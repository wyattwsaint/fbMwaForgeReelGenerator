import { spawn } from 'node:child_process'
import { relative } from 'node:path'
import { check } from './check.ts'
import { loadSite } from './config.ts'
import { keep } from './keep.ts'
import { render } from './render.ts'
import type { Render, Report } from './render.ts'
import { sectionLines, sections } from './sections.ts'
import type { Section } from './sections.ts'

const USAGE = [
  // `sections` is the one command that takes a URL, and it takes one because it is
  // what you run *before* `sites/<slug>.ts` exists — a slug is the one thing it
  // cannot ask for. Said here, or the exception reads as an inconsistency.
  'usage: reel sections <url>        # a URL, not a site: run it before a config exists',
  '       reel check    <site>',
  '       reel render   <site>',
  '       reel keep     out/<file>.mp4',
].join('\n')

export async function main(argv: string[], root = process.cwd()): Promise<number> {
  const [command, argument, ...rest] = argv
  const known =
    command === 'check' || command === 'render' || command === 'keep' || command === 'sections'
  // One positional argument each and no flags anywhere (#18): a flag that changed a
  // reel's shape would make a kept reel's config no longer describe the reel.
  if (!known || !argument || argument.startsWith('-') || rest.length > 0) {
    console.error(USAGE)
    return 2
  }

  if (command === 'keep') return await promote(argument, root)
  if (command === 'sections') return await reportSections(argument)

  // What is left takes a site, not a path: `check` and `render` are one path's halves.
  const slug = argument
  const started = Date.now()
  let problems: string[]
  let notes: string[]
  let cut: Render | null = null
  try {
    const config = await loadSite(slug, root)
    if (command === 'check') {
      const checked = await check(config, root)
      problems = checked.problems
      notes = checked.notes
    } else {
      cut = await render(config, root, slug, phaseReport((line) => console.log(line)))
      problems = cut.problems
      notes = cut.notes
    }
  } catch (error) {
    console.error(`${command} ${slug} — ${error instanceof Error ? error.message : error}`)
    return 1
  }
  const elapsed = seconds(Date.now() - started)

  // Notes first, and printed whether or not anything failed: a note is something the
  // run *did* — a `fit` past the cap, panned instead (#66); a `scroll` hook recorded as
  // ambient (#64) — so it is read alongside the reel it describes, and it never changes
  // the exit code. Burying it under a list of selector problems is how it goes unread.
  for (const note of notes) console.log(`note  ${note}`)

  if (problems.length > 0) {
    // `render` has already printed its own `check failed` line; a standalone one has
    // not, and the report reads as a report rather than a list without a heading.
    if (command === 'check') console.log(`check ${slug}  ${elapsed}`)
    console.log('')
    for (const problem of problems) console.log(`  ${problem}`)
    console.log('')
    console.log(`${problems.length} problem${problems.length === 1 ? '' : 's'}.`)
    return 1
  }

  if (!cut) {
    console.log(`check ok  ${slug}  ${elapsed}`)
    return 0
  }

  // The reel's own length beside what it cost to cut — the two numbers that are
  // never each other, and the only line worth reading when nothing went wrong.
  console.log(`done  ${relative(root, cut.path)}  ${seconds(cut.durationMs)}   [${elapsed} total]`)
  start([cut.path, ...cut.stills])
  return 0
}

/**
 * The page, reported — a selector that resolves, a height and the punch that height
 * needs, one line per candidate section. Enough to paste a first config out of,
 * which `check` then corrects.
 */
async function reportSections(url: string): Promise<number> {
  // A slug is a whole config file's worth of decisions; this command exists because
  // none of them have been made yet. Naming the mistake beats printing USAGE at it.
  if (!/^https?:\/\//.test(url)) {
    console.error(`sections ${url} — takes a URL, not a site: try \`reel sections https://${url}\``)
    return 2
  }
  const started = Date.now()
  let found: Section[]
  try {
    found = await sections(url)
  } catch (error) {
    // The first line only: a Playwright load failure carries a page of call log
    // under its one-line reason, and that reason is the whole report here.
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error)
    console.error(`sections ${url} — ${reason}`)
    return 1
  }
  const elapsed = seconds(Date.now() - started)

  if (found.length === 0) {
    // Not a crash and not a report either: the page loaded and `main` has nothing in
    // it that draws, so there is nothing a beat could be written against.
    console.error(`sections ${url} — no sections found  ${elapsed}`)
    return 1
  }
  console.log(`sections ${url}  ${elapsed}`)
  console.log('')
  for (const line of sectionLines(found)) console.log(line ? `  ${line}` : '')
  console.log('')
  console.log(`${found.length} section${found.length === 1 ? '' : 's'}.`)
  return 0
}

/**
 * Promotion, as the CLI sees it: the commit's own stat is the whole report, because
 * what is worth reading is which paths the commit touched (#28).
 */
async function promote(path: string, root: string): Promise<number> {
  try {
    console.log(await keep(path, root))
    return 0
  } catch (error) {
    console.error(`keep ${path} — ${error instanceof Error ? error.message : error}`)
    return 1
  }
}

/**
 * The name's own column, and the counter padded inside it — so `shot`'s counts line
 * up under `master`'s rather than each name pushing its own count along.
 */
const NAME_COLUMN = 6
const LABEL_COLUMN = 10

/**
 * The space between the widest subject of a run and its timing. One, because the
 * gap's job is only to be a gap: the timings are found by being in a column, not by
 * being far from the names.
 */
const SUBJECT_GAP = 1

/**
 * The phase report, as lines — one formatter per run, because the grid it draws is
 * this run's (#108).
 *
 * The subject column is sized to the longest subject the run is going to print, which
 * the pipeline hands over the moment it has planned the reel and before the first line
 * is written. So no name can overrun its column however long it is — `header.hero`,
 * or a `measure` line naming every fit section one load answered for — and every
 * timing in one report starts at the same column, which is the whole reason the
 * timings are printed as a column (#18).
 *
 * The price is that the column does not land in the same place in two reports of two
 * different sites. That is the right price: a report is read down its own page, and a
 * fixed width wide enough for today's longest name is only a cliff waiting for a site
 * whose sections are named a little longer.
 *
 * A refusal never reaches the plan — it prints its `check failed` line and its
 * problems — so the column falls back to that one line's own subject, which is the
 * only thing there is to line it up with.
 */
function phaseReport(write: (line: string) => void): Report {
  let column = 0
  return {
    plan(subjects) {
      column = Math.max(...subjects.map((subject) => subject.length))
    },
    phase({ name, count, subject, ms }) {
      const label = count ? `${name.padEnd(NAME_COLUMN)} ${count.index + 1}/${count.total}` : name
      const padded = subject.padEnd(Math.max(column, subject.length) + SUBJECT_GAP)
      write(`${label.padEnd(LABEL_COLUMN)} ${padded}${seconds(ms)}`)
    },
  }
}

/**
 * Hand the reel and both review stills to the desktop — never a subset, because the
 * judgment is "does it play right *and* is the thumbnail right", and opening two of
 * the three is how a bad frame 0 ships (#18).
 *
 * Only for a human who is sitting there: a piped or captured run is a script, a test
 * or a CI job, and none of those has anywhere to open a window. Fire and forget — the
 * viewer outlives the render, so nothing here waits on it or reports what it did.
 */
function start(paths: string[]): void {
  if (!process.stdout.isTTY) return
  const [bin, args] = opener()
  for (const path of paths) {
    const child = spawn(bin, [...args, path], { detached: true, stdio: 'ignore', windowsHide: true })
    child.on('error', () => {}) // No opener is a machine you judge some other way.
    child.unref()
  }
}

/** `start`, and its equivalents on the machines this is not run on. */
function opener(): [string, string[]] {
  // cmd's `start` takes an optional window title first, and a bare path in that
  // position becomes the title rather than the thing to open.
  if (process.platform === 'win32') return ['cmd', ['/c', 'start', '']]
  if (process.platform === 'darwin') return ['open', []]
  return ['xdg-open', []]
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}
