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
import type { Browser } from 'playwright'
import { masterSize } from './camera.ts'
import type { MasterSize } from './camera.ts'
import { FRAME_HEIGHT, FRAME_WIDTH, punchedFrameHeight } from './frame.ts'
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
    const masters: Master[] = []
    // A page load is per URL *and* per device scale factor: two beats at different
    // punch factors need the same page rasterised at two resolutions.
    for (const [, group] of groupShots(config, timeline)) {
      masters.push(...(await captureGroup(browser, config, dir, group, onCapture)))
    }
    return masters.sort((a, b) => a.shot.startMs - b.shot.startMs)
  } finally {
    await browser.close()
  }
}

type Group = { url: string; scale: number; shots: Shot[] }

function groupShots(config: SiteConfig, timeline: Timeline): Map<string, Group> {
  const groups = new Map<string, Group>()
  for (const shot of timeline.shots) {
    if (!shot.source) continue // The card is the one shot with no site pixels in it.
    const url = shot.source.url
    const scale = masterScale(shot)
    const key = `${url}@${scale.toFixed(4)}`
    const group = groups.get(key)
    if (group) group.shots.push(shot)
    else groups.set(key, { url, scale, shots: [shot] })
  }
  return groups
}

/** Master pixels per page pixel — the punch, doubled for a diagonal's second axis. */
function masterScale(shot: Shot): number {
  const { width } = masterSize(shot, 0)
  return width / FRAME_WIDTH
}

async function captureGroup(
  browser: Browser,
  config: SiteConfig,
  dir: string,
  group: Group,
  onCapture: OnCapture,
): Promise<Master[]> {
  const page = await browser.newPage({
    viewport: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
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
      const rect =
        shot.kind === 'hook'
          ? await hookRect(page, shot.source?.selector)
          : await rectOf(page, shot.source?.selector ?? '')
      if (!rect) throw new Error(`${shotName(shot)} '${shot.source?.selector ?? 'hero'}' — no element matches`)

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
