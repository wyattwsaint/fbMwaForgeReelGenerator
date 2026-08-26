import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DEFAULT_PUNCH_FACTOR, MAX_BEATS, MIN_BEATS } from './frame.ts'
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
  }
  if (typeof config.cta?.credit !== 'string' || config.cta.credit === '') {
    problems.push('cta.credit is required')
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
    })
  }

  if (config.music) {
    const file = config.music.file
    if (typeof file !== 'string' || file === '') {
      problems.push('music.file is required when music is set')
    } else {
      const path = isAbsolute(file) ? file : resolve(root, file)
      if (!existsSync(path)) problems.push(`music.file '${file}' — not found`)
    }
  }

  return problems
}
