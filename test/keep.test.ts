import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'
import { git, reel, withWorkspace } from './helpers.ts'
import type { Workspace } from './helpers.ts'

const REPO = fileURLToPath(new URL('../', import.meta.url))

/** Today, as `keep` names it — the same clock the CLI subprocess reads. */
function today(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * A scratch repo with a cut in `out/` and a dirty tree — the shape of the machine the
 * moment Wyatt decides a reel ships. Never this repo: the whole assertion is what a
 * commit *touched*, and that has to be asked of a repo the test owns and throws away.
 */
async function cut(ws: Workspace, name = 'brobst-3beat.mp4'): Promise<string> {
  await git(['init', '-b', 'main'], ws.root)
  await git(['config', 'user.email', 'test@example.test'], ws.root)
  await git(['config', 'user.name', 'Test'], ws.root)
  await writeFile(join(ws.root, '.gitignore'), 'out/\n')
  await writeFile(join(ws.root, 'sites', 'brobst.ts'), 'export default { punchFactor: 1.2 }\n')
  await git(['add', '-A'], ws.root)
  await git(['commit', '-m', 'Initial'], ws.root)

  await mkdir(join(ws.root, 'out'), { recursive: true })
  await writeFile(join(ws.root, 'out', name), 'mp4 bytes')
  await writeFile(join(ws.root, 'out', 'brobst-frame0.jpg'), 'still')
  await writeFile(join(ws.root, 'out', 'brobst-sheet.jpg'), 'sheet')
  // The normal case: the config edit that produced this cut is still uncommitted.
  await writeFile(join(ws.root, 'sites', 'brobst.ts'), 'export default { punchFactor: 1.4 }\n')
  return `out/${name}`
}

describe('keep', () => {
  test('moves the cut to reels/<slug>-<date>.mp4 and commits it alone', () =>
    withWorkspace(async (ws) => {
      const scratch = await cut(ws)
      const run = await reel(['keep', scratch], ws.root)
      assert.equal(run.code, 0, run.output)

      const kept = `reels/brobst-${today()}.mp4`
      assert.ok(existsSync(join(ws.root, kept)), `${kept} is not there`)
      assert.ok(!existsSync(join(ws.root, scratch)), 'the scratch cut was left behind')
      assert.equal(await readFile(join(ws.root, kept), 'utf8'), 'mp4 bytes')

      assert.equal((await git(['log', '-1', '--format=%s'], ws.root)).trim(), `Keep brobst reel, ${today()}`)
      const touched = (await git(['show', '--name-only', '--format=', 'HEAD'], ws.root)).trim()
      assert.deepEqual(touched.split(/\r?\n/), [kept])
    }))

  test('a dirty tree is the happy path — the config edit stays uncommitted', () =>
    withWorkspace(async (ws) => {
      const scratch = await cut(ws)
      const run = await reel(['keep', scratch], ws.root)
      assert.equal(run.code, 0, run.output)

      const status = await git(['status', '--porcelain'], ws.root)
      assert.match(status, /sites\/brobst\.ts/, 'the config edit rode along in the reel commit')
    }))

  test('does not promote the review stills', () =>
    withWorkspace(async (ws) => {
      const scratch = await cut(ws)
      assert.equal((await reel(['keep', scratch], ws.root)).code, 0)

      assert.ok(existsSync(join(ws.root, 'out', 'brobst-frame0.jpg')), 'frame 0 was moved out of out/')
      assert.ok(existsSync(join(ws.root, 'out', 'brobst-sheet.jpg')), 'the sheet was moved out of out/')
      assert.doesNotMatch(await git(['ls-files'], ws.root), /jpg/)
    }))

  test('prints the commit’s one-line stat, so nothing riding along would be visible', () =>
    withWorkspace(async (ws) => {
      const scratch = await cut(ws)
      const run = await reel(['keep', scratch], ws.root)
      assert.match(run.stdout, new RegExp(`reels/brobst-${today()}\\.mp4`))
      assert.match(run.stdout, /1 file changed/)
    }))

  test('refuses a path a failed render never produced', () =>
    withWorkspace(async (ws) => {
      await cut(ws)
      const run = await reel(['keep', 'out/brobst-4beat.mp4'], ws.root)
      assert.equal(run.code, 1)
      assert.match(run.output, /no reel at .*brobst-4beat\.mp4/)
      assert.equal((await git(['log', '-1', '--format=%s'], ws.root)).trim(), 'Initial')
    }))

  test('refuses a slug where a path belongs', () =>
    withWorkspace(async (ws) => {
      await cut(ws)
      const run = await reel(['keep', 'brobst'], ws.root)
      assert.equal(run.code, 1)
      assert.match(run.output, /\.mp4/)
    }))

  test('a re-cut kept the same day supersedes the first, in its own commit', () =>
    withWorkspace(async (ws) => {
      // `render` wipes `out/`, so a second cut of the same site lands on the same name.
      // The reel it replaces is not lost: it is in the commit that kept it.
      const scratch = await cut(ws)
      assert.equal((await reel(['keep', scratch], ws.root)).code, 0)
      await writeFile(join(ws.root, scratch), 'second cut')

      const run = await reel(['keep', scratch], ws.root)
      assert.equal(run.code, 0, run.output)
      const kept = `reels/brobst-${today()}.mp4`
      assert.equal(await readFile(join(ws.root, kept), 'utf8'), 'second cut')
      const touched = (await git(['show', '--name-only', '--format=', 'HEAD'], ws.root)).trim()
      assert.deepEqual(touched.split(/\r?\n/), [kept])
      assert.equal((await git(['log', '--format=%s', '--', kept], ws.root)).trim().split(/\r?\n/).length, 2)
    }))

  test('takes no flags, and neither does render', () =>
    withWorkspace(async (ws) => {
      const scratch = await cut(ws)
      for (const args of [['keep', scratch, '--force'], ['render', 'brobst', '--keep']]) {
        const run = await reel(args, ws.root)
        assert.equal(run.code, 2, run.output)
        assert.match(run.output, /usage: reel sections <url>/)
      }
    }))

  test('this repo tracks reels/ and ignores out/', async () => {
    // The one assertion that is about this repo rather than about `keep`: ADR-0002's
    // half of promotion, which is a fact about `.gitignore` and nothing else.
    const ignores = await readFile(join(REPO, '.gitignore'), 'utf8')
    assert.match(ignores, /^out\/$/m)
    assert.doesNotMatch(ignores, /^reels\/?$/m)
    assert.ok(existsSync(join(REPO, 'reels')), 'reels/ is not in the tree')
  })
})
