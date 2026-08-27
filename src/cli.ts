import { spawn } from 'node:child_process'
import { relative } from 'node:path'
import { check } from './check.ts'
import { loadSite } from './config.ts'
import { render } from './render.ts'
import type { Phase, Render } from './render.ts'

const USAGE = 'usage: reel check <site>\n       reel render <site>'

export async function main(argv: string[], root = process.cwd()): Promise<number> {
  const [command, slug, ...rest] = argv
  if ((command !== 'check' && command !== 'render') || !slug || rest.length > 0) {
    console.error(USAGE)
    return 2
  }

  const started = Date.now()
  let problems: string[]
  let cut: Render | null = null
  try {
    const config = await loadSite(slug, root)
    if (command === 'check') {
      problems = await check(config, root)
    } else {
      cut = await render(config, root, slug, (phase) => console.log(phaseLine(phase)))
      problems = cut.problems
    }
  } catch (error) {
    console.error(`${command} ${slug} — ${error instanceof Error ? error.message : error}`)
    return 1
  }
  const elapsed = seconds(Date.now() - started)

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
 * One finished phase, as a line: `master 1/5 hero       2.4s`.
 *
 * Fixed columns, so the timings read down the page as a column of numbers rather than
 * having to be picked out of prose — which is the whole reason to print them. The
 * counter is padded inside the name's own column, so `shot`'s counts line up under
 * `master`'s.
 */
function phaseLine({ name, count, subject, ms }: Phase): string {
  const label = count ? `${name.padEnd(6)} ${count.index + 1}/${count.total}` : name
  return `${label.padEnd(10)} ${subject.padEnd(11)}${seconds(ms)}`
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
