import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { configProblems, copyProblems } from './config.ts'
import {
  DEFAULT_PUNCH_FACTOR,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  MAX_BEATS,
  MIN_BEATS,
  punchedFrameHeight,
} from './frame.ts'
import { COPY_BUDGETS, panTravelProblems, planReel } from './plan.ts'
import type { Shot, Timeline } from './plan.ts'
import { headingIn, hookRect, rectOf } from './page.ts'
import type { Rect } from './page.ts'
import { settle } from './settle.ts'
import type { Beat, SiteConfig } from './site.ts'

export type { Rect } from './page.ts'

/**
 * What one settle bought: everything wrong with the config, and the headings the page
 * gave up while it was open.
 *
 * The headings ride along rather than being fetched again by the render, because they
 * are read off the *settled* page and settling it is the expensive thing `check` already
 * did — a render that loaded every page a second time to ask for its labels would pay
 * the whole preflight twice for text it had already been handed.
 */
export type Checked = {
  problems: string[]
  /**
   * In beat order. Null where the section has no heading, where the beat never
   * resolved, and where the config named a label — the plan draws that label whatever
   * the page says, so the heading it beats is not worth a round trip to read.
   */
  headings: (string | null)[]
}

/**
 * The render path stopped after settle. Reports *every* problem it finds — a
 * drifted site usually breaks several selectors at once, and fail-fast turns one
 * fix-and-rerun cycle into four.
 */
export async function check(config: SiteConfig, root: string): Promise<Checked> {
  const problems = configProblems(config, root)
  if (typeof config.url !== 'string' || config.url === '' || !Array.isArray(config.beats)) {
    return { problems, headings: [] } // Nothing left to resolve against.
  }

  // The plan says which beats pan and where, so it is what decides whether a punch
  // factor leaves one room to travel. A beat count the plan cannot describe is already
  // named above by `configProblems`, and the page checks still run without a plan.
  const plannable = config.beats.length >= MIN_BEATS && config.beats.length <= MAX_BEATS
  const timeline: Timeline | null = plannable ? planReel(config) : null

  const browser = await chromium.launch()
  try {
    const resolved = await resolveOnPages(browser, config, timeline)
    return { problems: [...problems, ...resolved.problems], headings: resolved.headings }
  } finally {
    await browser.close()
  }
}

/** One load per distinct URL: beats that share a route share a page. */
async function resolveOnPages(
  browser: Browser,
  config: SiteConfig,
  timeline: Timeline | null,
): Promise<Checked> {
  const problems: string[] = []
  // Beats are visited grouped by page rather than in reel order, so the headings are
  // filled in by index rather than pushed — a beat on another route would otherwise
  // caption the beat that happened to be resolved before it.
  const headings: (string | null)[] = config.beats.map(() => null)
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
        const checked = await checkBeat(page, index, beat, pageHeight, shot)
        problems.push(...checked.problems)
        headings[index] = checked.heading
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
  return { problems, headings }
}

async function checkHook(page: Page, config: SiteConfig): Promise<string[]> {
  const selector = config.hook?.selector
  if (await hookRect(page, selector)) return []
  return selector
    ? [`hook.selector '${selector}' — no element matches`]
    : ['hook — no hero found; name one with hook.selector']
}

async function checkBeat(
  page: Page,
  index: number,
  beat: Beat,
  pageHeight: number,
  shot: Shot | null,
): Promise<{ problems: string[]; heading: string | null }> {
  const rect = await rectOf(page, beat.selector)
  if (!rect) {
    return {
      problems: [`beats[${index}] selector '${beat.selector}' — no element matches`],
      heading: null,
    }
  }
  const problems: string[] = []

  // Only asked when the config named no label: a config that did is what will be drawn,
  // `configProblems` has already measured it, and the heading it overrides is a line
  // this reel will never carry. Windowed by the beat's own `y`/`height` where it has
  // them, because that hatch resolves to an ancestor and the heading wanted is the one
  // inside the slice, not the first one on the page.
  //
  // A label the page wrote is then held to exactly the standard a label Wyatt wrote is
  // held to: over the budget or over the width it draws, and `check` says so by name
  // (#62). So a page with a long heading fails until a human writes a shorter line, and
  // that pressure is the point — type never shrinks to fit (#9).
  const heading =
    beat.label === undefined ? await headingIn(page, beat.selector, beat) : null
  if (heading !== null) {
    problems.push(...copyProblems(`beats[${index}] heading`, heading, COPY_BUDGETS.label, 'label'))
  }

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
  // `fit` is no exemption from this: it only ever widens the capture viewport, and
  // widening cannot make a section that is already inside one frame fill it. A short
  // section still needs a punch, or a taller subject.
  const punch = shot?.punchFactor ?? beat.punchFactor ?? DEFAULT_PUNCH_FACTOR
  const needed = punchedFrameHeight(punch)
  if (height < needed) {
    problems.push(
      `beats[${index}] '${beat.selector}' is ${Math.round(height)}px tall; ` +
        `a punchFactor of ${punch} needs ${needed}px`,
    )
    // The section does not fill the frame, so asking what a pan has left over on top
    // of that is the same defect said twice.
    return { problems, heading }
  }

  // A pan only travels across what the punch left over, so #7 wants a punch that
  // leaves none caught here rather than discovered as a still.
  if (shot) problems.push(...panTravelProblems(shot, beat.selector, height))
  return { problems, heading }
}

