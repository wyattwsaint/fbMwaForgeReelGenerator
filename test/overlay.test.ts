import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { frameCount } from '../src/plan.ts'
import { GROUND, INK, TEXT_SLOT, TYPE } from '../src/house.ts'
import {
  alphaExpr,
  darkFrame,
  envelopeOf,
  escapeValue,
  overlayChains,
  overlayCues,
} from '../src/overlay.ts'
import { planReel } from '../src/plan.ts'
import type { Shot, TextCue, Timeline } from '../src/plan.ts'
import type { SiteConfig } from '../src/site.ts'

/** A config with a label on *every* beat — not a shipping reel, but the hard case. */
function labelled(n: number): SiteConfig {
  return {
    url: 'https://example.test',
    hook: { text: 'Spotless, every\ntime you look.' },
    beats: Array.from({ length: n }, (_, i) => ({
      selector: `#s${i}`,
      label: `Beat ${i}`,
    })),
    cta: { credit: 'example.test' },
  }
}

function graphOf(timeline: Timeline, shotIndex: number): string {
  const shot = timeline.shots[shotIndex] as Shot
  return overlayChains(overlayCues(timeline.text, shotIndex), shot, 'in', 'out').join(';')
}

describe('which cues are drawn', () => {
  const timeline = planReel(labelled(3))

  test('the hook belongs to the hook shot and a label to its own beat', () => {
    assert.deepEqual(
      overlayCues(timeline.text, 0).map((cue) => cue.role),
      ['hook'],
    )
    assert.deepEqual(
      overlayCues(timeline.text, 2).map((cue) => cue.content),
      ['Beat 1'],
    )
  })

  test('the card draws its own text — the overlay does not reach onto it', () => {
    const card = timeline.shots.length - 1
    assert.ok(timeline.text.some((cue) => cue.shot === card && cue.role === 'cta'))
    assert.deepEqual(overlayCues(timeline.text, card), [])
    assert.deepEqual(graphOf(timeline, card), '')
  })

  test('a beat with no label draws nothing at all', () => {
    const plain = planReel({ ...labelled(3), beats: [{ selector: '#a' }, { selector: '#b' }, { selector: '#c' }] })
    assert.deepEqual(overlayCues(plain.text, 1), [])
    assert.deepEqual(graphOf(plain, 1), '')
  })
})

describe('envelopes are the plan\u2019s, not re-derived', () => {
  test('the hook is drawn on frame 0 and fades out over its final 0.5s', () => {
    const timeline = planReel(labelled(3))
    const cue = timeline.text[0] as TextCue
    const envelope = envelopeOf(cue, timeline.shots[0] as Shot)
    assert.deepEqual(envelope, {
      startFrame: 0,
      fadeInFrames: 0,
      holdFrames: 75,
      fadeOutFrames: 15,
    })
    // No fade-in branch: at n=0 the expression is the constant 1, which is what keeps
    // frame 0 — the Facebook in-feed thumbnail — bit-identical run to run.
    assert.equal(alphaExpr(envelope), 'if(lt(n,75),1,if(lt(n,90),(90-n)/15,0))')
  })

  test('a label starts 0.2s after its cut and is dark 0.2s before the next', () => {
    const timeline = planReel(labelled(3))
    const cue = timeline.text[1] as TextCue
    const envelope = envelopeOf(cue, timeline.shots[1] as Shot)
    assert.deepEqual(envelope, {
      startFrame: 6,
      fadeInFrames: 9,
      holdFrames: 75,
      fadeOutFrames: 9,
    })
    assert.equal(
      alphaExpr(envelope),
      'if(lt(n,6),0,if(lt(n,15),(n-6)/9,if(lt(n,90),1,if(lt(n,99),(99-n)/9,0))))',
    )
  })

  test('no cue is lit across a cut point, at any reel length', () => {
    for (const n of [3, 4, 5]) {
      const timeline = planReel(labelled(n))
      timeline.shots.forEach((shot, index) => {
        for (const cue of overlayCues(timeline.text, index)) {
          const envelope = envelopeOf(cue, shot)
          assert.ok(envelope.startFrame >= 0, `${n} beats: shot ${index} starts before its cut`)
          // The cut frame is the *next* shot's frame 0, so a cue whose alpha reaches
          // zero exactly at the boundary is dark for every frame that is drawn after
          // it. The hook is that case by construction — its fade is the hook's own
          // final 0.5s — and a label is stricter still, finishing 0.2s early.
          const last = frameCount(shot.durationMs)
          assert.ok(
            darkFrame(envelope) <= last,
            `${n} beats: shot ${index} is still lit past its cut`,
          )
          if (cue.role === 'label') {
            assert.ok(darkFrame(envelope) < last, `${n} beats: label ${index} runs to its cut`)
          }
        }
      })
    }
  })
})

describe('what gets drawn', () => {
  const timeline = planReel(labelled(3))
  const hook = graphOf(timeline, 0)
  const label = graphOf(timeline, 2)

  test('the scrim is a constant house-ground wash, never sampled from the page', () => {
    // #0a0c10 as the source colour and as the three channels the gradient is built from.
    assert.equal(GROUND, '#0a0c10')
    assert.match(hook, /color=c=0x0a0c10:s=1080x620/)
    assert.match(hook, /geq=r=10:g=12:b=16/)
    // The alpha ramp is the only thing about it that varies, and it varies with Y.
    assert.match(hook, /a=255\*0\.9\*\(1-pow\(Y\/H\\,3\)\)/)
  })

  test('the scrim shares the text\u2019s envelope exactly', () => {
    // The hook holds to frame 75 and is dark at 90, so its wash does the same.
    assert.match(hook, /fade=t=out:alpha=1:start_frame=75:nb_frames=15/)
    assert.doesNotMatch(hook, /fade=t=in/) // Drawn on frame 0, so there is no ramp in.
    assert.match(label, /fade=t=in:alpha=1:start_frame=6:nb_frames=9/)
    assert.match(label, /fade=t=out:alpha=1:start_frame=90:nb_frames=9/)
  })

  test('text sits in one fixed slot, left-aligned, with no per-beat placement', () => {
    const hookPlacements = [...hook.matchAll(/:x=(\d+):y=(\d+)/g)].map((m) => [m[1], m[2]])
    assert.deepEqual(hookPlacements, [
      ['65', '270'],
      ['65', String(270 + TYPE.hook.lineHeight)],
    ])
    // A label is a different role in the same slot: same x, same first line.
    assert.deepEqual(
      [...label.matchAll(/:x=(\d+):y=(\d+)/g)].map((m) => [m[1], m[2]]),
      [['65', '270']],
    )
    assert.equal(TEXT_SLOT.x, 65)
  })

  test('every line stays inside the slot\u2019s band', () => {
    for (const [, , y] of hook.matchAll(/:x=(\d+):y=(\d+)/g)) {
      assert.ok(Number(y) >= TEXT_SLOT.top && Number(y) + TYPE.hook.size <= TEXT_SLOT.bottom)
    }
  })

  test('text fades and nothing else — it never travels, scales or types on', () => {
    // Position is an integer, so there is no expression that could move it, and the
    // only per-frame expression in the whole graph is the one on alpha.
    assert.doesNotMatch(hook, /zoompan|scale=|:x='|:y='/)
    const perFrame = [...hook.matchAll(/\bn\b/g)]
    const inAlpha = [...hook.matchAll(/alpha=[^:]*/g)].flatMap((m) => [...m[0].matchAll(/\bn\b/g)])
    assert.equal(perFrame.length, inAlpha.length)
  })

  test('a line each, in the house ink, at the role\u2019s own size', () => {
    assert.equal(INK, '#eef1f6')
    assert.equal((hook.match(/drawtext=/g) ?? []).length, 2) // A two-line hook.
    assert.match(hook, /fontcolor=0xeef1f6:fontsize=76/)
    assert.match(label, /fontcolor=0xeef1f6:fontsize=44/)
    assert.match(hook, /fontfile=\S*SpaceGrotesk-Bold\.ttf/)
  })

  test('one shot\u2019s chains hand off from the named input to the named output', () => {
    assert.match(hook, /^color=/)
    assert.match(hook, /\[in\]\[scrim0\]overlay=x=0:y=0:shortest=1\[washed0\]/)
    assert.match(hook, /\[washed0\]drawtext=.*\[out\]$/)
  })
})

describe('copy survives the filtergraph', () => {
  test('every special character is escaped once per parser', () => {
    assert.equal(escapeValue("it's"), "it\\\\\\'s")
    assert.equal(escapeValue('C:/fonts/x.ttf'), 'C\\\\:/fonts/x.ttf')
    assert.equal(escapeValue('a, b; c'), 'a\\, b\\; c')
    assert.equal(escapeValue('[x]'), '\\[x\\]')
    assert.equal(escapeValue('plain text'), 'plain text')
  })

  test('a hook with an apostrophe reaches the frame as one drawtext', () => {
    const timeline = planReel({ ...labelled(3), hook: { text: "It's spotless." } })
    const graph = graphOf(timeline, 0)
    assert.equal((graph.match(/drawtext=/g) ?? []).length, 1)
    assert.match(graph, /text=It\\\\\\'s spotless\./)
  })
})
