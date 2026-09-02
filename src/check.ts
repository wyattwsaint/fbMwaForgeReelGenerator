import { configProblems, copyProblems } from './config.ts'
import { DEFAULT_PUNCH_FACTOR, MAX_BEATS, MIN_BEATS, punchedFrameHeight } from './frame.ts'
import {
  COPY_BUDGETS,
  fitCapFallback,
  panTravelProblems,
  planReel,
  resolvedMotion,
} from './plan.ts'
import { trailed } from './plan.ts'
import type { Shot } from './plan.ts'
import type { Beat, SiteConfig } from './site.ts'
import { survey } from './survey.ts'
import type { Survey, SurveyedBeat, SurveyedPage } from './survey.ts'

export type { Rect } from './page.ts'

/**
 * What one settle bought: everything wrong with the config, and everything the run
 * decided to do about a page rather than refuse over.
 *
 * Two lists and nothing else (ADR-0009). The survey the judgment read is not carried
 * back, because the caller that needs it — the render, which plans a timeline from it
 * — is the caller that took it: `check` is the thin composition of a survey and a
 * verdict, and a value that only passed through it has no business in its result.
 */
export type Checked = {
  problems: string[]
  /**
   * Things the run did rather than things it refuses to do: a `fit: true` past the
   * legibility cap (#66), a `scroll` hook on a page whose reveals cannot re-fire and so
   * renders as ambient (#64), an `ambient` hook whose hero does not move in the frame
   * and so is captured still (#88) — whatever the pipeline decides *for* a human who
   * asked for something else.
   *
   * Never a reason to refuse — a note that stopped the render would be a problem, and
   * problems are the list above. A config that can only ever degrade would otherwise be
   * permanently unrenderable, which is a worse answer than a good ambient hook and a
   * line saying so.
   */
  notes: string[]
}

/**
 * The render path stopped after settle. Reports *every* problem it finds — a
 * drifted site usually breaks several selectors at once, and fail-fast turns one
 * fix-and-rerun cycle into four.
 *
 * Two halves with a value between them (ADR-0009): `survey` opens the browser and
 * writes down what the pages said, and `verdict` — which never opens one — decides
 * what that means. Nothing below this line imports Playwright.
 */
export async function check(config: SiteConfig, root: string): Promise<Checked> {
  return judge(config, root, await survey(config))
}

/**
 * The whole report over a survey somebody else took: what the config gets wrong on its
 * own, then what it gets wrong against the pages.
 *
 * One composer rather than one per caller, because the order is a promise (#18): the
 * config's own problems come first, since a config that names no music file is worth
 * reading before a selector that did not match on page three. `render` takes the survey
 * itself — it plans a timeline from the same value — and reaches the report through
 * here, so there is one place that spells what a report is made of.
 */
export function judge(config: SiteConfig, root: string, taken: Survey): Checked {
  const judged = verdict(config, taken)
  return { problems: [...configProblems(config, root), ...judged.problems], notes: judged.notes }
}

/**
 * What a survey means: every problem the config has against the pages it names, and
 * every note about what the run will do instead.
 *
 * Walked page by page in the order the survey took them, because that is the order the
 * report reads in — a beat's problems sit under the page they were found on, and the
 * hook's sit at the top of the site's own page rather than at the top of the report.
 */
export function verdict(config: SiteConfig, taken: Survey): Checked {
  const problems: string[] = []
  const notes: string[] = []
  const hook = resolvedMotion(config, taken)

  // The plan says which beats pan and where, so it is what decides whether a punch
  // factor leaves one room to travel — and since #66 one of those decisions turns on a
  // measurement, so a `check` that derived its own would be a second planner, free to
  // disagree with the one the render uses.
  //
  // Planned once, from the whole survey, and read beat by beat below: one call cannot
  // disagree with itself. A beat count the plan cannot describe is already named by
  // `configProblems`, and the page checks still run without a plan.
  const count = Array.isArray(config.beats) ? config.beats.length : 0
  const plannable = count >= MIN_BEATS && count <= MAX_BEATS
  const shots = plannable ? planReel(config, taken).shots : []
  const beatShot = (index: number): Shot | null =>
    shots.find((shot) => shot.kind === 'beat' && shot.index === index) ?? null

  for (const page of taken.pages) {
    if (page.url === config.url) notes.push(...hook.notes)
    if (page.failure !== null) problems.push(blockedBy(page, taken))
    else if (page.url === config.url) problems.push(...hookProblems(config, taken))
    taken.beats.forEach((surveyed, index) => {
      if (surveyed.url !== page.url) return
      // A page that died mid-survey took its unresolved beats down with it, and they
      // are named on the failure line rather than judged as selectors that did not
      // match. Whatever it had already measured is still judged: a load failure should
      // shrink the report by the beats it actually blocked and by nothing else.
      if (page.failure !== null && surveyed.rect === null) return
      const beat = config.beats[index]
      if (!beat) return
      const judged = judgeBeat(beat, index, surveyed, page.scrollHeight, beatShot(index))
      problems.push(...judged.problems)
      notes.push(...judged.notes)
    })
  }

  return { problems, notes }
}

/**
 * A page that would not load, and the beats it took down with it. Named rather than
 * quietly dropped: a load failure that only shrank the report would leave a human
 * reading a clean check of half a config.
 *
 * Only the beats it genuinely left unmeasured: a page that died after resolving two of
 * its three sections blocked one beat, and naming the other two as unchecked would be
 * a report that hid two judgments it had already made.
 */
function blockedBy(page: SurveyedPage, taken: Survey): string {
  const blocked = taken.beats
    .map((beat, index) =>
      beat.url === page.url && beat.rect === null ? `beats[${index}]` : null,
    )
    .filter((named): named is string => named !== null)
    .join(', ')
  return `${page.url} — ${page.failure}${blocked ? ` (unchecked: ${blocked})` : ''}`
}

function hookProblems(config: SiteConfig, taken: Survey): string[] {
  const selector = config.hook?.selector
  if (taken.heroRect) return []
  return selector
    ? [`hook.selector '${selector}' — no element matches`]
    : ['hook — no hero found; name one with hook.selector']
}

function judgeBeat(
  beat: Beat,
  index: number,
  surveyed: SurveyedBeat,
  pageHeight: number | null,
  shot: Shot | null,
): { problems: string[]; notes: string[] } {
  if (!surveyed.rect || surveyed.height === null) {
    return {
      problems: [`beats[${index}] selector '${beat.selector}' — no element matches`],
      notes: [],
    }
  }
  const problems: string[] = []
  const notes: string[] = []

  // A label the page wrote is held to exactly the standard a label Wyatt wrote is held
  // to: over the budget or over the width it draws, and `check` says so by name (#62).
  // So a page with a long heading fails until a human writes a shorter line, and that
  // pressure is the point — type never shrinks to fit (#9).
  if (surveyed.heading !== null) {
    const budget = COPY_BUDGETS.label
    problems.push(...copyProblems(`beats[${index}] heading`, trailed(surveyed.heading), budget, 'label'))
  }

  // `y`/`height` is the escape hatch for when no element wraps the subject: the
  // selector still has to resolve, it just does not have to be the right shape.
  // Both are page coordinates, the same space the master is clipped out of.
  const top = beat.y ?? surveyed.rect.y
  const height = surveyed.height

  // A `fit: true` the cap turned into a pan, said out loud (#66). A note and not a
  // problem: the beat renders, and what the human needs is to know it renders as
  // something other than what they wrote.
  const fallback = fitCapFallback(index, beat, height)
  if (fallback) notes.push(fallback)

  // Null where the page died before it was asked its own height — a beat measured on a
  // page that then failed is judged for everything but whether it runs off the bottom
  // of a page nobody has a height for.
  if (pageHeight !== null && top + height > pageHeight) {
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
    return { problems, notes }
  }

  // A pan only travels across what the punch left over, so #7 wants a punch that
  // leaves none caught here rather than discovered as a still. The fallback's pan is
  // no exception: it is a vertical pan like any other, and it is held here like one.
  if (shot) problems.push(...panTravelProblems(shot, beat.selector, height))
  return { problems, notes }
}
