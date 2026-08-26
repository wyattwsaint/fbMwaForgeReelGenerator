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
import { FPS, panAxes } from './plan.ts'
import type { Shot } from './plan.ts'

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
 */
export const DRIFT_ZOOM = 1.1

/** #11: sub-frames averaged per output frame, derived and never a knob. */
export const MAX_BLUR_SAMPLES = 32

/** The master a shot's move is computed over, in its own pixels. */
export type MasterSize = { width: number; height: number; over: number }

export type Camera = {
  /** The window into the master, in master pixels. Constant for a pan. */
  window: { width: number; height: number }
  /** Top-left of the window at the first and last output frame, in master pixels. */
  from: { x: number; y: number }
  to: { x: number; y: number }
  /** 1.0 for a pan; a drift zooms from 1.0 to this across the shot. */
  zoom: number
  frames: number
  /** #11: `ceil(peak per-frame px displacement)`, capped. No knob. */
  samples: number
}

export function frameCount(durationMs: number): number {
  return Math.round((durationMs * FPS) / 1000)
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
  const steps = Math.max(1, frames - 1)
  return shot.move === 'pan' ? pan(shot, master, frames, steps) : drift(master, frames, steps)
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

  const room = { x: master.width - window.width, y: master.height - window.height }
  const travel = {
    x: axes.includes('x') ? Math.max(0, Math.min(room.x, target)) : 0,
    y: axes.includes('y') ? Math.max(0, Math.min(room.y, target)) : 0,
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
  return { window, from, to, zoom: 1, frames, samples: blurSamples(peak) }
}

/**
 * A drift holds the window and zooms into it. The window is one frame of master
 * pixels — 1:1 at the shot's punch — centred on the section, so a drift never
 * shows more of the page than a pan of the same beat would.
 */
function drift(master: MasterSize, frames: number, steps: number): Camera {
  const window = { width: FRAME_WIDTH, height: FRAME_HEIGHT }
  const centre = {
    x: Math.round((master.width - window.width) / 2),
    y: Math.round((master.height - window.height) / 2),
  }
  // A zoom's fastest pixel is a frame corner, so that is what the blur is derived from.
  const peak = (Math.hypot(FRAME_WIDTH, FRAME_HEIGHT) / 2) * (DRIFT_ZOOM - 1) / steps
  return { window, from: centre, to: centre, zoom: DRIFT_ZOOM, frames, samples: blurSamples(peak) }
}
