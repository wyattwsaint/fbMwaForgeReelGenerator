import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { startFixtureSite } from './fixture/server.ts'
import type { FixtureSite } from './fixture/server.ts'
import { reel, withWorkspace } from './helpers.ts'

/**
 * `reel check` end to end, over a real page (ADR-0009).
 *
 * What only the CLI can prove: that a survey and a verdict are actually wired to each
 * other and to an exit code, and that the pages a config names are loaded once each.
 * The judgment itself is pure and is asserted as one in `test/verdict.test.ts`, and the
 * measuring is asserted against the fixture in `test/survey.test.ts` — a case that
 * needs neither a browser nor a process does not belong here.
 */

let fixture: FixtureSite

before(async () => {
  fixture = await startFixtureSite()
})
after(async () => {
  await fixture.close()
})

/** The minimum #7 allows: a URL, hook text, selectors and a credit line. */
function minimal(url: string, beats: string): string {
  return `
import { defineSite } from 'reel'
export default defineSite({
  url: '${url}',
  hook: { text: 'Spotless, every time.' },
  beats: ${beats},
  cta: { credit: 'fixture.test' },
})
`
}

describe('reel check', () => {
  test('a config naming only URL, hook text, selectors and credit passes', () =>
    withWorkspace(async (ws) => {
      await ws.site(
        'fixture',
        minimal(
          fixture.url,
          `[{ selector: '#hero' }, { selector: '#services' }, { selector: '#gallery' }]`,
        ),
      )
      const run = await reel(['check', 'fixture'], ws.root)
      assert.equal(run.code, 0, run.output)
      assert.match(run.stdout, /check ok {2}fixture/)
    }))

  test('reports every failure in one run, then exits non-zero', () =>
    withWorkspace(async (ws) => {
      await ws.site(
        'drifted',
        `
import { defineSite } from 'reel'
export default defineSite({
  url: '${fixture.url}',
  hook: { text: 'Spotless, every time.' },
  beats: [
    { selector: '#hero' },
    { selector: '#gone' },
    { selector: '#short' },
  ],
  cta: { credit: 'fixture.test' },
  music: { file: 'audio/not-a-track.mp3' },
})
`,
      )
      const run = await reel(['check', 'drifted'], ws.root)
      assert.equal(run.code, 1, run.output)
      assert.match(run.stdout, /beats\[1\] selector '#gone' — no element matches/)
      // Beat 2 is a lateral pan, so the plan punches it to 1.2 — and 400px is short
      // of a frame even punched.
      assert.match(run.stdout, /beats\[2\] '#short' is 400px tall; a punchFactor of 1\.2 needs 1600px/)
      assert.match(run.stdout, /music\.file 'audio\/not-a-track\.mp3' — not found/)
      assert.match(run.stdout, /3 problems\./)
    }))

  test('a punch captures a narrower column, so a punched beat may be under 1920px', () =>
    withWorkspace(async (ws) => {
      // A punchFactor of 5 captures a 216px-wide column; a 9:16 frame out of that
      // column is 384px tall, which #short (400px) clears.
      await ws.site(
        'punched',
        minimal(
          fixture.url,
          `[{ selector: '#hero' }, { selector: '#services' }, { selector: '#short', punchFactor: 5 }]`,
        ),
      )
      const run = await reel(['check', 'punched'], ws.root)
      assert.equal(run.code, 0, run.output)
    }))

  test('a beat with its own url gets its own load; beats sharing a url share one', () =>
    withWorkspace(async (ws) => {
      const before = fixture.documentLoads()
      await ws.site(
        'routes',
        minimal(
          fixture.url,
          `[
            { selector: '#hero' },
            { selector: '#services' },
            { selector: '#contact', url: '${fixture.url}/other.html' },
          ]`,
        ),
      )
      const run = await reel(['check', 'routes'], ws.root)
      assert.equal(run.code, 0, run.output)

      const loads = fixture.documentLoads()
      const delta = (path: string) => (loads[path] ?? 0) - (before[path] ?? 0)
      assert.equal(delta('/'), 1, 'two beats on the site url share one load')
      assert.equal(delta('/other.html'), 1, 'the beat on another route gets its own load')
    }))

  test('a route that will not load names the beats it took down with it', () =>
    withWorkspace(async (ws) => {
      await ws.site(
        'deadroute',
        minimal(
          fixture.url,
          `[
            { selector: '#hero' },
            { selector: '#services' },
            { selector: '#contact', url: 'http://127.0.0.1:9/gone.html' },
          ]`,
        ),
      )
      const run = await reel(['check', 'deadroute'], ws.root)
      assert.equal(run.code, 1, run.output)
      assert.match(run.stdout, /gone\.html — .*\(unchecked: beats\[2\]\)/)
    }))

  test('names the config file when there is none', () =>
    withWorkspace(async (ws) => {
      const run = await reel(['check', 'nosuch'], ws.root)
      assert.equal(run.code, 1)
      assert.match(run.output, /no site config at .*nosuch.ts/)
    }))

  test('a command it does not have prints usage and exits 2', () =>
    withWorkspace(async (ws) => {
      const run = await reel(['publish', 'fixture'], ws.root)
      assert.equal(run.code, 2)
      assert.match(run.output, /usage: reel sections <url>/)
    }))
})
