import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  DRIFT_ZOOM,
  MAX_BLUR_SAMPLES,
  PAN_PX_PER_FRAME,
  SUBTLE_ZOOM,
  cameraFor,
  masterSize,
} from '../src/camera.ts'
import { moveFilter } from '../src/compose.ts'
import { BEAT_MS, DIRECTIONS, HOOK_MS, MIN_PAN_PX_PER_FRAME, panTravelNeeded } from '../src/plan.ts'
import type { Shot } from '../src/plan.ts'
import { FRAME_HEIGHT, FRAME_WIDTH } from '../src/frame.ts'

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
function driftShot(durationMs: number, pushPull: Shot['pushPull'] = 'push'): Shot {
  return {
    kind: 'beat',
    index: 0,
    startMs: 0,
    durationMs,
    move: 'drift',
    pushPull,
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

/**
 * The crop offsets a shot's filtergraph actually asks ffmpeg for, one per *output*
 * frame (#51).
 *
 * The move is written as an expression in the sub-frame index `n` and `crop` rounds
 * it to a whole master pixel, so this is the position the render lands on rather than
 * the one the arithmetic wanted. An output frame is the mean of the `samples`
 * sub-frames `tmix` averages into it, which is the position a viewer reads: a move
 * that is smooth reads the same distance between every consecutive pair.
 */
function outputOffsets(shot: Shot, sectionHeight: number): { x: number[]; y: number[] } {
  const camera = cameraOver(shot, sectionHeight)
  const filter = moveFilter(camera)
  const crop = /crop=w=\d+:h=\d+:x=([^:]+):y=([^,]+)/.exec(filter)
  assert.ok(crop, `no crop stage in ${filter}`)
  // The expressions are plain arithmetic in `n`, which JS reads the way ffmpeg does.
  const axis = (expression: string) => {
    const at = new Function('n', `return ${expression}`) as (n: number) => number
    return Array.from({ length: camera.frames }, (_, frame) => {
      let total = 0
      for (let sub = 0; sub < camera.samples; sub++) {
        total += rounded(at(frame * camera.samples + sub))
      }
      return total / camera.samples
    })
  }
  return { x: axis(crop[1] as string), y: axis(crop[2] as string) }
}

/**
 * A crop offset as ffmpeg lands it — `lrint`, which is to nearest and halves to even
 * rather than the round-half-up JS reaches for first.
 */
function rounded(value: number): number {
  const nearest = Math.round(value)
  return Math.abs(value % 1) === 0.5 && nearest % 2 !== 0 ? nearest - 1 : nearest
}

/** The distance between consecutive output frames, rounded off floating-point dust. */
function stepsBetween(offsets: number[]): number[] {
  return offsets.slice(1).map((offset, i) => Number((offset - (offsets[i] as number)).toFixed(6)))
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

  test("a diagonal's oversample buys pixels, and the grain travel is cut at", () => {
    // The master is doubled on both axes, so the same move is sampled from twice
    // the pixels. Travel *room* comes from the punch, and the punch has not changed —
    // both of these have 216 output px of it. What the oversample buys is the grain:
    // travel is rounded down to a whole master pixel per output frame (#51), so the
    // diagonal keeps its room to the half output pixel where the lateral keeps it to
    // the whole one. Resolution is not free travel, but it is less of it thrown away.
    const shot = panShot('diagonal')
    const master = masterSize(shot, 2800)
    assert.equal(master.over, 2)
    assert.deepEqual([master.width, master.height], [2592, 6720])
    assert.equal(travel(shot, 2800).x, 178.5)
    assert.equal(travel(panShot('lateral'), 2800).x, 119)
  })

  test('a single-axis pan still travels as far as its room allows', () => {
    const lateral = travel(panShot('lateral'), 2800)
    assert.equal(lateral.y, 0)
    // Punch 1.2 leaves 1080 * 0.2 of lateral room, and #12's pace wants more. What it
    // travels is that room rounded down to a whole pixel per frame: 216 over 119 gaps
    // is 1.8px a frame, so it runs at 1 and covers 119 (#51).
    assert.equal(lateral.x, 119)

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

    // A pan the punch leaves less room than that travels slower, and blurs less: 540px
    // of room over 119 gaps runs at 4px a frame once #51's rounding has had it.
    const clamped = cameraOver(panShot('lateral', 1.5), 2800)
    assert.equal(clamped.samples, 4)

    // A diagonal is measured in the pixels a viewer sees, not the ones it was cut
    // from: its master is doubled on both axes, so 357 master-px of travel over 119
    // gaps is 2.12 output-px a frame. The oversample buys resolution, never blur.
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

  test('a push ramps up to the zoom and a pull back down from it', () => {
    // #52: the deck is still two moves. A pull is the same 10% over the same window,
    // read the other way round, so it crops no more of the master and blurs the same.
    const push = cameraOver(driftShot(3500), 2800)
    const pull = cameraOver(driftShot(3500, 'pull'), 2800)
    assert.deepEqual(push.zoom, { from: 1, to: DRIFT_ZOOM })
    assert.deepEqual(pull.zoom, { from: DRIFT_ZOOM, to: 1 })
    assert.deepEqual(pull.window, push.window)
    assert.equal(pull.samples, push.samples)

    // And the ramp ffmpeg is handed counts down rather than being a push run backwards
    // by some other stage — the zoom is the only thing that reverses.
    assert.match(moveFilter(pull), /z='1\.1-0\.1\*\(on-/)
    assert.match(moveFilter(push), /z='1\+0\.1\*\(on-/)
  })

  test('the derivation is capped, so no move can ask for an unbounded render', () => {
    // The same arithmetic over a drift of four frames: 110px over 3 steps wants 37
    // sub-frames for every frame. The cap is what stops a pathological duration
    // turning into a render that never finishes, and it is the only thing that does.
    assert.equal(cameraOver(driftShot(133), 2800).samples, MAX_BLUR_SAMPLES)
    assert.equal(MAX_BLUR_SAMPLES, 32)
  })

  test('a pan steps the same distance on every output frame', () => {
    // #51: the staircase. `crop` sits on whole master pixels, so a travel that is not
    // a whole number of pixels per output frame lands consecutive frames unequal
    // distances apart — a move that never lands, breaking in the small.
    for (const direction of DIRECTIONS) {
      const offsets = outputOffsets(panShot(direction, 1.5), 2800)
      for (const [axis, series] of Object.entries(offsets)) {
        const steps = new Set(stepsBetween(series))
        assert.equal(steps.size, 1, `${direction} pan steps ${[...steps]} on ${axis}`)
      }
    }
  })

  test("a pan at `check`'s own floor still runs at the pace `check` certified", () => {
    // #51's rounding takes travel away, so the floor is where it has to be shown not
    // to take the move with it: a beat punched to exactly the travel `panTravelNeeded`
    // demands still runs at MIN_PAN_PX_PER_FRAME and still has blur to average. The
    // margin is `check`'s own — it counts the travel a pan needs over its frames and
    // the pan spends it over the gaps between them, which is one more pixel a frame
    // than the rounding can cost.
    const shot = { ...panShot('lateral'), durationMs: BEAT_MS }
    const needed = panTravelNeeded(BEAT_MS)
    // The punch that leaves exactly that much lateral room, which is what `check` asks
    // for and no more.
    const punched = { ...shot, punchFactor: 1 + needed / FRAME_WIDTH }
    const camera = cameraOver(punched, 2800)
    const steps = camera.frames - 1
    assert.ok(
      (camera.to.x - camera.from.x) / steps >= MIN_PAN_PX_PER_FRAME,
      'the floor of a certified pan is still a pan',
    )
    assert.ok(camera.samples > 1, 'and still moves fast enough to be worth blurring')
  })

  test('a pan covers its whole travel across its output frames', () => {
    // The ramp is drawn on sub-frames and read on output frames, so it has to be
    // written over the output grid: ramping to the last *sub*-frame instead leaves
    // the shot short of the camera it was given.
    for (const direction of DIRECTIONS) {
      const shot = panShot(direction, 1.5)
      const camera = cameraOver(shot, 2800)
      const offsets = outputOffsets(shot, 2800)
      for (const axis of ['x', 'y'] as const) {
        const series = offsets[axis]
        const covered = Number(((series.at(-1) as number) - (series[0] as number)).toFixed(6))
        assert.equal(covered, camera.to[axis] - camera.from[axis], `${direction} on ${axis}`)
      }
    }
  })

  describe('a live shot', () => {
    /** #63's ambient hook, as the plan draws it: a drift, a push, at the breath's depth. */
    function liveHook(): Shot {
      return {
        kind: 'hook',
        index: 0,
        startMs: 0,
        durationMs: HOOK_MS,
        move: 'drift',
        pushPull: 'push',
        punchFactor: 1,
        motion: 'ambient',
        source: { url: 'https://example.test/' },
      }
    }

    test('is recorded at the frame, whatever the section under it is', () => {
      // A recording is the viewport over time: there is no full-page screenshot to
      // clip a taller window out of, so the section's height never enters.
      const short = masterSize(liveHook(), 400)
      const tall = masterSize(liveHook(), 6000)
      assert.deepEqual(short, tall)
      assert.deepEqual(short, { width: FRAME_WIDTH, height: FRAME_HEIGHT, over: 1 })
    })

    test("breathes at the card's 3% rather than drifting at a beat's 10%", () => {
      // ADR-0006: the page's own motion is the shot, and a full drift over it competes.
      const camera = cameraOver(liveHook(), 0)
      assert.deepEqual(camera.zoom, { from: 1, to: SUBTLE_ZOOM })
      assert.notEqual(SUBTLE_ZOOM, DRIFT_ZOOM)
      // Under a pixel a frame at that depth, so there is nothing to blur — which is
      // also what leaves the move chain no sub-frames to have stepped through.
      assert.equal(camera.samples, 1)
    })

    test('softens less than a still hook, because it asks 3% of the pixels not 10%', () => {
      // The recording is exactly one frame of pixels — a browser screencast is taken
      // at the CSS viewport whatever device scale factor it is given, so there is no
      // resolution headroom to be had and the breath upscales like any other zoom.
      // What it does not do is upscale *more* than the still hook it replaces: the
      // whole difference between the two is 3% against 10%.
      const live = cameraOver(liveHook(), 0)
      const still = cameraOver({ ...liveHook(), motion: undefined }, FRAME_HEIGHT)
      assert.deepEqual(live.window, still.window)
      assert.ok(
        live.zoom.to < still.zoom.to,
        `a live hook is upscaled as hard as a still one: ${live.zoom.to} vs ${still.zoom.to}`,
      )
    })

    test('drops the loop stage: a recording is already a stream', () => {
      const camera = cameraOver(liveHook(), 0)
      const live = moveFilter(camera, true)
      assert.ok(!live.includes('loop='), `the recording is looped in ${live}`)
      // Dropped rather than reconfigured — the rest of the chain is what it was.
      assert.equal(`loop=loop=-1:size=1:start=0,${live}`, moveFilter(camera))
    })
  })
})
