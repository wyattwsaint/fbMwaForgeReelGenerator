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
