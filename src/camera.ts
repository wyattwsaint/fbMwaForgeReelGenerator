/**
 * The camera move of one shot, as numbers (#11, #12).
 *
 * Pure and synchronous, like `plan`: the plan says *which* move a shot gets, this
 * says where that move starts and ends in the master's own pixels, and how many
 * sub-frames have to be averaged for it to read as motion rather than as dropped
 * frames. `compose` turns the result into ffmpeg arguments and nothing else, so the
 * geometry is arguable without reading a filtergraph.
 */

import { FRAME_HEIGHT, FRAME_WIDTH } from './frame.ts'
import { frameCount, panAxes } from './plan.ts'
import type { Shot } from './plan.ts'
import type { PushPull } from './site.ts'

/**
 * A diagonal pan needs punch-in headroom on both axes, so its master is doubled on
 * both and its camera window with it — same framing, same travel, twice the pixels
 * per axis. `CONTEXT.md` calls that cost automatic, which is what this is.
 */
export const DIAGONAL_OVERSAMPLE = 2

/** #6's accepted pan ran about this fast, and #11 measured its blur at ~7 samples. */
export const PAN_PX_PER_FRAME = 7

/**
 * How far a drift zooms across its shot. Set so a drift's fastest pixel — a frame
 * corner — moves a bit over 1px a frame, which is a move that reads without ever
 * competing with the cut.
 *
 * One depth for both directions (#52): a push ramps up to it and a pull ramps back
 * down from it, so the two are the same move read either way round — same window,
 * same pixels, same blur. Direction is what alternates, never distance.
 */
export const DRIFT_ZOOM = 1.1

/**
 * How far the card drifts, and the reason it drifts at all: #12 found there is no rest
 * anywhere in this reel, and a static final 2.5s reads as the video having ended early.
 * 3% over 2.5s is a move a viewer registers without being able to point at it.
 *
 * The depth stays 3% whichever way the card goes (#52). It is drawn rather than filmed
 * — the round trip renders it at `card.ts`'s own precision either way — so a pull costs
 * it no sharpness, which is why the card is in the rotation at all.
 */
export const CARD_ZOOM = 1.03

/** #11: sub-frames averaged per output frame, derived and never a knob. */
export const MAX_BLUR_SAMPLES = 32

/**
 * Where a move's ramp is read (#51).
 *
 * A move is *drawn* on sub-frames and *read* on output frames: `tmix` averages
 * `samples` sub-frames into each one, so output frame k is centred on sub-frame
 * `offset + k * samples`. A ramp written over the sub-frames instead — 0 on the
 * first and 1 on the last — ends `samples - 1` sub-frames past the last output
 * frame, so the shot never reaches the camera it was given and its output frames
 * are not evenly spaced along the way.
 */
export type Ramp = { offset: number; span: number }

/**
 * The two ends of a zoom, as the ramp a filter is handed rather than a depth off 1.0:
 * a pull starts at the zoom and comes back down, so which end is 1.0 is the move's to
 * say (#52).
 */
export type Zoom = { from: number; to: number }

/** The master a shot's move is computed over, in its own pixels. */
export type MasterSize = { width: number; height: number; over: number }

export type Camera = {
  /** The window into the master, in master pixels. Constant for a pan. */
  window: { width: number; height: number }
  /** Top-left of the window at the first and last output frame, in master pixels. */
  from: { x: number; y: number }
  to: { x: number; y: number }
  /**
   * The zoom at the first and last output frame. 1.0 to 1.0 for a pan; a drift ramps
   * between 1.0 and `DRIFT_ZOOM` in whichever order its push or pull asks for (#52).
   */
  zoom: Zoom
  frames: number
  /** #11: `ceil(peak per-frame px displacement)`, capped. No knob. */
  samples: number
}

/**
 * The gaps a move is spread across — one fewer than the frames it is drawn on, and
 * never zero, because a one-frame shot still has to divide by something. Callers
 * reach it through `moveRamp`: where a move's ends land is this file's to say.
 */
function moveSteps(frames: number): number {
  return Math.max(1, frames - 1)
}

/** The ramp a camera's move is written on, in its own sub-frames. */
export function moveRamp(camera: Camera): Ramp {
  return {
    offset: (camera.samples - 1) / 2,
    span: camera.samples * moveSteps(camera.frames),
  }
}

/** The oversample a shot's master is captured at. */
export function oversampleOf(shot: Shot): number {
  return shot.direction === 'diagonal' ? DIAGONAL_OVERSAMPLE : 1
}

/**
 * The master a shot needs, in pixels: the frame times the shot's punch factor,
 * doubled on both axes for a diagonal. Width is the frame's, because a section is
 * exactly as wide as the frame; height is the section's, which is what a vertical
 * pan travels across.
 */
export function masterSize(shot: Shot, sectionHeight: number): MasterSize {
  const over = oversampleOf(shot)
  const scale = shot.punchFactor * over
  return {
    width: Math.round(FRAME_WIDTH * scale),
    height: Math.round(sectionHeight * scale),
    over,
  }
}

function blurSamples(peakPxPerFrame: number): number {
  return Math.min(MAX_BLUR_SAMPLES, Math.max(1, Math.ceil(peakPxPerFrame)))
}

/** Where the camera starts and ends, given the master it actually got. */
export function cameraFor(shot: Shot, master: MasterSize): Camera {
  const frames = frameCount(shot.durationMs)
  const steps = moveSteps(frames)
  return shot.move === 'pan'
    ? pan(shot, master, frames, steps)
    : drift(shot, master, frames, steps)
}

/**
 * A pan holds its zoom and slides the window. It travels at #12's pace, or across
 * everything the punch left over when that is less — `check` has already refused the
 * punches that leave less than a move.
 */
function pan(shot: Shot, master: MasterSize, frames: number, steps: number): Camera {
  const over = master.over
  const window = { width: FRAME_WIDTH * over, height: FRAME_HEIGHT * over }
  const axes = shot.direction ? panAxes(shot.direction) : ['y' as const]
  const target = PAN_PX_PER_FRAME * steps * over

  // Every travelling axis moves the same distance, so a diagonal reads as a diagonal.
  // Clamping each axis on its own instead would let the vertical run at #12's pace
  // while the lateral crawled across the little room a punch leaves — a "diagonal"
  // shot that is a vertical pan with a wobble. `check` has already refused the punches
  // that leave any axis less than a move, so the smaller room is still a move.
  const room = { x: master.width - window.width, y: master.height - window.height }
  const space = Math.min(...axes.map((axis) => room[axis]))
  const reach = Math.max(0, Math.min(target, space))
  // #51: `crop` rounds to whole master pixels, so travel that is not a whole number
  // of pixels per output frame lands consecutive frames unequal distances apart — a
  // staircase, which is a continuous move landing over and over inside its own shot.
  // Rounding the travel down to a multiple of the gaps makes every output frame the
  // same integer step from the one before it, at a cost of under a pixel a frame that
  // the master's own resolution sets. `CONTEXT.md`'s **punch-in** has the finding.
  const quantised = Math.floor(reach / steps) * steps
  // The blur reaches half a frame past each end of the move — `tmix` averages the
  // sub-frames either side of an output frame, and the ones outside the move are what
  // the ends are averaged from. A move that filled its room to the edge would have
  // ffmpeg clamp those back onto the edge and bias its first and last frames, so the
  // room keeps a step in hand rather than the move spending all of it.
  const allowed = quantised > 0 && quantised === space ? quantised - steps : quantised
  const travel = {
    x: axes.includes('x') ? allowed : 0,
    y: axes.includes('y') ? allowed : 0,
  }
  // Centre the travel in the room it has, so a pan reads as a move across the middle
  // of the section rather than as a slide off one of its edges.
  const start = {
    x: Math.round((room.x - travel.x) / 2),
    y: Math.round((room.y - travel.y) / 2),
  }
  const end = { x: start.x + travel.x, y: start.y + travel.y }

  // Direction is which way along the axis, not which axis: reversing swaps the ends.
  const reversed = shot.direction === 'lateral-reversed'
  const from = reversed ? { x: end.x, y: start.y } : start
  const to = reversed ? { x: start.x, y: end.y } : end

  // Every direction covers the same path length in the same time, so the peak is the
  // whole diagonal of the travel, in output pixels.
  const peak = Math.hypot(travel.x, travel.y) / over / steps
  return { window, from, to, zoom: { from: 1, to: 1 }, frames, samples: blurSamples(peak) }
}

/**
 * A drift holds the window and zooms into it. The window is one frame of master
 * pixels — 1:1 at the shot's punch — centred on the section, so a drift never
 * shows more of the page than a pan of the same beat would.
 *
 * Which is also why a pull is free (#52): both directions ramp inside the window
 * `drift` already crops, so pulling costs no extra captured pixels and asks nothing
 * of the punch — unlike a lateral pan, which needs room the punch has to buy.
 */
function drift(shot: Shot, master: MasterSize, frames: number, steps: number): Camera {
  const window = { width: FRAME_WIDTH, height: FRAME_HEIGHT }
  const centre = {
    x: Math.round((master.width - window.width) / 2),
    y: Math.round((master.height - window.height) / 2),
  }
  // A zoom's fastest pixel is a frame corner, so that is what the blur is derived from.
  // The corner covers the same distance either way round, so direction never enters.
  const peak = (Math.hypot(FRAME_WIDTH, FRAME_HEIGHT) / 2) * (DRIFT_ZOOM - 1) / steps
  return {
    window,
    from: centre,
    to: centre,
    zoom: zoomRamp(DRIFT_ZOOM, shot.pushPull),
    frames,
    samples: blurSamples(peak),
  }
}

/**
 * A drift's zoom, as the two ends of its ramp: a push climbs to `depth` and a pull
 * comes back down from it.
 *
 * `undefined` is a value it takes rather than a default it supplies, because `Shot`
 * makes the field optional for pans and a drift that reaches here without one came
 * from something other than `planReel` — a hand-built shot in a test. It pushes,
 * which is what every drift in the repo was before #52.
 */
function zoomRamp(depth: number, pushPull: PushPull | undefined): Zoom {
  return pushPull === 'pull' ? { from: depth, to: 1 } : { from: 1, to: depth }
}

/**
 * The card's camera. `plan` gives the card `move: 'drift'` like any other shot, and
 * this is where that move becomes numbers — the card does not get to declare a zoom of
 * its own any more than a beat does.
 *
 * `plan` gives the card `move: 'drift'` and this is that move. There is no second
 * branch to write: a pan slides a window across a master, and the card has none — so
 * a card asking for one would be a bug in the plan rather than a shot to render.
 *
 * There is no punch either: the card is built at frame size, so the window is the
 * frame itself and there is nothing to crop out of anything. Which way it zooms is
 * the plan's, like a beat's — the card no more picks that than how far it zooms.
 * Nothing is blurred either — at 3% over 2.5s the card's fastest pixel travels under
 * half a pixel a frame, which is not a speed there is anything to blur.
 */
export function cardCamera(shot: Shot): Camera {
  const origin = { x: 0, y: 0 }
  return {
    window: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
    from: origin,
    to: origin,
    zoom: zoomRamp(CARD_ZOOM, shot.pushPull),
    frames: frameCount(shot.durationMs),
    samples: 1,
  }
}
