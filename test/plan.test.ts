import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  ambientBeforeProbe,
  BEAT_MS,
  COPY_BUDGETS,
  copyProblem,
  darkFrame,
  DEFAULT_LATERAL_PUNCH_FACTOR,
  DEFAULT_TRACK,
  DIRECTIONS,
  envelopeOf,
  fitCapFallback,
  FPS,
  frameCount,
  isLive,
  MAX_FIT_SECTION_HEIGHT,
  panAxes,
  pastFitCap,
  panTravelAvailable,
  panTravelNeeded,
  panTravelProblems,
  planReel,
  resolvedMotion,
  TITLE_MS,
} from '../src/plan.ts'
import type { Shot, Timeline } from '../src/plan.ts'
import { MIN_FIT_SCALE } from '../src/house.ts'
import { MOTION_FLOOR, STILL_DEGRADATION } from '../src/motion.ts'
import { AMBIENT_DEGRADATION } from '../src/scroll.ts'
import type { Beat, SiteConfig } from '../src/site.ts'
import { snapshot, surveyed } from './helpers.ts'
import type { BeatFacts } from './helpers.ts'

/** The minimum #7 allows, with `n` beats named only by selector. */
function config(n: number, overrides: Partial<SiteConfig> = {}): SiteConfig {
  const beats: Beat[] = Array.from({ length: n }, (_, i) => ({ selector: `#s${i}` }))
  return {
    url: 'https://example.test',
    hook: { text: 'Spotless, every time.' },
    beats,
    cta: { credit: 'example.test' },
    ...overrides,
  }
}

/** The minimum config with the hook overridden — three beats, named only by selector. */
function withHook(hook: Partial<SiteConfig['hook']>): SiteConfig {
  const base = config(3)
  return { ...base, hook: { ...base.hook, ...hook } }
}

function beatShots(timeline: Timeline) {
  return timeline.shots.filter((shot) => shot.kind === 'beat')
}

/** Three sections that each lead with a heading — what a page of unlabelled beats says. */
const HEADINGS: Partial<BeatFacts>[] = [
  { heading: 'Spotless bathrooms' },
  { heading: 'What we do' },
  { heading: 'Our work' },
]

/**
 * Five sections with only the third measured — the fit beat those tests are about, and
 * "nothing measured" for the four the cap has no opinion on.
 */
function onlyThird(height: number): Partial<BeatFacts>[] {
  return [{}, {}, { height }, {}, {}]
}

/** Every cut, plus the two ends — the moments a cue may not be lit across. */
function cueLit(cue: Timeline['text'][number], atMs: number): boolean {
  const end = cue.startMs + cue.fadeInMs + cue.holdMs + cue.fadeOutMs
  return atMs > cue.startMs && atMs < end
}

describe('planReel', () => {
  test('a reel is 17.2 / 20.7 / 24.2s for n = 3, 4, 5', () => {
    // 1.5s of title on the front of each, and all three still inside #1's 15-30s.
    assert.equal(planReel(config(3)).durationMs, 17200)
    assert.equal(planReel(config(4)).durationMs, 20700)
    assert.equal(planReel(config(5)).durationMs, 24200)
  })

  test('the shots are title + hook + n beats + card, back to back with the card overlapping', () => {
    for (const n of [3, 4, 5]) {
      const timeline = planReel(config(n))
      assert.equal(timeline.shots.length, n + 3)
      assert.deepEqual(
        timeline.shots.map((shot) => shot.kind),
        ['title', 'hook', ...Array.from({ length: n }, () => 'beat'), 'cta'],
      )
      assert.deepEqual(
        timeline.shots.map((shot) => shot.durationMs),
        [1500, 3000, ...Array.from({ length: n }, () => 3500), 2500],
      )
      // Every shot but the card starts where the last one ended; the card starts
      // 0.3s early, which is the crossfade, and it is why the total is 0.3s short.
      timeline.shots.slice(1, -1).forEach((shot, i) => {
        const previous = timeline.shots[i]!
        assert.equal(shot.startMs, previous.startMs + previous.durationMs)
      })
      const card = timeline.shots.at(-1)!
      const lastBeat = timeline.shots.at(-2)!
      assert.equal(card.startMs, lastBeat.startMs + lastBeat.durationMs - 300)
      assert.equal(card.startMs + card.durationMs, timeline.durationMs)
    }
  })

  test('cut points are n+2, one per hard cut, and the last is the crossfade start', () => {
    for (const n of [3, 4, 5]) {
      const timeline = planReel(config(n))
      assert.equal(timeline.cutPoints.length, n + 2)
      // Each hard cut falls on a beat boundary.
      timeline.cutPoints.slice(0, -1).forEach((cut, i) => {
        const shot = timeline.shots[i + 1]!
        assert.equal(cut, shot.startMs)
      })
      assert.equal(timeline.cutPoints.at(-1), timeline.shots.at(-1)!.startMs)
    }
  })

  test('the hook drifts, beat 1 pans, and no move repeats across a cut', () => {
    for (const n of [3, 4, 5]) {
      const moves = planReel(config(n)).shots.map((shot) => shot.move)
      assert.equal(moves[0], 'drift')
      assert.equal(moves[1], 'drift')
      assert.equal(moves[2], 'pan')
      // Across the hard cuts between *filmed* shots only. #6's alternation is about
      // site pixels: the title and the card are drawn, both drift, and neither is a
      // move a viewer reads against the shot beside it.
      moves.slice(1, -2).forEach((move, i) => {
        assert.notEqual(move, moves[i + 2], `shots ${i + 1} and ${i + 2} both ${move}`)
      })
    }
  })

  test('each pan takes the next direction in the rotation, none repeating', () => {
    const directions = beatShots(planReel(config(5)))
      .filter((shot) => shot.move === 'pan')
      .map((shot) => shot.direction)
    assert.deepEqual(directions, ['vertical', 'lateral', 'diagonal'])

    // A drift carries no direction — it is a parameter of pan, not a move.
    for (const shot of beatShots(planReel(config(5)))) {
      if (shot.move === 'drift') assert.equal(shot.direction, undefined)
    }
  })

  test('drifts alternate push and pull, and the hook always pushes', () => {
    // The title opens on a pull, which is what leaves the hook its push across the
    // first cut. It can afford one: it is drawn rather than filmed (#52, #106).
    for (const n of [3, 4, 5]) {
      const [title, hook] = planReel(config(n)).shots
      assert.equal(title!.pushPull, 'pull', `n=${n} opens on a push`)
      assert.equal(hook!.pushPull, 'push', `n=${n} hooks on a pull`)
    }
    // #52: every zoom used to be a push, so a reel read as one repeated gesture.
    for (const n of [3, 4, 5]) {
      const drifts = planReel(config(n))
        .shots.filter((shot) => shot.move === 'drift')
        .map((shot) => shot.pushPull)
      drifts.forEach((drift, i) => {
        if (i > 0) assert.notEqual(drift, drifts[i - 1], `n=${n} repeats ${drift}`)
      })
    }
    // The card is in the rotation, which for n=4 is what makes the alternation visible.
    assert.deepEqual(
      planReel(config(4))
        .shots.filter((shot) => shot.move === 'drift')
        .map((shot) => shot.pushPull),
      ['pull', 'push', 'pull', 'push', 'pull'],
    )
  })

  describe('hook.motion', () => {
    // #63: a hook can be recorded from the running page instead of synthesised from a
    // still. The default is the doctrine every reel before it was cut under, and the
    // whole of ADR-0006's "nothing existing moves" is that the plan says so.
    test('defaults to still, which the plan states by saying nothing', () => {
      for (const n of [3, 4, 5]) {
        const hook = planReel(config(n)).shots[1] as Shot
        assert.equal(hook.motion, undefined)
        assert.equal(isLive(hook), false)
        assert.equal(hook.punchFactor, 1)
      }
      // Naming the default explicitly plans the same shot as leaving it out.
      assert.deepEqual(
        planReel(withHook({ motion: 'still' })).shots,
        planReel(config(3)).shots,
      )
    })

    test('an ambient hook is live, and is the still hook in every other respect', () => {
      const live = planReel(withHook({ motion: 'ambient' })).shots[1] as Shot
      const still = planReel(config(3)).shots[1] as Shot
      assert.equal(live.motion, 'ambient')
      assert.equal(isLive(live), true)
      // The motion is the *only* difference: a recording is one frame of pixels, so a
      // live hook is punched exactly as much as a still one, which is not at all.
      assert.deepEqual({ ...live, motion: undefined }, { ...still, motion: undefined })
    })

    test('a live hook still drifts, still pushes, and still takes its turn', () => {
      const live = planReel(withHook({ motion: 'ambient' }))
      const still = planReel(config(3))
      const hook = live.shots[1] as Shot
      assert.equal(hook.move, 'drift')
      // Frame 0 is the thumbnail whichever way the pixels were got (#5).
      assert.equal(hook.pushPull, 'push')
      // And the rotation is untouched: the hook is exempt from it, not outside it, so
      // every beat and the card plan exactly as they did.
      assert.deepEqual(live.shots.slice(2), still.shots.slice(2))
    })

    test("beats are never live — the motion is the hook's alone", () => {
      for (const motion of ['ambient', 'scroll'] as const) {
        for (const shot of planReel(withHook({ motion })).shots.slice(2)) {
          assert.equal(shot.motion, undefined, `${motion}: ${shot.kind} ${shot.index} is live`)
        }
      }
    })

    test('a scroll hook plans the ambient hook, carrying its own motion', () => {
      // #64: the two live motions differ in what the page is doing under the lens, and
      // the plan is upstream of that entirely — it says "recorded", and the capture
      // pass is where "while a scripted scroll runs" happens. So the hook a scroll
      // plans is the ambient one with a different word in it, and the scroll's own
      // pace and distance appear nowhere in it, because they are house constants.
      const walked = planReel(withHook({ motion: 'scroll' }))
      const dwelt = planReel(withHook({ motion: 'ambient' }))
      const hook = walked.shots[1] as Shot
      assert.equal(hook.motion, 'scroll')
      assert.equal(isLive(hook), true)
      assert.deepEqual({ ...hook, motion: undefined }, { ...(dwelt.shots[1] as Shot), motion: undefined })
      // The beats are where the two do differ, and only in the rotation's phase: a
      // scroll travels down the page, so the pans start past the direction that would
      // travel down it again. The test below is that rule; this is where it shows up.
      assert.notDeepEqual(walked.shots.slice(2), dwelt.shots.slice(2))
    })

    test('a scroll hook is not followed by a vertical pan', () => {
      // The rotation's one rule read across the hook boundary: a scripted scroll and a
      // vertical pan are the same downward gesture, and a hard cut between them makes
      // one long slide with a stutter in it. The hook is a drift, so the pan rotation
      // never used to compare itself against it.
      const walked = beatShots(planReel(withHook({ motion: 'scroll' })))
      assert.equal(walked[0]!.direction, 'lateral')
      // Stepped past, not exempted from: every direction is still reachable and none
      // repeats across a cut, which is the whole of what the rotation is for.
      const directions = walked.map((shot) => shot.direction).filter(Boolean)
      for (const [i, direction] of directions.entries()) {
        if (i > 0) assert.notEqual(direction, directions[i - 1], `pan ${i} repeats its neighbour`)
      }
      // The other two motions travel nowhere on their own, so they start where the
      // rotation always started.
      for (const motion of ['still', 'ambient'] as const) {
        assert.equal(beatShots(planReel(withHook({ motion })))[0]!.direction, 'vertical')
      }
    })

    test('a scroll that degrades to ambient plans the rotation it degraded into', () => {
      // #64's degradation is the reason the shift is read off the resolved motion and
      // not off the config's ask: a hook whose reveals cannot re-fire is recorded
      // standing still, so there is no downward move for beat 1 to repeat and nothing
      // to step past. The reel plans the vertical it would always have had.
      const asked = withHook({ motion: 'scroll' })
      const degraded = surveyed(asked, { scrollRefires: false, motionReading: MOTION_FLOOR })
      assert.equal(beatShots(planReel(asked, degraded))[0]!.direction, 'vertical')
    })

    test('a surveyed reading degrades the hook, and plans the shot it lands on', () => {
      // #64 and #88 both degrade the hook on evidence a pure plan cannot have: whether
      // a page's reveals re-fire, and whether its hero moves in the frame it would be
      // shot in. The survey carries both as readings and the plan reads the chain off
      // them, so the reel is planned as the hook that will actually be cut rather than
      // as the one that was asked for. Unmeasured is the config's own answer, exactly
      // as an unmeasured height is uncapped.
      const asked = withHook({ motion: 'scroll' })
      const reveals = surveyed(asked, { scrollRefires: false, motionReading: MOTION_FLOOR })
      assert.equal((planReel(asked, reveals).shots[1] as Shot).motion, 'ambient')
      // And a hook probed dead is the still hook whole — not a live shot with the word
      // taken off it. A still hook is synthesised from one frozen master, so it drifts
      // the full 10% rather than breathing 3% over a recording, and every downstream
      // pass reads that off the plan alone.
      const dead = surveyed(asked, { scrollRefires: false, motionReading: 0 })
      assert.deepEqual(planReel(asked, dead).shots, planReel(config(3)).shots)
    })
  })

  test('each move carries only its own parameter', () => {
    for (const shot of planReel(config(5)).shots) {
      if (shot.move === 'pan') {
        assert.equal(shot.pushPull, undefined, `beat ${shot.index} is a pan that zooms`)
      } else {
        assert.ok(shot.pushPull, `${shot.kind} ${shot.index} drifts without pushing or pulling`)
      }
    }
  })

  test('a push/pull override wins without disturbing the beats around it', () => {
    const plain = planReel(config(5))
    const overridden = planReel(
      config(5, {
        beats: config(5).beats.map((beat, i) => (i === 1 ? { ...beat, pushPull: 'push' as const } : beat)),
      }),
    )
    assert.equal(beatShots(overridden)[1]!.pushPull, 'push')
    for (const i of [0, 2, 3, 4]) {
      assert.equal(beatShots(overridden)[i]!.pushPull, beatShots(plain)[i]!.pushPull, `beat ${i} moved`)
    }
    // The card is seeded on n, so it does not move either.
    assert.equal(overridden.shots.at(-1)!.pushPull, plain.shots.at(-1)!.pushPull)
  })

  test('the rotation is seeded on beat index alone', () => {
    const plain = planReel(config(4))
    const elaborate = planReel({
      url: 'https://other.test',
      hook: { text: 'Another site entirely.', selector: '#hero', videoTime: 1.5 },
      beats: [
        { selector: '.a', punchFactor: 2.2, label: 'Enrolling' },
        { selector: '.b', y: 400, height: 2400 },
        { selector: '.c', url: 'https://other.test/two' },
        { selector: '.d', punchFactor: 1.4 },
      ],
      cta: { credit: 'other.test' },
      music: { file: 'audio/other.mp3', offset: 1.1 },
    })
    assert.deepEqual(
      beatShots(plain).map((shot) => [shot.move, shot.direction, shot.pushPull]),
      beatShots(elaborate).map((shot) => [shot.move, shot.direction, shot.pushPull]),
    )
  })

  test('a move override wins without disturbing the beats around it', () => {
    const beats = beatShots(planReel(config(5)))
    const overridden = beatShots(
      planReel(
        config(5, {
          beats: config(5).beats.map((beat, i) => (i === 1 ? { ...beat, move: 'pan' as const } : beat)),
        }),
      ),
    )
    assert.equal(overridden[1]!.move, 'pan')
    for (const i of [0, 2, 3, 4]) {
      assert.deepEqual(
        [overridden[i]!.move, overridden[i]!.direction, overridden[i]!.pushPull],
        [beats[i]!.move, beats[i]!.direction, beats[i]!.pushPull],
        `beat ${i} moved because beat 1 was overridden`,
      )
    }
    // An unplanned pan still cannot repeat a neighbour's direction.
    assert.notEqual(overridden[1]!.direction, overridden[0]!.direction)
    assert.notEqual(overridden[1]!.direction, overridden[2]!.direction)
  })

  test('a direction override wins without disturbing the rotation', () => {
    const beats = beatShots(planReel(config(5)))
    const overridden = beatShots(
      planReel(
        config(5, {
          beats: config(5).beats.map((beat, i) =>
            i === 2 ? { ...beat, direction: 'lateral-reversed' as const } : beat,
          ),
        }),
      ),
    )
    assert.equal(overridden[2]!.direction, 'lateral-reversed')
    for (const i of [0, 1, 3, 4]) {
      assert.equal(overridden[i]!.direction, beats[i]!.direction)
    }
  })

  test('n outside 3..5 is rejected by name', () => {
    for (const n of [0, 2, 6]) {
      assert.throws(() => planReel(config(n)), /a reel is 3-5 beats, this config has/)
    }
  })

  describe('text cues', () => {
    test('the hook is lit on its own first frame and fades over the hook\'s final 0.5s', () => {
      const timeline = planReel(config(3))
      const hook = timeline.text.find((cue) => cue.role === 'hook')!
      assert.deepEqual(
        { ...hook },
        {
          shot: 1,
          content: 'Spotless, every time.',
          role: 'hook',
          startMs: 1500,
          fadeInMs: 0,
          // 3.0s less the 0.5s fade less one frame: the ramp reaches zero at the
          // frame it ends on, and that frame has to be one the shot has (#36).
          holdMs: 2467,
          fadeOutMs: 500,
        },
      )
      // The hook's own first frame carries the whole line: the title holds frame 0
      // now, and the hook still arrives whole rather than ramping up after its cut.
      assert.equal(hook.startMs, TITLE_MS)
      assert.equal(hook.fadeInMs, 0)
      // And it is dark *on* the hook's last frame, not on the next shot's first: 7%
      // of the wash over a hard cut is the dropped-frame read #24 refuses (#36).
      const shot = timeline.shots[1] as Shot
      assert.equal(darkFrame(envelopeOf(hook, shot)), frameCount(shot.durationMs) - 1)
    })

    test('a label fades in 0.2s after its cut and finishes 0.2s before the next', () => {
      const timeline = planReel(
        config(3, {
          beats: config(3).beats.map((beat, i) => (i === 1 ? { ...beat, label: 'Enrolling now' } : beat)),
        }),
      )
      const label = timeline.text.find((cue) => cue.role === 'label')!
      const shot = timeline.shots[3]!
      assert.equal(label.shot, 3)
      assert.equal(label.startMs, shot.startMs + 200)
      assert.equal(label.fadeInMs, 300)
      assert.equal(label.fadeOutMs, 300)
      assert.equal(
        label.startMs + label.fadeInMs + label.holdMs + label.fadeOutMs,
        shot.startMs + BEAT_MS - 200,
      )
    })

    test('a plan given no survey labels nothing — the page is the only source', () => {
      const roles = planReel(config(4)).text.map((cue) => cue.role)
      assert.deepEqual(roles, ['hook', 'cta'])
    })

    test('a beat with no label takes its section’s heading as one', () => {
      const timeline = planReel(config(3), surveyed(config(3), { beats: HEADINGS }))
      const labels = timeline.text.filter((cue) => cue.role === 'label')
      assert.deepEqual(
        labels.map((cue) => [cue.shot, cue.content]),
        [
          [2, 'Spotless bathrooms'],
          [3, 'What we do'],
          [4, 'Our work'],
        ],
      )
    })

    test('a label in config wins over the heading — the voice stays the human’s', () => {
      const timeline = planReel(
        config(3, {
          beats: config(3).beats.map((beat, i) => (i === 1 ? { ...beat, label: 'Enrolling' } : beat)),
        }),
        surveyed(config(3), { beats: HEADINGS }),
      )
      const labels = timeline.text.filter((cue) => cue.role === 'label')
      assert.deepEqual(labels.map((cue) => cue.content), ['Spotless bathrooms', 'Enrolling', 'Our work'])
    })

    test('an empty label suppresses the text on that shot', () => {
      const timeline = planReel(
        config(3, { beats: config(3).beats.map((beat, i) => (i === 1 ? { ...beat, label: '' } : beat)) }),
        surveyed(config(3), { beats: HEADINGS }),
      )
      const labels = timeline.text.filter((cue) => cue.role === 'label')
      assert.deepEqual(labels.map((cue) => [cue.shot, cue.content]), [[2, 'Spotless bathrooms'], [4, 'Our work']])
    })

    test('a section with no heading leaves its beat unlabelled', () => {
      const beats = [{ heading: 'Spotless bathrooms' }, {}, { heading: 'Our work' }]
      const timeline = planReel(config(3), surveyed(config(3), { beats }))
      const labels = timeline.text.filter((cue) => cue.role === 'label')
      assert.deepEqual(labels.map((cue) => cue.shot), [2, 4])
    })

    test('a defaulted label keeps the cue shape a written one has', () => {
      const timeline = planReel(config(3), surveyed(config(3), { beats: [{}, { heading: 'What we do' }, {}] }))
      const label = timeline.text.find((cue) => cue.role === 'label')!
      const shot = timeline.shots[3]!
      assert.equal(label.startMs, shot.startMs + 200)
      assert.equal(label.fadeInMs, 300)
      assert.equal(label.fadeOutMs, 300)
      assert.equal(
        label.startMs + label.fadeInMs + label.holdMs + label.fadeOutMs,
        shot.startMs + BEAT_MS - 200,
      )
    })

    test('the CTA arrives on the crossfade and has no animation of its own', () => {
      const timeline = planReel(config(3))
      const cta = timeline.text.find((cue) => cue.role === 'cta')!
      assert.equal(cta.content, 'example.test')
      assert.equal(cta.startMs, timeline.shots.at(-1)!.startMs)
      assert.equal(cta.fadeInMs, 0)
      assert.equal(cta.fadeOutMs, 0)
      assert.equal(cta.holdMs, 2500)
    })

    test('no cue is lit across a cut point, for any n', () => {
      for (const n of [3, 4, 5]) {
        // Every beat labelled, half from config and half from the page: a defaulted
        // label is the same cue, so it is held to the same cut point (#62).
        const timeline = planReel(
          config(n, {
            beats: config(n).beats.map((beat, i) => (i % 2 === 0 ? { ...beat, label: `Beat ${i}` } : beat)),
          }),
          surveyed(config(n), { beats: Array.from({ length: n }, (_, i) => ({ heading: `Heading ${i}` })) }),
        )
        for (const cue of timeline.text) {
          for (const cut of timeline.cutPoints) {
            assert.equal(cueLit(cue, cut), false, `${cue.role} cue is lit across the cut at ${cut}ms`)
          }
        }
      }
    })
  })

  describe('copy budgets', () => {
    test('the budgets are #9\'s table', () => {
      // One table for both roles since ADR-0012: a label is set at the hook's size, and
      // this table is a proxy for the width a size draws.
      assert.deepEqual(COPY_BUDGETS, { hook: { lines: 2, chars: 42 }, label: { lines: 2, chars: 42 } })
    })

    test('copy at, one under, and one over a budget classifies correctly', () => {
      for (const [role, budget] of Object.entries(COPY_BUDGETS)) {
        const at = 'x'.repeat(budget.chars)
        assert.equal(copyProblem(role, at.slice(1), budget), null, `${role}: one under fits`)
        assert.equal(copyProblem(role, at, budget), null, `${role}: at budget fits`)
        assert.match(
          copyProblem(role, `${at}x`, budget) ?? '',
          new RegExp(`${role} is ${budget.chars + 1} characters; the budget is ${budget.chars}`),
        )
      }
    })

    test('lines are budgeted too, and a line break is not a character', () => {
      assert.equal(copyProblem('hook.text', 'Spotless,\nevery time.', COPY_BUDGETS.hook), null)
      assert.match(
        copyProblem('hook.text', 'a\nb\nc', COPY_BUDGETS.hook) ?? '',
        /hook\.text is 3 lines; the budget is 2/,
      )
      assert.equal(copyProblem('beats[0].label', 'a\nb', COPY_BUDGETS.label), null)
      assert.match(
        copyProblem('beats[0].label', 'a\nb\nc', COPY_BUDGETS.label) ?? '',
        /beats\[0\]\.label is 3 lines; the budget is 2/,
      )
    })
  })

  describe('pan travel', () => {
    test('a pan needs travel a viewer can see, over the whole shot', () => {
      // 2px a frame at 30fps for 3.5s. #6's accepted pan runs ~7px a frame.
      assert.equal(panTravelNeeded(BEAT_MS), 210)
    })

    test('a direction travels the axes it says it does', () => {
      assert.deepEqual(panAxes('vertical'), ['y'])
      assert.deepEqual(panAxes('lateral'), ['x'])
      assert.deepEqual(panAxes('lateral-reversed'), ['x'])
      assert.deepEqual(panAxes('diagonal'), ['x', 'y'])
    })

    test('without a punch a lateral pan has nowhere to go, however tall the section', () => {
      assert.equal(panTravelAvailable('x', 1, 99_000), 0)
      assert.equal(panTravelAvailable('x', 1.2, 400), 216)
    })

    test('a pan needing lateral room is punched in for it when config names none', () => {
      const beats = beatShots(planReel(config(5)))
      const punched = beats.filter((shot) => shot.direction && panAxes(shot.direction).includes('x'))
      assert.ok(punched.length > 0)
      for (const shot of punched) {
        assert.equal(shot.punchFactor, DEFAULT_LATERAL_PUNCH_FACTOR)
        assert.ok(panTravelAvailable('x', shot.punchFactor, 0) >= panTravelNeeded(shot.durationMs))
      }
      // A vertical pan and a drift are not punched — the section's own height is
      // where a vertical pan's travel comes from.
      for (const shot of beats) {
        if (shot.direction === 'vertical' || shot.move === 'drift') {
          assert.equal(shot.punchFactor, 1)
        }
      }
    })

    test('a punchFactor the config names wins, right or wrong', () => {
      const beats = beatShots(
        planReel(config(3, { beats: config(3).beats.map((beat) => ({ ...beat, punchFactor: 1.05 })) })),
      )
      for (const shot of beats) assert.equal(shot.punchFactor, 1.05)
    })

    test('a fit beat is not punched, and drifts rather than panning nowhere', () => {
      // Beat 2 is the diagonal in the rotation, so it is the beat the plan would
      // otherwise punch for lateral room — a punch would crop back into the section
      // fit exists to show whole.
      const site = config(5)
      const fit = config(5, {
        beats: site.beats.map((beat, i) => (i === 2 ? { ...beat, fit: true } : beat)),
      })
      const [plain, fitted] = [beatShots(planReel(site))[2]!, beatShots(planReel(fit))[2]!]
      assert.equal(plain.move, 'pan')
      assert.equal(plain.punchFactor, DEFAULT_LATERAL_PUNCH_FACTOR)
      assert.equal(fitted.move, 'drift')
      assert.equal(fitted.punchFactor, 1)
      assert.equal(fitted.fit, true)
      // And it is still an override seeded on the index: the beats either side of it
      // planned the same move, direction and zoom as they did without it.
      assert.deepEqual(beatShots(planReel(fit))[1], beatShots(planReel(site))[1])
      assert.deepEqual(beatShots(planReel(fit))[3], beatShots(planReel(site))[3])
    })

    test('a fit beat asked to pan is still asked to pan, and still reported', () => {
      const site = config(3, {
        beats: config(3).beats.map((beat, i) =>
          i === 0 ? { ...beat, fit: true, move: 'pan' as const } : beat,
        ),
      })
      const shot = beatShots(planReel(site))[0]!
      assert.equal(shot.move, 'pan')
      assert.equal(shot.direction, 'vertical')
      // However tall the section measured, fit makes it one frame — so there is no
      // travel, whatever the caller passes.
      assert.deepEqual(panTravelProblems(shot, '#s0', 6000), [
        `beats[0] '#s0' — a vertical pan needs 210px of travel, a fit section is ` +
          'exactly one frame and leaves 0px (drift it instead)',
      ])
    })

    test('a config naming fit nowhere carries no fit at all', () => {
      for (const shot of planReel(config(5)).shots) assert.equal(shot.fit, undefined)
    })

    test('a fit beat inside the cap is the fit beat it was, measured or not', () => {
      const site = config(5, {
        beats: config(5).beats.map((beat, i) => (i === 2 ? { ...beat, fit: true } : beat)),
      })
      const at = surveyed(site, { beats: onlyThird(MAX_FIT_SECTION_HEIGHT) })
      // At the cap exactly, and one pixel under it: the floor is what the section may
      // be drawn *at*, not what it has to stay clear of.
      assert.deepEqual(beatShots(planReel(site, at))[2], beatShots(planReel(site))[2])
      const under = surveyed(site, { beats: onlyThird(MAX_FIT_SECTION_HEIGHT - 1) })
      assert.deepEqual(beatShots(planReel(site, under))[2], beatShots(planReel(site))[2])
    })

    test('a fit beat past the cap falls back to fit-to-width and a vertical pan', () => {
      const site = config(5, {
        beats: config(5).beats.map((beat, i) => (i === 2 ? { ...beat, fit: true } : beat)),
      })
      const tall = MAX_FIT_SECTION_HEIGHT + 1
      const shot = beatShots(planReel(site, surveyed(site, { beats: onlyThird(tall) })))[2]!
      assert.equal(shot.fit, undefined)
      assert.equal(shot.move, 'pan')
      assert.equal(shot.direction, 'vertical')
      // Fit to *width*: no punch, so the master is the page at frame width and the
      // section's own height is what the pan travels across.
      assert.equal(shot.punchFactor, 1)
      assert.ok(panTravelAvailable('y', shot.punchFactor, tall) >= panTravelNeeded(shot.durationMs))
      assert.deepEqual(panTravelProblems(shot, '#s2', tall), [])
      // And the fallback is still one beat's business: its neighbours plan unchanged.
      const plain = beatShots(planReel(config(5)))
      const fallen = beatShots(planReel(site, surveyed(site, { beats: onlyThird(tall) })))
      assert.deepEqual(fallen[1], plain[1])
      assert.deepEqual(fallen[3], plain[3])
    })

    test('the fallback names the beat and the section that was too tall', () => {
      const beat: Beat = { selector: '#s2', fit: true }
      assert.equal(fitCapFallback(2, beat, MAX_FIT_SECTION_HEIGHT), null)
      assert.equal(fitCapFallback(2, { selector: '#s2' }, 9000), null, 'no fit, nothing to fall back')
      assert.equal(
        fitCapFallback(2, beat, 4400),
        `beats[2] '#s2' is 4400px tall; fit pulls out to at most ${MAX_FIT_SECTION_HEIGHT}px, ` +
          'so this beat is fit to width and panned vertically instead',
      )
    })

    test('the cap is the legibility floor said as a height', () => {
      // One constant, beside the type sizes it defends: half is the scale, so the
      // tallest section a fit may pull out to is two frames.
      assert.equal(MIN_FIT_SCALE, 0.5)
      assert.equal(MAX_FIT_SECTION_HEIGHT, 3840)
      assert.equal(pastFitCap(3840), false)
      assert.equal(pastFitCap(3841), true)
    })

    test('the fallback pan is vertical even where the fit beat named a direction', () => {
      // `direction` on a fit beat was a field the plan dropped, because fit drifts. The
      // fallback must not cash it in: a lateral pan at no punch has no travel at all,
      // which would fail `check` over a line the human wrote for a beat that drifted.
      const site = config(3, {
        beats: config(3).beats.map((beat, i) =>
          i === 1 ? { ...beat, fit: true, direction: 'lateral' as const } : beat,
        ),
      })
      const shot = beatShots(planReel(site, surveyed(site, { beats: [{}, { height: 9000 }, {}] })))[1]!
      assert.equal(shot.direction, 'vertical')
      assert.deepEqual(panTravelProblems(shot, '#s1', 9000), [])
    })

    test('a fit beat past the cap still takes the move the config named', () => {
      // The fallback supplies a move for a beat that named none. A beat that named one
      // is the human's, exactly as it is for a fit beat inside the cap.
      const site = config(3, {
        beats: config(3).beats.map((beat, i) =>
          i === 1 ? { ...beat, fit: true, move: 'drift' as const } : beat,
        ),
      })
      const shot = beatShots(planReel(site, surveyed(site, { beats: [{}, { height: 9000 }, {}] })))[1]!
      assert.equal(shot.move, 'drift')
      assert.equal(shot.fit, undefined)
    })

    test('a vertical pan travels whatever the section has past one frame', () => {
      assert.equal(panTravelAvailable('y', 1, 1920), 0)
      assert.equal(panTravelAvailable('y', 1, 2130), 210)
      // A punch multiplies the section's own pixels, so a short section can still pan.
      assert.equal(panTravelAvailable('y', 6, 400), 480)
    })
  })

  describe('audio', () => {
    test('the signature track is the default, and offset is config seconds', () => {
      assert.deepEqual(planReel(config(3)).audio, {
        file: DEFAULT_TRACK,
        offsetMs: 0,
        fadeOutMs: 1000,
      })
      assert.deepEqual(planReel(config(3, { music: { file: 'audio/other.mp3', offset: 1.1 } })).audio, {
        file: 'audio/other.mp3',
        offsetMs: 1100,
        fadeOutMs: 1000,
      })
    })
  })

  test('a survey that measured nothing plans the reel the config alone describes', () => {
    // The survey is the page's half of the plan, and a page nobody asked about has no
    // half: an empty one is the same "unmeasured is what the config asked for" that
    // leaving it out is, for every fact it could have carried.
    for (const n of [3, 4, 5]) {
      assert.deepEqual(planReel(config(n), surveyed(config(n))), planReel(config(n)))
    }
  })

  test('it is pure: the same config plans the same reel, twice', () => {
    const site = config(4)
    assert.deepEqual(planReel(site), planReel(site))
    // And it did not eat the config it was handed.
    assert.deepEqual(site, config(4))
  })

  test('the frame rate is constant and stated', () => {
    assert.equal(planReel(config(3)).fps, FPS)
    assert.equal(DIRECTIONS.length, 4)
  })

  for (const n of [3, 4, 5]) {
    test(`the whole timeline for n = ${n}`, () => {
      snapshot(
        `timeline-${n}beat`,
        planReel(
          config(n, {
            beats: config(n).beats.map((beat, i) =>
              i === 1 ? { ...beat, punchFactor: 1.6, label: 'Enrolling for Fall' } : beat,
            ),
          }),
        ),
      )
    })
  }
})

describe('resolvedMotion', () => {
  // ADR-0008's chain, as a function of two numbers rather than of a page that animates
  // (#96): a `scroll` whose reveals do not re-fire is an `ambient`, and an `ambient`
  // that does not move in its own frame is a `still`.
  // What each degradation *says* is pinned against the module that owns the sentence —
  // `AMBIENT_DEGRADATION` in `test/scroll.test.ts`, `STILL_DEGRADATION` in
  // `test/motion.test.ts` — because a note's wording is a fact about the probe that
  // produced it, not about the chain that orders them. What is asserted here is the
  // ordering: which sentences a config and a survey produce, and in which order.
  test('the probe gate is the chain’s first step, and reaches the survey as a predicate', () => {
    // What `survey.ts` asks before spending 2s on the probe (ADR-0009). Stated once
    // here and called from both sides, so the browser never asks the chain for a
    // verdict about the survey it is halfway through taking — and, because the reading
    // is a parameter rather than a survey, the gate cannot come to depend on the number
    // the probe below it is about to write down.
    assert.equal(ambientBeforeProbe(withHook({ motion: 'ambient' }), null), true)
    assert.equal(ambientBeforeProbe(withHook({ motion: 'still' }), false), false)
    // A scroll is probed only where it has already lost its scroll: unread re-fires
    // are what the config asked for, exactly as `resolvedMotion` reads them.
    assert.equal(ambientBeforeProbe(withHook({ motion: 'scroll' }), false), true)
    assert.equal(ambientBeforeProbe(withHook({ motion: 'scroll' }), true), false)
    assert.equal(ambientBeforeProbe(withHook({ motion: 'scroll' }), null), false)
  })

  test('an unsurveyed hook is the one the config asked for, and is noted as nothing', () => {
    for (const motion of ['still', 'ambient', 'scroll'] as const) {
      assert.deepEqual(resolvedMotion(withHook({ motion })), { motion, notes: [] })
      // A page that would not load, or a hero nobody could find, reads as nothing
      // measured — and degrades nothing. Both are already problems in their own right.
      assert.deepEqual(resolvedMotion(withHook({ motion }), surveyed(withHook({ motion }))), {
        motion,
        notes: [],
      })
    }
  })

  test('a scroll whose reveals do not re-fire is an ambient, and says so', () => {
    // The probe read above the floor, so the ambient it degraded to is one worth
    // recording and the chain stops after one step.
    assert.deepEqual(
      resolvedMotion(
        withHook({ motion: 'scroll' }),
        surveyed(withHook({ motion: 'scroll' }), { scrollRefires: false, motionReading: MOTION_FLOOR }),
      ),
      { motion: 'ambient', notes: [AMBIENT_DEGRADATION] },
    )
  })

  test('a scroll can degrade twice in one run, and both steps are named', () => {
    // The whole chain, three deep: a human handed a still where they asked for a scroll
    // reads why in two lines rather than inferring it from one.
    assert.deepEqual(
      resolvedMotion(
        withHook({ motion: 'scroll' }),
        surveyed(withHook({ motion: 'scroll' }), {
          scrollRefires: false,
          motionReading: MOTION_FLOOR - 0.01,
        }),
      ),
      { motion: 'still', notes: [AMBIENT_DEGRADATION, STILL_DEGRADATION] },
    )
  })

  test('an ambient is degraded by the floor alone, from either side of it', () => {
    const dead = surveyed(withHook({ motion: 'ambient' }), { motionReading: MOTION_FLOOR - 0.01 })
    assert.deepEqual(resolvedMotion(withHook({ motion: 'ambient' }), dead), {
      motion: 'still',
      notes: [STILL_DEGRADATION],
    })
    // The floor itself passes: it is where the probe's calibration put "live", not the
    // first reading past it.
    assert.deepEqual(
      resolvedMotion(
        withHook({ motion: 'ambient' }),
        surveyed(withHook({ motion: 'ambient' }), { motionReading: MOTION_FLOOR }),
      ),
      { motion: 'ambient', notes: [] },
    )
  })

  test('a scroll that keeps its scroll is never degraded by a reading it never took', () => {
    // The probe is not run for a scroll that stays a scroll, so there is no reading to
    // read — and a scroll is not the motion the still degradation is about anyway.
    assert.deepEqual(
      resolvedMotion(
        withHook({ motion: 'scroll' }),
        surveyed(withHook({ motion: 'scroll' }), { scrollRefires: true }),
      ),
      { motion: 'scroll', notes: [] },
    )
  })

  test('a still hook is asked neither question', () => {
    // The default config plans the reel it always did, whatever a page happened to say.
    assert.deepEqual(
      resolvedMotion(config(3), surveyed(config(3), { scrollRefires: false, motionReading: 0 })),
      { motion: 'still', notes: [] },
    )
  })
})
