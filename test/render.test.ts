import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { cardLayout } from '../src/card.ts'
import { SAFE_ZONE, TYPE } from '../src/house.ts'
import { AUDIO_FADE_OUT_MS } from '../src/plan.ts'
import { startFixtureSite } from './fixture/server.ts'
import type { FixtureSite } from './fixture/server.ts'
import {
  frame,
  meanDiff,
  meanLuma,
  meanVolume,
  pixelsNear,
  probe,
  reel,
  workspace,
} from './helpers.ts'
import type { Workspace } from './helpers.ts'

/**
 * The fixture's three hazards, as colours a rendered frame either has or does not:
 * the hero video pinned to 2.0s (it runs red, then green, then blue), the lazy image
 * that only loads if settle primed the scroll, and the infinite animation parked at
 * its first keyframe. A frame carrying all three was captured from a settled page.
 */
const VIDEO_AT_PIN = '#017f01'
const LAZY_IMAGE = '#00e5a0'
const PARKED_ANIMATION = '#ff2ea6'
/** The sticky nav. It belongs to the page, so it may never bake into a beat. */
const PAGE_CHROME = '#ffb300'
/** House ink. The fixture's own body copy is this colour, but only ~150px of it. */
const INK = '#eef1f6'
/** The scrim's band — the top of the frame down to the text slot's foot. */
const SCRIM_BAND = [0, 620] as const

/** The house accent — on a rendered reel it appears on the CTA card's rule and nowhere else. */
const ACCENT = '#8b5cf6'

/** Frame indices, from #12's arithmetic: hook 90, three beats of 105, then the card. */
const CUTS = [90, 195, 300]
const LAST_FRAME = 470
/** The card's crossfade starts here — 0.3s before the last beat would have ended. */
const CARD_IN = 396
/** The first frame the crossfade is over and the card is alone on screen. */
const CARD_ALONE = 405

/** A 3-beat config: 3.0 + 3 x 3.5 + 2.5 - 0.3 crossfade. */
function fixtureSite(url: string): string {
  return `
import { defineSite } from 'reel'
export default defineSite({
  url: '${url}',
  hook: { text: "Spotless, it's every\\ntime you look." },
  beats: [
    { selector: '#hero' },
    { selector: '#services', label: 'Deep clean' },
    { selector: '#gallery', direction: 'diagonal' },
  ],
  cta: { credit: 'fixture.test' },
})
`
}

let fixture: FixtureSite
let ws: Workspace
let reelPath: string
let masters: string

before(async () => {
  fixture = await startFixtureSite()
  ws = await workspace()
  await ws.site('fixture', fixtureSite(fixture.url))
  reelPath = join(ws.root, 'out', 'fixture-3beat.mp4')
  masters = join(ws.root, 'out', 'masters')

  const run = await reel(['render', 'fixture'], ws.root)
  assert.equal(run.code, 0, run.output)
  assert.match(run.stdout, /render ok {2}fixture/)
})

after(async () => {
  await ws.dispose()
  await fixture.close()
})

describe('reel render', () => {
  test('writes an mp4 in the container #1 requires', async () => {
    assert.ok(existsSync(reelPath), 'no mp4 at out/fixture-3beat.mp4')
    const video = await probe(reelPath, 'stream=codec_name,width,height,r_frame_rate,avg_frame_rate', 'v:0')
    assert.equal(video.codec_name, 'h264')
    assert.equal(video.width, '1080')
    assert.equal(video.height, '1920')
    // Constant frame rate: the nominal and the average agree, at 30.
    assert.equal(video.r_frame_rate, '30/1')
    assert.equal(video.avg_frame_rate, '30/1')

    const audio = await probe(reelPath, 'stream=codec_name,profile,sample_rate,channels', 'a:0')
    assert.match(audio.codec_name ?? '', /aac/)
    assert.equal(audio.profile, 'LC')
    assert.equal(audio.sample_rate, '48000')
    assert.equal(audio.channels, '2')

    // faststart: the index is in front of the media, not appended after it.
    const head = (await readFile(reelPath)).subarray(0, 4096).toString('latin1')
    const moov = head.indexOf('moov')
    const mdat = head.indexOf('mdat')
    assert.ok(moov > 0 && (mdat < 0 || moov < mdat), 'the moov atom is not at the front')
  })

  test('carries the signature track, with no word from the config about music', async () => {
    // The fixture config says nothing about music, so this bed is the default one
    // (#8) — one commissioned track under the body of work, found beside the face and
    // the mark rather than beside the site config.
    const opening = await meanVolume(reelPath, { start: 0.5, duration: 2 })
    assert.ok(opening > -40, `the reel is silent (${opening} dB)`)
  })

  test('the bed ends with the reel — faded, never hard-cut', async () => {
    const fade = AUDIO_FADE_OUT_MS / 1000
    const before = await meanVolume(reelPath, { start: 15.7 - fade - 0.5, duration: 0.4 })
    const last = await meanVolume(reelPath, { start: 15.7 - 0.2, duration: 0.2 })
    assert.ok(last < before - 12, `the bed is cut off rather than faded: ${before} -> ${last} dB`)
  })

  test('is exactly as long as the timeline says', async () => {
    const { duration } = await probe(reelPath, 'format=duration')
    assert.equal(Number(duration).toFixed(3), '15.700')
    const { nb_frames } = await probe(reelPath, 'stream=nb_frames', 'v:0')
    assert.equal(nb_frames, String(LAST_FRAME + 1))
  })

  test('takes one master per shot, sized by punch factor', async () => {
    // Punch 1.0, so the master is the section at 1:1 — 1080 wide by the section's own
    // height. #hero is 3000px, #services 2400px.
    assert.deepEqual(await size(join(masters, 'hook.jpg')), [1080, 3000])
    assert.deepEqual(await size(join(masters, 'beat-0.jpg')), [1080, 3000])
    assert.deepEqual(await size(join(masters, 'beat-1.jpg')), [1080, 2400])
  })

  test('a diagonal pan pays its 2x pixel cost without being asked to', async () => {
    // #gallery is 2800px and the plan punches a diagonal to 1.2, so a lateral pan of
    // it would be 1296x3360. Diagonal needs headroom on both axes, so it is doubled
    // on both — nothing in the config asked for that.
    assert.deepEqual(await size(join(masters, 'beat-2.jpg')), [2592, 6720])
  })

  test('frame 0 is a settled page: video pinned, lazy images in, animation parked', async () => {
    const first = await frame(reelPath, 0)
    assert.ok(pixelsNear(first, VIDEO_AT_PIN) > 10_000, 'the hero video is not at its pinned time')
    assert.ok(pixelsNear(first, LAZY_IMAGE) > 10_000, 'the lazy image never loaded')
    assert.ok(pixelsNear(first, PARKED_ANIMATION) > 10_000, 'the infinite animation is not parked')
  })

  test('page chrome appears in the hook only, never baked into a beat', async () => {
    // A master is a full-page shot clipped to the section's rect. Scrolling to a
    // section instead would carry the sticky nav into the top of every beat.
    for (const index of [120, 230, 340]) {
      const beat = await frame(reelPath, index)
      assert.equal(pixelsNear(beat, PAGE_CHROME), 0, `page chrome is baked into frame ${index}`)
    }
  })

  test('every shot moves for its whole duration and never lands', async () => {
    // A shot's last two frames against two from its middle. Absolute pixel difference
    // says nothing — a drift over a subtle section moves as little as a tenth of a
    // level — so the claim is the shot-relative one: the camera is still travelling as
    // fast at the cut as it was halfway through, having neither stopped nor eased.
    for (const [mid, end] of [
      [45, 89],
      [143, 194],
      [248, 299],
      [351, 395],
    ] as const) {
      const midway = meanDiff(await frame(reelPath, mid - 1), await frame(reelPath, mid))
      const landing = meanDiff(await frame(reelPath, end - 1), await frame(reelPath, end))
      assert.ok(landing > 0, `the shot ending at frame ${end} is a still`)
      assert.ok(
        landing > midway / 2,
        `the shot ending at frame ${end} lands: ${midway.toFixed(3)} -> ${landing.toFixed(3)}`,
      )
    }
  })

  test('cuts between beats are hard', async () => {
    for (const cut of CUTS) {
      const within = meanDiff(await frame(reelPath, cut - 2), await frame(reelPath, cut - 1))
      const across = meanDiff(await frame(reelPath, cut - 1), await frame(reelPath, cut))
      assert.ok(across > within * 10, `the cut at frame ${cut} is not hard (${within} -> ${across})`)
    }
  })

  test('the hook is fully drawn on frame 0 and never animates in', async () => {
    // Frame 0 is the Facebook in-feed thumbnail, so the hook is a constraint on it
    // rather than a by-product: it is already at full alpha, and it stays there for
    // the whole hold. An animated-in hook would put a fraction of this on frame 0.
    const first = pixelsNear(await frame(reelPath, 0), INK)
    const held = pixelsNear(await frame(reelPath, 75), INK)
    assert.ok(first > 10_000, `the hook is not drawn on frame 0 (${first}px of ink)`)
    assert.ok(
      Math.abs(first - held) < first * 0.05,
      `the hook's alpha moves during its hold: ${first} -> ${held}`,
    )
  })

  test('the hook and its scrim let go together, before the cut', async () => {
    const held = await frame(reelPath, 75)
    const gone = await frame(reelPath, 89) // The hook's last frame; the cut is at 90.
    assert.ok(pixelsNear(gone, INK) === 0, 'the hook is still lit when the cut lands')
    // The wash lifts with the words rather than dimming the site for the whole reel.
    const under = meanLuma(held, ...SCRIM_BAND)
    const clear = meanLuma(gone, ...SCRIM_BAND)
    assert.ok(clear > under * 1.25, `the scrim outlived its text: ${under} -> ${clear}`)
  })

  test('a label lives and dies inside its own shot', async () => {
    // #services carries the reel's one label. It is dark at both ends of its shot and
    // lit in the middle, so no cut ever has text on either side of it.
    for (const index of [195, 200, 294, 299]) {
      const at = pixelsNear(await frame(reelPath, index), INK)
      assert.equal(at, 0, `the label is lit at frame ${index}, next to a cut`)
    }
    const lit = pixelsNear(await frame(reelPath, 240), INK)
    assert.ok(lit > 1000, `the label never appears (${lit}px of ink)`)
  })

  test('there is no scrim where there is no text', async () => {
    // Same shot, same section, same camera: the only difference between these two
    // frames is whether the label is up. A permanent wash would flatten the gap.
    const withLabel = meanLuma(await frame(reelPath, 240), ...SCRIM_BAND)
    const without = meanLuma(await frame(reelPath, 299), ...SCRIM_BAND)
    assert.ok(
      withLabel < without * 0.7,
      `the scrim does not ride with its label: ${withLabel} vs ${without}`,
    )
    // And a beat with no label is never washed at all.
    const unlabelled = meanLuma(await frame(reelPath, 150), ...SCRIM_BAND)
    assert.ok(unlabelled > without * 0.7, `an unlabelled beat is scrimmed (${unlabelled})`)
  })

  test('the card is MWA Forge’s: house pixels, the mark, and no site in it at all', async () => {
    const card = await frame(reelPath, 440)
    for (const [name, colour] of [
      ['the hero video', VIDEO_AT_PIN],
      ['a lazy image', LAZY_IMAGE],
      ['the parked animation', PARKED_ANIMATION],
      ['page chrome', PAGE_CHROME],
    ] as const) {
      assert.equal(pixelsNear(card, colour), 0, `${name} reaches the card`)
    }
    // The mark and the headline, in house ink, and the accent rule under them.
    assert.ok(pixelsNear(card, INK) > 10_000, 'the card carries no mark or headline')
    // The rule is 140x6, and its top and bottom rows are blended into the ground by
    // the scale it is drifting under — so most of it, not all of it, is the accent.
    assert.ok(pixelsNear(card, ACCENT) > 300, 'the card carries no accent rule')
  })

  test('the card’s content sits in the boosted safe box, centred on y 760', async () => {
    const card = await frame(reelPath, CARD_ALONE)
    const layout = cardLayout()
    const empty = meanLuma(card, 1300, 1500) // Ground, below everything drawn.
    const mark = meanLuma(card, layout.mark.y + 10, layout.mark.y + layout.mark.height - 10)
    const headline = meanLuma(card, layout.headline.y + 10, layout.headline.y + 90)
    const credit = meanLuma(card, layout.credit.y, layout.credit.y + TYPE.credit.lineHeight)

    assert.ok(mark > empty * 2, `nothing is drawn where the mark should be (${mark})`)
    assert.ok(headline > empty * 2, `nothing is drawn where the headline should be (${headline})`)
    // The credit is on the card and is quieter than the headline — it is attribution,
    // not the thing the card is asking for.
    assert.ok(credit > empty, `the credit line never appears (${credit} vs ${empty})`)
    assert.ok(credit < headline, `the credit is not muted against the headline (${credit})`)
    // Nothing is drawn outside the box Meta's own UI leaves alone.
    assert.ok(meanLuma(card, 0, SAFE_ZONE.top) < empty * 1.05, 'the card draws above the safe box')
    assert.ok(
      meanLuma(card, SAFE_ZONE.bottom, 1920) < empty * 1.05,
      'the card draws below the safe box',
    )
  })

  test('the card arrives on the reel’s only crossfade', async () => {
    // Every other transition was asserted hard above. This one is not: the last beat
    // and the card share these frames, so the change is spread across all of them
    // instead of landing on one.
    const within = meanDiff(await frame(reelPath, CARD_IN - 2), await frame(reelPath, CARD_IN - 1))
    const across = meanDiff(await frame(reelPath, CARD_IN - 1), await frame(reelPath, CARD_IN))
    assert.ok(across < within * 10, `the card cuts in rather than crossfading (${across})`)
    // And it is genuinely arriving: the card's ink is not there at the start of the
    // overlap and is there at the end of it.
    const early = pixelsNear(await frame(reelPath, CARD_IN + 1), INK)
    const done = pixelsNear(await frame(reelPath, CARD_ALONE), INK)
    assert.ok(done > 10_000, 'the card never finishes arriving')
    assert.ok(early < done / 2, `the card is already drawn when its crossfade starts (${early})`)
  })

  test('the card drifts to its last frame — the reel never rests', async () => {
    // #12: a static final 2.5s reads as the video having ended early. The card scales
    // 1.00 -> 1.03, so its pixels are still moving on the frame the reel stops on.
    // Two frames apart rather than one: the card's fastest pixel travels under half a
    // pixel a frame, so a single frame gap is small enough that the encoder's own
    // rounding is a fair share of it and the reading jitters.
    const midway = meanDiff(await frame(reelPath, 438), await frame(reelPath, 440))
    const landing = meanDiff(await frame(reelPath, LAST_FRAME - 2), await frame(reelPath, LAST_FRAME))
    assert.ok(landing > 0, 'the card is a still')
    assert.ok(landing > midway / 2, `the card lands: ${midway.toFixed(3)} -> ${landing.toFixed(3)}`)
  })

  test('a second render re-takes its masters and reproduces frame 0 bit-identically', async () => {
    const before = await frame(reelPath, 0)
    const wasCaptured = (await stat(join(masters, 'hook.jpg'))).mtimeMs

    const again = await reel(['render', 'fixture'], ws.root)
    assert.equal(again.code, 0, again.output)

    // Run-scoped: the second render captured the page again rather than reusing a
    // photograph of it (#14).
    assert.notEqual((await stat(join(masters, 'hook.jpg'))).mtimeMs, wasCaptured)
    assert.deepEqual(await frame(reelPath, 0), before, 'frame 0 differs between two renders')
  })
})

describe('reel render, refused', () => {
  test('runs check first and writes no mp4 when it fails', async () => {
    const broken = await workspace()
    try {
      await broken.site(
        'drifted',
        `
import { defineSite } from 'reel'
export default defineSite({
  url: '${fixture.url}',
  hook: { text: 'Spotless, every time.' },
  beats: [{ selector: '#hero' }, { selector: '#gone' }, { selector: '#short' }],
  cta: { credit: 'fixture.test' },
})
`,
      )
      const run = await reel(['render', 'drifted'], broken.root)
      assert.equal(run.code, 1, run.output)
      // check's own report, verbatim — there is one report to learn to read.
      assert.match(run.stdout, /beats\[1\] selector '#gone' — no element matches/)
      assert.match(run.stdout, /2 problems\./)
      assert.ok(!existsSync(join(broken.root, 'out', 'drifted-3beat.mp4')))
    } finally {
      await broken.dispose()
    }
  })
})

async function size(path: string): Promise<[number, number]> {
  const { width, height } = await probe(path, 'stream=width,height', 'v:0')
  return [Number(width), Number(height)]
}
