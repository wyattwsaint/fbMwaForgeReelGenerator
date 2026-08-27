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
import { moveRamp } from './camera.ts'
import type { Camera } from './camera.ts'
import { FRAME_WIDTH } from './frame.ts'
import { drawText, ffmpegColor, pad, stream, zoomStage } from './filtergraph.ts'
import type { StreamLabel } from './filtergraph.ts'
import { ACCENT, FONT_FILE, INK, SAFE_ZONE, TYPE } from './house.ts'
import { overflowProblems } from './measure.ts'
import { FPS } from './plan.ts'
import type { TextCue } from './plan.ts'
import { wordmarkHeight, wordmarkRgba } from './wordmark.ts'

/** The repo's own call to action. Config never reaches it — #9 §5 is explicit. */
export const HEADLINE = 'mwaforge.com'

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
 * The card's copy, measured.
 *
 * The credit is the one line on the card a config owns, so it is the one line that
 * can overflow — and it fails at `check` like every other line of copy, because type
 * on a card never shrinks to fit either. The card is the safe box wide, which is the
 * width `measure` already holds, so this is the same check the overlay lines get.
 */
export function creditProblems(credit: string): string[] {
  return overflowProblems('cta.credit', credit, 'credit')
}

/**
 * The card's own line, out of a shot's cues.
 *
 * Each drawer takes the roles that are its own — `overlay.ts` picks the ones that go
 * over site pixels, and this picks the one that goes on the card — so nothing upstream
 * of either has to know what a role is. Absent is empty rather than an error: a config
 * with no `cta.credit` gets a card with no credit line, which is a card.
 */
export function cardCredit(cues: TextCue[]): string {
  return cues.find((cue) => cue.role === 'cta')?.content ?? ''
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
  const { data, width, height } = wordmarkRgba(MARK_WIDTH)
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
  cues: TextCue[],
  camera: Camera,
  ground: StreamLabel,
  mark: StreamLabel,
  output: StreamLabel,
): string[] {
  const layout = cardLayout()
  const credit = cardCredit(cues)
  const looped = stream('mark')
  const marked = stream('marked')
  const drawn = stream('drawn')
  return [
    // The mark is one frame and the card is seventy-five. Looped rather than re-read,
    // and given a frame rate as well as timestamps — `overlay` counts frames.
    `${pad(mark)}format=rgba,loop=loop=-1:size=1:start=0,fps=${FPS}${pad(looped)}`,
    `${pad(ground)}${pad(looped)}overlay=x=${layout.mark.x}:y=${layout.mark.y}:shortest=1${pad(marked)}`,
    `${pad(marked)}${[
      drawLine(HEADLINE, 'headline', layout.headline.y, ffmpegColor(INK)),
      drawLine(credit, 'credit', layout.credit.y, `${ffmpegColor(INK)}@${CREDIT_ALPHA}`),
      `drawbox=x=${layout.rule.x}:y=${layout.rule.y}:w=${layout.rule.width}:` +
        `h=${layout.rule.height}:color=${ffmpegColor(ACCENT)}:t=fill`,
    ].join(',')}${pad(drawn)}`,
    `${pad(drawn)}${driftFilter(camera)}${pad(output)}`,
  ]
}

/**
 * One line of card copy, centred on the frame — the card's axis, not the slot's.
 *
 * Centred by freetype's own measurement at draw time. `check` has already refused a
 * credit too wide for the card, so this centres a line known to fit. No alpha: the
 * card arrives on the reel's one crossfade and holds, so neither of its lines has an
 * envelope to ramp.
 */
function drawLine(content: string, role: 'headline' | 'credit', y: number, colour: string): string {
  return drawText({
    content,
    fontFile: FONT_FILE,
    size: TYPE[role].size,
    colour,
    x: '(w-text_w)/2',
    y,
  })
}

/**
 * The card's move, as filter stages: `camera`'s drift, run over the whole card.
 *
 * The card is enlarged before it is zoomed and brought back down after, because
 * `zoompan` crops in whole pixels: 3% of 1080 is 32 pixels shared between 75 frames,
 * so at frame size the same crop is asked for two or three frames running and the card
 * visibly steps. Enlarging first buys the sub-pixel precision the move needs —
 * `PRECISION` is set so the crop is a different rect on *every* frame — and the
 * enlargement is nearest-neighbour, which is exact: it invents no detail for the final
 * scale down to have to sort out.
 *
 * Which is why the precision lives here and the zoom does not: the multiple is about
 * how the card is drawn, and how far it drifts is `camera.ts`'s to say.
 *
 * What the round trip costs the pixels that are *not* moving is #48's measurement,
 * read off rendered cards through the reel's own final encode. Against the card #38
 * proposed instead — laid out whole at `PRECISION` and brought down once — this one
 * is about a fifth less acute at 1080 wide, and under a twentieth less at the ~430px
 * a reel is watched at, which is not a difference to see. And against a third card,
 * drawn once at frame size and never resampled at all, the round trip is the smaller
 * of the two departures: laying out at `PRECISION` lands glyphs on different
 * subpixels, so that card sits about twice as far from the unresampled one as this
 * card does. The alternative is a restyle of the card's type rather than the same
 * card cheaper — which is why the round trip stays, and why `cardLayout` still
 * returns frame pixels.
 */
function driftFilter(camera: Camera): string {
  const { window, samples } = camera
  const width = window.width * PRECISION
  const height = window.height * PRECISION
  return [
    `scale=${width}:${height}:flags=neighbor`,
    zoomStage(camera.zoom, moveRamp(camera), { width, height }, FPS * samples),
    `scale=${window.width}:${window.height}:flags=lanczos`,
  ].join(',')
}

/**
 * How much bigger than the frame the zoom is computed in.
 *
 * `FRAME_WIDTH * PRECISION * (1 - 1/CARD_ZOOM)` — `camera.ts`'s zoom, which is what
 * makes this a number about drawing rather than about the move — is the count of
 * whole-pixel steps the crop takes across the shot; at 3 that is 94 steps for 74 frame
 * gaps, so every frame's crop differs from the one before it and nothing repeats.
 */
const PRECISION = 3
