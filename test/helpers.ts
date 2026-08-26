import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('../', import.meta.url))
const BIN = join(REPO, 'bin', 'reel.mjs')
const TMP = join(REPO, 'test', '.tmp')
const SNAPSHOTS = join(REPO, 'test', 'snapshot')

/**
 * Compare a value against its checked-in JSON record, which is the readable
 * statement of what a reel's shape *is*. Rewrite them with `UPDATE_SNAPSHOTS=1`,
 * and read the diff — a snapshot that changes without a finding changing is a
 * regression wearing a new record's clothes.
 */
export function snapshot(name: string, value: unknown): void {
  const path = join(SNAPSHOTS, `${name}.json`)
  const actual = `${JSON.stringify(value, null, 2)}\n`
  if (process.env.UPDATE_SNAPSHOTS === '1' || !existsSync(path)) {
    mkdirSync(SNAPSHOTS, { recursive: true })
    writeFileSync(path, actual)
    return
  }
  assert.equal(actual, readFileSync(path, 'utf8'), `${name} no longer matches test/snapshot/${name}.json`)
}

export type Workspace = {
  /** cwd for the CLI — `sites/<slug>.ts` is resolved from here, as it is for Wyatt. */
  root: string
  site: (slug: string, source: string) => Promise<void>
  dispose: () => Promise<void>
}

/** A workspace, disposed however the body ends. */
export async function withWorkspace<T>(body: (ws: Workspace) => Promise<T>): Promise<T> {
  const ws = await workspace()
  try {
    return await body(ws)
  } finally {
    await ws.dispose()
  }
}

export async function workspace(): Promise<Workspace> {
  await mkdir(TMP, { recursive: true })
  const root = await mkdtemp(join(TMP, 'ws-'))
  await mkdir(join(root, 'sites'))
  return {
    root,
    site: (slug, source) => writeFile(join(root, 'sites', `${slug}.ts`), source),
    dispose: () => rm(root, { recursive: true, force: true }),
  }
}

export type Run = { code: number; stdout: string; stderr: string; output: string }

/** Drive the CLI the way Wyatt does: a process, an exit code, and its report. */
export function reel(args: string[], cwd: string): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], { cwd })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr, output: stdout + stderr }))
  })
}

/**
 * ffprobe, as a flat record. Tests assert on the mp4 Wyatt would play, never on the
 * ffmpeg arguments that produced it — an argv assertion makes a refactor look like a
 * regression.
 */
export async function probe(
  path: string,
  entries: string,
  stream?: string,
): Promise<Record<string, string>> {
  const out = await capture('ffprobe', [
    '-v', 'error',
    ...(stream ? ['-select_streams', stream] : []),
    '-show_entries', entries,
    '-of', 'default=noprint_wrappers=1',
    path,
  ])
  const fields: Record<string, string> = {}
  for (const line of out.toString('utf8').split(/\r?\n/)) {
    const at = line.indexOf('=')
    if (at > 0) fields[line.slice(0, at)] = line.slice(at + 1)
  }
  return fields
}

/** One decoded frame as raw RGB — what the pixels actually are, not what was asked for. */
export async function frame(path: string, index: number): Promise<Buffer> {
  return capture('ffmpeg', [
    '-v', 'error',
    '-i', path,
    '-vf', `select='eq(n,${index})'`,
    '-fps_mode', 'passthrough',
    '-frames:v', '1',
    '-f', 'rawvideo',
    '-pix_fmt', 'rgb24',
    '-',
  ])
}

/** Mean per-channel difference between two frames, 0..255. */
export function meanDiff(a: Buffer, b: Buffer): number {
  assert.equal(a.length, b.length)
  let total = 0
  for (let i = 0; i < a.length; i++) total += Math.abs((a[i] as number) - (b[i] as number))
  return total / a.length
}

/** How many pixels of a frame sit within `tolerance` of a colour, per channel. */
export function pixelsNear(frameBytes: Buffer, hex: string, tolerance = 14): number {
  const want = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16))
  let found = 0
  for (let i = 0; i + 2 < frameBytes.length; i += 3) {
    if (want.every((c, k) => Math.abs((frameBytes[i + k] as number) - c) <= tolerance)) found++
  }
  return found
}

function capture(bin: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true })
    const chunks: Buffer[] = []
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(new Error(`${bin} exited ${code}\n${stderr.trim()}`)),
    )
  })
}
