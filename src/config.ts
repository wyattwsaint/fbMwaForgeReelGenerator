import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { creditProblems } from './card.ts'
import { DEFAULT_PUNCH_FACTOR, MAX_BEATS, MIN_BEATS } from './frame.ts'
import { trackPath } from './house.ts'
import { overflowProblems } from './measure.ts'
import type { TypeRole } from './measure.ts'
import { COPY_BUDGETS, DEFAULT_TRACK, copyProblem } from './plan.ts'
import type { CopyBudget } from './plan.ts'
import type { SiteConfig } from './site.ts'

export function sitePath(slug: string, root: string): string {
  return resolve(root, 'sites', `${slug}.ts`)
}

/** Load `sites/<slug>.ts`. Throws with the path when there is nothing to load. */
export async function loadSite(slug: string, root: string): Promise<SiteConfig> {
  const path = sitePath(slug, root)
  if (!existsSync(path)) throw new Error(`no site config at ${path}`)
  const module = (await import(pathToFileURL(path).href)) as { default?: unknown }
  const config = module.default
  if (!config || typeof config !== 'object') {
    throw new Error(`${path} has no default export — expected \`export default defineSite({...})\``)
  }
  return config as SiteConfig
}

/**
 * Everything the config file says wrong about itself — no browser needed. Reported
 * alongside the page problems in one run, because a drifted site usually breaks
 * several things at once.
 */
export function configProblems(config: SiteConfig, root: string): string[] {
  const problems: string[] = []

  if (typeof config.url !== 'string' || config.url === '') problems.push('url is required')
  if (typeof config.hook?.text !== 'string' || config.hook.text === '') {
    problems.push('hook.text is required')
  } else {
    // #9: copy over budget fails loudly, like a missing selector. Type never shrinks
    // to fit, so the only fix is shorter copy.
    problems.push(...copyProblems('hook.text', config.hook.text, COPY_BUDGETS.hook, 'hook'))
  }
  // A fraction of the hero's own width, so the two edges are the two ends of it. Out of
  // range is not clamped: 1.4 is a human meaning something this cannot do, and a crop
  // silently snapped back to the right edge is a framing decision nobody made (ADR-0011).
  const heroPosition = config.hook?.heroPosition
  const inRange = Number.isFinite(heroPosition) && heroPosition! >= 0 && heroPosition! <= 1
  if (heroPosition !== undefined && !inRange) {
    problems.push(
      `hook.heroPosition is ${heroPosition}; it is a fraction of the hero, ` +
        '0 (left edge) to 1 (right)',
    )
  }
  if (typeof config.cta?.credit !== 'string' || config.cta.credit === '') {
    problems.push('cta.credit is required')
  } else {
    // The card's one line of config-owned copy, against the card's own width.
    problems.push(...creditProblems(config.cta.credit))
  }

  const beats = config.beats
  if (!Array.isArray(beats)) {
    problems.push('beats is required')
  } else {
    if (beats.length < MIN_BEATS || beats.length > MAX_BEATS) {
      problems.push(
        `beats: a reel is ${MIN_BEATS}-${MAX_BEATS} beats, this config has ${beats.length}`,
      )
    }
    beats.forEach((beat, i) => {
      if (typeof beat?.selector !== 'string' || beat.selector === '') {
        problems.push(`beats[${i}].selector is required`)
      }
      // Punching *out* is not a thing: 1.0 is the whole section, and larger numbers
      // capture a narrower column of it.
      if (beat?.punchFactor !== undefined && beat.punchFactor < DEFAULT_PUNCH_FACTOR) {
        problems.push(`beats[${i}].punchFactor is ${beat.punchFactor}; ${DEFAULT_PUNCH_FACTOR} is "no punch"`)
      }
      // The two ends of the same axis: `fit` widens the capture viewport to show the
      // whole section, `punchFactor` crops into it. A beat that names both has not
      // said which of the two it wants, and there is no answer to guess at.
      if (beat?.fit && beat.punchFactor !== undefined) {
        problems.push(
          `beats[${i}] names both fit and punchFactor; fit shows the whole section, ` +
            'punchFactor crops into it',
        )
      }
      if (typeof beat?.label === 'string') {
        problems.push(...copyProblems(`beats[${i}].label`, beat.label, COPY_BUDGETS.label, 'label'))
      }
    })
  }

  // Every reel has a bed, so the default is checked exactly as hard as an override:
  // a track that is not on disk is a render that dies inside ffmpeg a minute in,
  // having captured everything, to say what `check` says in seconds (#18). Each is
  // named as the human would fix it — a config key when they wrote one, and the
  // repo's own missing asset when they did not.
  const music = config.music
  if (music && (typeof music.file !== 'string' || music.file === '')) {
    problems.push('music.file is required when music is set')
  } else if (!existsSync(trackPath(music?.file, root))) {
    problems.push(
      music?.file
        ? `music.file '${music.file}' — not found`
        : `${DEFAULT_TRACK} — the signature track is missing from this checkout`,
    )
  }
  // An offset runs forward into the track and nowhere else; `-ss` reads a negative one
  // as an offset from the *end*, which is a bed nobody asked for. How far forward is
  // not checked: the bed is padded to length, so past the end is silence, not a crash.
  const offset = music?.offset
  if (offset !== undefined && !(Number.isFinite(offset) && offset >= 0)) {
    problems.push(`music.offset is ${offset}; an offset slides forward into the track`)
  }

  return problems
}

/**
 * One field of copy against both of #9's limits: how much of it there is, and how
 * wide it draws.
 *
 * The count is the budget the human was given and the width is the constraint the
 * budget stands in for — 42 characters is about 25 of them at hook size, so a line
 * of capitals inside the count still runs off the side of the slot. Width is only
 * asked once the count passes, because a line that broke the count breaks it *by
 * being too long*, and naming the same rewrite twice is a report that reads as two
 * defects.
 */
export function copyProblems(
  field: string,
  content: string,
  budget: CopyBudget,
  role: TypeRole,
): string[] {
  const problem = copyProblem(field, content, budget)
  return problem ? [problem] : overflowProblems(field, content, role)
}
