/** The reel frame. 9:16, fixed — nothing about a site changes it. */
export const FRAME_WIDTH = 1080
export const FRAME_HEIGHT = 1920

/** #7: 3-5 beats. `beats.length` *is* n; there is no flag that changes it. */
export const MIN_BEATS = 3
export const MAX_BEATS = 5

/** #6: a hero video's own fade-in is still running at t=0, so the pin sits past it. */
export const DEFAULT_VIDEO_TIME = 2.0

/** #7: 1.0 is "no punch". */
export const DEFAULT_PUNCH_FACTOR = 1.0

/**
 * The section height one punched frame needs, in the section's own pixels.
 *
 * A punch captures a column `FRAME_WIDTH / punch` wide, so a 9:16 frame out of that
 * column is `FRAME_HEIGHT / punch` tall. `check` refuses a section shorter than this
 * and `capture` grows a clip up to it, so the two must round the same way — a
 * disagreement here is a section check passed that capture then has to stretch.
 */
export function punchedFrameHeight(punchFactor: number): number {
  return Math.ceil(FRAME_HEIGHT / punchFactor)
}
