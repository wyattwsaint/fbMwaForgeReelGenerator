import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { cardLayout } from '../src/card.ts'
import { RECORD_START_MS } from '../src/capture.ts'
import { FRAME_HEIGHT, FRAME_WIDTH } from '../src/frame.ts'
import { SAFE_ZONE, SCRIM, TEXT_SLOT, TYPE } from '../src/house.ts'
import { AUDIO_FADE_OUT_MS, FRAME_MS, HOOK_FADE_OUT_MS, HOOK_MS, frameCount } from '../src/plan.ts'
import { SHEET_TILE, sheetSize } from '../src/review.ts'
import { startFixtureSite } from './fixture/server.ts'
import type { FixtureSite } from './fixture/server.ts'
import {
  assertFadesOut,
  frame,
  meanDiff,
  meanLuma,
  meanVolume,
  pixelsNear,
  probe,
  reel,
  workspace,
} from './helpers.ts'
import type { Run, Workspace } from './helpers.ts'

/**
 * The fixture's three hazards, as colours a rendered frame either has or does not:
 * the hero video pinned to 2.0s (it runs red, then green, then blue), the lazy image
 * that only loads if settle primed the scroll, and the infinite animation parked at
 * its first keyframe. A frame carrying all three was captured from a settled page.
 */
const VIDEO_AT_PIN = '#017f01'
const LAZY_IMAGE = '#00e5a0'
const PARKED_ANIMATION = '#ff2ea6'
/** The sticky nav. It belongs to the page, so it may never bake into a shot. */
const PAGE_CHROME = '#ffb300'
/** House ink. The fixture's own body copy is this colour, but only ~150px of it. */
const INK = '#eef1f6'
/** The scrim's band — where it comes up, down to the boosted bottom boundary. */
const SCRIM_BAND = [SCRIM.top, SAFE_ZONE.bottom] as const
/**
 * Everything above the wash — which includes the whole band the slot used to occupy,
 * the top of the frame down to its old foot at 620. Nothing is drawn up here now
 * (#60), and the band is derived rather than restated so it follows the wash.
 */
const ABOVE_THE_WASH = [0, SCRIM.top] as const

/** One band of a decoded frame, so a colour can be counted where it should be and not. */
function rows(frameBytes: Buffer, top: number, bottom: number): Buffer {
  return frameBytes.subarray(top * FRAME_WIDTH * 3, bottom * FRAME_WIDTH * 3)
}

/** The house accent — on a rendered reel it appears on the CTA card's rule and nowhere else. */
const ACCENT = '#8b5cf6'

/** #12's arithmetic for three beats: 3.0 + 3 x 3.5 + 2.5, less the 0.3 crossfade. */
const REEL_SECONDS = 15.7
/** Frame indices, from #12's arithmetic: hook 90, three beats of 105, then the card. */
const CUTS = [90, 195, 300]
const LAST_FRAME = 470
/** The hook's last frame at full alpha: its fade starts on the next one and ends on 89. */
const HOOK_HELD = frameCount(HOOK_MS - HOOK_FADE_OUT_MS - FRAME_MS)
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
let stale: string
let firstRun: Run

before(async () => {
  fixture = await startFixtureSite()
  ws = await workspace()
  await ws.site('fixture', fixtureSite(fixture.url))
  reelPath = join(ws.root, 'out', 'fixture-3beat.mp4')
  masters = join(ws.root, 'out', 'masters')

  // Yesterday's cut, left lying around. The render below has to make it impossible to
  // promote this by mistake, and the only way it can is by not being here afterwards.
  stale = join(ws.root, 'out', 'yesterday.mp4')
  await mkdir(join(ws.root, 'out'), { recursive: true })
  await writeFile(stale, 'yesterday')

  firstRun = await reel(['render', 'fixture'], ws.root)
  assert.equal(firstRun.code, 0, firstRun.output)
  assert.match(firstRun.stdout, /^done {2}out[\\/]fixture-3beat\.mp4/m)
})

after(async () => {
  await ws.dispose()
  await fixture.close()
})

describe('reel render', () => {
  test('wipes out/ before it does anything else', () => {
    // One render at a time, one thing in out/ (#18): scratch that accumulates is how
    // yesterday's cut gets promoted because it was still lying around.
    assert.ok(!existsSync(stale), 'a stale render survived into this one')
  })

  test('reports one checkpointed line per phase, with timings', () => {
    // Plain appended lines, never a redrawing bar: the reason to look is almost always
    // "which beat is slow", and the reason to scroll back is that something failed.
    for (const line of [
      /^check {6}ok {9}\d+\.\d+s$/m,
      /^master 1\/4 hook {7}\d+\.\d+s$/m,
      /^master 2\/4 hero {7}\d+\.\d+s$/m,
      /^shot {3}1\/5 drift {6}\d+\.\d+s$/m,
      /^shot {3}5\/5 drift {6}\d+\.\d+s$/m,
      /^mux {19}\d+\.\d+s$/m,
      // The reel's own length, then what it cost to cut — never each other.
      /^done {2}out[\\/]fixture-3beat\.mp4 {2}15\.7s {3}\[\d+\.\d+s total\]$/m,
    ]) {
      assert.match(firstRun.stdout, line)
    }
    // n + 2 shots and one master per shot that shows the site, so the counts are the
    // timeline's rather than a spinner's idea of how far along it is.
    assert.equal(firstRun.stdout.match(/^master \d\/4 /gm)?.length, 4)
    assert.equal(firstRun.stdout.match(/^shot {3}\d\/5 /gm)?.length, 5)
  })

  test('writes an mp4 in the container #1 requires', async () => {
    assert.ok(existsSync(reelPath), 'no mp4 at out/fixture-3beat.mp4')
    const video = await probe(reelPath, 'stream=codec_name,width,height,r_frame_rate,avg_frame_rate,bit_rate', 'v:0')
    assert.equal(video.codec_name, 'h264')
    assert.equal(video.width, '1080')
    assert.equal(video.height, '1920')
    // Constant frame rate: the nominal and the average agree, at 30.
    assert.equal(video.r_frame_rate, '30/1')
    assert.equal(video.avg_frame_rate, '30/1')

    // #1's ~3 Mbps, on the reel Wyatt would play. This is the ceiling half only, and
    // the fixture never approaches it — flat colour blocks under slow moves compress
    // to about 1.3 — so an encode with no rate control at all would pass here too.
    // That the budget is real is asserted in `compose.test.ts`, against noise that
    // would take every bit of it and is held to ~3 anyway.
    const mbps = Number(video.bit_rate) / 1_000_000
    assert.ok(mbps > 0.5, `the video is barely encoded at all (${mbps.toFixed(2)} Mbps)`)
    assert.ok(mbps < 3.3, `the video is over #1's ~3 Mbps budget (${mbps.toFixed(2)})`)

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

  test('the bed ends with the reel — faded, never hard-cut', () =>
    assertFadesOut(reelPath, REEL_SECONDS, AUDIO_FADE_OUT_MS / 1000))

  test('is exactly as long as the timeline says', async () => {
    const { duration } = await probe(reelPath, 'format=duration')
    assert.equal(Number(duration).toFixed(3), REEL_SECONDS.toFixed(3))
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

  test('the hook is cut from a settled page: video pinned, lazy images in, animation parked', async () => {
    // Read off the hook's last frame rather than its first. The scrim is anchored to
    // the foot of the frame now (#60), and on frame 0 the wash is over two of the
    // three hazards — which is the wash working, not the page being unsettled. It is
    // the same shot and the same master either way: the hook is one continuous move
    // over one capture, so this is the settled page frame 0 was cut from.
    const bare = await frame(reelPath, CUTS[0]! - 1)
    assert.ok(pixelsNear(bare, VIDEO_AT_PIN) > 10_000, 'the hero video is not at its pinned time')
    assert.ok(pixelsNear(bare, LAZY_IMAGE) > 10_000, 'the lazy image never loaded')
    assert.ok(pixelsNear(bare, PARKED_ANIMATION) > 10_000, 'the infinite animation is not parked')
    // And frame 0 — the in-feed thumbnail — carries the one hazard that sits above
    // the scrim's release, so the thumbnail is that capture rather than a re-shoot.
    const first = await frame(reelPath, 0)
    assert.ok(pixelsNear(first, VIDEO_AT_PIN) > 10_000, 'the thumbnail is not the settled page')
  })

  test('page chrome is baked into no beat, and into this fixture’s hook either', async () => {
    // A master is a full-page shot clipped to the section's rect. Scrolling to a
    // section instead would carry the sticky nav into the top of every beat, and no
    // clip a beat takes reaches the top of the document.
    //
    // The hook's can, which is #34's correction to #23's "chrome appears in the hook
    // only": the hook is framed on the hero, so whether chrome is in it is the
    // fixture's fact rather than the tool's. This fixture's hero starts below its
    // sticky nav, so this reel carries chrome nowhere — which is what the hook's
    // frames are here to say, rather than being the half that was never asserted.
    for (const index of [0, 45, 89, 120, 230, 340]) {
      const shot = await frame(reelPath, index)
      assert.equal(pixelsNear(shot, PAGE_CHROME), 0, `page chrome is baked into frame ${index}`)
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
    const held = pixelsNear(await frame(reelPath, HOOK_HELD), INK)
    assert.ok(first > 10_000, `the hook is not drawn on frame 0 (${first}px of ink)`)
    assert.ok(
      Math.abs(first - held) < first * 0.05,
      `the hook's alpha moves during its hold: ${first} -> ${held}`,
    )
  })

  test('the thumbnail reads with its copy at the bottom: ink in the slot, nothing up top', async () => {
    // Frame 0 is the in-feed thumbnail, and #60 moved the copy on it. Every pixel of
    // ink is inside the slot's own band, and the band the slot used to occupy — the
    // whole frame above the wash — carries none of it and none of the wash either.
    const first = await frame(reelPath, 0)
    const inSlot = pixelsNear(rows(first, TEXT_SLOT.top, TEXT_SLOT.bottom), INK)
    assert.ok(inSlot > 10_000, `the hook is not in the slot on the thumbnail (${inSlot}px of ink)`)
    assert.equal(
      pixelsNear(first, INK) - inSlot,
      0,
      'the thumbnail draws ink outside the slot',
    )
    assert.equal(pixelsNear(rows(first, ...ABOVE_THE_WASH), INK), 0, 'ink is still up top')
  })

  test('the hook and its scrim let go together, before the cut', async () => {
    const held = await frame(reelPath, HOOK_HELD)
    // The hook's last frame — dark on it, and the cut is at 90 (#36).
    const gone = await frame(reelPath, CUTS[0]! - 1)
    assert.ok(pixelsNear(gone, INK) === 0, 'the hook is still lit when the cut lands')
    // The wash lifts with the words rather than dimming the site for the whole reel.
    const under = meanLuma(held, ...SCRIM_BAND)
    const clear = meanLuma(gone, ...SCRIM_BAND)
    assert.ok(clear > under * 1.25, `the scrim outlived its text: ${under} -> ${clear}`)
  })

  test('the wash rides with its text at the bottom, and the old band is left alone', async () => {
    // The same two frames read at the band the slot used to occupy (#60). The hook is
    // lit on one and gone on the other, and up here that makes no difference at all:
    // the wash inverted with the copy rather than the copy sliding out from under it.
    const lit = meanLuma(await frame(reelPath, HOOK_HELD), ...ABOVE_THE_WASH)
    const dark = meanLuma(await frame(reelPath, CUTS[0]! - 1), ...ABOVE_THE_WASH)
    assert.ok(
      Math.abs(lit - dark) < dark * 0.05,
      `something is still drawn above the wash: ${lit} vs ${dark}`,
    )
  })

  test('a label lives and dies inside its own shot', async () => {
    // #services carries the reel's written label. It is dark at both ends of its shot
    // and lit in the middle, so no cut ever has text on either side of it.
    for (const index of [195, 200, 294, 299]) {
      const at = pixelsNear(await frame(reelPath, index), INK)
      assert.equal(at, 0, `the label is lit at frame ${index}, next to a cut`)
    }
    const lit = pixelsNear(await frame(reelPath, 240), INK)
    assert.ok(lit > 1000, `the label never appears (${lit}px of ink)`)
  })

  test('a beat naming no label draws its section’s own heading, on the same cue', async () => {
    // #hero's beat says nothing about copy, so it draws "Fixture hero" off the page
    // (#62) — and the label the page wrote keeps the cue a written one gets: dark at
    // both ends of the shot, lit in the middle, never across a cut.
    for (const index of [CUTS[0]!, CUTS[0]! + 5, 189, 194]) {
      const at = pixelsNear(await frame(reelPath, index), INK)
      assert.equal(at, 0, `the defaulted label is lit at frame ${index}, next to a cut`)
    }
    const lit = pixelsNear(await frame(reelPath, 150), INK)
    assert.ok(lit > 1000, `the heading is never drawn (${lit}px of ink)`)
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
    // And a beat with nothing to say is never washed at all: #gallery is four images
    // and no heading, so nothing defaults it a label either (#62). Read where the
    // label of the shot before it was up, and where its own would have been — both
    // clear, and neither the other, so the wash is not merely late or early.
    for (const index of [320, 350]) {
      const unlabelled = meanLuma(await frame(reelPath, index), ...SCRIM_BAND)
      assert.ok(
        unlabelled > without * 0.7,
        `an unlabelled beat is scrimmed at frame ${index} (${unlabelled} vs ${without})`,
      )
    }
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
    const tagline = meanLuma(card, layout.tagline.y, layout.tagline.y + TYPE.tagline.lineHeight)
    const headline = meanLuma(card, layout.headline.y + 10, layout.headline.y + 90)
    const credit = meanLuma(card, layout.credit.y, layout.credit.y + TYPE.credit.lineHeight)

    assert.ok(mark > empty * 2, `nothing is drawn where the mark should be (${mark})`)
    assert.ok(tagline > empty * 2, `nothing is drawn where the tagline should be (${tagline})`)
    assert.ok(headline > empty * 2, `nothing is drawn where the headline should be (${headline})`)
    // Four separate elements down the card and not one block of ink (#61): between the
    // mark and the tagline, and between the tagline and the ask, the ground is bare.
    // Read on the pixels rather than off the layout — `card.test.ts` already asserts
    // the arithmetic, and what this frame is evidence of is that it rendered that way.
    // Inset windows, because the card is drifting and its pixels have travelled.
    for (const [name, from, to] of [
      ['the mark and the tagline', layout.mark.y + layout.mark.height + 5, layout.tagline.y - 5],
      ['the tagline and the ask', layout.tagline.y + TYPE.tagline.size + 15, layout.headline.y - 5],
    ] as const) {
      const gap = meanLuma(card, from, to)
      assert.ok(gap < empty * 1.5, `${name} run together into one block (${gap} vs ${empty})`)
    }
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

  test('emits frame 0 as a still, hook and all, beside the mp4', async () => {
    // The Facebook in-feed thumbnail, read back off the reel rather than rendered a
    // second time — a still derived from anything but the mp4 can disagree with it.
    const path = join(ws.root, 'out', 'fixture-frame0.jpg')
    assert.ok(existsSync(path), 'no still at out/fixture-frame0.jpg')
    const still = await frame(path, 0)
    assert.ok(meanDiff(still, await frame(reelPath, 0)) < 3, 'the still is not frame 0')
    assert.ok(pixelsNear(still, INK) > 10_000, 'the hook is not drawn on the thumbnail')
  })

  test('emits a contact sheet with one tile per cut point', async () => {
    // n + 2 tiles: frame 0, then the frame each cut lands on, in one row.
    const path = join(ws.root, 'out', 'fixture-sheet.jpg')
    assert.ok(existsSync(path), 'no sheet at out/fixture-sheet.jpg')
    assert.deepEqual(await size(path), sheetSize(CUTS.length + 2))

    // Every tile against the reel frame it claims to be: frame 0, then each cut, then
    // the card once it is alone on screen — its own cut point being where the
    // crossfade starts, which shows neither the beat it leaves nor the card.
    const sheet = await frame(path, 0)
    for (const [index, at] of [0, ...CUTS, CARD_ALONE].entries()) {
      const drawn = tile(sheet, index)
      const want = await frame(reelPath, at, [SHEET_TILE.width, SHEET_TILE.height])
      assert.ok(meanDiff(drawn, want) < 6, `tile ${index} is not the reel at frame ${at}`)
    }
  })

  test('the review stills stay in out/ and nothing is written to reels/', () => {
    // Scratch, like the render they describe (#14): the mp4 is the record, frame 0 is
    // recoverable from it, and the sheet has no life after the judgment.
    assert.ok(!existsSync(join(ws.root, 'reels')), 'render wrote into reels/')
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

describe('reel render, died mid-pass', () => {
  test('leaves its debris — no cleanup, partial masters intact', async () => {
    // A bed that is on disk and is not audio: `check` asks whether the file exists
    // (#8), so this passes the preflight and dies in the mux, having captured and cut
    // everything. Which is a real mid-pass death, and the debris is what it is
    // diagnosed from.
    const dying = await workspace()
    try {
      await writeFile(join(dying.root, 'not-music.mp3'), 'not audio')
      await dying.site(
        'dying',
        `
import { defineSite } from 'reel'
export default defineSite({
  url: '${fixture.url}',
  hook: { text: 'Spotless, every time.' },
  beats: [{ selector: '#hero' }, { selector: '#services' }, { selector: '#gallery' }],
  cta: { credit: 'fixture.test' },
  music: { file: 'not-music.mp3' },
})
`,
      )
      const run = await reel(['render', 'dying'], dying.root)
      assert.equal(run.code, 1, run.output)

      const out = join(dying.root, 'out')
      assert.ok(existsSync(join(out, 'masters', 'hook.jpg')), 'the masters were cleaned up')
      assert.ok(
        existsSync(join(out, 'masters', 'shot-000000-hook.mp4')),
        'the shots were cleaned up',
      )
      // And promotion takes an explicit `.mp4` path that this run never produced, so
      // none of that debris can be promoted by accident.
      assert.ok(!existsSync(join(out, 'dying-3beat.mp4')), 'a dead render left an mp4')
      assert.ok(!existsSync(join(out, 'dying-frame0.jpg')), 'a dead render left a still')
    } finally {
      await dying.dispose()
    }
  })
})

/**
 * The live hook (#63, ADR-0006) — a reel whose opening 3.0s is *recorded* from the
 * running page rather than synthesised from one frozen screenshot.
 *
 * Its own render, because the claim is about a whole pass: the hook load is stabilised
 * and never frozen while the beat loads still are, and the difference is only visible in
 * the mp4 the two of them end up in together. In *this* file rather than a file of its
 * own, because a second full render running alongside this one saturates the machine —
 * `settle`'s "check completes in seconds" is a wall-clock budget and it is the first
 * thing to go. Beside the still reel is also where it reads: the still hook above is the
 * thing every assertion here is a difference from.
 *
 * The control for "the page moved" is inside the ambient reel rather than in a second
 * render of it: beat 0 is the *same* `#hero` section, frozen, under a drift three times
 * deeper than the hook's breath. If the hook's frames still change far more than that
 * beat's, the motion is the page's own and not the camera's — and the control having the
 * *more* active camera is what makes that a one-way argument.
 */
describe('an ambient hook', () => {
  /**
   * The band both hooks are read in: 70 rows of the fixture's `<video>`, and nothing else.
   *
   * Chosen rather than the whole frame, because a whole-frame difference is three claims
   * at once. This band is above the scrim's release, so no wash attenuates it; it is near
   * enough the frame's centre that neither the hook's 3% breath nor the beat's 10% drift
   * moves its content more than a pixel or two; and the *same element* falls in it either
   * way — the hero video, playing in the recording and pinned in the master. What is left
   * in the number is whether the page was moving.
   */
  const VIDEO_BAND = [700, 770] as const
  const HOOK_FRAMES = frameCount(HOOK_MS)

  /**
   * Beat 0 is `#hero` again and overridden to drift, so it is the still hook's shot in
   * all but name: same section, same page, same kind of move, off a frozen master.
   */
  function ambientSite(url: string): string {
    return `
import { defineSite } from 'reel'
export default defineSite({
  url: '${url}',
  hook: { motion: 'ambient', text: "It moves.\\nSo does this." },
  beats: [
    { selector: '#hero', move: 'drift' },
    { selector: '#services' },
    { selector: '#gallery' },
  ],
  cta: { credit: 'fixture.test' },
})
`
  }

  let live: Workspace
  let livePath: string
  let liveMasters: string
  let liveRun: Run

  before(async () => {
    live = await workspace()
    await live.site('ambient', ambientSite(fixture.url))
    livePath = join(live.root, 'out', 'ambient-3beat.mp4')
    liveMasters = join(live.root, 'out', 'masters')
    liveRun = await reel(['render', 'ambient'], live.root)
    assert.equal(liveRun.code, 0, liveRun.output)
  })

  after(() => live.dispose())

  /**
   * How far the video band travels across a shot, sampled every half second.
   *
   * The sum along a chain rather than one pair's difference, because the fixture's hero
   * video is a short loop of flat colours: any *given* pair of frames can land twice on
   * one colour, and the recording starts wherever the page's own clock had got to. What
   * cannot be small is the whole path — unless nothing moved at all.
   */
  async function bandTravel(from: number): Promise<number> {
    const at = [5, 20, 35, 50, 65, 80].map((offset) => from + offset)
    const frames = await Promise.all(at.map((index) => frame(livePath, index)))
    const bands = frames.map((bytes) => rows(bytes, ...VIDEO_BAND))
    return bands
      .slice(1)
      .reduce((total, band, i) => total + meanDiff(band, bands[i] as Buffer), 0)
  }

  test('records the hero instead of screenshotting it', () => {
    // A recording, not a master — and it is where the masters are, so the line that
    // wipes them wipes it. Never a build artifact, never promoted.
    assert.ok(existsSync(join(liveMasters, 'hook.mp4')), 'no recording at out/masters/hook.mp4')
    assert.ok(!existsSync(join(liveMasters, 'hook.jpg')), 'the hook was screenshotted as well')
    // The browser's own raw capture is scratch even by scratch's standards.
    assert.ok(!existsSync(join(liveMasters, 'recording')), 'the raw recording survived the pass')
    // And the beats are still masters: they still take a screenshot of a frozen page.
    for (const name of ['beat-0.jpg', 'beat-1.jpg', 'beat-2.jpg']) {
      assert.ok(existsSync(join(liveMasters, name)), `no master at out/masters/${name}`)
    }
  })

  test('is exactly the hook, at the timeline’s rate and the camera’s pixels', async () => {
    const shot = await probe(join(liveMasters, 'hook.mp4'), 'stream=nb_frames,width,height', 'v:0')
    assert.equal(Number(shot.nb_frames), HOOK_FRAMES)
    // One frame of pixels: a screencast is taken at the CSS viewport whatever device
    // scale factor it is handed, so a recording is the frame and never larger.
    assert.deepEqual([Number(shot.width), Number(shot.height)], [FRAME_WIDTH, FRAME_HEIGHT])
  })

  test('costs what it cost, reported like every other shot', () => {
    // #18: the reason to read this output is "which shot is slow", and a hook that dwells
    // on the page for RECORD_START_MS before recording 3.0s of it is the slowest thing in
    // the pass. It is counted and timed with the rest.
    assert.match(liveRun.stdout, /^master 1\/4 hook {7}\d+\.\d+s$/m)
    assert.equal(liveRun.stdout.match(/^master \d\/4 /gm)?.length, 4)
    const seconds = Number(/^master 1\/4 hook {7}(\d+\.\d+)s$/m.exec(liveRun.stdout)?.[1])
    assert.ok(
      seconds > (RECORD_START_MS + HOOK_MS) / 1000,
      `the hook was not dwelt on and recorded (${seconds}s)`,
    )
  })

  test('moves because the page moves, not because the camera does', async () => {
    // The whole of ADR-0006 as one comparison. Beat 0 is the same hero video, frozen,
    // under a drift three times deeper than the hook's breath — so the camera is *more*
    // active on the control than on the subject. Two frames sampled inside the hook still
    // differ where the same two inside the beat do not, and the only thing that can
    // account for that is the page's own clock.
    const moving = await bandTravel(0)
    const frozen = await bandTravel(CUTS[0] as number)
    // The control is not perfectly still — its deeper drift drags the video's own bottom
    // edge through the band — which is the point: even against that, the live hook moves
    // an order of magnitude further.
    assert.ok(
      moving > frozen * 5 && moving > 100,
      `the live hook is the same shot repeated: ${moving.toFixed(1)} against a frozen ` +
        `${frozen.toFixed(1)}`,
    )
  })

  test('carries the page chrome it scrolled under — the one capture that scrolls', async () => {
    // A master is clipped out of a full-page screenshot and never scrolled to, which is
    // what keeps sticky furniture out of a beat. A recording *is* the viewport, so it is
    // scrolled to the hero and the fixture's sticky nav comes with it. That is
    // `CONTEXT.md`'s "chrome is in the hook or in nothing at all", asserted from the side
    // that had no way to happen before #63 — the still reel above asserts the other.
    const first = await frame(livePath, 0)
    assert.ok(
      pixelsNear(rows(first, 0, 120), PAGE_CHROME) > 50_000,
      'the recording is not the viewport scrolled to the hero',
    )
    // And still nowhere else: every beat is still clipped rather than scrolled to.
    for (const index of [130, 235, 340]) {
      const beat = await frame(livePath, index)
      assert.equal(pixelsNear(beat, PAGE_CHROME), 0, `page chrome is baked into frame ${index}`)
    }
  })

  test('draws its line fully on frame 0, and never animates it in', async () => {
    // Frame 0 is the in-feed thumbnail whichever way the pixels underneath it were got:
    // the line is at full alpha on it, in the slot, and stays there for the hold.
    const first = await frame(livePath, 0)
    const inSlot = pixelsNear(rows(first, TEXT_SLOT.top, TEXT_SLOT.bottom), INK)
    assert.ok(inSlot > 5_000, `the hook is not drawn on frame 0 (${inSlot}px of ink)`)
    assert.equal(pixelsNear(first, INK) - inSlot, 0, 'the thumbnail draws ink outside the slot')

    const held = pixelsNear(await frame(livePath, HOOK_HELD), INK)
    assert.ok(
      Math.abs(inSlot - held) < inSlot * 0.05,
      `the hook’s alpha moves during its hold: ${inSlot} -> ${held}`,
    )
    // And it lets go before the cut, like a still hook's does (#24).
    const cut = CUTS[0] as number
    assert.equal(pixelsNear(await frame(livePath, cut - 1), INK), 0, 'the hook outlives its shot')
  })

  test('still cuts hard into a beat that is still a frozen master', async () => {
    const cut = CUTS[0] as number
    const within = meanDiff(await frame(livePath, cut - 2), await frame(livePath, cut - 1))
    const across = meanDiff(await frame(livePath, cut - 1), await frame(livePath, cut))
    assert.ok(across > within * 10, `the hook does not cut hard (${within} -> ${across})`)
  })
})

/**
 * The other end of #66: a `fit: true` the cap refused, cut into a real reel.
 *
 * `check` says what it decided and `capture` frames the master, both asserted in their
 * own files. What only a render can say is that the beat the human asked to fit is a
 * shot like any other by the time it is on screen — 3.5s of a camera that is still
 * moving at the cut.
 */
describe('a fit beat past the legibility cap', () => {
  /** #tall is 4400px against a 3840px cap, so beat 2 is the one that falls back. */
  function cappedSite(url: string): string {
    return `
import { defineSite } from 'reel'
export default defineSite({
  url: '${url}',
  hook: { text: "Spotless, it's every\\ntime you look." },
  beats: [
    { selector: '#hero' },
    { selector: '#services' },
    { selector: '#tall', fit: true },
  ],
  cta: { credit: 'fixture.test' },
})
`
  }

  let capped: Workspace
  let cappedPath: string
  let cappedRun: Run

  before(async () => {
    capped = await workspace()
    await capped.site('capped', cappedSite(fixture.url))
    cappedPath = join(capped.root, 'out', 'capped-3beat.mp4')
    cappedRun = await reel(['render', 'capped'], capped.root)
  })

  after(() => capped.dispose())

  test('renders, and says what it did with the fit on the way', () => {
    assert.equal(cappedRun.code, 0, cappedRun.output)
    assert.match(
      cappedRun.stdout,
      /^note {2}beats\[2\] '#tall' is 4400px tall; fit pulls out to at most 3840px/m,
    )
    // A note never becomes a refusal: the reel is cut, and it is the length #12 says.
    assert.match(cappedRun.stdout, /^done {2}out[\\/]capped-3beat\.mp4 {2}15\.7s/m)
    assert.ok(existsSync(cappedPath), 'no mp4 at out/capped-3beat.mp4')
  })

  test('the beat is a vertical pan, still travelling at its own cut', async () => {
    // Beat 2's shot, read the way every other shot is (#12): a camera that has eased
    // or landed shows a last pair of frames quieter than a middle pair.
    const [mid, end] = [351, 395]
    const midway = meanDiff(await frame(cappedPath, mid - 1), await frame(cappedPath, mid))
    const landing = meanDiff(await frame(cappedPath, end - 1), await frame(cappedPath, end))
    assert.ok(landing > 0, 'the fallback beat is a still')
    assert.ok(landing > midway / 2, `the fallback beat lands: ${midway} -> ${landing}`)
  })
})

/**
 * The scroll hook (#64, ADR-0006) — the same recording as an ambient one, taken while
 * the page is walked from the top of the document down through the hero, so the
 * effects keyed to the viewport *moving* fire on camera.
 *
 * Its own render for the same reason the ambient one is: the claim is about a whole
 * pass. In this file rather than a file of its own for the same reason too — a third
 * render running alongside these two saturates the machine, and here they run in turn.
 *
 * What it is read against is the fixture's `#reveal`: a 400px bar 50px below the fold
 * at scroll 0, which an IntersectionObserver shows whenever it enters the viewport and
 * hides again when it leaves. No capture that holds the page still can see it. This one
 * can, and that is the whole of what #64 buys.
 */
describe('a scroll hook', () => {
  /** The reveal's own colour, which appears nowhere else on the fixture. */
  const REVEAL = '#00e676'
  /**
   * Where the reveal lands once the house scroll has run: comfortably inside the bar,
   * and above the scrim's release, so no wash attenuates the count.
   */
  const REVEAL_BAND = [540, 700] as const
  const HOOK_FRAMES = frameCount(HOOK_MS)

  function scrollSite(url: string): string {
    return `
import { defineSite } from 'reel'
export default defineSite({
  url: '${url}',
  hook: { motion: 'scroll', text: "It reveals.\\nOn camera." },
  beats: [
    { selector: '#hero', move: 'drift' },
    { selector: '#services' },
    { selector: '#gallery' },
  ],
  cta: { credit: 'fixture.test' },
})
`
  }

  let walked: Workspace
  let walkedPath: string
  let walkedRun: Run

  before(async () => {
    walked = await workspace()
    await walked.site('scrolled', scrollSite(fixture.url))
    walkedPath = join(walked.root, 'out', 'scrolled-3beat.mp4')
    walkedRun = await reel(['render', 'scrolled'], walked.root)
    assert.equal(walkedRun.code, 0, walkedRun.output)
  })

  after(() => walked.dispose())

  test('is exactly the hook, at the timeline’s rate and the camera’s pixels', async () => {
    // ADR-0006's arithmetic is unchanged by driving the page: the recording is the
    // shot's own length at the reel's fps, and one frame of pixels.
    const shot = await probe(
      join(walked.root, 'out', 'masters', 'hook.mp4'),
      'stream=nb_frames,width,height',
      'v:0',
    )
    assert.equal(Number(shot.nb_frames), HOOK_FRAMES)
    assert.deepEqual([Number(shot.width), Number(shot.height)], [FRAME_WIDTH, FRAME_HEIGHT])
  })

  test('fires the reveal on camera — the frames carry what no still could', async () => {
    // Frame 0 is the top of the document, where the reveal is 50px below the fold: not
    // in the band, and not anywhere else in the frame either.
    const first = await frame(walkedPath, 0)
    assert.equal(pixelsNear(first, REVEAL), 0, 'the reveal is already on the thumbnail')

    // And by the last frame of the hook the walk has carried it up into the band.
    const last = await frame(walkedPath, (CUTS[0] as number) - 1)
    const revealed = pixelsNear(rows(last, ...REVEAL_BAND), REVEAL)
    const band = (REVEAL_BAND[1] - REVEAL_BAND[0]) * FRAME_WIDTH
    assert.ok(
      revealed > band * 0.9,
      `the reveal never fired: ${revealed} of ${band} px in the band`,
    )
  })

  test('the page moves under the lens, not the lens over the page', async () => {
    // A 3% breath cannot carry a bar 1500px up the frame. Sampled across the hook, the
    // frames travel far further than the same camera manages over a frozen beat — and
    // beat 0 is the same `#hero`, under a drift three times deeper.
    const at = [5, 25, 45, 65, 85]
    const travel = async (from: number) => {
      const frames = await Promise.all(at.map((offset) => frame(walkedPath, from + offset)))
      return frames
        .slice(1)
        .reduce((total, bytes, i) => total + meanDiff(bytes, frames[i] as Buffer), 0)
    }
    const moving = await travel(0)
    const frozen = await travel(CUTS[0] as number)
    // A lower bar than the ambient hook's, and for the reason that makes the argument
    // one-way: the control is a *deeper* camera over the same section, and a 10% drift
    // over the fixture's textured hero is not a small number to beat.
    assert.ok(
      moving > frozen * 3 && moving > 100,
      `the scroll hook barely moves: ${moving.toFixed(1)} against a frozen ${frozen.toFixed(1)}`,
    )
  })

  test('starts at the top of the document, and scrolls off it', async () => {
    // The one capture that scrolls, said the other way round from #63's: an ambient
    // hook is scrolled *to* its hero and holds there, so its chrome is baked in for the
    // whole shot. A walk starts at the document's top — where the sticky nav is what a
    // frame 0 sees — and leaves it behind, because the fixture's nav is not fixed.
    const first = await frame(walkedPath, 0)
    assert.ok(
      pixelsNear(rows(first, 0, 100), PAGE_CHROME) > 50_000,
      'the walk did not start at the top of the document',
    )
    // And still nowhere in a beat: every beat is still clipped rather than scrolled to.
    for (const index of [130, 235, 340]) {
      const beat = await frame(walkedPath, index)
      assert.equal(pixelsNear(beat, PAGE_CHROME), 0, `page chrome is baked into frame ${index}`)
    }
  })

  test('draws its line fully on frame 0, and still cuts hard into a frozen beat', async () => {
    // Everything ADR-0006 fixed for an ambient hook holds for a walked one: frame 0 is
    // the thumbnail whichever way the pixels were got, and the cut is still a cut.
    // Counted in the slot only, and never across the frame as the still and ambient
    // hooks are: a walk starts at the top of the document, so the fixture's own `<h1>`
    // is on this thumbnail at full size, and it is set in the same ink. The claim being
    // made is about the overlay's alpha, so it is read where the overlay is.
    const first = await frame(walkedPath, 0)
    const inSlot = pixelsNear(rows(first, TEXT_SLOT.top, TEXT_SLOT.bottom), INK)
    assert.ok(inSlot > 5_000, `the hook is not drawn on frame 0 (${inSlot}px of ink)`)
    const held = pixelsNear(rows(await frame(walkedPath, HOOK_HELD), TEXT_SLOT.top, TEXT_SLOT.bottom), INK)
    assert.ok(
      Math.abs(inSlot - held) < inSlot * 0.05,
      `the hook’s alpha moves during its hold: ${inSlot} -> ${held}`,
    )

    // Read in the slot rather than across the frame, unlike the still and ambient hooks
    // above: by the last frame the walk has pulled the fixture's own `#services`
    // heading up into the bottom of the shot, and that ink is the page's, not the
    // overlay's. The slot is where the overlay would be if it had outlived its cue.
    const cut = CUTS[0] as number
    const last = rows(await frame(walkedPath, cut - 1), TEXT_SLOT.top, TEXT_SLOT.bottom)
    assert.equal(pixelsNear(last, INK), 0, 'the hook outlives its shot')
    const within = meanDiff(await frame(walkedPath, cut - 2), await frame(walkedPath, cut - 1))
    const across = meanDiff(await frame(walkedPath, cut - 1), await frame(walkedPath, cut))
    assert.ok(across > within * 3, `the hook does not cut hard (${within} -> ${across})`)
  })

  test('is not noted as degraded — the fixture’s reveal re-fires', () => {
    // The other half of #64's report, from the render side: a note here would mean the
    // hook above was an ambient one wearing a scroll config's name.
    assert.doesNotMatch(walkedRun.stdout, /^note/m)
  })
})

/** One tile out of a contact sheet, as raw RGB — the same shape `frame` returns. */
function tile(sheet: Buffer, index: number): Buffer {
  const { width, height, gap } = SHEET_TILE
  const stride = (sheetSize(CUTS.length + 2)[0] as number) * 3
  const left = (gap + index * (width + gap)) * 3
  const rows: Buffer[] = []
  for (let row = 0; row < height; row++) {
    const start = (gap + row) * stride + left
    rows.push(sheet.subarray(start, start + width * 3))
  }
  return Buffer.concat(rows)
}

async function size(path: string): Promise<[number, number]> {
  const { width, height } = await probe(path, 'stream=width,height', 'v:0')
  return [Number(width), Number(height)]
}
