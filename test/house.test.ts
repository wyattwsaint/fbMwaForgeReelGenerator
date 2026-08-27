import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { FRAME_HEIGHT, FRAME_WIDTH } from '../src/frame.ts'
import { ACCENT, GROUND, INK, SAFE_ZONE, SCRIM, TEXT_SLOT } from '../src/house.ts'

/**
 * The frozen table, pinned to the values #9 actually specifies.
 *
 * Every other test derives from these constants rather than restating them, which is
 * what stops a test passing its own copy of a number after the number moved (#36) —
 * and leaves exactly one place where the numbers themselves are checked against the
 * finding that set them. This is that place: a hex here is a quote, not a copy.
 */
describe('the house style is #9’s, frozen', () => {
  test('the palette is the one scraped from mwaforge.com and frozen', () => {
    assert.equal(INK, '#eef1f6')
    assert.equal(GROUND, '#0a0c10')
    assert.equal(ACCENT, '#8b5cf6')
  })

  test('the safe zone is Meta’s boosted box: top 14%, sides 6%, bottom 35%', () => {
    // The boosted figure, not the 20% organic one — a reel that must be re-cut to be
    // promoted is a trap, and the cost is vertical room this layout does not need.
    assert.equal(SAFE_ZONE.left, 65)
    assert.equal(SAFE_ZONE.right, FRAME_WIDTH - 65)
    assert.equal(SAFE_ZONE.top, 270)
    assert.equal(SAFE_ZONE.bottom, FRAME_HEIGHT - 672)
    assert.ok(Math.abs(SAFE_ZONE.left / FRAME_WIDTH - 0.06) < 0.005)
    assert.ok(Math.abs((FRAME_HEIGHT - SAFE_ZONE.bottom) / FRAME_HEIGHT - 0.35) < 0.005)
  })

  test('the text slot is one band inside the safe zone, and the scrim covers it', () => {
    assert.equal(TEXT_SLOT.x, SAFE_ZONE.left)
    assert.equal(TEXT_SLOT.top, SAFE_ZONE.top)
    assert.ok(TEXT_SLOT.bottom < SAFE_ZONE.bottom, 'the slot runs past the safe box')
    // Full width, from the top of the frame down to the slot's foot: text is never
    // drawn over an unwashed pixel.
    assert.equal(SCRIM.width, FRAME_WIDTH)
    assert.equal(SCRIM.height, TEXT_SLOT.bottom)
  })
})
