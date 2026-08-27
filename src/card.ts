/**
 * The CTA card — MWA Forge's closing 2.5s (#9 §5, #25).
 *
 * The card is MWA Forge's, not the client's: these reels are MWA Forge's own
 * marketing, the client site is the subject and the proof, and the viewer's next step
 * is hiring Wyatt. So the mark and the headline are repo constants, and the only
 * thing config puts on the card is `cta.credit` — the client's domain, credited,
 * because proof needs attribution.
 *
 * Pure and synchronous like `plan`, `camera` and `overlay`, apart from the one call
 * that has to put the rasterised mark somewhere ffmpeg can read it. `compose` turns
 * the result into arguments and has no opinion about the layout.
 */

import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { FRAME_HEIGHT, FRAME_WIDTH } from './frame.ts'
import { ACCENT, FONT_FILE, INK, SAFE_ZONE, TYPE, ffmpegColor } from './house.ts'
import { overflowProblems } from './measure.ts'
import { escapeValue } from './overlay.ts'
import { FPS } from './plan.ts'
import { wordmarkHeight, wordmarkRgba } from './wordmark.ts'

/** The repo's own call to action. Config never reaches it — #9 §5 is explicit. */
export const HEADLINE = 'mwaforge.com'

/**
 * The card's drift, and the reason it has one: #12 found there is no rest anywhere in
 * this reel, and a static final 2.5s reads as the video having ended early. 3% over
 * 2.5s is a move a viewer registers without being able to point at it — the card's
 * fastest pixel travels under half a pixel a frame, which is also why nothing here is
 * blurred: at that speed there is nothing to blur.
 */
export const CARD_ZOOM = 1.03

/** The mark, in frame pixels. Wide enough to read as the mark and no wider. */
export const MARK_WIDTH = 460

/** #9 §5: the card's content is centred here, not on the frame's own middle. */
export const CARD_CENTRE_Y = 760

/**
 * The accent rule — a rule, not a bar: it separates the credit from the headline.
 * Six pixels rather than the hairline the same shape wants on a page: this one is
 * looked at on a phone, through an encode, under a 3% scale.
 */
const RULE = { width: 140, height: 6 }

/** Space under the mark, and around the rule. */
const MARK_GAP = 56
const RULE_GAP = 40

/** The credit is attribution, so it is set muted as well as small. */
const CREDIT_ALPHA = 0.62

export type CardLayout = {
  /** The content box: the boosted safe box's own width, centred in the frame. */
  width: number
  mark: { x: number; y: number; width: number; height: number }
  headline: { y: number }
  rule: { x: number; y: number; width: number; height: number }
  credit: { y: number }
}

/**
 * Where everything on the card sits, in frame pixels.
 *
 * The stack is measured, then placed as a whole around #9's centre — so a change to
 * any one element's size moves the others rather than pushing the card off centre.
 * There is no config in it: the card is the same card on every reel, which is what a
 * house style is for.
 */
export function cardLayout(): CardLayout {
  const markHeight = wordmarkHeight(MARK_WIDTH)
  const stack =
    markHeight +
    MARK_GAP +
    TYPE.headline.lineHeight +
    RULE_GAP +
    RULE.height +
    RULE_GAP +
    TYPE.credit.lineHeight
  const top = Math.round(CARD_CENTRE_Y - stack / 2)

  const headlineY = top + markHeight + MARK_GAP
  const ruleY = headlineY + TYPE.headline.lineHeight + RULE_GAP
  return {
    width: SAFE_ZONE.right - SAFE_ZONE.left,
    mark: {
      x: Math.round((FRAME_WIDTH - MARK_WIDTH) / 2),
      y: top,
      width: MARK_WIDTH,
      height: markHeight,
    },
    headline: { y: headlineY },
    rule: {
      x: Math.round((FRAME_WIDTH - RULE.width) / 2),
      y: ruleY,
      width: RULE.width,
      height: RULE.height,
    },
    credit: { y: ruleY + RULE.height + RULE_GAP },
  }
}

/**
 * The card's copy against the card's own width.
 *
 * The credit is the one line on the card a config owns, so it is the one line that
 * can overflow — and it fails at `check` like every other line of copy, because type
 * on a card never shrinks to fit either.
 */
export function creditProblems(credit: string): string[] {
  return overflowProblems('cta.credit', credit, 'credit', {
    name: 'card',
    width: cardLayout().width,
  })
}

export type Wordmark = { path: string; width: number; height: number }

/**
 * The mark, rasterised into `dir` as raw RGBA for ffmpeg to read.
 *
 * Raw rather than encoded: encoding it would mean carrying an encoder for one image
 * that is identical on every render. It is written beside the masters and wiped with
 * them — it is derived from a checked-in constant, so it is never something to keep.
 */
export async function writeWordmark(dir: string): Promise<Wordmark> {
  const { data, width, height } = wordmarkRgba(MARK_WIDTH, INK)
  const path = join(dir, 'wordmark.rgba')
  await writeFile(path, data)
  return { path, width, height }
}

/** The mark's input arguments — raw pixels carry no header, so the header is argv. */
export function wordmarkInput(mark: Wordmark): string[] {
  return [
    '-f', 'rawvideo',
    '-pixel_format', 'rgba',
    '-video_size', `${mark.width}x${mark.height}`,
    '-i', mark.path,
  ]
}

/**
 * The whole card, from a flat ground and the mark's single frame to a drifting shot.
 *
 * Drawn first and scaled after, so the drift moves the card rather than its elements
 * moving against each other — mark, type and rule are one object, and a zoom applied
 * per element would read as four things sliding apart.
 */
export function cardChains(
  credit: string,
  frames: number,
  ground: string,
  mark: string,
  output: string,
): string[] {
  const layout = cardLayout()
  return [
    // The mark is one frame and the card is seventy-five. Looped rather than re-read,
    // and given a frame rate as well as timestamps — `overlay` counts frames.
    `[${mark}]format=rgba,loop=loop=-1:size=1:start=0,fps=${FPS}[mark]`,
    `[${ground}][mark]overlay=x=${layout.mark.x}:y=${layout.mark.y}:shortest=1[marked]`,
    `[marked]${[
      drawLine(HEADLINE, 'headline', layout.headline.y, ffmpegColor(INK)),
      drawLine(credit, 'credit', layout.credit.y, `${ffmpegColor(INK)}@${CREDIT_ALPHA}`),
      `drawbox=x=${layout.rule.x}:y=${layout.rule.y}:w=${layout.rule.width}:` +
        `h=${layout.rule.height}:color=${ffmpegColor(ACCENT)}:t=fill`,
    ].join(',')}[drawn]`,
    `[drawn]${driftFilter(frames)}[${output}]`,
  ]
}

/** One line of card copy, centred on the frame — the card's axis, not the slot's. */
function drawLine(content: string, role: 'headline' | 'credit', y: number, colour: string): string {
  return [
    'drawtext',
    `=fontfile=${escapeValue(FONT_FILE)}`,
    `:text=${escapeValue(content)}`,
    // Copy is a human's, not a format string: `%{...}` and backslashes are letters.
    ':expansion=none',
    `:fontcolor=${colour}`,
    `:fontsize=${TYPE[role].size}`,
    // Centred by freetype's own measurement at draw time. `check` has already refused
    // a credit too wide for the card, so this centres a line known to fit.
    ':x=(w-text_w)/2',
    `:y=${y}`,
  ].join('')
}

/**
 * The card's own drift: a scale from 1.00 to `CARD_ZOOM` across the card's frames.
 *
 * `on`, so the ramp is counted in output frames and reaches its end on the last one —
 * the card is still moving when the reel stops, which is the whole point of it moving.
 *
 * The card is enlarged before it is zoomed and brought back down after, because
 * `zoompan` crops in whole pixels: 3% of 1080 is 32 pixels shared between 75 frames,
 * so at frame size the same crop is asked for two or three frames running and the
 * card visibly steps. Enlarging first buys the sub-pixel precision the move needs —
 * `PRECISION` is set so the crop is a different rect on *every* frame — and the
 * enlargement is nearest-neighbour, which is exact: it invents no detail for the
 * final scale down to have to sort out.
 */
function driftFilter(frames: number): string {
  const ramp = Number((CARD_ZOOM - 1).toFixed(6))
  const last = Math.max(1, frames - 1)
  const width = FRAME_WIDTH * PRECISION
  const height = FRAME_HEIGHT * PRECISION
  return [
    `scale=${width}:${height}:flags=neighbor`,
    `zoompan=z='1+${ramp}*on/${last}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
      `d=1:s=${width}x${height}:fps=${FPS}`,
    `scale=${FRAME_WIDTH}:${FRAME_HEIGHT}:flags=lanczos`,
  ].join(',')
}

/**
 * How much bigger than the frame the zoom is computed in.
 *
 * `FRAME_WIDTH * PRECISION * (1 - 1/CARD_ZOOM)` is the number of whole-pixel steps
 * the crop takes across the shot; at 3 that is 94 steps for 74 frame gaps, so every
 * frame's crop differs from the one before it and nothing in the move repeats.
 */
const PRECISION = 3
