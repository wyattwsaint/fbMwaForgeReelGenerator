import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { chromium } from 'playwright'
import type { Page } from 'playwright'
import { configProblems } from '../src/config.ts'
import { FRAME_HEIGHT, FRAME_WIDTH } from '../src/frame.ts'
import { positionHero } from '../src/hero.ts'
import { frameAt, framedMotion, movesEnough } from '../src/motion.ts'
import { hookRect } from '../src/page.ts'
import { stabilise } from '../src/settle.ts'
import { configuredHeroPosition, defineSite } from '../src/site.ts'
import type { SiteConfig } from '../src/site.ts'
import { startFixtureSite } from './fixture/server.ts'
import type { FixtureSite } from './fixture/server.ts'

let fixture: FixtureSite
let browser: Awaited<ReturnType<typeof chromium.launch>>

before(async () => {
  fixture = await startFixtureSite()
  browser = await chromium.launch()
})
after(async () => {
  await browser.close()
  await fixture.close()
})

function site(over: Partial<SiteConfig['hook']> = {}): SiteConfig {
  return defineSite({
    url: `${fixture.url}/covered.html`,
    hook: { text: 'Spotless, every time.', ...over },
    beats: [{ selector: '#services' }, { selector: '#gallery' }, { selector: '#hero' }],
    cta: { credit: 'fixture.test' },
  })
}

/**
 * A page stabilised, repositioned and framed on its hero at the reel's own frame size —
 * exactly the state, and exactly the crop, a live shot is recorded from.
 *
 * The order is the one `survey.ts` and `capture.ts` both use, and it is the thing under
 * test as much as any assertion below: a reposition that landed after the framing would
 * be measuring one crop and shooting another.
 */
async function framedOnHero(config: SiteConfig): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: FRAME_WIDTH, height: FRAME_HEIGHT } })
  await page.goto(config.url, { waitUntil: 'load' })
  await stabilise(page)
  await positionHero(page, config)
  const rect = await hookRect(page)
  assert.ok(rect, 'the fixture hero did not resolve')
  await frameAt(page, rect.y)
  return page
}

/** What the browser ended up with, which is the only reading that settles this. */
function objectPosition(page: Page, selector: string): Promise<string> {
  return page.evaluate(
    (at) => getComputedStyle(document.querySelector(at) as Element).objectPosition,
    selector,
  )
}

describe('positionHero', () => {
  test('a repositioned crop is what decides whether the hero moves', async () => {
    // ADR-0011's whole claim, end to end and on one page: `sided.mp4` is flat on its
    // left half and flickering on its right, and covering a 1080x1920 frame keeps 31.6%
    // of its width. Nothing here differs between the two readings except which 31.6%
    // the frame took — not the page, not the browser, not the probe.
    const left = await framedOnHero(site({ heroPosition: 0 }))
    const dead = await framedMotion(left)
    await left.close()

    const right = await framedOnHero(site({ heroPosition: 1 }))
    const live = await framedMotion(right)
    await right.close()

    assert.equal(movesEnough(dead), false, `the left crop read ${dead}, which is not dead`)
    assert.equal(movesEnough(live), true, `the right crop read ${live}, which is not live`)
  })

  test('a config that asks for nothing leaves the site with its own crop', async () => {
    // The default is a decision: every reel before ADR-0011 is a reel that never
    // touched the page it filmed, and a config saying nothing plans exactly that one.
    const page = await framedOnHero(site())
    assert.equal(await objectPosition(page, '#covered'), '0% 50%')
    await page.close()
  })

  test('only the horizontal half moves, and only inside the hook', async () => {
    const page = await framedOnHero(site({ heroPosition: 0.85 }))
    // The column asked for, as a percentage of the source the browser resolved for
    // itself — 0.85 is a fraction of the hero and `85%` is what CSS calls it.
    assert.equal(await objectPosition(page, '#covered'), '85% 50%')
    // `fill` stretches rather than crops, so there is no column to choose and nothing
    // this could be improving.
    assert.equal(await objectPosition(page, '#filled'), '50% 50%')
    // Cover, but overflowing downwards rather than sideways: there is no column in it
    // to choose, so the site's own framing is left exactly where the site put it.
    assert.equal(await objectPosition(page, '#tall'), '50% 12%')
    // And outside the hero it is not the hook's business at all — a beat is a section
    // of a page laid out at the viewport's own width, with no cover crop in play.
    assert.equal(await objectPosition(page, '#below'), '30% 50%')
    await page.close()
  })

  test('a hero with no cover crop in it is left alone rather than failed', async () => {
    // index.html's hero video is `object-fit: fill`. A config that asks such a page for
    // a column is asking for something the page cannot give, and the answer is the
    // frame it always had: there is no crop here for this to undo, so nothing is being
    // silently missed and the probe still reports what the hook reads.
    const config = defineSite({ ...site({ heroPosition: 1 }), url: `${fixture.url}/` })
    const page = await framedOnHero(config)
    assert.equal(await objectPosition(page, '#hero video'), '50% 50%')
    await page.close()
  })
})

describe('hook.heroPosition, as config', () => {
  test('is a fraction of the hero, and both edges are in range', () => {
    for (const heroPosition of [0, 0.22, 0.85, 1]) {
      assert.deepEqual(configProblems(site({ heroPosition }), process.cwd()), [])
    }
  })

  test('out of range is a problem and never a clamp', () => {
    // A crop quietly snapped back to the right edge is a framing decision nobody made,
    // and framing is the one thing this field exists to put in the config's hands.
    for (const heroPosition of [-0.1, 1.4, Number.NaN]) {
      const problems = configProblems(site({ heroPosition }), process.cwd())
      assert.equal(problems.length, 1, `${heroPosition} was accepted`)
      assert.match(problems[0] as string, /hook\.heroPosition/)
    }
  })

  test('the default is undefined, and that is the site keeping its own crop', () => {
    assert.equal(configuredHeroPosition(site()), undefined)
    assert.equal(configuredHeroPosition(site({ heroPosition: 0 })), 0)
  })
})
