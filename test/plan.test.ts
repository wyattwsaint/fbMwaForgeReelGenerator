import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  BEAT_MS,
  COPY_BUDGETS,
  copyProblem,
  darkFrame,
  DEFAULT_LATERAL_PUNCH_FACTOR,
  DEFAULT_TRACK,
  DIRECTIONS,
  envelopeOf,
  FPS,
  frameCount,
  panAxes,
  panTravelAvailable,
  panTravelNeeded,
  planReel,
} from '../src/plan.ts'
import type { Shot, Timeline } from '../src/plan.ts'
import type { Beat, SiteConfig } from '../src/site.ts'
import { snapshot } from './helpers.ts'

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

function beatShots(timeline: Timeline) {
  return timeline.shots.filter((shot) => shot.kind === 'beat')
}

/** Every cut, plus the two ends — the moments a cue may not be lit across. */
function cueLit(cue: Timeline['text'][number], atMs: number): boolean {
  const end = cue.startMs + cue.fadeInMs + cue.holdMs + cue.fadeOutMs
  return atMs > cue.startMs && atMs < end
}

describe('planReel', () => {
  test('a reel is 15.7 / 19.2 / 22.7s for n = 3, 4, 5', () => {
    assert.equal(planReel(config(3)).durationMs, 15700)
    assert.equal(planReel(config(4)).durationMs, 19200)
    assert.equal(planReel(config(5)).durationMs, 22700)
  })

  test('the shots are hook + n beats + card, back to back with the card overlapping', () => {
    for (const n of [3, 4, 5]) {
      const timeline = planReel(config(n))
      assert.equal(timeline.shots.length, n + 2)
      assert.deepEqual(
        timeline.shots.map((shot) => shot.kind),
        ['hook', ...Array.from({ length: n }, () => 'beat'), 'cta'],
      )
      assert.deepEqual(
        timeline.shots.map((shot) => shot.durationMs),
        [3000, ...Array.from({ length: n }, () => 3500), 2500],
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

  test('cut points are n+1, one per hard cut, and the last is the crossfade start', () => {
    for (const n of [3, 4, 5]) {
      const timeline = planReel(config(n))
      assert.equal(timeline.cutPoints.length, n + 1)
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
      assert.equal(moves[1], 'pan')
      // Across the hard cuts only: the card arrives on a crossfade, and it drifts
      // whatever the last beat did.
      moves.slice(0, -2).forEach((move, i) => {
        assert.notEqual(move, moves[i + 1], `shots ${i} and ${i + 1} both ${move}`)
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
    // #52: every zoom used to be a push, so a reel read as one repeated gesture.
    for (const n of [3, 4, 5]) {
      const drifts = planReel(config(n))
        .shots.filter((shot) => shot.move === 'drift')
        .map((shot) => shot.pushPull)
      // Frame 0 is the thumbnail, and a pull's first frame is its most upscaled one.
      assert.equal(drifts[0], 'push', `n=${n} opens on a pull`)
      drifts.forEach((drift, i) => {
        if (i > 0) assert.notEqual(drift, drifts[i - 1], `n=${n} repeats ${drift}`)
      })
    }
    // The card is in the rotation, which for n=4 is what makes the alternation visible.
    assert.deepEqual(
      planReel(config(4))
        .shots.filter((shot) => shot.move === 'drift')
        .map((shot) => shot.pushPull),
      ['push', 'pull', 'push', 'pull'],
    )
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
    test('the hook is fully drawn on frame 0 and fades over the hook\'s final 0.5s', () => {
      const timeline = planReel(config(3))
      const hook = timeline.text.find((cue) => cue.role === 'hook')!
      assert.deepEqual(
        { ...hook },
        {
          shot: 0,
          content: 'Spotless, every time.',
          role: 'hook',
          startMs: 0,
          fadeInMs: 0,
          // 3.0s less the 0.5s fade less one frame: the ramp reaches zero at the
          // frame it ends on, and that frame has to be one the shot has (#36).
          holdMs: 2467,
          fadeOutMs: 500,
        },
      )
      // Frame 0 carries the whole line — the thumbnail is not an animation.
      assert.equal(hook.startMs, 0)
      assert.equal(hook.fadeInMs, 0)
      // And it is dark *on* the hook's last frame, not on the next shot's first: 7%
      // of the wash over a hard cut is the dropped-frame read #24 refuses (#36).
      const shot = timeline.shots[0] as Shot
      assert.equal(darkFrame(envelopeOf(hook, shot)), frameCount(shot.durationMs) - 1)
    })

    test('a label fades in 0.2s after its cut and finishes 0.2s before the next', () => {
      const timeline = planReel(
        config(3, {
          beats: config(3).beats.map((beat, i) => (i === 1 ? { ...beat, label: 'Enrolling now' } : beat)),
        }),
      )
      const label = timeline.text.find((cue) => cue.role === 'label')!
      const shot = timeline.shots[2]!
      assert.equal(label.shot, 2)
      assert.equal(label.startMs, shot.startMs + 200)
      assert.equal(label.fadeInMs, 300)
      assert.equal(label.fadeOutMs, 300)
      assert.equal(
        label.startMs + label.fadeInMs + label.holdMs + label.fadeOutMs,
        shot.startMs + BEAT_MS - 200,
      )
    })

    test('labels are off by default — most reels are hook + CTA only', () => {
      const roles = planReel(config(4)).text.map((cue) => cue.role)
      assert.deepEqual(roles, ['hook', 'cta'])
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
        const timeline = planReel(
          config(n, { beats: config(n).beats.map((beat, i) => ({ ...beat, label: `Beat ${i}` })) }),
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
      assert.deepEqual(COPY_BUDGETS, { hook: { lines: 2, chars: 42 }, label: { lines: 1, chars: 28 } })
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
      assert.match(
        copyProblem('beats[0].label', 'a\nb', COPY_BUDGETS.label) ?? '',
        /beats\[0\]\.label is 2 lines; the budget is 1/,
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
