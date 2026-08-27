/**
 * `keep out/<file>.mp4` — promotion (#18, #28, ADR-0004).
 *
 * The judgment stays human: #14 rejected a `--keep` flag on `render` so that deciding
 * a cut ships is the pipeline's one manual step. This runs *after* that judgment,
 * about a file Wyatt chose, and automates only the mechanics — which are worth
 * automating because #14's solo-commit rule is exactly the discipline that erodes by
 * hand.
 *
 * A rendered reel is not reproducible: the client's live site underneath it is theirs
 * to change. So the mp4 is the only record of what a reel was, and the commit that
 * adds it is its manifest — `git log --follow` on a kept reel recovers the config that
 * made it. One `git add .` that sweeps a config edit into that commit destroys that,
 * permanently. Hence both git calls scoped to the one path, and hence the stat.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rename } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve as resolvePath } from 'node:path'

/**
 * Moves a judged cut to `reels/<slug>-<YYYY-MM-DD>.mp4`, commits it on its own, and
 * returns that commit's one-line stat — which names every path it touched, and is
 * therefore the whole report.
 *
 * The date replaces the scratch name's `-<n>beat`: `n` is recoverable from the config
 * the commit carries, and the day it was cut is not.
 *
 * A dirty working tree succeeds. Uncommitted config edits are the *normal* case —
 * you tune, render, judge and keep in one sitting — so refusing on a dirty tree would
 * refuse on the happy path. The pathspecs, not a clean tree, are what make the commit
 * solo.
 */
export async function keep(path: string, root: string): Promise<string> {
  const from = isAbsolute(path) ? path : resolvePath(root, path)
  if (!from.endsWith('.mp4')) throw new Error(`${path} is not an .mp4 — keep takes the cut's own path`)
  // An explicit path is what makes debris unpromotable: a render that died mid-pass
  // never wrote this file, so there is nothing here to mistake for a finished reel.
  if (!existsSync(from)) throw new Error(`no reel at ${from}`)

  const slug = basename(from, '.mp4').replace(/-\d+beat$/, '')
  const day = today()
  const to = join(root, 'reels', `${slug}-${day}.mp4`)
  // Forward slashes: a pathspec is git's, not Windows'.
  const pathspec = relative(root, to).replaceAll('\\', '/')

  await mkdir(join(root, 'reels'), { recursive: true })
  await rename(from, to)

  try {
    await git(['add', '--', pathspec], root)
    // Everything after `--` is a pathspec, so the message has to precede it.
    await git(['commit', '--quiet', '-m', `Keep ${slug} reel, ${day}`, '--', pathspec], root)
  } catch (error) {
    // The move already happened, and the next render wipes `out/` — so say where the
    // reel is now, or the report sends Wyatt looking for it where it no longer is.
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${message}\nthe reel moved to ${pathspec}; nothing was committed`)
  }
  return (await git(['show', '--oneline', '--stat', 'HEAD'], root)).trim()
}

/** The local day — the one Wyatt would write down, not UTC's. */
function today(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', (error) => reject(new Error(`git — ${error.message} (is it on PATH?)`)))
    child.on('close', (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(`git ${args[0]} exited ${code}${stderr.trim() ? `\n${stderr.trim()}` : ''}`)),
    )
  })
}
