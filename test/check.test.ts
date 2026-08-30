import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { survey } from '../src/survey.ts'
import type { SiteConfig } from '../src/site.ts'
import { startFixtureSite } from './fixture/server.ts'
import type { FixtureSite } from './fixture/server.ts'
import { reel, withWorkspace } from './helpers.ts'

/**
 * What only a page can prove (ADR-0009).
 *
 * The judgment is pure and is asserted as one in `test/verdict.test.ts`, over a survey
 * a test writes down. What a literal cannot say is that the survey itself measured a
 * real page correctly — a survey that read the wrong height would make every pure test
 * above it pass and every reel wrong. So the fixture site and its server stay, and what
 * runs through them is the measuring rather than the judging.
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

/** The same config as a value, for the tests that survey a page without the CLI. */
function site(url: string, beats: SiteConfig['beats']): SiteConfig {
  return {
    url,
    hook: { text: 'Spotless, every time.' },
    beats,
    cta: { credit: 'fixture.test' },
  }
}

describe('survey', () => {
  test('a section measures at the height the page lays it out at', async () => {
    const taken = await survey(
      site(fixture.url, [
        { selector: '#hero' },
        { selector: '#short' },
        { selector: '#tall' },
        { selector: '#gallery' },
        { selector: '#gone' },
      ]),
    )
    // The numbers every pure test states as a literal, read off the page that lays
    // them out — and off the *settled* page: #gallery has no height of its own until
    // its lazy images load, so 2800px is a measurement a load alone would not get.
    assert.deepEqual(
      taken.beats.map((beat) => beat.height),
      [3000, 400, 4400, 2800, null],
    )
    // A selector that does not resolve is nothing measured, which is exactly what the
    // judgment reads as "no element matches".
    assert.equal(taken.beats[4]?.rect, null)
    // y 120, not 0: the fixture's sticky nav takes its 120px of flow above main.
    assert.deepEqual(taken.beats[0]?.rect, { x: 0, y: 120, width: 1080, height: 3000 })
    // The hook names no selector, so the hero is the one the page's own shape gives
    // up — the first candidate section, which is #hero.
    assert.deepEqual(taken.heroRect, taken.beats[0]?.rect)
    // 120 + 3000 + 2400 + 400 + 2800 + 1200 + 4400: the page's own height, which is
    // what says whether a beat runs off the foot of it.
    assert.deepEqual(
      taken.pages.map((page) => [page.scrollHeight, page.failure]),
      [[14_320, null]],
    )
  })

  test('a heading is read as one line, from inside the beat’s own slice', async () => {
    // Every section on noid.html is addressed through `main`, so all three beats
    // resolve to the same element and the heading each one draws is the one inside its
    // own y/height window — not the page's first, which is what an ancestor would
    // otherwise hand every beat on the page (#7, #62).
    const taken = await survey(
      site(`${fixture.url}/noid.html`, [
        { selector: 'main', y: 0, height: 2000 },
        { selector: 'main', y: 2000, height: 2000 },
        { selector: 'main', y: 2000, height: 2000, label: 'Enrolling now' },
      ]),
    )
    assert.deepEqual(
      taken.beats.map((beat) => beat.heading),
      [
        // Set in two by a `<br>` and carrying a line the page never paints: a heading
        // is one line of the copy a viewer actually sees, so the break is a space and
        // the hidden span is not there at all.
        'First section',
        'Enrolling now for the autumn term',
        // A beat that names a label is drawing that label whatever the page says, so
        // the heading it overrides is never read and never weighed.
        null,
      ],
    )
    // And the height is the window's, not the resolved element's: `main` is 4000px
    // tall, and the hatch is what says which 2000px of it this beat is about.
    assert.deepEqual(
      taken.beats.map((beat) => beat.height),
      [2000, 2000, 2000],
    )
  })
})

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

  test('a punchFactor below 1 is rejected — there is no punching out', () =>
    withWorkspace(async (ws) => {
      await ws.site(
        'punchout',
        minimal(
          fixture.url,
          `[{ selector: '#hero' }, { selector: '#services' }, { selector: '#gallery', punchFactor: 0.7 }]`,
        ),
      )
      const run = await reel(['check', 'punchout'], ws.root)
      assert.equal(run.code, 1, run.output)
      assert.match(run.stdout, /beats\[2\]\.punchFactor is 0\.7; 1 is "no punch"/)
    }))

  test('a beat naming both fit and punchFactor fails — they are opposite ends', () =>
    withWorkspace(async (ws) => {
      await ws.site(
        'both',
        minimal(
          fixture.url,
          `[{ selector: '#hero' }, { selector: '#services', fit: true, punchFactor: 1.4 }, { selector: '#gallery' }]`,
        ),
      )
      const run = await reel(['check', 'both'], ws.root)
      assert.equal(run.code, 1, run.output)
      assert.match(
        run.stdout,
        /beats\[1\] names both fit and punchFactor; fit shows the whole section, punchFactor crops into it/,
      )
    }))

  test('music without a file fails by name', () =>
    withWorkspace(async (ws) => {
      await ws.site(
        'nofile',
        `
import { defineSite } from 'reel'
export default defineSite({
  url: '${fixture.url}',
  hook: { text: 'Spotless, every time.' },
  beats: [{ selector: '#hero' }, { selector: '#services' }, { selector: '#gallery' }],
  cta: { credit: 'fixture.test' },
  music: { offset: 0.42 } as { file: string; offset: number },
})
`,
      )
      const run = await reel(['check', 'nofile'], ws.root)
      assert.equal(run.code, 1, run.output)
      assert.match(run.stdout, /music\.file is required when music is set/)
    }))

  test('an offset that runs backwards out of the track fails by name', () =>
    withWorkspace(async (ws) => {
      // A real file, so the only thing wrong with this config is the offset.
      await writeFile(join(ws.root, 'bed.mp3'), '')
      await ws.site(
        'backwards',
        `
import { defineSite } from 'reel'
export default defineSite({
  url: '${fixture.url}',
  hook: { text: 'Spotless, every time.' },
  beats: [{ selector: '#hero' }, { selector: '#services' }, { selector: '#gallery' }],
  cta: { credit: 'fixture.test' },
  music: { file: 'bed.mp3', offset: -2 },
})
`,
      )
      const run = await reel(['check', 'backwards'], ws.root)
      assert.equal(run.code, 1, run.output)
      assert.match(run.stdout, /music\.offset is -2; an offset slides forward into the track/)
      assert.match(run.stdout, /1 problem\./)
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
