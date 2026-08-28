/**
 * `render <site>` — the pipeline, end to end (#20).
 *
 * check, then one master per shot, then all camera motion synthesised in post, then
 * the encode, then the review stills. `check` first is not a courtesy: it is the
 * settle the render was going to do anyway, and a drifted selector discovered deep in
 * a capture pass costs a minute to learn what it costs seconds to learn here.
 *
 * Each phase is reported as it finishes, with what it cost. Nothing is announced
 * before it happens and nothing is redrawn: the reason to look at this output is
 * almost always "which beat is slow", and the reason to scroll back through it is
 * that something failed — both of which a redrawing progress bar erases (#18).
 */

import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { captureMasters, mastersDir } from './capture.ts'
import { check } from './check.ts'
import { assemble, renderShot } from './compose.ts'
import { trackPath } from './house.ts'
import { planReel } from './plan.ts'
import type { Shot } from './plan.ts'
import { reviewStills } from './review.ts'
import type { SiteConfig } from './site.ts'

/**
 * One finished phase: what it was, what it was about, and what it cost.
 *
 * Data, not a line. How it is laid out is the CLI's — this is the pipeline saying
 * what it just did, and it does not know it is being printed at all.
 */
export type Phase = {
  /** `check`, `measure`, `master`, `shot`, `mux`. */
  name: string
  /** Which of how many, when the phase is one of a countable pass. */
  count?: { index: number; total: number }
  /** What the phase was about: the section a master frames, the move a shot is. */
  subject: string
  ms: number
}
export type Report = (phase: Phase) => void

export type Render = {
  path: string
  /** The review stills, in the order they are worth looking at. Empty on refusal. */
  stills: string[]
  /** The reel's own length — what `done` reports, beside what the render cost. */
  durationMs: number
  /** `check`'s own notes: what the run decided *for* the human, and did anyway (#66). */
  notes: string[]
  problems: string[]
}

export function outDir(root: string): string {
  return join(root, 'out')
}

/**
 * Renders `out/<slug>-<n>beat.mp4` and its two review stills, or reports why it
 * refused to. Problems are `check`'s own, verbatim — there is one report to learn to
 * read (#18).
 *
 * `out/` is wiped first, before check and before anything else: it is disposable by
 * construction (#14), and the failure mode of letting scratch accumulate is real and
 * unrecoverable — promoting yesterday's cut because it was still lying around. One
 * render at a time, one thing in `out/`, so promotion's argument is unambiguous.
 *
 * A render that then dies mid-pass keeps everything it got as far as. The partial
 * masters are exactly what the failure is diagnosed from, `out/` is gitignored, and
 * promotion takes an explicit `.mp4` path that a failed run never produced — so
 * debris cannot be promoted by accident, and clearing it would only destroy evidence.
 */
export async function render(
  config: SiteConfig,
  root: string,
  slug: string,
  report: Report = () => {},
): Promise<Render> {
  const dir = outDir(root)
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })

  const checkedAt = Date.now()
  const { problems, notes, headings, heights } = await check(config, root)
  report({
    name: 'check',
    subject: problems.length === 0 ? 'ok' : 'failed',
    ms: Date.now() - checkedAt,
  })
  if (problems.length > 0) return { path: '', stills: [], durationMs: 0, notes, problems }

  // What `check` already read off the settled pages: the heading a beat that named no
  // `label` draws (#62), and the height that says whether a `fit` beat can fit legibly
  // (#66). Planned once, here, so capture and compose read one timeline.
  const timeline = planReel(config, headings, heights)

  // Masters are grouped by page and device scale rather than taken in reel order, so
  // the count runs in the order they are finished — which is the order they cost.
  const masterCount = timeline.shots.filter((shot) => shot.source).length
  let taken = 0
  // A fit beat's measurement load is a phase of its own rather than a count off the
  // masters (#78): it is a full page settle that produced no pixels, and how many
  // there are is a property of the config's fit beats, not of the reel's shots.
  const masters = await captureMasters(config, timeline, dir, (event) =>
    report(
      event.kind === 'master'
        ? {
            name: 'master',
            count: { index: taken++, total: masterCount },
            subject: subjectOf(event.shot),
            ms: event.ms,
          }
        : // Every fit section the load answered for, because one load serves all of
          // them: a line naming only the first would under-state what it bought.
          { name: 'measure', subject: event.shots.map(subjectOf).join(', '), ms: event.ms },
    ),
  )
  const byShot = new Map(masters.map((master) => [master.shot, master]))

  const shots: string[] = []
  for (const [index, shot] of timeline.shots.entries()) {
    // Every cue of this shot, whatever its role: `compose` hands the overlay roles
    // to `overlay` and the card's own to `card`, and neither has to know the other's.
    const cues = timeline.text.filter((cue) => cue.shot === index)
    const count = { index, total: timeline.shots.length }
    shots.push(
      await timed(report, { name: 'shot', count, subject: shot.move }, () =>
        renderShot(byShot.get(shot) ?? null, shot, mastersDir(dir), cues),
      ),
    )
  }

  const path = join(dir, `${slug}-${config.beats.length}beat.mp4`)
  await timed(report, { name: 'mux', subject: '' }, () =>
    assemble(shots, timeline, path, trackPath(config.music?.file, root)),
  )

  // After the mux, and out of the mp4 rather than out of the pipeline that made it:
  // a still that is not read back off the file it describes is a still that can
  // disagree with what was shipped.
  const stills = await reviewStills(path, dir, slug, timeline)
  return { path, stills, durationMs: timeline.durationMs, notes, problems: [] }
}

/** What a phase is *about*: the section a master frames, or the move a shot is. */
function subjectOf(shot: Shot): string {
  const selector = shot.source?.selector
  return selector ? selector.replace(/^#/, '') : shot.kind
}

async function timed<T>(
  report: Report,
  phase: Omit<Phase, 'ms'>,
  work: () => Promise<T>,
): Promise<T> {
  const started = Date.now()
  const result = await work()
  report({ ...phase, ms: Date.now() - started })
  return result
}
