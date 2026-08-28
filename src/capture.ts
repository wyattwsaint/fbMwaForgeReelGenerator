/**
 * The site pixels a shot is made of (#6).
 *
 * Almost always a **master**: one static, high-resolution screenshot, with every
 * camera move synthesised from it in post (#11). A master is taken as a full-page
 * screenshot *clipped* to the section's page rect and never by scrolling to it, which
 * is what keeps sticky page chrome out of a beat by construction.
 *
 * A live shot is the exception (#63, ADR-0006): the hero is stabilised but never
 * frozen, and the viewport is *recorded* for exactly the shot's duration while the
 * page animates on its own clock. Both come back as a `Master` — a path and the size
 * its move is computed over — because everything downstream of here wants the same
 * two things whichever way the pixels were got.
 */

import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { masterSize } from './camera.ts'
import type { MasterSize } from './camera.ts'
import { ffmpeg, ffprobe, intermediateEncode } from './compose.ts'
import { FRAME_HEIGHT, FRAME_WIDTH, punchedFrameHeight } from './frame.ts'
import { hookRect, rectOf } from './page.ts'
import type { Rect } from './page.ts'
import { FPS, frameCount } from './plan.ts'
import type { Shot, Timeline } from './plan.ts'
import { settle, stabilise } from './settle.ts'
import type { LiveMotion, SiteConfig } from './site.ts'

export type Master = { shot: Shot; path: string; size: MasterSize }

/** Called as each master lands, with what it cost — `render` reports the pass (#18). */
export type OnCapture = (shot: Shot, ms: number) => void

/** #11: JPEG, not PNG — tens of milliseconds a shot rather than half a second. */
const JPEG_QUALITY = 92

/**
 * The fixed post-stabilise moment a recording starts at (ADR-0006).
 *
 * Determinism is spent on a live shot — the page animates on a clock this pipeline
 * does not own — but *composition* is not: every run starts recording the same
 * distance past the same stabilise, so frame 0 frames the same thing even though it
 * is not the same pixels. Frame 0 is the thumbnail Facebook shows, so that much is
 * worth keeping.
 */
export const RECORD_START_MS = 500

/**
 * How long past the shot the browser goes on recording. Slack, not content: the trim
 * window is measured back from the file's own end, and a recording that stopped on the
 * shot's last frame would have no margin for the browser's own close latency.
 */
const RECORD_TAIL_MS = 400

/** Masters live here, run-scoped: wiped by the next render, never a build artifact. */
export function mastersDir(outDir: string): string {
  return join(outDir, 'masters')
}

/**
 * One master per shot that shows the site, written under `out/masters/`.
 *
 * The directory is wiped first. #14 is emphatic that a master is never reused across
 * runs — a cached master is a photograph of a page that may no longer exist — so the
 * only way it can be is if it is still on disk, and this is where that stops. A live
 * shot's recording lands here too and is wiped by exactly the same line: it is a
 * photograph of a page over time, which is if anything staler.
 */
export async function captureMasters(
  config: SiteConfig,
  timeline: Timeline,
  outDir: string,
  onCapture: OnCapture = () => {},
): Promise<Master[]> {
  const dir = mastersDir(outDir)
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })

  const browser = await chromium.launch()
  try {
    const masters: Master[] = []
    for (const group of capturePlan(config, timeline)) {
      masters.push(...(await captureGroup(browser, config, dir, group, onCapture)))
    }
    return masters.sort((a, b) => a.shot.startMs - b.shot.startMs)
  } finally {
    await browser.close()
  }
}

/** One page load, and every shot taken off it. */
type CaptureGroup = {
  url: string
  /** CSS pixels the page is laid out at. */
  viewport: { width: number; height: number }
  /** Device scale factor: master pixels per CSS pixel. */
  scale: number
  /**
   * Present when this load is recorded rather than screenshotted — which is a
   * different *settle*, not just a different output, so it can never share a load
   * with a shot that wanted the page frozen.
   */
  motion?: LiveMotion
  shots: Shot[]
}

/**
 * Which page loads at which viewport and scale, and which shots come off each load —
 * the whole decision as a value, so it is assertable without a browser.
 *
 * A load is per URL *and* per viewport width *and* per device scale factor: two beats
 * at different punch factors need the same page rasterised at two resolutions, and the
 * width is in the key because #57's fit is what will vary it. Every shot is laid out at
 * the frame's own width today, so no current config sees more than `url @ scale`.
 * Groups come back in the order their first shot does — the order the pass loads in.
 *
 * The config is here because a viewport is the site's decision to make and fit will
 * read it; every shot's own url and punch already reach this through the timeline.
 */
export function capturePlan(config: SiteConfig, timeline: Timeline): CaptureGroup[] {
  const groups = new Map<string, CaptureGroup>()
  for (const shot of timeline.shots) {
    if (!shot.source) continue // The card is the one shot with no site pixels in it.
    const url = shot.source.url
    const viewport = { width: FRAME_WIDTH, height: FRAME_HEIGHT }
    const scale = masterScale(shot)
    // The motion is in the key because a live load is stabilised and never frozen: a
    // beat sharing it would take its master off a page that is still moving.
    const key = `${url}@${viewport.width}@${scale.toFixed(4)}@${shot.motion ?? 'still'}`
    const group = groups.get(key)
    if (group) {
      group.shots.push(shot)
      continue
    }
    const motion = shot.motion ? { motion: shot.motion } : {}
    groups.set(key, { url, viewport, scale, ...motion, shots: [shot] })
  }
  return [...groups.values()]
}

/** Master pixels per page pixel — the punch, doubled for a diagonal's second axis. */
function masterScale(shot: Shot): number {
  const { width } = masterSize(shot, 0)
  return width / FRAME_WIDTH
}

function captureGroup(
  browser: Browser,
  config: SiteConfig,
  dir: string,
  group: CaptureGroup,
  onCapture: OnCapture,
): Promise<Master[]> {
  // A live group takes no config: the freeze is the only thing on it a capture reads,
  // and a live shot is the one that never freezes.
  return group.motion
    ? recordGroup(browser, dir, group, onCapture)
    : screenshotGroup(browser, config, dir, group, onCapture)
}

async function screenshotGroup(
  browser: Browser,
  config: SiteConfig,
  dir: string,
  group: CaptureGroup,
  onCapture: OnCapture,
): Promise<Master[]> {
  const page = await browser.newPage({
    viewport: group.viewport,
    deviceScaleFactor: group.scale,
  })
  try {
    // The clock starts before the load, so a group's page load and settle land on the
    // first master taken off it rather than going unreported. Which is where they
    // belong: a slow page is what "which beat is slow" is usually asking about.
    let since = Date.now()
    await page.goto(group.url, { waitUntil: 'load', timeout: 60_000 })
    await settle(page, config.hook?.videoTime)
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight)

    const masters: Master[] = []
    for (const shot of group.shots) {
      const rect = await rectFor(page, shot)
      // `y`/`height` is the escape hatch for a subject no element wraps, and it is
      // in page coordinates — the same space the clip is taken in.
      const clip = clipFor(
        shot,
        shot.source?.y ?? rect.y,
        shot.source?.height ?? rect.height,
        pageHeight,
      )
      const path = join(dir, `${shotName(shot)}.jpg`)
      await page.screenshot({ path, type: 'jpeg', quality: JPEG_QUALITY, fullPage: true, clip })
      masters.push({ shot, path, size: masterSize(shot, clip.height) })
      onCapture(shot, Date.now() - since)
      since = Date.now()
    }
    return masters
  } finally {
    await page.close()
  }
}

function shotName(shot: Shot): string {
  return shot.kind === 'beat' ? `beat-${shot.index}` : shot.kind
}

/**
 * The page rect a shot is framed on, or a loud failure naming what did not resolve.
 *
 * The hook resolves through `hookRect` because its selector is optional — the hero is
 * found for it — and both ways of capturing a shot ask this before doing anything, so
 * a drifted selector reads the same whether the shot was screenshotted or recorded.
 */
async function rectFor(page: Page, shot: Shot): Promise<Rect> {
  const selector = shot.source?.selector
  const rect =
    shot.kind === 'hook' ? await hookRect(page, selector) : await rectOf(page, selector ?? '')
  if (!rect) throw new Error(`${shotName(shot)} '${selector ?? 'hero'}' — no element matches`)
  return rect
}

/**
 * The page rect a master is clipped out of. Full frame width, because a section is
 * exactly as wide as the frame; the section's own top and height otherwise, with
 * `y`/`height` winning when config named them.
 *
 * A section shorter than one punched frame cannot be shot, and `check` refuses those
 * by name — except the hook's, which has no beat to name. Rather than crash the
 * capture pass on it, the window grows down the page and then up.
 */
function clipFor(shot: Shot, top: number, height: number, pageHeight: number) {
  const needed = Math.min(pageHeight, punchedFrameHeight(shot.punchFactor))
  const grown = Math.max(height, needed)
  const y = Math.max(0, Math.min(top, pageHeight - grown))
  return { x: 0, y, width: FRAME_WIDTH, height: grown }
}

/**
 * A live shot: the stabilised hero recorded while it animates on its own clock.
 *
 * `stabilise` and never `settle` — the freeze is exactly what a live shot must not
 * have (ADR-0006), so videos autoplay and animations run. The page is then scrolled
 * to the hero and left alone for `RECORD_START_MS`, which is the fixed moment frame 0
 * is reproducible from, and recorded a little past the shot so there is a window to
 * cut out of the middle of the file rather than off the end of it.
 *
 * One shot to a group by construction: only the hook can be live, and its motion is
 * in the group key.
 */
async function recordGroup(
  browser: Browser,
  dir: string,
  group: CaptureGroup,
  onCapture: OnCapture,
): Promise<Master[]> {
  const shot = group.shots[0] as Shot
  const size = masterSize(shot, FRAME_HEIGHT)
  const raws = join(dir, 'recording')

  // The clock starts before the context, like a screenshot group's: the load, the
  // stabilise and the dwell are all of what a live hook costs.
  const since = Date.now()
  const context = await browser.newContext({
    viewport: group.viewport,
    // No device scale factor, unlike a screenshot group. A browser records its
    // viewport at the size the page is laid out at and pads whatever box it is asked
    // for out to that — so asking for more pixels here buys bars, not resolution. A
    // recording is exactly one frame, and a live shot's breath is sized to suit.
    recordVideo: { dir: raws, size: { width: size.width, height: size.height } },
  })
  let raw: string
  let recordedMs: number
  try {
    const page = await context.newPage()
    await page.goto(group.url, { waitUntil: 'load', timeout: 60_000 })
    await stabilise(page)
    await scrollToShot(page, shot)
    await page.waitForTimeout(RECORD_START_MS)

    const startedAt = Date.now()
    await page.waitForTimeout(shot.durationMs + RECORD_TAIL_MS)
    const video = page.video()
    if (!video) throw new Error(`${shotName(shot)} — the browser recorded no video`)
    // Recording stops when the page does, so this is the last moment on the file.
    await page.close()
    recordedMs = Date.now() - startedAt
    raw = await video.path()
  } finally {
    await context.close()
  }

  const path = join(dir, `${shotName(shot)}.mp4`)
  await trimRecording(raw, path, shot, size, recordedMs)
  await rm(raws, { recursive: true, force: true })
  onCapture(shot, Date.now() - since)
  return [{ shot, path, size }]
}

/**
 * Put the shot's subject at the top of the viewport, because a recording *is* the
 * viewport — there is no full-page screenshot to clip one out of.
 *
 * The one place this pipeline scrolls *to* a section rather than past it, and the
 * reason `CONTEXT.md` lets the hook carry page chrome: a sticky nav sits over the hero
 * here whether or not the hero starts at the top of the document. Beats still never
 * scroll, so chrome is still in the hook or in nothing at all.
 */
async function scrollToShot(page: Page, shot: Shot): Promise<void> {
  const rect = await rectFor(page, shot)
  // The same `y` escape hatch a master's clip honours, in the same page coordinates —
  // a scroll is what a clip is for a recording.
  await page.evaluate((y) => window.scrollTo(0, y), shot.source?.y ?? rect.y)
  // One painted frame at the new scroll position, so the dwell is spent on a page that
  // has already drawn where it was put rather than on the scroll itself.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))))
}

/**
 * The recording, cut to exactly the shot and re-encoded as an intermediate.
 *
 * The window is measured *back from the file's own end*: `recordedMs` is how long the
 * browser went on recording past the moment the shot starts at, and where the file
 * starts is the browser's business while where it stops is this pass's.
 *
 * Exported for the tests, which is where its loud failures are worth reading. A
 * recording shorter than the window, or one that decodes to fewer frames than the
 * timeline asked for, throws here — a hook is never quietly padded out to length,
 * because what it would be padded with is black.
 */
export async function trimRecording(
  raw: string,
  output: string,
  shot: Shot,
  size: MasterSize,
  recordedMs: number,
): Promise<void> {
  const frames = frameCount(shot.durationMs)
  const recorded = await probeDuration(raw)
  const offset = recorded - recordedMs / 1000
  if (!(offset >= 0)) {
    throw new Error(
      `${shotName(shot)} — the browser recorded ${recorded.toFixed(2)}s of a ` +
        `${(recordedMs / 1000).toFixed(2)}s window; there is no shot to cut from it`,
    )
  }

  await ffmpeg([
    // Input seeking, so the decoder skips to the window rather than decoding up to it.
    '-ss', offset.toFixed(3),
    '-i', raw,
    // A browser emits a frame when the page paints, which is neither `FPS` nor even
    // constant; `fps` resamples to the timeline's rate and `scale` to the pixels the
    // camera was planned over, so the move meets exactly the master it was promised.
    '-vf', `fps=${FPS},scale=${size.width}:${size.height}`,
    '-frames:v', String(frames),
    '-an',
    ...intermediateEncode(),
    output,
  ])

  const got = await probeFrames(output)
  if (got !== frames) {
    throw new Error(`${shotName(shot)} — the recording cut to ${got} frames; the shot is ${frames}`)
  }
}

/** A media file's length in seconds, or a loud failure when it does not claim one. */
async function probeDuration(path: string): Promise<number> {
  const out = await ffprobe([
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    path,
  ])
  const seconds = Number(out.trim())
  if (!Number.isFinite(seconds)) throw new Error(`${path} — the recording has no duration`)
  return seconds
}

/** How many video frames a file really decodes to — counted, never inferred. */
async function probeFrames(path: string): Promise<number> {
  const out = await ffprobe([
    '-select_streams', 'v:0',
    '-count_packets',
    '-show_entries', 'stream=nb_read_packets',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    path,
  ])
  return Number(out.trim())
}
