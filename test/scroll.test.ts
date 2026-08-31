import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { chromium } from 'playwright'
import type { Page } from 'playwright'
import { FRAME_HEIGHT, FRAME_WIDTH } from '../src/frame.ts'
import { HOOK_MS } from '../src/plan.ts'
import {
  AMBIENT_DEGRADATION,
  SCROLL_PACE,
  scriptedScroll,
  scrollDistance,
  scrollEffectsRefire,
} from '../src/scroll.ts'
import { stabilise } from '../src/settle.ts'
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

/** A stabilised page at the fixture's own frame size — the state a recording starts in. */
async function stabilised(path = '/'): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: FRAME_WIDTH, height: FRAME_HEIGHT } })
  await page.goto(`${fixture.url}${path}`, { waitUntil: 'load' })
  await stabilise(page)
  return page
}

const scrollY = (page: Page) => page.evaluate(() => window.scrollY)

describe('the scripted scroll', () => {
  test('pace and distance are house constants, spent over the shot', () => {
    // #64: no config field reaches these. The distance is the pace over the shot's own
    // duration, so a longer shot travels further at the same speed rather than the
    // same distance more slowly — the pace is what a viewer reads.
    assert.equal(scrollDistance(HOOK_MS), (SCROLL_PACE * HOOK_MS) / 1000)
    assert.equal(scrollDistance(2 * HOOK_MS), 2 * scrollDistance(HOOK_MS))
  })

  test('a reveal below the fold is above it by the time the walk ends', async () => {
    // The whole geometric claim the fixture is built around: #reveal is 50px below the
    // 1920px fold at scroll 0, so nothing that never scrolls can see it — and the house
    // distance carries it well up the frame rather than only just onto it.
    const page = await stabilised()
    try {
      const top = await page.evaluate(
        () => (document.querySelector('#reveal') as HTMLElement).getBoundingClientRect().top,
      )
      assert.ok(top > FRAME_HEIGHT, `#reveal is already on screen at scroll 0 (${top}px)`)
      assert.ok(
        top - scrollDistance(HOOK_MS) < FRAME_HEIGHT / 2,
        `the house scroll leaves #reveal in the bottom half of the frame (${top}px)`,
      )
    } finally {
      await page.close()
    }
  })

  test('walks the house distance, and takes the shot to do it', async () => {
    const page = await stabilised()
    try {
      const started = Date.now()
      await scriptedScroll(page, HOOK_MS)
      const took = Date.now() - started
      assert.equal(await scrollY(page), scrollDistance(HOOK_MS))
      // Awaiting it is how the caller knows the page was driven for the whole window
      // it was recording: a walk that returned early would leave the shot's tail still.
      assert.ok(took >= HOOK_MS, `the walk finished ${HOOK_MS - took}ms early`)
    } finally {
      await page.close()
    }
  })

  test('leaves the page mid-walk rather than landing on it', async () => {
    // The move doctrine (#12) applied to the page instead of the camera: a scroll that
    // finished early would spend the rest of the hook static, and a static shot reads
    // as a stall. Sampled at the halfway point, where a linear pace is halfway along.
    const page = await stabilised()
    try {
      const walk = scriptedScroll(page, HOOK_MS)
      await page.waitForTimeout(HOOK_MS / 2)
      const half = await scrollY(page)
      await walk
      const whole = scrollDistance(HOOK_MS)
      assert.ok(
        half > whole * 0.3 && half < whole * 0.7,
        `the walk is not paced: ${half} of ${whole} at the halfway point`,
      )
    } finally {
      await page.close()
    }
  })
})

describe('scrollEffectsRefire', () => {
  test('is true of a reveal that comes back every time it re-enters the viewport', async () => {
    const page = await stabilised()
    try {
      assert.equal(await scrollEffectsRefire(page, HOOK_MS), true)
      // And it hands the page back at the top, which is where a walk begins.
      assert.equal(await scrollY(page), 0)
    } finally {
      await page.close()
    }
  })

  test('is false of a reveal that fired once during stabilise and unobserved itself', async () => {
    // ADR-0006's known limit, as a value: `stabilise` step-scrolls the whole page to
    // trip the observers behind lazy images, so a once-only reveal has already fired
    // before anything is recorded and no later scroll changes a pixel.
    const page = await stabilised('/once.html')
    try {
      assert.equal(
        await page.evaluate(
          () => getComputedStyle(document.querySelector('#reveal') as Element).opacity,
        ),
        '1',
        'the once-only reveal never fired at all — stabilise did not walk the page',
      )
      assert.equal(await scrollEffectsRefire(page, HOOK_MS), false)
    } finally {
      await page.close()
    }
  })

  test('the ambient degradation says which motion was asked for and what is shot', () => {
    // The sentence itself, and not only the constant the source names it by: every
    // other assertion about this note compares it against the same constant it came
    // from, so a rewording would change src and test together in silence. A human
    // reads this line out of a preflight, so the wording is the finding — and it is
    // pinned here, beside the reading that produces it, rather than beside the chain
    // in `plan.ts` that only decides when it is said.
    assert.equal(
      AMBIENT_DEGRADATION,
      "hook.motion 'scroll' — this page's scroll effects do not re-fire, " +
        "so the hook is recorded as 'ambient'",
    )
  })
})
