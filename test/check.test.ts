import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
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

  test('rejects a beat count outside 3..5 by name', async () => {
    for (const beats of [
      `[{ selector: '#hero' }, { selector: '#services' }]`,
      `[{ selector: '#hero' }, { selector: '#services' }, { selector: '#gallery' },
        { selector: '#pulse' }, { selector: '#hero' }, { selector: '#services' }]`,
    ]) {
      await withWorkspace(async (ws) => {
        await ws.site('count', minimal(fixture.url, beats))
        const run = await reel(['check', 'count'], ws.root)
        assert.equal(run.code, 1, run.output)
        assert.match(run.stdout, /beats: a reel is 3-5 beats, this config has [26]/)
      })
    }
  })

  test('y/height is the escape hatch when no element wraps the subject', () =>
    withWorkspace(async (ws) => {
      // #short is 400px, so on its own it is too short for a frame. y/height carve
      // a taller window out of the page around it instead.
      await ws.site(
        'hatch',
        minimal(
          fixture.url,
          `[{ selector: '#hero' }, { selector: '#services' }, { selector: '#short', y: 2400, height: 2000 }]`,
        ),
      )
      const run = await reel(['check', 'hatch'], ws.root)
      assert.equal(run.code, 0, run.output)
    }))

  test('a y/height window that runs off the end of the page fails', () =>
    withWorkspace(async (ws) => {
      await ws.site(
        'overrun',
        minimal(
          fixture.url,
          `[{ selector: '#hero' }, { selector: '#services' }, { selector: '#short', y: 99000, height: 2000 }]`,
        ),
      )
      const run = await reel(['check', 'overrun'], ws.root)
      assert.equal(run.code, 1, run.output)
      assert.match(run.stdout, /beats\[2\] '#short' runs to 101000px; the page is \d+px tall/)
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

  test('a hook line over budget fails, naming the field and the budget', () =>
    withWorkspace(async (ws) => {
      await ws.site(
        'wordy',
        `
import { defineSite } from 'reel'
export default defineSite({
  url: '${fixture.url}',
  hook: { text: 'Spotless, every single time, without exception, ever.' },
  beats: [{ selector: '#hero' }, { selector: '#services' }, { selector: '#gallery' }],
  cta: { credit: 'fixture.test' },
})
`,
      )
      const run = await reel(['check', 'wordy'], ws.root)
      assert.equal(run.code, 1, run.output)
      assert.match(run.stdout, /hook\.text is 53 characters; the budget is 42/)
    }))

  test('a hook inside the character budget still fails when it draws too wide', () =>
    withWorkspace(async (ws) => {
      // 23 characters against a 42-character budget — the count says yes and the
      // slot says no, which is the whole reason the width is measured at all.
      await ws.site(
        'shouty',
        `
import { defineSite } from 'reel'
export default defineSite({
  url: '${fixture.url}',
  hook: { text: 'CURB APPEAL, GUARANTEED' },
  beats: [{ selector: '#hero' }, { selector: '#services' }, { selector: '#gallery' }],
  cta: { credit: 'fixture.test' },
})
`,
      )
      const run = await reel(['check', 'shouty'], ws.root)
      assert.equal(run.code, 1, run.output)
      assert.match(run.stdout, /hook\.text draws 1007px wide at 76px; the safe box is 950px/)
      assert.doesNotMatch(run.stdout, /characters/)
    }))

  test('a beat label over budget fails, naming the beat', () =>
    withWorkspace(async (ws) => {
      await ws.site(
        'labelled',
        minimal(
          fixture.url,
          `[
            { selector: '#hero' },
            { selector: '#services', label: 'Enrolling for Fall, apply now' },
            { selector: '#gallery' },
          ]`,
        ),
      )
      const run = await reel(['check', 'labelled'], ws.root)
      assert.equal(run.code, 1, run.output)
      assert.match(run.stdout, /beats\[1\]\.label is 29 characters; the budget is 28/)
    }))

  test('a punchFactor that leaves a lateral pan no travel fails', () =>
    withWorkspace(async (ws) => {
      // Beat 2 pans laterally, and a section is exactly as wide as the frame, so all
      // of a lateral pan's travel comes from the punch.
      await ws.site(
        'flat',
        minimal(
          fixture.url,
          `[{ selector: '#hero' }, { selector: '#services' }, { selector: '#gallery', punchFactor: 1.05 }]`,
        ),
      )
      const run = await reel(['check', 'flat'], ws.root)
      assert.equal(run.code, 1, run.output)
      assert.match(
        run.stdout,
        /beats\[2\] '#gallery' — a lateral pan needs 210px of travel, a punchFactor of 1\.05 leaves 54px \(needs 1\.2\)/,
      )
    }))

  test('a vertical pan with nothing left over past the frame fails', () =>
    withWorkspace(async (ws) => {
      // Beat 0 pans vertically at no punch, so its travel is whatever the section has
      // past one frame — 80px here, which is a stall, not a move.
      await ws.site(
        'notall',
        minimal(
          fixture.url,
          `[{ selector: '#hero', y: 0, height: 2000 }, { selector: '#services' }, { selector: '#gallery' }]`,
        ),
      )
      const run = await reel(['check', 'notall'], ws.root)
      assert.equal(run.code, 1, run.output)
      assert.match(
        run.stdout,
        /beats\[0\] '#hero' — a vertical pan needs 210px of travel, a punchFactor of 1 leaves 80px \(needs 1\.07\)/,
      )
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

  test('a fit beat too short for a frame is still refused — fit only pulls out', () =>
    withWorkspace(async (ws) => {
      // #short is 400px, and fit widens the viewport to shrink a section against the
      // frame. There is nothing there for it to do: a section already inside one frame
      // needs a punch, and narrowing to reach it would shoot the phone layout.
      await ws.site(
        'fitshort',
        minimal(
          fixture.url,
          `[{ selector: '#hero' }, { selector: '#services' }, { selector: '#short', fit: true }]`,
        ),
      )
      const run = await reel(['check', 'fitshort'], ws.root)
      assert.equal(run.code, 1, run.output)
      assert.match(run.stdout, /beats\[2\] '#short' is 400px tall; a punchFactor of 1 needs 1920px/)
    }))

  test('a fit beat taller than a frame passes, and is left unpunched', () =>
    withWorkspace(async (ws) => {
      await ws.site(
        'fitted',
        minimal(
          fixture.url,
          `[{ selector: '#hero' }, { selector: '#services', fit: true }, { selector: '#gallery' }]`,
        ),
      )
      const run = await reel(['check', 'fitted'], ws.root)
      assert.equal(run.code, 0, run.output)
    }))

  test('a fit beat asked to pan is refused — a fit section has nothing to travel', () =>
    withWorkspace(async (ws) => {
      await ws.site(
        'fitpan',
        minimal(
          fixture.url,
          `[{ selector: '#hero' }, { selector: '#services', fit: true, move: 'pan', direction: 'vertical' }, { selector: '#gallery' }]`,
        ),
      )
      const run = await reel(['check', 'fitpan'], ws.root)
      assert.equal(run.code, 1, run.output)
      // #services is 2400px, so unfit it would have 480px of vertical travel — fit is
      // what spends it, and the finding names fit rather than a punch to raise.
      assert.match(
        run.stdout,
        /beats\[1\] '#services' — a vertical pan needs 210px of travel, a fit section is exactly one frame and leaves 0px \(drift it instead\)/,
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
