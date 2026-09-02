import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { masterSize } from '../src/camera.ts'
import { ffmpeg, renderShot } from '../src/compose.ts'
import { channels, escapeValue, ffmpegColor, stream } from '../src/filtergraph.ts'
import { FRAME_HEIGHT } from '../src/frame.ts'
import { GROUND, INK, SCRIM, TEXT_SLOT, TYPE } from '../src/house.ts'
import { alphaExpr, drawnOverlays, overlayChains } from '../src/overlay.ts'
import { darkFrame, envelopeOf, frameCount, planReel } from '../src/plan.ts'
import type { Shot, TextCue, Timeline } from '../src/plan.ts'
import type { SiteConfig } from '../src/site.ts'
import { frame, meanLuma, pixelsNear, workspace } from './helpers.ts'
import type { Workspace } from './helpers.ts'

/** A flat master, mid-grey: dark enough to see ink over, light enough to see a wash. */
const GREY = 128

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

/** The cues one shot draws over site pixels — what `render` hands the overlay. */
function drawnOn(timeline: Timeline, shotIndex: number): TextCue[] {
  return drawnOverlays(timeline.text.filter((cue) => cue.shot === shotIndex))
}

function graphOf(timeline: Timeline, shotIndex: number): string {
  const shot = timeline.shots[shotIndex] as Shot
  return overlayChains(drawnOn(timeline, shotIndex), shot, stream('in'), stream('out')).join(';')
}

describe('which cues are drawn', () => {
  const timeline = planReel(labelled(3))

  test('the hook belongs to the hook shot and a label to its own beat', () => {
    // Shot 0 is the title, which draws its own line and carries no cue at all.
    assert.deepEqual(drawnOn(timeline, 0), [])
    assert.deepEqual(
      drawnOn(timeline, 1).map((cue) => cue.role),
      ['hook'],
    )
    assert.deepEqual(
      drawnOn(timeline, 3).map((cue) => cue.content),
      ['Beat 1...'],
    )
  })

  test('the card draws its own text — the overlay does not reach onto it', () => {
    const card = timeline.shots.length - 1
    assert.ok(timeline.text.some((cue) => cue.shot === card && cue.role === 'cta'))
    assert.deepEqual(drawnOn(timeline, card), [])
    assert.deepEqual(graphOf(timeline, card), '')
  })

  test('a beat with no label draws nothing at all', () => {
    const plain = planReel({ ...labelled(3), beats: [{ selector: '#a' }, { selector: '#b' }, { selector: '#c' }] })
    assert.deepEqual(drawnOn(plain, 2), [])
    assert.deepEqual(graphOf(plain, 2), '')
  })
})

describe('envelopes are the plan\u2019s, not re-derived', () => {
  test('the hook is drawn on frame 0 and fades out over its final 0.5s', () => {
    const timeline = planReel(labelled(3))
    const cue = timeline.text[0] as TextCue
    const shot = timeline.shots[1] as Shot
    const envelope = envelopeOf(cue, shot)
    assert.deepEqual(envelope, {
      startFrame: 0,
      fadeInFrames: 0,
      holdFrames: 74,
      fadeOutFrames: 15,
    })
    // No fade-in branch: at n=0 the expression is the constant 1, which is what keeps
    // frame 0 — the Facebook in-feed thumbnail — bit-identical run to run.
    assert.equal(alphaExpr(envelope), 'if(lt(n,74),1,if(lt(n,89),(89-n)/15,0))')
    // And the ramp reaches zero *on* the shot's last frame rather than one past it:
    // frame 89 is the last frame the hook has, and the cut lands at 90.
    assert.equal(darkFrame(envelope), frameCount(shot.durationMs) - 1)
  })

  test('a label starts 0.2s after its cut and is dark 0.2s before the next', () => {
    const timeline = planReel(labelled(3))
    const cue = timeline.text[1] as TextCue
    const envelope = envelopeOf(cue, timeline.shots[2] as Shot)
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
        for (const cue of drawnOn(timeline, index)) {
          const envelope = envelopeOf(cue, shot)
          assert.ok(envelope.startFrame >= 0, `${n} beats: shot ${index} starts before its cut`)
          // A ramp reaches zero *at* the frame it ends on, and the frame it ends on
          // has to be one the shot actually has: the cut frame is the next shot's
          // frame 0, so an envelope that only reaches zero there leaves this shot's
          // last frame lit across a hard cut. The hook is dark on its own last frame
          // by a frame's margin; a label is stricter still, finishing 0.2s early.
          const last = frameCount(shot.durationMs)
          assert.ok(
            darkFrame(envelope) < last,
            `${n} beats: shot ${index} is still lit on its last frame`,
          )
        }
      })
    }
  })
})

describe('what gets drawn', () => {
  const timeline = planReel(labelled(3))
  const hook = graphOf(timeline, 1)
  const label = graphOf(timeline, 3)

  test('the scrim is a constant house-ground wash, never sampled from the page', () => {
    // House ground as the source colour and as the three channels the gradient is
    // built from, over the band the text slot sits in.
    const { r, g, b } = channels(GROUND)
    assert.ok(hook.includes(`color=c=${ffmpegColor(GROUND)}:s=${SCRIM.width}x${SCRIM.height}`))
    assert.ok(hook.includes(`geq=r=${r}:g=${g}:b=${b}`))
    // The alpha ramp is the only thing about it that varies, and it varies with Y —
    // clipped at both ends, so the wash is at peak across the text band, spends its
    // release above it and its fall below it, and is gone before the frame's foot.
    assert.ok(
      hook.includes(
        `a=255*${SCRIM.peak}` +
          `*(1-pow(clip((${SCRIM.release}-Y)/${SCRIM.release}\\,0\\,1)\\,${SCRIM.falloff}))` +
          `*(1-pow(clip((Y-${SCRIM.fallTop})/${SCRIM.fall}\\,0\\,1)\\,${SCRIM.falloff}))`,
      ),
    )
  })

  test('the scrim shares the text\u2019s envelope exactly', () => {
    // The hook holds to frame 74 and is dark at 89, so its wash does the same.
    assert.match(hook, /fade=t=out:alpha=1:start_frame=74:nb_frames=15/)
    assert.doesNotMatch(hook, /fade=t=in/) // Drawn on frame 0, so there is no ramp in.
    assert.match(label, /fade=t=in:alpha=1:start_frame=6:nb_frames=9/)
    assert.match(label, /fade=t=out:alpha=1:start_frame=90:nb_frames=9/)
  })

  test('text sits in one fixed slot, left-aligned, with no per-beat placement', () => {
    const at = (x: number, y: number) => [String(x), String(y)]
    const hookPlacements = [...hook.matchAll(/:x=(\d+):y=(\d+)/g)].map((m) => [m[1], m[2]])
    assert.deepEqual(hookPlacements, [
      at(TEXT_SLOT.x, TEXT_SLOT.top),
      at(TEXT_SLOT.x, TEXT_SLOT.top + TYPE.hook.lineHeight),
    ])
    // A label is a different role in the same slot: same x, same first line.
    assert.deepEqual(
      [...label.matchAll(/:x=(\d+):y=(\d+)/g)].map((m) => [m[1], m[2]]),
      [at(TEXT_SLOT.x, TEXT_SLOT.top)],
    )
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
    assert.equal((hook.match(/drawtext=/g) ?? []).length, 2) // A two-line hook.
    assert.ok(hook.includes(`fontcolor=${ffmpegColor(INK)}:fontsize=${TYPE.hook.size}`))
    assert.ok(label.includes(`fontcolor=${ffmpegColor(INK)}:fontsize=${TYPE.label.size}`))
    assert.match(hook, /fontfile=\S*SpaceGrotesk-Bold\.ttf/)
  })

  test('one shot\u2019s chains hand off from the named input to the named output', () => {
    assert.match(hook, /^color=/)
    assert.ok(hook.includes(`[in][scrim0]overlay=x=0:y=${SCRIM.top}:shortest=1[washed0]`))
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
    const graph = graphOf(timeline, 1)
    assert.equal((graph.match(/drawtext=/g) ?? []).length, 1)
    assert.match(graph, /text=It\\\\\\'s spotless\./)
  })
})

/**
 * The hook's fade, on the pixels — the envelope is arithmetic, and the frame is what
 * a viewer sees (#36).
 *
 * A flat mid-grey master, so both of the things drawn over it are measurable against
 * a known number: the scrim darkens the band and the ink is far lighter than it. The
 * last frame the hook shot has must carry neither. Everything about the shot but the
 * pixels underneath it is the real one — the real plan, the real chains, the real
 * encode — because the bug this catches was a single frame's worth of arithmetic.
 */
describe('the hook is dark on its last frame, on the decoded pixels', () => {
  const timeline = planReel(labelled(3))
  const shot = timeline.shots[1] as Shot
  const last = frameCount(shot.durationMs) - 1

  let ws: Workspace
  let rendered: string

  before(async () => {
    ws = await workspace()
    const size = masterSize(shot, FRAME_HEIGHT)
    const raw = join(ws.root, 'grey.rgb')
    await writeFile(raw, Buffer.alloc(size.width * size.height * 3, GREY))

    const master = join(ws.root, 'grey.png')
    await ffmpeg([
      '-f', 'rawvideo',
      '-pix_fmt', 'rgb24',
      '-s', `${size.width}x${size.height}`,
      '-i', raw,
      '-frames:v', '1',
      master,
    ])
    rendered = await renderShot({ shot, path: master, size }, shot, ws.root, drawnOn(timeline, 1))
  })

  after(() => ws.dispose())

  test('the wash is gone and the words with it, with the cut one frame away', async () => {
    const dark = await frame(rendered, last)
    assert.equal(pixelsNear(dark, INK), 0, 'the hook is still lit on its last frame')
    // Not "nearly gone": the band is the master's own grey, so nothing was drawn over
    // it at all. 7% of the wash — a ramp that reaches zero one frame past the shot —
    // shows up here as about four levels of dimming.
    assert.ok(
      Math.abs(meanLuma(dark, SCRIM.top, FRAME_HEIGHT) - GREY) < 1,
      `something is still drawn on the hook's last frame: ${meanLuma(dark, SCRIM.top, FRAME_HEIGHT)}`,
    )
  })

  test('and the frame before it is still fading, so the assertion has teeth', async () => {
    // One frame of ramp left: the same measurement that passes at `last` fails here,
    // which is what makes the one above a test rather than a tolerance.
    const fading = await frame(rendered, last - 1)
    assert.ok(
      GREY - meanLuma(fading, SCRIM.top, FRAME_HEIGHT) > 1,
      'the fade is already over a frame before it ends',
    )
  })
})
