import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { MAX_BLUR_SAMPLES, PAN_PX_PER_FRAME, cameraFor, masterSize } from '../src/camera.ts'
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

/** A drift of `durationMs`, over a section tall enough to hold one frame. */
function driftShot(durationMs: number): Shot {
  return {
    kind: 'beat',
    index: 0,
    startMs: 0,
    durationMs,
    move: 'drift',
    punchFactor: 1,
    source: { url: 'https://example.test/', selector: '#gallery' },
  }
}

/** The camera a shot gets over a section of `sectionHeight` page pixels. */
function cameraOver(shot: Shot, sectionHeight: number) {
  return cameraFor(shot, masterSize(shot, sectionHeight))
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

  test('blur samples are the peak per-frame displacement, rounded up', () => {
    // #11's derivation, on a pan with room to run at #12's pace: every frame moves
    // PAN_PX_PER_FRAME, so every frame is averaged from that many sub-frames. The
    // number is read off the move rather than configured — there is no knob to set.
    const running = cameraOver(panShot('lateral', 2), 2800)
    assert.equal(running.samples, PAN_PX_PER_FRAME)

    // A pan the punch leaves less room than that travels slower, and blurs less. Its
    // 216px of room over 119 steps is 1.82px a frame, which rounds up to 2.
    const clamped = cameraOver(panShot('lateral'), 2800)
    assert.equal(clamped.samples, 2)

    // A diagonal is measured in the pixels a viewer sees, not the ones it was cut
    // from: its master is doubled on both axes, so 432 master-px of travel over 119
    // steps is 2.57 output-px a frame. The oversample buys resolution, never blur.
    assert.equal(cameraOver(panShot('diagonal'), 2800).samples, 3)

    // A pan with nowhere to go still renders: one sub-frame, which is no blur at all.
    // `check` refuses these configs, so this is the floor rather than a shot anyone sees.
    assert.equal(cameraOver(panShot('lateral', 1), 2800).samples, 1)
  })

  test("a drift's samples come from its fastest pixel, a frame corner", () => {
    // A zoom's centre does not move at all, so the corner is what the blur is owed
    // to: half the frame's diagonal (1102px) times the zoom (0.1) over the shot's 104
    // steps is 1.06px a frame, which rounds up to 2.
    assert.equal(cameraOver(driftShot(3500), 2800).samples, 2)
  })

  test('the derivation is capped, so no move can ask for an unbounded render', () => {
    // The same arithmetic over a drift of four frames: 110px over 3 steps wants 37
    // sub-frames for every frame. The cap is what stops a pathological duration
    // turning into a render that never finishes, and it is the only thing that does.
    assert.equal(cameraOver(driftShot(133), 2800).samples, MAX_BLUR_SAMPLES)
    assert.equal(MAX_BLUR_SAMPLES, 32)
  })
})
