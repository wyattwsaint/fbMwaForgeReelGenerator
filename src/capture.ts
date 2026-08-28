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
import { masterScale, masterSize } from './camera.ts'
import type { MasterSize } from './camera.ts'
import { ffmpeg, ffprobe, intermediateEncode } from './compose.ts'
import { FRAME_HEIGHT, FRAME_WIDTH, fitViewportWidth, punchedFrameHeight } from './frame.ts'
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
    const fitWidths = await measureFitWidths(browser, config, timeline)
    const masters: Master[] = []
    for (const group of capturePlan(config, timeline, fitWidths)) {
      masters.push(...(await captureGroup(browser, config, dir, group, onCapture)))
    }
    return masters.sort((a, b) => a.shot.startMs - b.shot.startMs)
  } finally {
    await browser.close()
  }
}

/**
 * The capture viewport each fit shot widened to, in CSS pixels. Empty is "no fit".
 *
 * Keyed on the shot itself rather than on its name, because the shot is what the
 * grouping is over and a timeline is passed around by reference — measured and
 * planned off the same `Timeline`, which is the one thing the caller has to hold on
 * to. A copied shot is a different key, and would silently be a beat that is not fit.
 */
export type FitWidths = ReadonlyMap<Shot, number>

/**
 * The first of a fit beat's two measurements: how tall its section is at the *base*
 * viewport, which is what says how far the capture viewport has to widen (#65).
 *
 * A page load of its own, because the width it computes is what decides which page
 * loads there are — the answer cannot come off a load that the answer chose. Only the
 * URLs that actually carry a fit shot are loaded, so a config naming `fit` nowhere
 * captures exactly the pages it captured before, in exactly the order it did.
 *
 * The legibility cap is not re-applied here (#66). It is the plan's: a shot still
 * carrying `fit` is one the plan measured and let through, and a shot the cap caught is
 * a vertical pan by the time it arrives — it has no `fit` to widen for. This is the
 * second measurement of the same section, so a page that changed between `check`'s load
 * and this one could read a hair past the cap; fitting it anyway is a section slightly
 * smaller than the floor, where re-capping it here would be a shot the plan framed as
 * one frame and capture shot as something else.
 */
async function measureFitWidths(
  browser: Browser,
  config: SiteConfig,
  timeline: Timeline,
): Promise<FitWidths> {
  const widths = new Map<Shot, number>()
  const byUrl = new Map<string, Shot[]>()
  for (const shot of timeline.shots) {
    if (!shot.fit || !shot.source) continue
    const group = byUrl.get(shot.source.url)
    if (group) group.push(shot)
    else byUrl.set(shot.source.url, [shot])
  }

  for (const [url, shots] of byUrl) {
    await onSettledPage(browser, config, url, { width: FRAME_WIDTH, height: FRAME_HEIGHT }, 1, async (page) => {
      for (const shot of shots) {
        widths.set(shot, fitViewportWidth((await subjectRect(page, shot)).height))
      }
    })
  }
  return widths
}

/**
 * A page loaded, settled and closed however the body ends — the one shape every pass
 * in this file needs before it can measure or photograph anything.
 *
 * The caller times it rather than this doing it: the capture pass charges a group's
 * load and settle to the first master taken off it, and that clock has to start before
 * `goto` — so it starts on the call, one line above.
 */
async function onSettledPage<T>(
  browser: Browser,
  config: SiteConfig,
  url: string,
  viewport: { width: number; height: number },
  deviceScaleFactor: number,
  body: (page: Page) => Promise<T>,
): Promise<T> {
  const page = await browser.newPage({ viewport, deviceScaleFactor })
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 })
    await settle(page, config.hook?.videoTime)
    return await body(page)
  } finally {
    await page.close()
  }
}

/**
 * Where a shot's subject sits on the page it is loaded on, in page coordinates — the
 * same space the clip is taken in.
 *
 * `rectFor` says which element, this says which rectangle: `y`/`height` is the escape
 * hatch for a subject no element wraps, and it wins over the resolved rect wherever
 * config named it. One statement of that precedence, because both of a fit beat's two
 * measurements go through it and they have to agree about what they measured.
 */
async function subjectRect(page: Page, shot: Shot): Promise<{ y: number; height: number }> {
  const rect = await rectFor(page, shot)
  return { y: shot.source?.y ?? rect.y, height: shot.source?.height ?? rect.height }
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
 * width is in the key because a **fit** beat varies it. So a fit beat and a non-fit
 * beat on the same URL are two page loads — widening the viewport reflows the site,
 * and the non-fit beat is not entitled to the reflowed layout — while two fit beats
 * that landed on the same width share one. Groups come back in the order their first
 * shot does, which is the order the pass loads in.
 *
 * The config is here because a viewport is the site's decision to make; every shot's
 * own url and punch already reach this through the timeline.
 */
export function capturePlan(
  config: SiteConfig,
  timeline: Timeline,
  fitWidths: FitWidths = new Map(),
): CaptureGroup[] {
  const groups = new Map<string, CaptureGroup>()
  for (const shot of timeline.shots) {
    if (!shot.source) continue // The card is the one shot with no site pixels in it.
    const url = shot.source.url
    const viewport = { width: fitWidths.get(shot) ?? FRAME_WIDTH, height: FRAME_HEIGHT }
    const scale = masterScale(shot, viewport.width)
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
  // The clock starts before the load, so a group's page load and settle land on the
  // first master taken off it rather than going unreported. Which is where they
  // belong: a slow page is what "which beat is slow" is usually asking about.
  let since = Date.now()
  return onSettledPage(browser, config, group.url, group.viewport, group.scale, async (page) => {
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight)

    const masters: Master[] = []
    for (const shot of group.shots) {
      // For a fit shot this is the *second* measurement — the section as the widened
      // viewport reflowed it — and it is the one the clip is framed on.
      const subject = await subjectRect(page, shot)
      const clip = clipFor(shot, subject, pageHeight, group.viewport.width)
      const path = join(dir, `${shotName(shot)}.jpg`)
      await page.screenshot({ path, type: 'jpeg', quality: JPEG_QUALITY, fullPage: true, clip })
      masters.push({ shot, path, size: masterSize(shot, clip.height, group.viewport.width) })
      onCapture(shot, Date.now() - since)
      since = Date.now()
    }
    return masters
  })
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
 * The page rect a master is clipped out of. Full viewport width, because a section is
 * exactly as wide as the viewport it was laid out in; the section's own top and height
 * otherwise, with `y`/`height` winning when config named them.
 *
 * A section shorter than one punched frame cannot be shot, and `check` refuses those
 * by name — except the hook's, which has no beat to name. Rather than crash the
 * capture pass on it, the window grows down the page and then up.
 *
 * A fit beat's clip is that frame *exactly*, rather than at least it. Its width came
 * off the section's height at the base viewport, and the reflow that width caused
 * moves the height either way — a little shorter for a section that reflows into its
 * new room, taller for one whose images scale with it. Neither is a second chance at
 * the width: a fit master that came back taller than a frame would be a fit beat
 * quietly not fitting, and everything downstream would read it as room to travel. So
 * the frame is centred on the section, which spends the difference on a strip of the
 * page either side rather than on the section's own top.
 */
function clipFor(
  shot: Shot,
  subject: { y: number; height: number },
  pageHeight: number,
  viewportWidth: number,
) {
  const frame = Math.min(pageHeight, punchedFrameHeight(shot.punchFactor, viewportWidth))
  const height = shot.fit ? frame : Math.max(subject.height, frame)
  const top = shot.fit ? subject.y + (subject.height - height) / 2 : subject.y
  const y = Math.max(0, Math.min(Math.round(top), pageHeight - height))
  return { x: 0, y, width: viewportWidth, height }
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
