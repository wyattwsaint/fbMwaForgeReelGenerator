/**
 * `render <site>` — the pipeline, end to end (#20).
 *
 * check, then one master per shot, then all camera motion synthesised in post, then
 * the encode. `check` first is not a courtesy: it is the settle the render was going
 * to do anyway, and a drifted selector discovered deep in a capture pass costs a
 * minute to learn what it costs seconds to learn here.
 */

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { captureMasters, mastersDir } from './capture.ts'
import { check } from './check.ts'
import { assemble, renderShot } from './compose.ts'
import { overlayCues } from './overlay.ts'
import { planReel } from './plan.ts'
import type { SiteConfig } from './site.ts'

export type Render = { path: string; problems: string[] }

export function outDir(root: string): string {
  return join(root, 'out')
}

/**
 * Renders `out/<slug>-<n>beat.mp4`, or reports why it refused to. Problems are
 * `check`'s own, verbatim — there is one report to learn to read (#18).
 */
export async function render(config: SiteConfig, root: string, slug: string): Promise<Render> {
  const problems = await check(config, root)
  if (problems.length > 0) return { path: '', problems }

  const timeline = planReel(config)
  const dir = outDir(root)
  await mkdir(dir, { recursive: true })

  const masters = await captureMasters(config, timeline, dir)
  const byShot = new Map(masters.map((master) => [master.shot, master]))

  const shots: string[] = []
  for (const [index, shot] of timeline.shots.entries()) {
    const cues = overlayCues(timeline.text, index)
    shots.push(await renderShot(byShot.get(shot) ?? null, shot, mastersDir(dir), cues))
  }

  const path = join(dir, `${slug}-${config.beats.length}beat.mp4`)
  await assemble(shots, timeline, path)
  return { path, problems: [] }
}
