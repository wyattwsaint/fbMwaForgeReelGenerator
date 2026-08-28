/**
 * Masters — one static, high-resolution capture per shot with site pixels in it (#6).
 *
 * Camera motion is never stepped in the browser: capture costs one screenshot per
 * shot, and every move is synthesised from it in post (#11). A master is taken as a
 * full-page screenshot *clipped* to the section's page rect and never by scrolling to
 * it, which is what keeps sticky page chrome out of a beat by construction.
 */

import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { masterScale, masterSize } from './camera.ts'
import type { MasterSize } from './camera.ts'
import { FRAME_HEIGHT, FRAME_WIDTH, fitViewportWidth, punchedFrameHeight } from './frame.ts'
import { hookRect, rectOf } from './page.ts'
import type { Shot, Timeline } from './plan.ts'
import { settle } from './settle.ts'
import type { SiteConfig } from './site.ts'

export type Master = { shot: Shot; path: string; size: MasterSize }

/** Called as each master lands, with what it cost — `render` reports the pass (#18). */
export type OnCapture = (shot: Shot, ms: number) => void

/** #11: JPEG, not PNG — tens of milliseconds a shot rather than half a second. */
const JPEG_QUALITY = 92

/** Masters live here, run-scoped: wiped by the next render, never a build artifact. */
export function mastersDir(outDir: string): string {
  return join(outDir, 'masters')
}

/**
 * One master per shot that shows the site, written under `out/masters/`.
 *
 * The directory is wiped first. #14 is emphatic that a master is never reused across
 * runs — a cached master is a photograph of a page that may no longer exist — so the
 * only way it can be is if it is still on disk, and this is where that stops.
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
 * One statement of the precedence, because both of a fit beat's two measurements go
 * through it: `y`/`height` is the escape hatch for a subject no element wraps, and it
 * wins over the rect wherever config named it. The selector still has to resolve
 * either way, which is the one failure this can report.
 */
async function subjectRect(page: Page, shot: Shot): Promise<{ y: number; height: number }> {
  const selector = shot.source?.selector
  const rect =
    shot.kind === 'hook' ? await hookRect(page, selector) : await rectOf(page, selector ?? '')
  if (!rect) throw new Error(`${shotName(shot)} '${selector ?? 'hero'}' — no element matches`)
  return { y: shot.source?.y ?? rect.y, height: shot.source?.height ?? rect.height }
}

/** One page load, and every shot taken off it. */
type CaptureGroup = {
  url: string
  /** CSS pixels the page is laid out at. */
  viewport: { width: number; height: number }
  /** Device scale factor: master pixels per CSS pixel. */
  scale: number
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
    const key = `${url}@${viewport.width}@${scale.toFixed(4)}`
    const group = groups.get(key)
    if (group) group.shots.push(shot)
    else groups.set(key, { url, viewport, scale, shots: [shot] })
  }
  return [...groups.values()]
}

async function captureGroup(
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
