/**
 * The motion probe an `ambient` live shot is gated on (#88, ADR-0008).
 *
 * ADR-0006 let the hook be recorded and named a video background as the first case it
 * was for. The first such hero recorded *dead*: it moves on the page and not in the
 * 9:16 frame, because covering a 1080x1920 box with a 1920x1080 video keeps about a
 * third of the source and the moving water was mostly outside that column. Nothing
 * failed — `check` passed, the render exited 0, the frame count matched — and the eye
 * cannot catch it either, because a dead recording and a live one make the same
 * review still. So it is measured instead, before the shot is taken.
 *
 * What is measured is the *capture*, not the page: the stabilised page framed exactly
 * as the recording would frame it, at the shot's own viewport, sampled and differenced
 * per horizontal band. That is deliberately blind to *why* a hook would record dead —
 * a cropped hero, a genuinely static one, or a compositing hole of the kind #88 went
 * looking for and did not find. The one thing it answers is the one thing that matters
 * downstream: is there anything here worth spending 3.0s of recording on.
 *
 * The floor and the window are house constants for the reason the scroll's pace is:
 * there is no site for which the right answer differs on taste, and a per-site floor
 * would be a hand-tuned "record it anyway" wearing a config field.
 */

import { inflateSync } from 'node:zlib'
import type { Page } from 'playwright'

/**
 * The reading an `ambient` hook has to beat to be recorded — the highest band mean,
 * in absolute channel difference.
 *
 * Calibrated framed at 1080x1920, headless, across all four client sites (ADR-0008):
 * mwaforge's five drifting `.hero-shape` blocks read 35.03, pharos's cropped `<video>`
 * reads 1.46, and legacyroof's and brobst's static heroes read 0.00. The gap between
 * dead and live is 1.46 to 35.03 with nothing in it, so 5.0 sits in open ground rather
 * than on a boundary anyone has to defend to the second decimal.
 *
 * Note where a dead hook lands: **nonzero**. "Did anything change at all" is not the
 * test — 1.46 is the sliver of moving water that survives the crop. The probe's own
 * noise floor really is 0.00, because two headless screenshots of a static page are
 * bit-identical; the 2.0-2.9 seen differencing a rendered master is the mp4 encoder,
 * which is exactly why this is asked of screenshots beforehand rather than of the
 * recording afterwards.
 */
export const MOTION_FLOOR = 5.0

/**
 * How long the probe watches for, and how many times it looks.
 *
 * Three samples rather than a pair, because a single pair can land on an unlucky loop
 * phase: pharos read 1.46 at 2s apart and 0.70 at 6s, and the reading taken is the
 * *highest* of the three pairs. Two seconds because that is the order of the shot it
 * is deciding about — a window much shorter measures a phase rather than a motion, and
 * a longer one spends preflight time on a question already answered.
 */
export const MOTION_WINDOW_MS = 2000
export const MOTION_SAMPLES = 3

/**
 * How many horizontal bands the frame is differenced in.
 *
 * Banded rather than whole-frame averaged, because a hero's motion is usually *local* —
 * one strip of video, one drifting block — and spreading it over 1920 rows of an
 * otherwise static page divides it away. Eight is coarse enough that a band is far
 * bigger than any one moving element and fine enough that a live band stands out
 * against its neighbours: pharos's landscape crop reads 5.24 and 7.67 in bands 5 and 6
 * against ~0.7 either side, framed 1920x1080 where the motion survives.
 */
export const MOTION_BANDS = 8

/**
 * What `check` says about an `ambient` hook that would record dead. A note and never a
 * problem, exactly as the scroll's degradation is: the reel renders, and what it
 * renders is the better shot.
 *
 * The bias here is the *inverse* of `scrollEffectsRefire`'s, and that is deliberate
 * rather than an oversight to be tidied up into a matching pair. The scroll question
 * errs towards scrolling because the costly mistake there is silently dwelling on a
 * hero built to reveal. Here a false pass ships the dead hook and a false fail ships a
 * `still` — a deterministic frame 0, the site's `videoTime` honoured, a beat's 10%
 * drift instead of a 3% breath. One of those failure modes is strictly better than the
 * thing it replaces, so the probe leans on it.
 */
export const STILL_DEGRADATION =
  "hook.motion 'ambient' — this hero does not move in the frame it would be shot in, " +
  "so the hook is captured as 'still'"

/**
 * Put the page where a live shot is framed from, and let it paint there.
 *
 * A recording *is* the viewport, so there is no full-page screenshot to clip a frame
 * out of and the scroll position is the framing. Stated once and called by both the
 * probe and the recording, because a probe that framed the page a pixel differently
 * from the recording would be measuring a different shot than the one it decides.
 *
 * The painted frame is what makes the dwell after it worth anything: without it the
 * page is still drawing where it was put, and the first thing sampled is the scroll.
 */
export async function frameAt(page: Page, y: number): Promise<void> {
  await page.evaluate((to) => window.scrollTo(0, to), y)
  await painted(page)
}

/**
 * Let the page paint what was just asked of it, and wait for the frame it paints on.
 *
 * Stated once for the same reason the framing is: every caller here is about to time
 * something against a frame the browser has actually drawn — where a probe samples,
 * where a recording's dwell starts, where its window opens — and a caller that skipped
 * the wait would be measuring the request rather than the paint. One rAF, because one
 * is what "the browser has drawn it" costs.
 */
export async function painted(page: Page): Promise<void> {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))))
}

/** Whether the frame this page is currently at moves enough to be worth recording. */
export async function movesAsFramed(page: Page): Promise<boolean> {
  return (await framedMotion(page)) >= MOTION_FLOOR
}

/**
 * How much the frame this page is currently at moves, as one number: the highest band
 * mean over every pair of samples.
 *
 * Screenshots rather than a recording, because this runs *before* the record window —
 * it is predictive, and it has to be, since the master's own encoder noise sits close
 * enough to a dead reading to make a post-hoc threshold jump around.
 *
 * The page is left where it was framed; the caller put it there and is the one that
 * knows where it goes next.
 */
export async function framedMotion(page: Page): Promise<number> {
  const samples: Bitmap[] = []
  for (let sample = 0; sample < MOTION_SAMPLES; sample++) {
    if (sample > 0) await page.waitForTimeout(MOTION_WINDOW_MS / (MOTION_SAMPLES - 1))
    samples.push(decodePng(await page.screenshot({ type: 'png' })))
  }

  let reading = 0
  for (let a = 0; a < samples.length; a++) {
    for (let b = a + 1; b < samples.length; b++) {
      reading = Math.max(reading, highestBandMean(samples[a] as Bitmap, samples[b] as Bitmap))
    }
  }
  return reading
}

/** A decoded screenshot: 8-bit samples, row-major, `channels` of them per pixel. */
type Bitmap = { width: number; height: number; channels: number; data: Buffer }

/**
 * The largest per-band mean absolute channel difference between two samples.
 *
 * Colour only, never alpha: a screenshot is opaque, so an alpha channel would fold a
 * column of 255s into every mean and drag the whole reading down by a quarter for no
 * information at all.
 */
function highestBandMean(a: Bitmap, b: Bitmap): number {
  if (a.width !== b.width || a.height !== b.height || a.channels !== b.channels) {
    throw new Error('the motion probe sampled two frames of different shapes')
  }
  let highest = 0
  for (let band = 0; band < MOTION_BANDS; band++) {
    const from = Math.floor((band * a.height) / MOTION_BANDS)
    const to = Math.floor(((band + 1) * a.height) / MOTION_BANDS)
    let sum = 0
    for (let at = from * a.width * a.channels; at < to * a.width * a.channels; at += a.channels) {
      sum += Math.abs((a.data[at] as number) - (b.data[at] as number))
      sum += Math.abs((a.data[at + 1] as number) - (b.data[at + 1] as number))
      sum += Math.abs((a.data[at + 2] as number) - (b.data[at + 2] as number))
    }
    highest = Math.max(highest, sum / ((to - from) * a.width * 3))
  }
  return highest
}

/**
 * A PNG screenshot as raw samples.
 *
 * Decoded here rather than shelled out to ffmpeg or pulled in as a dependency, for the
 * reason the face in `measure.ts` is parsed here: this is the preflight, and a `check`
 * that has to spawn a process three times to answer "does this move" has a failure mode
 * with no upside. Only what a browser screenshot actually is — 8 bits a sample, RGB or
 * RGBA, uninterlaced — is supported, and anything else fails loudly rather than being
 * quietly mis-read as a reading.
 */
function decodePng(png: Buffer): Bitmap {
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('the motion probe was handed something that is not a PNG')
  }
  let shape: { width: number; height: number; channels: number } | null = null
  const compressed: Buffer[] = []
  for (let at = 8; at + 8 <= png.length; at += 12 + png.readUInt32BE(at)) {
    const length = png.readUInt32BE(at)
    const type = png.toString('latin1', at + 4, at + 8)
    const body = png.subarray(at + 8, at + 8 + length)
    if (type === 'IHDR') {
      const depth = body.readUInt8(8)
      const colour = body.readUInt8(9)
      const interlace = body.readUInt8(12)
      // 2 is truecolour and 6 is truecolour with alpha; a palette or a greyscale
      // screenshot is not something any browser here emits.
      const channels = colour === 2 ? 3 : colour === 6 ? 4 : 0
      if (depth !== 8 || channels === 0 || interlace !== 0) {
        throw new Error(
          `the motion probe cannot read this PNG: ${depth}-bit, colour type ${colour}` +
            `${interlace ? ', interlaced' : ''}`,
        )
      }
      shape = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), channels }
    } else if (type === 'IDAT') {
      // One zlib stream split across however many chunks the encoder felt like, so the
      // parts are concatenated and inflated once rather than inflated one at a time.
      compressed.push(body)
    } else if (type === 'IEND') break
  }
  if (!shape) throw new Error('the motion probe read a PNG with no header')
  return { ...shape, data: unfilter(inflateSync(Buffer.concat(compressed)), shape) }
}

/**
 * The inflated stream with its per-row filters undone — PNG's whole compression trick,
 * which is that each row is stored as a delta against the row or the pixel before it.
 *
 * Every filter is implemented rather than the one Chromium happens to emit: which it
 * picks is per row and per build, and a decoder that guessed right today would read a
 * silently wrong number the day it guessed wrong.
 */
function unfilter(
  raw: Buffer,
  shape: { width: number; height: number; channels: number },
): Buffer {
  const bpp = shape.channels
  const stride = shape.width * bpp
  const out = Buffer.allocUnsafe(stride * shape.height)
  for (let row = 0; row < shape.height; row++) {
    // Each row is one filter byte and then its samples.
    const filter = raw[row * (stride + 1)] as number
    const from = row * (stride + 1) + 1
    const to = row * stride
    for (let at = 0; at < stride; at++) {
      const x = raw[from + at] as number
      // Left, above, and above-left. Off the edge of the image they are zero, which is
      // what makes the first row and the first pixel of every row decode.
      const left = at >= bpp ? (out[to + at - bpp] as number) : 0
      const above = row > 0 ? (out[to - stride + at] as number) : 0
      const corner = row > 0 && at >= bpp ? (out[to - stride + at - bpp] as number) : 0
      let value: number
      switch (filter) {
        case 0: value = x; break
        case 1: value = x + left; break
        case 2: value = x + above; break
        case 3: value = x + ((left + above) >> 1); break
        case 4: value = x + paeth(left, above, corner); break
        default: throw new Error(`the motion probe met PNG row filter ${filter}`)
      }
      out[to + at] = value & 0xff
    }
  }
  return out
}

/** PNG's predictor: whichever of the three neighbours their linear estimate is nearest. */
function paeth(left: number, above: number, corner: number): number {
  const estimate = left + above - corner
  const toLeft = Math.abs(estimate - left)
  const toAbove = Math.abs(estimate - above)
  const toCorner = Math.abs(estimate - corner)
  if (toLeft <= toAbove && toLeft <= toCorner) return left
  return toAbove <= toCorner ? above : corner
}
