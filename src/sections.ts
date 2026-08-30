import { chromium } from 'playwright'
import { BASE_VIEWPORT, FRAME_HEIGHT, LOAD, fitViewportWidth } from './frame.ts'
import { hookRect, sectionRects } from './page.ts'
import type { Rect } from './page.ts'
import { BEAT_MS, panTravelNeeded, pastFitCap, punchFactorFor } from './plan.ts'
import { settle } from './settle.ts'

/**
 * One candidate section of a page, as `reel sections` reports it.
 *
 * A report, not a proposal: it says what is on the page and what each section's
 * height costs in punch. Which of them become beats, in what order, with what hook
 * line, is untouched by it — #10's constraint is that nothing figures out the
 * highlights, and this figures out nothing.
 */
export type Section = {
  /** A selector that resolves — the section's own id, or `main` when it has none. */
  selector: string
  /**
   * True when `selector` is the ancestor rather than the section, so a beat written
   * against it needs `y` and `height` too. Never the hook: it is found by shape when
   * config names no selector, so a hero with no id of its own still needs nothing.
   */
  throughParent: boolean
  y: number
  height: number
  /** The hero. It is the hook, not a beat: a config that lists it opens twice. */
  hook: boolean
  /** Absent on the hook, whose punch is the plan's rather than the config's. */
  punchFactor?: number
  /**
   * The capture viewport a `fit: true` beat would widen to, in CSS pixels — present
   * only on the sections a punch cannot show whole, which is the sections taller than
   * one frame. Absent on the hook, which is not a beat and takes no `fit`.
   *
   * Absent too on a section past the legibility cap (#66): `fit: true` on one of those
   * is fit to width and panned instead, and a report that offered a width `check` will
   * not honour would be a report disagreeing with `check`.
   */
  fitWidth?: number
  /**
   * The line this section leads with — the label a beat written against it inherits
   * when its config names no `label` (#62). Absent where the section has no heading,
   * which is a beat that simply carries no text.
   */
  heading?: string
}

/**
 * Walk a page's candidate sections and measure them — the half of the config loop
 * `check` cannot do, because `check` can only say what is wrong with the selectors
 * you already guessed (#53).
 *
 * Each row carries the heading its section leads with, so the labels a config is
 * about to get for free are visible before it is written (#62).
 *
 * Measured against the **settled** page, in the viewport a master is taken in: a
 * section's height before its lazy images load is not the height the master is
 * clipped at, and a report that disagrees with `check` is worse than no report.
 */
export async function sections(url: string): Promise<Section[]> {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: BASE_VIEWPORT })
    await page.goto(url, LOAD)
    await settle(page)
    const found = await sectionRects(page)
    const heroAt = heroIndex(found, await hookRect(page))
    return found.map(({ selector, named, y, height, heading }, index) => {
      const hook = index === heroAt
      // Rounded once, here, and everything downstream reads the rounded number: a
      // report whose printed height and printed punch were computed from different
      // values invites the reader to correct one of them.
      const rounded = Math.round(height)
      return {
        selector,
        throughParent: !named && !hook,
        y: Math.round(y),
        height: rounded,
        hook,
        ...(hook ? {} : { punchFactor: punchFor(rounded) }),
        ...(hook || rounded <= FRAME_HEIGHT || pastFitCap(rounded)
          ? {}
          : { fitWidth: fitViewportWidth(rounded) }),
        ...(heading === null ? {} : { heading }),
      }
    })
  } finally {
    await browser.close()
  }
}

/**
 * Which candidate is the hero — the first one the hook's own rect starts inside.
 *
 * Containment rather than an equal rect, because `hookRect` owns the one answer to
 * which element the hook is (`check` and `capture` have to agree with it) and that
 * answer is a *descendant* `section`, which on a page that wraps its sections is not
 * a candidate at all. Asking which candidate the hero sits in marks the row a human
 * would otherwise paste as `beats[0]` — which is a reel that opens twice.
 */
function heroIndex(found: Rect[], hero: Rect | null): number {
  if (!hero) return -1
  return found.findIndex((section) => section.y <= hero.y && hero.y < section.y + section.height)
}

/**
 * The punch a section of this height needs — the one number that is right whatever
 * move the beat turns out to get.
 *
 * A section is reported before it is a beat, so which move it draws is not yet
 * decided, and the punch a pan needs also satisfies the drift it might have been:
 * filling the frame is the floor a drift asks for, and a pan asks for one frame plus
 * its travel. Both axes, because a diagonal needs headroom on each — so this is the
 * largest of what any of #6's directions would want, which is what makes it a number
 * `check` accepts in any beat slot rather than one it corrects in half of them.
 */
function punchFor(height: number): number {
  const needed = panTravelNeeded(BEAT_MS)
  return Math.max(punchFactorFor('x', needed, height), punchFactorFor('y', needed, height))
}

/**
 * The report's rows, in document order, plus the one line that explains the sections
 * that have no selector of their own.
 *
 * Fixed columns, like the render's phase lines: the heights and the punch factors are
 * read down the page as columns of numbers, which is the whole reason to print them.
 * The heading is last and quoted, because it is the one column of arbitrary text: a
 * heading with two spaces in it would otherwise read as two columns, and putting it
 * anywhere but the end would push every number right by however long it happens to be.
 */
export function sectionLines(found: Section[]): string[] {
  if (found.length === 0) return []
  const width = Math.max(...found.map((section) => section.selector.length))
  const tallest = Math.max(...found.map((section) => section.height))
  // The hook has no punch factor, so its cell is padded to the width of the ones that
  // do rather than dropped — a heading that slid left on that one row would stop the
  // column being a column. Measured off the cells themselves, so the pad cannot drift
  // from the format that wrote them. The fit cell is padded for the same reason and is
  // empty far more often: only the sections a punch cannot show whole have one.
  const factors = found.map((section) =>
    section.punchFactor === undefined ? '' : `   punchFactor ${section.punchFactor.toFixed(2)}`,
  )
  // The two ways to shoot the section, side by side: punch in on part of it, or fit
  // the whole of it by capturing this wide.
  const fits = found.map((section) =>
    section.fitWidth === undefined ? '' : `   fit ${section.fitWidth}px`,
  )
  const factorWidth = Math.max(...factors.map((factor) => factor.length))
  const fitWidth = Math.max(...fits.map((fit) => fit.length))
  const lines = found.map((section, index) =>
    [
      (section.hook ? 'hook' : '').padEnd(6),
      section.selector.padEnd(width + 2),
      `y ${String(section.y).padEnd(7)}`,
      `${String(section.height).padStart(String(tallest).length)}px`,
      (factors[index] as string).padEnd(factorWidth),
      (fits[index] as string).padEnd(fitWidth),
      section.heading === undefined ? '' : `  "${section.heading}"`,
    ]
      .join('')
      .trimEnd(),
  )
  if (found.some((section) => section.throughParent)) {
    lines.push('')
    lines.push('A row named for its parent has no id of its own — give that beat its y and height too.')
  }
  return lines
}
