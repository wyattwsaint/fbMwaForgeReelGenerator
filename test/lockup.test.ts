/**
 * The gate on the lockup (#106): the two halves this repo *builds* against the one
 * exported asset it was traced and measured from.
 *
 * Every other test of the lockup is an arithmetic test — `card.test.ts` asks whether the
 * geometry solves to the numbers the asset was measured at. This one asks the only
 * question those cannot: whether the pixels ffmpeg actually draws are the brand's mark.
 * `MWA` comes from a hand-fitted SVG, `FORGE` from five separately-placed `drawtext`s at
 * a tracking and a kern that are constants in `lockup.ts`, and either could be wrong in
 * a way no ratio would catch — a polygon vertex a pixel out, a kern applied to the wrong
 * pair, a baseline solved off the wrong metric. Rendered against the asset, all of that
 * is one number.
 *
 * It needs ffmpeg, so it is its own file rather than part of `card.test.ts`: the rest of
 * the card's tests are arithmetic and run in milliseconds.
 *
 * The frame read back is frame 0 of the real card chain, which means it has been through
 * the drift's `scale=neighbor` → `zoompan` → `scale=lanczos` round trip. That is
 * deliberate: the gate should see the pixels that ship, not a cleaner rendering of them
 * that nobody watches.
 */

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { cardCamera } from '../src/camera.ts'
import { cardChains, cardLayout, rawFrameInput, writeCardSources } from '../src/card.ts'
import { ffmpegPixels } from '../src/compose.ts'
import { channels, pad, stream } from '../src/filtergraph.ts'
import { FRAME_HEIGHT, FRAME_WIDTH } from '../src/frame.ts'
import { GROUND, LOCKUP_PNG_FILE } from '../src/house.ts'
import { FPS, planReel } from '../src/plan.ts'
import type { Shot } from '../src/plan.ts'

/**
 * The asset's own ink box, in its 6680x1440 pixels — found by scanning its alpha for
 * the first and last row and column carrying any, and confirmed against the crop.
 * Written down rather than re-scanned per run: it is a property of a checked-in file.
 */
const INK_BOX = { width: 6190, height: 640, x: 160, y: 396 }

/**
 * What counts as ink on either side.
 *
 * They are not the same test and cannot be: the render is opaque pixels over house
 * ground, so ink is distance travelled from the ground; the reference is an alpha
 * channel, so ink is coverage. 40 of 255 is well clear of the encode's own noise on flat
 * ground, and 128 is the half-covered pixel — the same edge a rasteriser would call.
 */
const RENDER_INK = 40
const REFERENCE_INK = 128

/** How far the profiles are slid against each other looking for a better fit than 0. */
const SHIFTS = [-3, -2, -1, 0, 1, 2, 3]

const CARD_SHOT = planReel({
  url: 'https://example.test',
  hook: { text: 'Spotless.' },
  beats: [{ selector: '#a' }, { selector: '#b' }, { selector: '#c' }],
  cta: { credit: 'example.test' },
}).shots.at(-1) as Shot

const BOX = cardLayout().lockup

/** A one-byte-per-pixel map of the lockup box: 1 where there is ink. */
type Ink = { width: number; height: number; on: Uint8Array }

function inkOf(width: number, height: number, lit: (index: number) => boolean): Ink {
  const on = new Uint8Array(width * height)
  for (let i = 0; i < on.length; i++) on[i] = lit(i) ? 1 : 0
  return { width, height, on }
}

/** Frame 0 of the card, cropped to the lockup's own box, as ink. */
async function renderedInk(dir: string): Promise<Ink> {
  const { mark, ramp } = await writeCardSources(dir)
  const card = stream('card')
  const out = stream('out')
  const graph = [
    ...cardChains([], cardCamera(CARD_SHOT), stream('0:v'), stream('1:v'), stream('2:v'), card),
    `${pad(card)}crop=${BOX.width}:${BOX.height}:${BOX.x}:${BOX.y}${pad(out)}`,
  ].join(';')

  const bytes = await ffmpegPixels([
    '-f', 'lavfi',
    '-i', `color=c=0x${GROUND.slice(1)}:s=${FRAME_WIDTH}x${FRAME_HEIGHT}:r=${FPS}`,
    ...rawFrameInput(mark),
    ...rawFrameInput(ramp),
    '-filter_complex', graph,
    '-map', pad(out),
    '-frames:v', '1',
    '-f', 'rawvideo',
    '-pix_fmt', 'rgb24',
    '-',
  ])

  const ground = channels(GROUND)
  return inkOf(BOX.width, BOX.height, (i) => {
    const at = i * 3
    return (
      Math.max(
        Math.abs((bytes[at] as number) - ground.r),
        Math.abs((bytes[at + 1] as number) - ground.g),
        Math.abs((bytes[at + 2] as number) - ground.b),
      ) > RENDER_INK
    )
  })
}

/**
 * The exported lockup, cropped to its ink and scaled to the card's own box, as ink.
 *
 * `format=rgba` on both sides of the scale is not decoration: without them `alphaextract`
 * and `scale` cannot negotiate a format between them and ffmpeg refuses the graph.
 */
async function referenceInk(): Promise<Ink> {
  const bytes = await ffmpegPixels([
    '-i', LOCKUP_PNG_FILE,
    '-vf',
    `format=rgba,crop=${INK_BOX.width}:${INK_BOX.height}:${INK_BOX.x}:${INK_BOX.y},` +
      `scale=${BOX.width}:${BOX.height}:flags=lanczos,format=rgba,alphaextract`,
    '-frames:v', '1',
    '-f', 'rawvideo',
    '-pix_fmt', 'gray',
    '-',
  ])
  return inkOf(BOX.width, BOX.height, (i) => (bytes[i] as number) > REFERENCE_INK)
}

/** Intersection over union, over a range of columns — 1.0 is the same shape twice. */
function iou(a: Ink, b: Ink, from = 0, to = a.width): number {
  let both = 0
  let either = 0
  for (let y = 0; y < a.height; y++) {
    for (let x = from; x < to; x++) {
      const lit = a.on[y * a.width + x] as number
      const want = b.on[y * b.width + x] as number
      if (lit && want) both++
      if (lit || want) either++
    }
  }
  return either === 0 ? 0 : both / either
}

/** How much ink stands in each column — the lockup read as a horizontal signal. */
function columnProfile(ink: Ink): number[] {
  const profile = new Array<number>(ink.width).fill(0)
  for (let y = 0; y < ink.height; y++) {
    for (let x = 0; x < ink.width; x++) {
      profile[x] = (profile[x] as number) + (ink.on[y * ink.width + x] as number)
    }
  }
  return profile
}

/** Absolute difference between two profiles with one slid `shift` columns along. */
function profileError(a: number[], b: number[], shift: number): number {
  let total = 0
  for (let x = 0; x < b.length; x++) {
    const at = x + shift
    total += Math.abs((at >= 0 && at < a.length ? (a[at] as number) : 0) - (b[x] as number))
  }
  return total
}

/**
 * Where each gap in the lockup opens: the first empty column of every run of at least
 * `MIN_GAP` of them.
 *
 * This is the letterspacing read off the pixels. Two lockups whose gaps open on the same
 * columns are set at the same tracking, with the same kern, in the same order — which is
 * everything `lockup.ts` decides about the typeset half, said in six numbers.
 *
 * A run of columns, and clear rather than empty, because the `M` pinches to nothing in
 * the middle: its four middle edges meet at a point, and at that column the asset holds
 * no ink at all while this rasteriser holds one or two pixels of it. Both are the same
 * vertex sampled a fraction of a pixel apart. Asking for `PINCH` rather than zero lets
 * the two agree about it, which is the honest answer — and asking for `MIN_GAP` columns
 * of it keeps a one-column pinch anywhere else from being read as a letter gap.
 */
const MIN_GAP = 2
const PINCH = 2

function gapColumns(profile: number[]): number[] {
  const clear = profile.map((ink) => ink <= PINCH)
  const gaps: number[] = []
  for (let x = 1; x < clear.length; x++) {
    if (!clear[x - 1] && clear.slice(x, x + MIN_GAP).every(Boolean)) gaps.push(x)
  }
  return gaps
}

let dir: string
let rendered: Ink
let reference: Ink

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'reel-lockup-'))
  rendered = await renderedInk(dir)
  reference = await referenceInk()
})

after(() => rm(dir, { recursive: true, force: true }))

describe('the rendered lockup is the exported lockup', () => {
  test('both halves land on the asset’s own shape', () => {
    // 0.80 rather than something nearer 1: the two ink tests are not symmetric. The
    // spark's blue end is dim, so a fixed distance-from-ground test catches a little
    // more of its antialiased edge than an alpha >= 128 test does on the reference, and
    // `FORGE` therefore reads slightly *thicker* here than it is. What is left over that
    // is a one-pixel antialias band around a shape 880px wide. Anything that moved a
    // letter, changed a tracking or lost a polygon costs far more than the margin.
    const whole = iou(rendered, reference)
    assert.ok(whole >= 0.8, `the lockup renders at IoU ${whole.toFixed(4)} against the asset`)

    // Each half on its own as well, because the whole can hide either: `MWA` is the
    // larger of the two by ink, so a `FORGE` set at the wrong tracking still leaves the
    // combined figure respectable.
    const split = Math.round(BOX.geometry.forge.x)
    const mwa = iou(rendered, reference, 0, split)
    const forge = iou(rendered, reference, split, BOX.width)
    assert.ok(mwa >= 0.78, `MWA renders at IoU ${mwa.toFixed(4)}`)
    assert.ok(forge >= 0.78, `FORGE renders at IoU ${forge.toFixed(4)}`)
  })

  test('it is not merely close — it is in the right place, to the column', () => {
    // An IoU says how much two shapes share and nothing about whether one is a pixel to
    // the left of where it belongs. Sliding the profiles against each other does: if the
    // lockup were set even one column off, some other shift would fit better than none.
    const a = columnProfile(rendered)
    const b = columnProfile(reference)
    const errors = SHIFTS.map((shift) => profileError(a, b, shift))
    const best = Math.min(...errors)
    assert.equal(
      SHIFTS[errors.indexOf(best)],
      0,
      `the lockup fits best shifted ${SHIFTS[errors.indexOf(best)]} columns: ` +
        SHIFTS.map((shift, i) => `${shift}:${errors[i]}`).join(' '),
    )
  })

  test('every gap opens on the asset’s own column, the word gap included', () => {
    // The tracking and the `F`→`O` kern, end to end. `card.test.ts` asserts that the pen
    // positions solve to the numbers measured off this asset; this asserts that the five
    // `drawtext`s ffmpeg ran put the ink there — and the word gap between the two halves
    // is in the same list, so it also says the trace and the type agree about the cap.
    const drawn = gapColumns(columnProfile(rendered))
    const want = gapColumns(columnProfile(reference))
    assert.equal(
      drawn.length,
      want.length,
      `${drawn.length} gaps drawn (${drawn.join(', ')}), ` +
        `${want.length} in the asset (${want.join(', ')})`,
    )
    for (const [index, column] of want.entries()) {
      assert.ok(
        Math.abs((drawn[index] as number) - column) <= 2,
        `gap ${index} opens at column ${drawn[index]}, the asset opens it at ${column}`,
      )
    }
  })
})
