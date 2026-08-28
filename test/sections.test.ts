import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { startFixtureSite } from './fixture/server.ts'
import type { FixtureSite } from './fixture/server.ts'
import { reel, withWorkspace } from './helpers.ts'

let fixture: FixtureSite

before(async () => {
  fixture = await startFixtureSite()
})
after(async () => {
  await fixture.close()
})

describe('reel sections', () => {
  test('prints one line per candidate section, with the height and the punch it needs', () =>
    withWorkspace(async (ws) => {
      const run = await reel(['sections', fixture.url], ws.root)
      assert.equal(run.code, 0, run.output)
      // #services is 2400px: taller than a frame, so the punch it needs is the one a
      // lateral pan needs, which is the floor for every section.
      assert.match(run.stdout, /#services\s+y 3120\s+2400px\s+punchFactor 1\.2/)
      // #short is 400px, and a section that short needs a lot of punch to fill a frame.
      assert.match(run.stdout, /#short\s+y 5520\s+400px\s+punchFactor 5\.33/)
      assert.match(run.stdout, /5 sections\./)
    }))

  test('says which sections would need a fit, and the width they would fit at', () =>
    withWorkspace(async (ws) => {
      const run = await reel(['sections', fixture.url], ws.root)
      assert.equal(run.code, 0, run.output)
      // #services is 2400px — a frame and a quarter — so a fit loads the page a
      // quarter wider. #gallery is 2800px, so it fits at 1575.
      assert.match(run.stdout, /#services\s+y 3120\s+2400px\s+punchFactor 1\.20\s+fit 1350px/)
      assert.match(run.stdout, /#gallery\s+y 5920\s+2800px\s+punchFactor 1\.20\s+fit 1575px/)
      // #short already sits inside one frame, so there is nothing for a fit to show.
      assert.doesNotMatch(run.stdout, /#short.*fit /)
    }))

  test('marks the hero as the hook, and gives it no punch factor', () =>
    withWorkspace(async (ws) => {
      const run = await reel(['sections', fixture.url], ws.root)
      assert.equal(run.code, 0, run.output)
      // y 120, not 0: the fixture's sticky nav takes its 120px of flow above main.
      const hero = run.stdout.split(/\r?\n/).find((line) => line.includes('#hero'))
      assert.ok(hero, run.output)
      assert.match(hero, /^\s+hook\s+#hero\s+y 120\s+3000px\s+"Fixture hero"$/)
    }))

  test('shows each section’s heading, and leaves the column empty where there is none', () =>
    withWorkspace(async (ws) => {
      const run = await reel(['sections', fixture.url], ws.root)
      assert.equal(run.code, 0, run.output)
      // The label a beat written against #services would inherit, visible before the
      // config that inherits it is written (#62).
      assert.match(
        run.stdout,
        /#services\s+y 3120\s+2400px\s+punchFactor 1\.20\s+fit 1350px\s+"Services"/,
      )
      // #gallery is four images and no heading at all — an unlabelled beat, not a gap
      // in the report.
      const gallery = run.stdout.split(/\r?\n/).find((line) => line.includes('#gallery'))
      assert.ok(gallery, run.output)
      assert.doesNotMatch(gallery, /"/)
    }))

  test('starts the heading column where the hook’s row starts it, punch factor or not', () =>
    withWorkspace(async (ws) => {
      const run = await reel(['sections', fixture.url], ws.root)
      assert.equal(run.code, 0, run.output)
      const lines = run.stdout.split(/\r?\n/)
      const quoteAt = (id: string) => lines.find((line) => line.includes(id))?.indexOf('"')
      assert.equal(quoteAt('#hero'), quoteAt('#services'), run.output)
    }))

  test('measures the settled page, not the loaded one', () =>
    withWorkspace(async (ws) => {
      const run = await reel(['sections', fixture.url], ws.root)
      assert.equal(run.code, 0, run.output)
      // #gallery has no height of its own until its lazy images load, and #pulse is
      // sized by an infinite animation that has to be parked to have one height.
      assert.match(run.stdout, /#gallery\s+y 5920\s+2800px/)
      assert.match(run.stdout, /#pulse\s+y \d+\s+1200px/)
    }))

  test('addresses a section with no id through main, by y and height', () =>
    withWorkspace(async (ws) => {
      const run = await reel(['sections', `${fixture.url}/noid.html`], ws.root)
      assert.equal(run.code, 0, run.output)
      assert.match(run.stdout, /main\s+y 2000\s+2000px\s+punchFactor 1\.2/)
      assert.match(run.stdout, /no id of its own/)
      // A heading the page sets in two with a `<br>` is one line of copy, and it is
      // the section's own — not the first heading in the `main` its row is named for.
      assert.match(run.stdout, /hook\s+main\s+y 0\s+2000px\s+"First section"/)
    }))

  test('marks the candidate the hero sits inside, when the hero is wrapped', () =>
    withWorkspace(async (ws) => {
      const run = await reel(['sections', `${fixture.url}/wrapped.html`], ws.root)
      assert.equal(run.code, 0, run.output)
      // #banner is not the hero — the hero is the section inside it — but it is the
      // row a human would paste, so it is the row that has to say hook.
      assert.match(run.stdout, /hook\s+#banner/)
      assert.doesNotMatch(run.stdout, /#banner\s+y \d+\s+\d+px\s+punchFactor/)
    }))

  test('names `body` on a page with no main, since `main` would not resolve', () =>
    withWorkspace(async (ws) => {
      const run = await reel(['sections', `${fixture.url}/nomain.html`], ws.root)
      assert.equal(run.code, 0, run.output)
      assert.match(run.stdout, /body\s+y 2000\s+2000px\s+punchFactor 1\.20/)
      assert.doesNotMatch(run.stdout, / main /)
    }))

  test('takes a URL, and says so when it is handed a slug', () =>
    withWorkspace(async (ws) => {
      const run = await reel(['sections', 'brobst'], ws.root)
      assert.equal(run.code, 2, run.output)
      assert.match(run.stderr, /sections brobst — takes a URL, not a site/)
    }))

  test('reports a page that will not load, and exits non-zero', () =>
    withWorkspace(async (ws) => {
      const run = await reel(['sections', 'http://127.0.0.1:1/'], ws.root)
      assert.equal(run.code, 1, run.output)
      assert.match(run.stderr, /sections http:\/\/127\.0\.0\.1:1\/ — /)
    }))
})
