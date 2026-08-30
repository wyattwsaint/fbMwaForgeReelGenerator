/** The reel frame. 9:16, fixed — nothing about a site changes it. */
export const FRAME_WIDTH = 1080
export const FRAME_HEIGHT = 1920

/** #7: 3-5 beats. `beats.length` *is* n; there is no flag that changes it. */
export const MIN_BEATS = 3
export const MAX_BEATS = 5

/** #6: a hero video's own fade-in is still running at t=0, so the pin sits past it. */
export const DEFAULT_VIDEO_TIME = 2.0

/**
 * What a page is given before the run calls it a failure: the `load` event, within a
 * minute. House policy, not local detail — every module that opens a browser passes
 * this to `goto`, so a fifth caller agrees with the four by construction (#100).
 */
export const LOAD = { waitUntil: 'load', timeout: 60_000 } as const

/**
 * The viewport a page is *read* at — the one frame the reel is framed in. Distinct
 * from the widened viewport a **fit** shot is captured at, which `fitViewportWidth`
 * derives per section; everything measured for a decision is measured here (#100).
 */
export const BASE_VIEWPORT = { width: FRAME_WIDTH, height: FRAME_HEIGHT } as const

/** #7: 1.0 is "no punch". */
export const DEFAULT_PUNCH_FACTOR = 1.0

/**
 * The section height one punched frame needs, in the capture viewport's own pixels.
 *
 * A punch captures a column `FRAME_WIDTH / punch` wide, so a 9:16 frame out of that
 * column is `FRAME_HEIGHT / punch` tall. `check` refuses a section shorter than this
 * and `capture` grows a clip up to it, so the two must round the same way — a
 * disagreement here is a section check passed that capture then has to stretch.
 *
 * A **fit** beat is laid out in a wider viewport, and a section is exactly as wide as
 * whatever viewport it is laid out in, so the frame it has to fill is proportionally
 * taller in that viewport's pixels. Non-fit callers pass nothing and get #18's number.
 */
export function punchedFrameHeight(punchFactor: number, viewportWidth = FRAME_WIDTH): number {
  return Math.ceil((FRAME_HEIGHT * viewportWidth) / (FRAME_WIDTH * punchFactor))
}

/**
 * The capture viewport a section of this height is **fit** in: the width at which the
 * section, being exactly as wide as its viewport, is exactly one frame tall (#65).
 *
 * The inverse of a punch rather than a punch below 1.0. A punch crops a narrower
 * column out of a page already rasterised at `FRAME_WIDTH`, so a factor under 1.0
 * asks for page pixels that were never rendered; widening the viewport renders them.
 *
 * It only ever widens. Fit is the way to pull *out* and the punch is the way to crop
 * *in*, so a section already inside one frame has nothing to fit — and narrowing to
 * reach it would shoot the site's phone layout, which is a different site rather than
 * a wider view of this one. Such a section is left at the base viewport and refused by
 * `check` for the same reason it always was: it is too short for a frame.
 *
 * The height it is given is measured at the *base* viewport, so this width is an
 * estimate: widening reflows the site and the section is not the same section at the
 * new width. `capture` re-measures after the reflow and frames the clip on that.
 */
export function fitViewportWidth(sectionHeight: number): number {
  return Math.max(FRAME_WIDTH, Math.round((FRAME_WIDTH * sectionHeight) / FRAME_HEIGHT))
}
