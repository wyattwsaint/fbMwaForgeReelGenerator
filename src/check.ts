import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { configProblems } from './config.ts'
import {
  DEFAULT_PUNCH_FACTOR,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  MAX_BEATS,
  MIN_BEATS,
} from './frame.ts'
import { panTravelProblems, planReel } from './plan.ts'
import type { Shot, Timeline } from './plan.ts'
import { settle } from './settle.ts'
import type { Beat, SiteConfig } from './site.ts'

export type Rect = { x: number; y: number; width: number; height: number }

/**
 * The render path stopped after settle. Reports *every* problem it finds — a
 * drifted site usually breaks several selectors at once, and fail-fast turns one
 * fix-and-rerun cycle into four.
 */
export async function check(config: SiteConfig, root: string): Promise<string[]> {
  const problems = configProblems(config, root)
  if (typeof config.url !== 'string' || config.url === '' || !Array.isArray(config.beats)) {
    return problems // Nothing left to resolve against.
  }

  // The plan says which beats pan and where, so it is what decides whether a punch
  // factor leaves one room to travel. A beat count the plan cannot describe is already
  // named above by `configProblems`, and the page checks still run without a plan.
  const plannable = config.beats.length >= MIN_BEATS && config.beats.length <= MAX_BEATS
  const timeline: Timeline | null = plannable ? planReel(config) : null

  const browser = await chromium.launch()
  try {
    problems.push(...(await resolveOnPages(browser, config, timeline)))
  } finally {
    await browser.close()
  }
  return problems
}

/** One load per distinct URL: beats that share a route share a page. */
async function resolveOnPages(
  browser: Browser,
  config: SiteConfig,
  timeline: Timeline | null,
): Promise<string[]> {
  const problems: string[] = []
  const byUrl = new Map<string, { index: number; beat: Beat }[]>()
  config.beats.forEach((beat, index) => {
    const url = beat.url ?? config.url
    const group = byUrl.get(url)
    if (group) group.push({ index, beat })
    else byUrl.set(url, [{ index, beat }])
  })
  // The hook always lives on the site's own URL, so that page is always loaded.
  if (!byUrl.has(config.url)) byUrl.set(config.url, [])

  for (const [url, group] of byUrl) {
    const page = await browser.newPage({
      viewport: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
    })
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 60_000 })
      await settle(page, config.hook?.videoTime)
      if (url === config.url) problems.push(...(await checkHook(page, config)))
      const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight)
      for (const { index, beat } of group) {
        const shot =
          timeline?.shots.find((planned) => planned.kind === 'beat' && planned.index === index) ??
          null
        problems.push(...(await checkBeat(page, index, beat, pageHeight, shot)))
      }
    } catch (error) {
      // The page is gone, so none of its beats can be resolved. Name them, rather
      // than letting a load failure quietly shrink the report.
      const reason = error instanceof Error ? error.message.split('\n')[0] : String(error)
      const blocked = group.map(({ index }) => `beats[${index}]`).join(', ')
      problems.push(`${url} — ${reason}${blocked ? ` (unchecked: ${blocked})` : ''}`)
    } finally {
      await page.close()
    }
  }
  return problems
}

async function checkHook(page: Page, config: SiteConfig): Promise<string[]> {
  const selector = config.hook?.selector
  if (selector) {
    const rect = await rectOf(page, selector)
    return rect ? [] : [`hook.selector '${selector}' — no element matches`]
  }
  const found = await page.evaluate(() => {
    const main = document.querySelector('main')
    return Boolean((main ?? document).querySelector('section') ?? main?.firstElementChild)
  })
  return found ? [] : ['hook — no hero found; name one with hook.selector']
}

async function checkBeat(
  page: Page,
  index: number,
  beat: Beat,
  pageHeight: number,
  shot: Shot | null,
): Promise<string[]> {
  const rect = await rectOf(page, beat.selector)
  if (!rect) return [`beats[${index}] selector '${beat.selector}' — no element matches`]
  const problems: string[] = []

  // `y`/`height` is the escape hatch for when no element wraps the subject: the
  // selector still has to resolve, it just does not have to be the right shape.
  // Both are page coordinates, the same space the master is clipped out of.
  const top = beat.y ?? rect.y
  const height = beat.height ?? rect.height
  if (top + height > pageHeight) {
    problems.push(
      `beats[${index}] '${beat.selector}' runs to ${Math.round(top + height)}px; ` +
        `the page is ${Math.round(pageHeight)}px tall`,
    )
  }

  // A punch captures a *narrower column* of the section — width 1080/punch — and a
  // 9:16 frame out of that column is 1920/punch tall. So this is #18's "no section
  // shorter than the frame", stated in the section's own pixels.
  // The *planned* punch, not the config's: it is what capture will use, and the plan
  // punches a pan the config left flat rather than shooting a move that cannot move.
  const punch = shot?.punchFactor ?? beat.punchFactor ?? DEFAULT_PUNCH_FACTOR
  const needed = Math.round(FRAME_HEIGHT / punch)
  if (height < needed) {
    problems.push(
      `beats[${index}] '${beat.selector}' is ${Math.round(height)}px tall; ` +
        `a punchFactor of ${punch} needs ${needed}px`,
    )
    // The section does not fill the frame, so asking what a pan has left over on top
    // of that is the same defect said twice.
    return problems
  }

  // A pan only travels across what the punch left over, so #7 wants a punch that
  // leaves none caught here rather than discovered as a still.
  if (shot) problems.push(...panTravelProblems(shot, beat.selector, height))
  return problems
}

/** Page coordinates — the master is clipped out of the full page, never scrolled to. */
async function rectOf(page: Page, selector: string): Promise<Rect | null> {
  return page.evaluate((sel) => {
    const element = document.querySelector(sel)
    if (!element) return null
    const box = element.getBoundingClientRect()
    return {
      x: box.x + window.scrollX,
      y: box.y + window.scrollY,
      width: box.width,
      height: box.height,
    }
  }, selector)
}
