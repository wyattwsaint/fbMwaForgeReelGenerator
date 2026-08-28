import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { FRAME_HEIGHT, FRAME_WIDTH } from '../src/frame.ts'
import { ACCENT, GROUND, INK, SAFE_ZONE, SCRIM, TEXT_SLOT, TYPE } from '../src/house.ts'

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

  test('the text slot is the safe zone’s lower band, where a Reels viewer looks', () => {
    assert.equal(TEXT_SLOT.x, SAFE_ZONE.left)
    // Lower band, not upper: below the midline of the safe box, and its foot a breath
    // clear of the boosted bottom boundary rather than merely inside it — copy that
    // touches the boundary reads as something Meta's own UI drew (#60).
    assert.ok(TEXT_SLOT.top > (SAFE_ZONE.top + SAFE_ZONE.bottom) / 2, 'the slot is still up top')
    assert.ok(TEXT_SLOT.bottom < SAFE_ZONE.bottom, 'the slot crosses into the bottom 35%')
    assert.ok(
      SAFE_ZONE.bottom - TEXT_SLOT.bottom >= 32,
      'the slot sits right on the boosted boundary',
    )
    // And it holds a two-line hook at the hook's own size — type never shrinks to fit.
    assert.ok(
      TEXT_SLOT.top + TYPE.hook.lineHeight + TYPE.hook.size <= TEXT_SLOT.bottom,
      'a two-line hook runs out of the slot',
    )
  })

  test('the scrim is dense at the frame’s foot and released above the text', () => {
    // Full width, and anchored to the *foot* of the frame rather than its top: the
    // text sits at the bottom now, so the wash is densest there and lets go upward.
    assert.equal(SCRIM.width, FRAME_WIDTH)
    assert.equal(SCRIM.top + SCRIM.height, FRAME_HEIGHT)
    // Text is never drawn over an unwashed pixel: the wash is at full density by the
    // slot's head, so both lines of a two-line hook sit on peak, and it runs past the
    // slot's foot rather than letting go under the copy.
    assert.ok(SCRIM.top + SCRIM.release <= TEXT_SLOT.top, 'the wash is still coming up under the copy')
    assert.ok(SCRIM.top + SCRIM.height >= TEXT_SLOT.bottom, 'the wash lets go above the slot’s foot')
  })

  test('the tagline is its own role, under the headline and over the credit', () => {
    // #61: the card's signature line is neither the thing being asked for nor
    // attribution, so it is neither the headline's size nor the credit's. `mwaforge.com`
    // stays the largest type on the reel — it is the one line asking a viewer to act.
    assert.ok(TYPE.tagline.size < TYPE.headline.size, 'the tagline crowds the headline')
    assert.ok(TYPE.tagline.size > TYPE.credit.size, 'the tagline is set as quietly as attribution')
    assert.ok(TYPE.tagline.lineHeight > TYPE.tagline.size)
  })
})
