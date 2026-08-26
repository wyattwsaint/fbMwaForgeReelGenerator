import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import { after, before, describe, test } from 'node:test'
import { chromium } from 'playwright'
import { settle } from '../src/settle.ts'
import { FRAME_HEIGHT, FRAME_WIDTH } from '../src/frame.ts'
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

function site(url: string, beats: string): string {
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

describe('settle, through the CLI', () => {
  test('lazy images below the fold are loaded, so a gallery beat measures its full height', () =>
    withWorkspace(async (ws) => {
      // #gallery has no height of its own: it is 4 x 700px of image, or it is 0px.
      // Nothing but a settled page gets it past the frame.
      await ws.site(
        'lazy',
        site(
          fixture.url,
          `[{ selector: '#hero' }, { selector: '#services' }, { selector: '#gallery' }]`,
        ),
      )
      const run = await reel(['check', 'lazy'], ws.root)
      assert.equal(run.code, 0, run.output)
    }))

  test('an infinite animation is parked at 0, so a section measures the same every run', async () => {
    // #pulse animates 1200px -> 2600px forever. Parked at currentTime 0 it is 1200px,
    // which is short of the frame — so the report names the same number every run.
    return withWorkspace(async (ws) => {
      await ws.site(
        'pulse',
        site(fixture.url, `[{ selector: '#hero' }, { selector: '#services' }, { selector: '#pulse' }]`),
      )
      const first = await reel(['check', 'pulse'], ws.root)
      const second = await reel(['check', 'pulse'], ws.root)
      assert.equal(first.code, 1, first.output)
      assert.match(first.stdout, /beats\[2\] '#pulse' is 1200px tall/)
      assert.equal(stripTimings(second.stdout), stripTimings(first.stdout))
    })
  })

  test('completes in seconds against a video hero, and captures nothing', () =>
    withWorkspace(async (ws) => {
      await ws.site(
        'hero',
        `
import { defineSite } from 'reel'
export default defineSite({
  url: '${fixture.url}',
  hook: { selector: '#hero', text: 'Spotless, every time.', videoTime: 2.0 },
  beats: [{ selector: '#hero' }, { selector: '#services' }, { selector: '#gallery' }],
  cta: { credit: 'fixture.test' },
})
`,
      )
      const started = Date.now()
      const run = await reel(['check', 'hero'], ws.root)
      assert.equal(run.code, 0, run.output)
      assert.ok(Date.now() - started < 30_000, `check took ${Date.now() - started}ms`)
      assert.deepEqual(await readdir(ws.root), ['sites'], 'check writes no masters and no frames')
    }))

  test('a hook selector that no longer matches fails by name', () =>
    withWorkspace(async (ws) => {
      await ws.site(
        'hook',
        `
import { defineSite } from 'reel'
export default defineSite({
  url: '${fixture.url}',
  hook: { selector: '#banner', text: 'Spotless, every time.' },
  beats: [{ selector: '#hero' }, { selector: '#services' }, { selector: '#gallery' }],
  cta: { credit: 'fixture.test' },
})
`,
      )
      const run = await reel(['check', 'hook'], ws.root)
      assert.equal(run.code, 1, run.output)
      assert.match(run.stdout, /hook\.selector '#banner' — no element matches/)
    }))
})

/**
 * The one thing settle does that `check` cannot show: `check` takes no master, so a
 * pinned video leaves no trace in a report. This calls settle directly until the
 * capture ticket gives it a CLI-visible consequence.
 */
describe('settle, directly', () => {
  test('pins a hero the page keeps re-playing to hook.videoTime', async () => {
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage({ viewport: { width: FRAME_WIDTH, height: FRAME_HEIGHT } })
      await page.goto(fixture.url, { waitUntil: 'load' })
      await settle(page, 2.0)

      const pinned = () =>
        page.evaluate(() => {
          const video = document.querySelector('video')
          return { time: video?.currentTime, paused: video?.paused }
        })
      assert.deepEqual(await pinned(), { time: 2, paused: true })

      // The fixture re-plays its own hero every 200ms. Pausing without stubbing
      // `play()` first loses this race, and the master lands on an arbitrary frame.
      await page.waitForTimeout(1500)
      assert.deepEqual(await pinned(), { time: 2, paused: true })
    } finally {
      await browser.close()
    }
  })
})

const stripTimings = (output: string) => output.replace(/\d+\.\d+s/g, '<t>')
