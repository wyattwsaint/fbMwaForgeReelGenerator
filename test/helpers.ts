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
 * git, in a workspace — never in this repo. Promotion's whole assertion is what a
 * commit *touched*, and that has to be asked of a repo the test owns and throws away.
 */
export function git(args: string[], cwd: string): Promise<string> {
  return run('git', args, (stdout) => stdout.toString('utf8'), cwd)
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

/**
 * One decoded frame as raw RGB — what the pixels actually are, not what was asked for.
 *
 * `size` scales it on the way out, which is how a frame is compared against something
 * that carries it at another size — a contact sheet's tile, say.
 */
export async function frame(path: string, index: number, size?: [number, number]): Promise<Buffer> {
  return capture('ffmpeg', [
    '-v', 'error',
    '-i', path,
    '-vf', `select='eq(n,${index})'${size ? `,scale=${size[0]}:${size[1]}` : ''}`,
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

/** Mean channel value over a band of rows, 0..255 — how dark a scrim has made it. */
export function meanLuma(frameBytes: Buffer, top: number, bottom: number): number {
  const stride = 1080 * 3
  let total = 0
  for (let i = top * stride; i < bottom * stride; i++) total += frameBytes[i] as number
  return total / ((bottom - top) * stride)
}

/**
 * How abruptly a frame changes across its columns, 0..255 — how sharp it is.
 *
 * Not the plain column-to-column difference: motion blur turns a hard edge into a
 * ramp, and a ramp climbing the same distance more slowly has exactly the same total
 * difference, so that number cannot tell a smear from an edge. The second difference
 * can — it is large where a pattern *turns* and near zero along a ramp — which is how
 * "softer" is asked as a number rather than looked at.
 */
export function acutance(frameBytes: Buffer): number {
  const stride = 1080 * 3
  const rows = frameBytes.length / stride
  let total = 0
  for (let row = 0; row < rows; row++) {
    const start = row * stride
    for (let i = start + 3; i < start + stride - 3; i++) {
      const here = frameBytes[i] as number
      total += Math.abs((frameBytes[i - 3] as number) + (frameBytes[i + 3] as number) - 2 * here)
    }
  }
  return total / (rows * (stride - 6))
}

function capture(bin: string, args: string[]): Promise<Buffer> {
  return run(bin, args, (stdout) => stdout)
}

/** ffmpeg says everything worth reading on stderr — `volumedetect`'s tally included. */
function captureStderr(bin: string, args: string[]): Promise<string> {
  return run(bin, args, (_stdout, stderr) => stderr)
}

function run<T>(
  bin: string,
  args: string[],
  pick: (stdout: Buffer, stderr: string) => T,
  cwd?: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, windowsHide: true })
    const chunks: Buffer[] = []
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0
        ? resolve(pick(Buffer.concat(chunks), stderr))
        : reject(new Error(`${bin} exited ${code}\n${stderr.trim()}`)),
    )
  })
}

/**
 * Mean volume of a slice of a file's audio, in dBFS — silence reads as `-inf`.
 *
 * The bed is asserted the way it is heard rather than by the arguments that laid it
 * down: whether the reel is loud where the track is loud, and quiet where it fades.
 */
export async function meanVolume(
  path: string,
  window: { start: number; duration: number },
): Promise<number> {
  const out = await captureStderr('ffmpeg', [
    '-v', 'info',
    '-ss', window.start.toFixed(3),
    '-t', window.duration.toFixed(3),
    '-i', path,
    '-af', 'volumedetect',
    '-f', 'null',
    '-',
  ])
  const found = /mean_volume:\s*(-?[\d.]+|-inf) dB/.exec(out)
  if (!found) throw new Error(`no mean_volume in volumedetect output:\n${out}`)
  return found[1] === '-inf' ? Number.NEGATIVE_INFINITY : Number(found[1])
}

/**
 * The bed ends *with* the reel rather than being cut off (#8): the reel's last fifth
 * of a second is far quieter than the same slice was before the fade began.
 *
 * A hard cut leaves the two readings level, which is the whole difference between a
 * bed trimmed to length and a bed faded to it.
 */
export async function assertFadesOut(
  path: string,
  endSeconds: number,
  fadeSeconds: number,
): Promise<void> {
  const before = await meanVolume(path, { start: endSeconds - fadeSeconds - 0.4, duration: 0.3 })
  const last = await meanVolume(path, { start: endSeconds - 0.2, duration: 0.2 })
  assert.ok(last < before - 12, `the bed is cut off rather than faded: ${before} -> ${last} dB`)
}
