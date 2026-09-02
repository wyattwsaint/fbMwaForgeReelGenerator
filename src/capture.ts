/**
 * The site pixels a shot is made of (#6).
 *
 * Almost always a **master**: one static, high-resolution screenshot, with every
 * camera move synthesised from it in post (#11). A master is taken as a full-page
 * screenshot *clipped* to the section's page rect and never by scrolling to it, which
 * is what keeps sticky page chrome out of a beat by construction.
 *
 * A live shot is the exception (#63, #64, ADR-0006): the hero is stabilised but never
 * frozen, and the viewport is *recorded* for exactly the shot's duration while the
 * page animates on its own clock or is walked down under a scripted scroll. Both come
 * back as a `Master` — a path and the size
 * its move is computed over — because everything downstream of here wants the same
 * two things whichever way the pixels were got.
 */

import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { masterScale, masterSize } from './camera.ts'
import type { MasterSize } from './camera.ts'
import { ffmpeg, ffmpegPixels, ffprobe, intermediateEncode } from './compose.ts'
import {
  BASE_VIEWPORT,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  LOAD,
  fitViewportWidth,
  punchedFrameHeight,
} from './frame.ts'
import { positionHero } from './hero.ts'
import { frameAt, painted } from './motion.ts'
import { hookRect, rectOf } from './page.ts'
import type { Rect } from './page.ts'
import { FPS, frameCount } from './plan.ts'
import type { Shot, Timeline } from './plan.ts'
import { scriptedScroll } from './scroll.ts'
import { settle, stabilise } from './settle.ts'
import type { LiveMotion, SiteConfig } from './site.ts'

export type Master = { shot: Shot; path: string; size: MasterSize }

/**
 * One thing the capture pass just paid for, and what it cost.
 *
 * A `master` is the usual one: pixels landed, charged to the shot they are for. A
 * `measure` is a fit beat's first page load — the one that learns how far the capture
 * viewport has to widen (#65) — which is a full settle and belongs to no master at
 * all, so it is named rather than folded into some shot's line (#78).
 *
 * Two kinds, two shapes, because a measurement is per *load* and a master is per
 * shot: one load answers for every fit beat on its page, so it carries all of them
 * rather than a representative. A single shot standing for several is how a line
 * comes to name one of two sections it was really paid for.
 */
export type CaptureEvent =
  | { kind: 'master'; shot: Shot; ms: number }
  | { kind: 'measure'; shots: readonly Shot[]; ms: number }

/** Called as each cost lands — `render` reports the pass (#18). */
export type OnCapture = (event: CaptureEvent) => void

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
 *
 * The dwell is spent under the **marker**, and the marker is what makes that claim
 * true rather than nearly true (#91).
 */
export const RECORD_START_MS = 500

/**
 * How long past the shot the browser goes on recording. Slack, not content: the window
 * opens where the marker lifts and runs for exactly the shot, so a recording that
 * stopped on the shot's own last frame would be betting on the browser having painted
 * one — and the last thing a live hook may be padded out with is black.
 */
const RECORD_TAIL_MS = 400

/**
 * The colour the viewport is held under for the dwell, and lifted from at the exact
 * moment the shot begins (#91).
 *
 * A recording's own timeline is *not* the wall clock, which is what a window measured
 * back from the file's end quietly assumed. A browser emits a frame when the page
 * paints, so an idle stretch is one frame held rather than a stretch of frames; and
 * the recorder pads the file's tail past the last paint by a floor of its own. Both
 * ends of the file therefore sit an unknown distance from the wall-clock moments this
 * pass timed the shot by, and a `scroll` hook's frame 0 landed a quarter-second into
 * the walk — a couple of hundred pixels down a page whose top it is supposed to frame,
 * and a different couple of hundred each run.
 *
 * So the recording is asked where the shot starts instead of being told: the marker is
 * a wash the page cannot draw, the last frame carrying it is the last frame before the
 * window, and the answer is in the same clock as the cut. Magenta because it has to
 * survive a lossy encode and a downscale to a handful of pixels and still be nothing a
 * client's own hero could be mistaken for.
 *
 * One hex, read by the wash and by the detector that finds it again — the same way the
 * house colours are written once and handed to `ffmpegColor`. A colour the page is
 * painted in and hunted for by two different numbers is a marker that stops being
 * found the day one of them is edited.
 */
const MARKER = '#ff00ff'

/** How far a marker frame may drift per channel through VP8, yuv420 and the downscale. */
const MARKER_TOLERANCE = 24

/**
 * The square a frame is averaged down to before it is read.
 *
 * Named once because the filter that asks for it and the arithmetic that walks the
 * bytes back have to agree: a `scale` edited on its own would leave every frame
 * misread at the wrong stride, and misread quietly. Four pixels rather than one, so a
 * frame that is *nearly* all marker — a page's own wash under a corner of something —
 * is not averaged into a marker frame.
 */
const MARKER_PROBE = 2

/**
 * How far the marker's run on film may sit from the dwell it was actually held for.
 *
 * The dwell is bounded above by the round trips either side of it and below by
 * nothing, so this is slack rather than a measurement — wide enough that no real
 * recording is refused, narrow enough that a stretch of a page's own colour is not
 * mistaken for the dwell.
 */
const MARKER_DWELL_TOLERANCE_MS = 250

/** The element the marker is drawn as — removed, never merely hidden. */
const MARKER_ID = 'reel-record-marker'

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
    const fitWidths = await measureFitWidths(browser, config, timeline, onCapture)
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
 * captures exactly the pages it captured before, in exactly the order it did — and
 * reports exactly the lines it reported before, because a pass that measures nothing
 * says nothing.
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
  onCapture: OnCapture,
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
    // The clock starts before the load, like a capture group's: the load and the
    // settle are all but the whole of what a measurement costs.
    const since = Date.now()
    await onSettledPage(browser, config, url, BASE_VIEWPORT, 1, async (page) => {
      for (const shot of shots) {
        widths.set(shot, fitViewportWidth((await subjectRect(page, shot)).height))
      }
    })
    // Per load, not per fit beat: two fit beats sharing a page shared this settle,
    // and both are named on it rather than one of them answering for the other.
    onCapture({ kind: 'measure', shots, ms: Date.now() - since })
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
    await page.goto(url, LOAD)
    await settle(page, config.hook?.videoTime)
    // A still hook is a master like any other, so the crop the config asked for has to
    // reach the screenshot path too — a reel whose hook records dead still opens on the
    // framing it was written for. Harmless on a beat's load: a beat is a section of the
    // page and the hero is in none of them.
    await positionHero(page, config)
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
    // The drawn shots — the title and the card — are the ones with no site pixels in
    // them, and so the ones with nothing to capture.
    if (!shot.source) continue
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
    ? recordGroup(browser, config, dir, group, onCapture)
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
      onCapture({ kind: 'master', shot, ms: Date.now() - since })
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
 * A live shot: the stabilised hero recorded while the page moves.
 *
 * `stabilise` and never `settle` — the freeze is exactly what a live shot must not
 * have (ADR-0006), so videos autoplay and animations run. The page is then framed and
 * held under the **marker** for `RECORD_START_MS` — the fixed moment frame 0 is
 * reproducible from — and recorded a little past the shot, so there is a window to cut
 * out of the middle of the file rather than off the end of it. The marker lifts as the
 * window opens, which is how the cut and the shot agree about where that was (#91).
 *
 * How it is framed is the difference between the two live motions (#64). An `ambient`
 * shot scrolls the hero to the top of the viewport and holds there while the page
 * animates on its own clock. A `scroll` shot starts at the top of the *document* and
 * is walked down through the hero across the whole shot, so the effects keyed to the
 * viewport moving fire on camera — unless this page's cannot re-fire, in which case
 * there is nothing a scroll would show that a dwell would not, and the shot degrades
 * to an ambient one. `check` reports that degradation; here it is simply done.
 *
 * One shot to a group by construction: only the hook can be live, and its motion is
 * in the group key.
 */
async function recordGroup(
  browser: Browser,
  config: SiteConfig,
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
  try {
    const page = await context.newPage()
    await page.goto(group.url, LOAD)
    await stabilise(page)
    await positionHero(page, config)
    const walking = await framedForRecording(page, shot, group.motion as LiveMotion)
    await markPage(page)
    await page.waitForTimeout(RECORD_START_MS)

    // The window opens here, and says so on the film rather than on this pass's clock.
    await unmarkPage(page)
    // Started rather than awaited: the walk and the recording window are the same
    // stretch of time, so the page has to be driven while the browser is filming it.
    const walk = walking ? scriptedScroll(page, shot.durationMs) : null
    await page.waitForTimeout(shot.durationMs + RECORD_TAIL_MS)
    await walk
    const video = page.video()
    if (!video) throw new Error(`${shotName(shot)} — the browser recorded no video`)
    await page.close()
    raw = await video.path()
  } finally {
    await context.close()
  }

  const path = join(dir, `${shotName(shot)}.mp4`)
  await trimRecording(raw, path, shot, size)
  await rm(raws, { recursive: true, force: true })
  onCapture({ kind: 'master', shot, ms: Date.now() - since })
  return [{ shot, path, size }]
}

/**
 * Put the page where the recording starts, and say whether it will be walked from
 * there — a recording *is* the viewport, so there is no full-page screenshot to clip
 * a frame out of and the scroll position is the framing.
 *
 * The one place this pipeline scrolls *to* a section rather than past it, and the
 * reason `CONTEXT.md` lets the hook carry page chrome: a sticky nav sits over the hero
 * here whether or not the hero starts at the top of the document. Beats still never
 * scroll, so chrome is still in the hook or in nothing at all.
 *
 * The hero's rect is resolved either way, including on the `scroll` path that starts
 * at the top of the document and does not need it: a hook whose selector has drifted
 * fails by name here rather than quietly recording whatever the top of the page is.
 *
 * Whether the walk happens is the *plan's* answer and is not re-asked here (#88). This
 * pass used to put `scrollEffectsRefire` a second time and quietly record an ambient
 * hook where its own load disagreed with the preflight's — which is the one shot the
 * motion probe never sees, since a `scroll` that passed in `check` is never probed. A
 * pass holding a timeline cannot degrade anyway: it can stop walking, but it cannot
 * turn the live shot it was handed into a still one, so all a second opinion could buy
 * was an unmeasured dwell on a hero nobody measured. The remaining disagreement is the
 * harmless direction — a page that would not re-fire today is still walked, and a
 * viewport that moves is live footage whatever the reveals do.
 */
async function framedForRecording(page: Page, shot: Shot, motion: LiveMotion): Promise<boolean> {
  const rect = await rectFor(page, shot)
  const walking = motion === 'scroll'
  // The same `y` escape hatch a master's clip honours, in the same page coordinates —
  // a scroll is what a clip is for a recording. A walk starts at the document's top,
  // which is where the effects it is there to re-fire are wound back to.
  //
  // Shared with the motion probe rather than spelled out here, because the probe's
  // whole claim is that it measured *this* frame: a framing written twice is a probe
  // that can drift a pixel off the shot it decided about (#88).
  await frameAt(page, walking ? 0 : (shot.source?.y ?? rect.y))
  return walking
}

/**
 * Cover the viewport with the marker, and let the browser paint it.
 *
 * On `documentElement` rather than on `body`, so a page whose own `body` carries a
 * transform cannot turn a fixed cover into a scrolling one — the marker has to be the
 * whole frame or it is not an answer.
 */
async function markPage(page: Page): Promise<void> {
  await page.evaluate(
    (marker) => {
      const cover = document.createElement('div')
      cover.id = marker.id
      cover.style.cssText =
        `position:fixed;inset:0;background:${marker.colour};` +
        'z-index:2147483647;pointer-events:none'
      document.documentElement.append(cover)
    },
    { id: MARKER_ID, colour: MARKER },
  )
  await painted(page)
}

/**
 * Lift the marker — the first frame that carries none of it is the shot's frame 0.
 *
 * The page is given a frame to come back on its own before the caller starts driving
 * it, so the frame the window opens on is the framing the shot was planned around
 * rather than the first step of a walk.
 */
async function unmarkPage(page: Page): Promise<void> {
  await page.evaluate((id) => document.getElementById(id)?.remove(), MARKER_ID)
  await painted(page)
}

/**
 * Where the marker lifts, in the recording's own seconds — the moment the shot starts.
 *
 * Read off the film rather than computed from this pass's clock, which is the whole of
 * #91: a recording's timeline is wall time only where the page is painting, and its
 * tail is padded past the last paint by a floor the recorder picks. The marker is the
 * one thing in the file whose position both the browser and this pass agree about.
 *
 * What is looked for is the *dwell*, not merely a marker-coloured frame: one unbroken
 * run of them, about as long as the page was actually held under the wash, with none
 * of the colour anywhere else in the file. Taking the last marker frame on its own
 * would trust a claim nobody can make about a client's site — that no page paints this
 * colour over its whole viewport — and a page that does (a transition flash, a
 * full-bleed hero) would push the window late and reproduce #91 with a correct frame
 * count and no error at all. So the shape is checked and a file that does not have it
 * fails loudly, which is the same bargain the frame count is cut under.
 *
 * The run may sit anywhere in the file, and does not begin at its start: a recording
 * covers the page's whole life, so the load and the stabilise are on the film ahead of
 * the dwell.
 */
async function markerLift(raw: string, shot: Shot): Promise<number> {
  const marked = await markerFrames(raw)
  const last = marked.lastIndexOf(true)
  if (last < 0) {
    throw new Error(
      `${shotName(shot)} — the recording carries no start marker; there is no shot to cut from it`,
    )
  }
  let first = last
  while (first > 0 && marked[first - 1]) first--

  const run = (last - first + 1) / FPS
  const dwell = RECORD_START_MS / 1000
  const stray = first > 0 && marked.lastIndexOf(true, first - 1) >= 0
  if (stray || Math.abs(run - dwell) > MARKER_DWELL_TOLERANCE_MS / 1000) {
    throw new Error(
      `${shotName(shot)} — the recording carries ${run.toFixed(2)}s of unbroken start marker` +
        `${stray ? ', and more of that colour earlier in the file' : ''}; the dwell is ` +
        `${dwell.toFixed(2)}s, so this is not the marker lifting once and there is no ` +
        'moment in the file this shot can honestly be cut from',
    )
  }
  return (last + 1) / FPS
}

/**
 * Which of a recording's frames are the marker, on the grid the cut is made on.
 *
 * Averaged down to `MARKER_PROBE` squared rather than sampled, so "the marker is up"
 * means the whole frame and not a corner of it, and the file is read as a handful of
 * bytes a frame rather than decoded.
 */
async function markerFrames(raw: string): Promise<boolean[]> {
  const side = MARKER_PROBE
  const pixels = await ffmpegPixels([
    '-i', raw,
    // The timeline's own rate, so this reads the film on the grid the cut is made on.
    '-vf', `fps=${FPS},scale=${side}:${side}:flags=area`,
    '-f', 'rawvideo',
    '-pix_fmt', 'rgb24',
    '-',
  ])
  const want = channelsOf(MARKER)
  const stride = side * side * 3
  const marked: boolean[] = []
  for (let at = 0; at + stride <= pixels.length; at += stride) {
    let whole = true
    for (let px = 0; px < side * side && whole; px++) {
      whole = want.every(
        (channel, k) => Math.abs((pixels[at + px * 3 + k] as number) - channel) <= MARKER_TOLERANCE,
      )
    }
    marked.push(whole)
  }
  return marked
}

/** A `#rrggbb` as the three numbers a decoded frame is made of. */
function channelsOf(hex: string): number[] {
  return [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16))
}

/**
 * The recording, cut to exactly the shot and re-encoded as an intermediate.
 *
 * The window opens where the **marker** lifts and runs for the shot's own length. It
 * used to be measured back from the file's end off a wall-clock stopwatch, which put a
 * walked hook's frame 0 a quarter-second into its own scroll (#91).
 *
 * Exported for the tests, which is where its loud failures are worth reading. A
 * recording that carries no marker, one whose marker is not the single unbroken dwell
 * it was held under, one with less than the shot left after it, or one that decodes to
 * fewer frames than the timeline asked for, throws here — a hook is never quietly
 * padded out to length, because what it would be padded with is black, and never
 * quietly cut from a moment nothing in the file points at.
 */
export async function trimRecording(
  raw: string,
  output: string,
  shot: Shot,
  size: MasterSize,
): Promise<void> {
  const frames = frameCount(shot.durationMs)
  const offset = await markerLift(raw, shot)
  const recorded = await probeDuration(raw)
  if (recorded - offset < shot.durationMs / 1000) {
    throw new Error(
      `${shotName(shot)} — the browser recorded ${(recorded - offset).toFixed(2)}s past the ` +
        `marker; the shot is ${(shot.durationMs / 1000).toFixed(2)}s`,
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
