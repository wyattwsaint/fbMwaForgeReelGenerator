import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { chromium } from 'playwright'
import type { Page } from 'playwright'
import { FRAME_HEIGHT, FRAME_WIDTH } from '../src/frame.ts'
import {
  MOTION_BANDS,
  MOTION_FLOOR,
  MOTION_SAMPLES,
  MOTION_WINDOW_MS,
  frameAt,
  framedMotion,
  movesEnough,
} from '../src/motion.ts'
import { hookRect } from '../src/page.ts'
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

/**
 * A page stabilised and framed on its hero at the reel's own frame size — exactly the
 * state, and exactly the crop, a live shot is recorded from.
 */
async function framedOnHero(path = '/'): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: FRAME_WIDTH, height: FRAME_HEIGHT } })
  await page.goto(`${fixture.url}${path}`, { waitUntil: 'load' })
  await stabilise(page)
  const rect = await hookRect(page)
  assert.ok(rect, 'the fixture hero did not resolve')
  await frameAt(page, rect.y)
  return page
}

describe('the motion probe’s house constants', () => {
  test('are ADR-0008’s numbers, and no config reaches them', () => {
    // The floor sits in the open ground the calibration found: pharos's cropped video
    // read 1.46 dead and mwaforge's drifting blocks 35.03 live, with nothing between.
    assert.equal(MOTION_FLOOR, 5.0)
    // Three samples over 2s, because one pair can land on an unlucky loop phase —
    // pharos read 1.46 at 2s apart and 0.70 at 6s.
    assert.equal(MOTION_SAMPLES, 3)
    assert.equal(MOTION_WINDOW_MS, 2000)
    assert.equal(MOTION_BANDS, 8)
  })
})

describe('framedMotion', () => {
  test('reads a hero that moves inside the frame well above the floor', async () => {
    // index.html's hero carries a playing video and an infinite animation, both inside
    // the first 1920px of it — which is the whole of what a live shot would record.
    const page = await framedOnHero()
    try {
      const reading = await framedMotion(page)
      assert.ok(reading > MOTION_FLOOR, `a live hero read ${reading.toFixed(2)}`)
      assert.equal(movesEnough(reading), true)
    } finally {
      await page.close()
    }
  })

  test('reads a still hero as exactly nothing — the probe has no noise floor', async () => {
    // ADR-0008's calibration claim, and the reason "did anything change at all" is not
    // the test: two headless screenshots of a static page are bit-identical, so a dead
    // reading is the *page's* and never the probe's. `once.html` is deliberately still.
    const page = await framedOnHero('/once.html')
    try {
      const reading = await framedMotion(page)
      assert.equal(reading, 0)
      assert.equal(movesEnough(reading), false)
    } finally {
      await page.close()
    }
  })

  test('a hero that moves on the page and not in the frame reads dead', async () => {
    // #88 itself: the crop decides. `#deep` animates forever 280px below the bottom of
    // the frame the hero would be shot in.
    const page = await framedOnHero('/cropped.html')
    try {
      assert.equal(movesEnough(await framedMotion(page)), false)

      // And the motion is real — the same page, framed on the part of the hero that
      // has it, reads live. Nothing is wrong with the page, the browser or the probe;
      // the shot was simply pointed somewhere still.
      await frameAt(page, 2200)
      const reading = await framedMotion(page)
      assert.ok(reading > MOTION_FLOOR, `the page's own motion read ${reading.toFixed(2)}`)
    } finally {
      await page.close()
    }
  })
})
