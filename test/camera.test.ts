import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { cameraFor, masterSize } from '../src/camera.ts'
import type { Shot } from '../src/plan.ts'

/** A pan of one beat, punched enough that a lateral axis has somewhere to go. */
function panShot(direction: Shot['direction'], punchFactor = 1.2): Shot {
  return {
    kind: 'beat',
    index: 0,
    startMs: 3000,
    durationMs: 4000,
    move: 'pan',
    direction,
    punchFactor,
    source: { url: 'https://example.test/', selector: '#gallery' },
  }
}

/** Travel in output pixels, which is the space a viewer sees the move in. */
function travel(shot: Shot, sectionHeight: number) {
  const master = masterSize(shot, sectionHeight)
  const camera = cameraFor(shot, master)
  return {
    x: Math.abs(camera.to.x - camera.from.x) / master.over,
    y: Math.abs(camera.to.y - camera.from.y) / master.over,
  }
}

describe('camera', () => {
  test('a diagonal travels equally on both axes', () => {
    // A tall section leaves far more vertical room than the punch leaves lateral.
    // Clamping each axis to its own room would spend all of the vertical and a
    // sliver of the lateral, which is a vertical pan wearing a diagonal's name.
    const moved = travel(panShot('diagonal'), 2800)
    assert.equal(moved.x, moved.y)
    assert.ok(moved.x > 0, 'a diagonal has to move laterally at all')
  })

  test("a diagonal's oversample buys pixels, not travel", () => {
    // The master is doubled on both axes, so the same move is sampled from twice
    // the pixels. Travel room comes from the punch, and the punch has not changed.
    const shot = panShot('diagonal')
    const master = masterSize(shot, 2800)
    assert.equal(master.over, 2)
    assert.deepEqual([master.width, master.height], [2592, 6720])
    assert.equal(travel(shot, 2800).x, travel(panShot('lateral'), 2800).x)
  })

  test('a single-axis pan still travels as far as its room allows', () => {
    const lateral = travel(panShot('lateral'), 2800)
    assert.equal(lateral.y, 0)
    // Punch 1.2 leaves 1080 * 0.2 of lateral room, and #12's pace wants more.
    assert.equal(lateral.x, 216)

    const vertical = travel(panShot('vertical'), 2800)
    assert.equal(vertical.x, 0)
    assert.ok(vertical.y > lateral.x, 'a tall section gives a vertical pan more room')
  })
})
