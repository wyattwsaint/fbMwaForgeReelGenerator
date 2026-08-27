import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { TEXT_SLOT, TYPE } from '../src/house.ts'
import { lineWidth, overflowProblems } from '../src/measure.ts'
import { COPY_BUDGETS } from '../src/plan.ts'

describe('line width', () => {
  test('scales with the size it is drawn at', () => {
    const line = 'Spotless, every time.'
    assert.equal(lineWidth(line, 152), 2 * lineWidth(line, 76))
    assert.equal(lineWidth('', 76), 0)
  })

  test('the same character count is not the same width', () => {
    // The whole reason the count is not the check: 42 of each, one fits and one does
    // not, and the budget cannot tell them apart.
    assert.ok(lineWidth('M'.repeat(42), TYPE.hook.size) > TEXT_SLOT.width)
    assert.ok(lineWidth('i'.repeat(42), TYPE.hook.size) < TEXT_SLOT.width)
  })

  test('a codepoint the face does not carry is measured, not thrown at', () => {
    // Copy is whatever a human typed. An emoji draws `.notdef` on the frame, so
    // measuring `.notdef` is measuring what the viewer gets.
    assert.ok(lineWidth('🙂', TYPE.hook.size) >= 0)
    assert.equal(lineWidth('—', TYPE.hook.size), lineWidth('—', TYPE.hook.size))
  })

  test('agrees with the ~0.5em advance the house style is designed against', () => {
    const perCharacter = lineWidth('Spotless, every time.', TYPE.hook.size) / 21
    assert.ok(perCharacter > 0.4 * TYPE.hook.size, `${perCharacter}px`)
    assert.ok(perCharacter < 0.6 * TYPE.hook.size, `${perCharacter}px`)
  })
})

describe('slot overflow', () => {
  test('copy that fits the slot has no problem', () => {
    assert.deepEqual(overflowProblems('hook.text', 'Spotless, every\ntime.', 'hook'), [])
  })

  test('copy inside the character budget can still run off the slot', () => {
    // 23 characters against a 42-character budget, and still 1007px across a 950px
    // slot: capitals cost nearly twice what the budget assumes.
    const copy = 'CURB APPEAL, GUARANTEED'
    assert.ok(copy.length < COPY_BUDGETS.hook.chars)
    assert.deepEqual(overflowProblems('hook.text', copy, 'hook'), [
      `hook.text draws 1007px wide at 76px; the safe box is ${TEXT_SLOT.width}px`,
    ])
  })

  test('a multi-line hook names the line that overflows', () => {
    const problems = overflowProblems('hook.text', 'Spotless.\nCURB APPEAL, GUARANTEED', 'hook')
    assert.equal(problems.length, 1)
    assert.match(problems[0] as string, /^hook\.text line 2 draws \d+px wide/)
  })

  test('both lines are reported, because both are one rewrite', () => {
    const problems = overflowProblems('hook.text', `${'W'.repeat(30)}\n${'W'.repeat(30)}`, 'hook')
    assert.equal(problems.length, 2)
    assert.match(problems[0] as string, /line 1/)
    assert.match(problems[1] as string, /line 2/)
  })

  test('a label is measured at label size, not hook size', () => {
    const copy = 'W'.repeat(28)
    assert.deepEqual(overflowProblems('beats[0].label', copy, 'label'), [
      `beats[0].label draws ${lineWidth(copy, TYPE.label.size)}px wide at 44px; the safe box is ${TEXT_SLOT.width}px`,
    ])
    assert.ok(lineWidth(copy, TYPE.label.size) < lineWidth(copy, TYPE.hook.size))
  })
})
