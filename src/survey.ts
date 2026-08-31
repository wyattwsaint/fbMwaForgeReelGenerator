/**
 * What one settled page load gives up about a config, as a value (ADR-0009).
 *
 * This is the only module on the checking path that opens a browser. Everything that
 * *judges* a config — the problems, the notes, the degradation chain, the fit cap —
 * reads the value this produces and never a page, so a rule about a page fact can be
 * exercised by writing the number down instead of serving HTML over HTTP.
 *
 * A survey carries facts and never verdicts. The motion probe's *reading* is here; the
 * `scroll -> ambient -> still` chain that reads it is not. A section's *height* is
 * here; the cap that refuses it is not.
 */

import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { BASE_VIEWPORT, DEFAULT_VIDEO_TIME, LOAD } from './frame.ts'
import { HOOK_MS, resolvedMotion } from './plan.ts'
import { headingIn, hookRect, rectOf } from './page.ts'
import type { Rect } from './page.ts'
import { frameAt, framedMotion } from './motion.ts'
import { scrollEffectsRefire } from './scroll.ts'
import { freeze, stabilise } from './settle.ts'
import { configuredMotion } from './site.ts'
import type { SiteConfig } from './site.ts'

export type { Rect } from './page.ts'

/** One page load, in the order the run made them. */
export type SurveyedPage = {
  url: string
  /**
   * The page's own scroll height, null only where the failure landed before it could
   * be read. A page that died after it was read keeps it: the height is a fact the
   * survey already has.
   */
  scrollHeight: number | null
  /**
   * Why the page could not be surveyed, or null where it loaded. A page that carries
   * one leaves every beat on it unmeasured, which is a different thing from a selector
   * that did not match, and is reported as a different thing.
   */
  failure: string | null
}

/** One beat's section, in beat order. Every measurement null where it did not resolve. */
export type SurveyedBeat = {
  /** The page it was looked for on: `beat.url` where the beat named one, else the site's. */
  url: string
  /** Page coordinates at the base viewport, null where the selector did not match. */
  rect: Rect | null
  /**
   * How tall the beat is at the base viewport: what the page measured, or what the
   * config's `height` hatch said instead. Null where the selector did not match.
   */
  height: number | null
  /**
   * The section's own heading, one line. Null where the section has none, where the
   * selector did not match, and where the config named a `label` — the plan draws that
   * label whatever the page says, so the heading it beats is not worth reading.
   */
  heading: string | null
}

export type Survey = {
  pages: SurveyedPage[]
  beats: SurveyedBeat[]
  /** The hero, resolved on the site's own url; null where it did not resolve. */
  heroRect: Rect | null
  /**
   * Whether the page's scroll effects re-fire under a scripted scroll — the answer
   * `scrollEffectsRefire` gave. Null where it was not asked, which is every config
   * whose hook is not a `scroll`, and every page that would not load.
   */
  scrollRefires: boolean | null
  /**
   * How much the hero moves in the frame it would be shot in — the number
   * `framedMotion` returned. Null where the probe was not run: a hook that is not
   * `ambient` by the time the question arises, a hero that does not resolve, a page
   * that would not load.
   */
  motionReading: number | null
}

/**
 * Load, settle and measure every page this config names.
 *
 * One load per distinct url: beats that share a route share a page, and the site's own
 * url is always loaded because the hook always lives there.
 */
export async function survey(config: SiteConfig): Promise<Survey> {
  // A config that names no url, or no beats, describes no page to open. Nothing
  // measured is the honest answer and the judgment already has the words for it —
  // `configProblems` names the missing field — so this is a browser not launched
  // rather than a load failure invented for a config that never asked for one.
  if (typeof config.url !== 'string' || config.url === '' || !Array.isArray(config.beats)) {
    return unsurveyed()
  }
  const beats: SurveyedBeat[] = config.beats.map((beat) => ({
    url: beat.url ?? config.url,
    rect: null,
    height: null,
    heading: null,
  }))
  const taken: Survey = {
    pages: [],
    beats,
    heroRect: null,
    scrollRefires: null,
    motionReading: null,
  }

  // Grouped by page rather than walked in reel order, so the measurements are filled
  // in by index rather than pushed — a beat on another route would otherwise caption
  // the beat that happened to be resolved before it.
  const byUrl = new Map<string, number[]>()
  beats.forEach((beat, index) => {
    const group = byUrl.get(beat.url)
    if (group) group.push(index)
    else byUrl.set(beat.url, [index])
  })
  if (!byUrl.has(config.url)) byUrl.set(config.url, [])

  const browser = await chromium.launch()
  try {
    for (const [url, group] of byUrl) {
      taken.pages.push(await surveyPage(browser, config, taken, url, group))
    }
  } finally {
    await browser.close()
  }
  return taken
}

/** Nothing measured: what a run that never opened a browser knows about the pages. */
function unsurveyed(): Survey {
  return { pages: [], beats: [], heroRect: null, scrollRefires: null, motionReading: null }
}

/**
 * One page, measured into `taken`.
 *
 * The live readings are taken against a *stabilised, unfrozen* page and everything
 * else against a frozen one, which is why the settle is split at its seam (#64):
 * freezing parks the very motion both readings are about, so a survey that settled
 * whole would answer a question capture never asks. Everything below the freeze reads
 * the settled page it always read.
 *
 * The readings are written down as they are taken rather than at the end, so a page
 * that dies halfway keeps whatever it had already said.
 */
async function surveyPage(
  browser: Browser,
  config: SiteConfig,
  taken: Survey,
  url: string,
  group: number[],
): Promise<SurveyedPage> {
  const page = await browser.newPage({ viewport: BASE_VIEWPORT })
  let scrollHeight: number | null = null
  try {
    await page.goto(url, LOAD)
    await stabilise(page)
    if (url === config.url) await readLive(page, config, taken)
    await freeze(page, config.hook?.videoTime ?? DEFAULT_VIDEO_TIME)
    scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight)
    for (const index of group) {
      const beat = config.beats[index]
      const surveyed = taken.beats[index]
      if (!beat || !surveyed) continue
      const rect = await rectOf(page, beat.selector)
      if (!rect) continue
      surveyed.rect = rect
      // `y`/`height` is the escape hatch for when no element wraps the subject: the
      // selector still has to resolve, it just does not have to be the right shape.
      surveyed.height = beat.height ?? rect.height
      // Only asked when the config named no label: a config that did is what will be
      // drawn, and the heading it overrides is a line this reel will never carry.
      // Windowed by the beat's own `y`/`height` where it has them, because that hatch
      // resolves to an ancestor and the heading wanted is the one inside the slice.
      surveyed.heading = beat.label === undefined ? await headingIn(page, beat.selector, beat) : null
    }
    return { url, scrollHeight, failure: null }
  } catch (error) {
    // The page is gone, so none of its beats can be resolved. The reason is written
    // down rather than thrown, so the judgment can still name the beats it blocked.
    const failure =
      error instanceof Error ? (error.message.split('\n')[0] ?? error.message) : String(error)
    return { url, scrollHeight, failure }
  } finally {
    await page.close()
  }
}

/**
 * The two readings a live shot turns on, taken off the site's own page.
 *
 * Neither is asked unconditionally, and the gating is not an optimisation. A `scroll`
 * that is going to stay a `scroll` is never probed for framed motion, because under a
 * scripted scroll the viewport itself moves and every page on earth reads far above
 * the floor — the probe would be measuring its own camera. And a hook that was never
 * going to be `ambient` has nothing for the probe to decide.
 *
 * The hero is framed exactly as the recording frames it — scrolled to the top of the
 * viewport, at the viewport the page is already loaded at — and the page is put back
 * where `stabilise` left it, which is where everything below expects it.
 */
async function readLive(page: Page, config: SiteConfig, taken: Survey): Promise<void> {
  if (configuredMotion(config) === 'scroll') {
    taken.scrollRefires = await scrollEffectsRefire(page, HOOK_MS)
  }
  taken.heroRect = await hookRect(page, config.hook?.selector)
  // Whether the shot the probe would be deciding about is an `ambient` one is the
  // first step of the degradation chain, and `resolvedMotion` owns that chain
  // (ADR-0009). Asked of it rather than re-derived here, so the gate and the plan
  // cannot disagree about which hook this is. The reading it would read next is still
  // null at this point, which is the step below — the one this is about to take.
  if (resolvedMotion(config, taken).motion !== 'ambient') return
  const rect = taken.heroRect
  if (!rect) return
  await frameAt(page, rect.y)
  taken.motionReading = await framedMotion(page)
  await frameAt(page, 0)
}
