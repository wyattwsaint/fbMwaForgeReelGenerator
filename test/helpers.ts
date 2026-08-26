import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('../', import.meta.url))
const BIN = join(REPO, 'bin', 'reel.mjs')
const TMP = join(REPO, 'test', '.tmp')

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
