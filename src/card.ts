/**
 * The CTA card — MWA Forge's closing 2.5s (#9 §5, #25).
 *
 * The card is MWA Forge's, not the client's: these reels are MWA Forge's own
 * marketing, the client site is the subject and the proof, and the viewer's next step
 * is hiring Wyatt. So the mark, the tagline and the headline are repo constants, and
 * the only thing config puts on the card is `cta.credit` — the client's domain,
 * credited, because proof needs attribution.
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
import { forgePixels, lockupChains, lockupGeometry, mwaRgba, sparkRgba } from './lockup.ts'
import type { Frame, LockupGeometry } from './lockup.ts'
import { overflowProblems } from './measure.ts'
import { FPS } from './plan.ts'
import type { TextCue } from './plan.ts'

/** The repo's own call to action. Config never reaches it — #9 §5 is explicit. */
export const HEADLINE = 'mwaforge.com'

/**
 * What the lockup sells, in words (#61, #106).
 *
 * House style, like the face, the lockup and the accent: the same line on every reel,
 * for every client, so it is a constant here and not a config field. A viewer who
 * catches only the last two seconds sees a name and a domain, neither of which says
 * what is being offered; this is the line that does. It does not repeat the name,
 * because the lockup above it already is the name — what it adds is the offer, and
 * `jobs` is the word the trade the client is in actually uses.
 */
export const TAGLINE = 'Websites that book jobs'

/**
 * The lockup, in frame pixels — the one number the rest of its geometry is solved
 * from (`lockupGeometry`).
 *
 * 880 of the safe box's 950, which leaves 35 either side. Wide because the lockup is
 * now the whole lockup: at 460 the `MWA` half alone was the mark, and `FORGE` set
 * beside it at that width would be type nobody can read through an encode at the ~430
 * pixels a reel is watched at. It is the card's one image and the card has the room.
 */
export const MARK_WIDTH = 880

/** #9 §5: the card's content is centred here, not on the frame's own middle. */
export const CARD_CENTRE_Y = 760

/**
 * The accent rule — a rule, not a bar: it separates the credit from the headline.
 * Six pixels rather than the hairline the same shape wants on a page: this one is
 * looked at on a phone, through an encode, under a 3% scale.
 */
const RULE = { width: 140, height: 6 }

/**
 * The lockup and the tagline are one **signature** — the words are the lockup's own
 * signing, not a second line stacked under it — so they sit tighter than the gaps
 * between the card's other elements. Set equidistant, the tagline starts to read as a
 * headline.
 */
const SIGNATURE_GAP = 32

/** Space under the signature, and around the rule. */
const BLOCK_GAP = 56
const RULE_GAP = 40

/** The credit is attribution, so it is set muted as well as small. */
const CREDIT_ALPHA = 0.62

export type CardLayout = {
  /** The content box: the boosted safe box's own width, centred in the frame. */
  width: number
  /** Where the lockup's drawn box sits, and — inside it, in its own coordinates —
   * where the two halves and `FORGE`'s five glyphs go. */
  lockup: { x: number; y: number; width: number; height: number; geometry: LockupGeometry }
  tagline: { y: number }
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
  const geometry = lockupGeometry(MARK_WIDTH)
  // The lockup's drawn box is taller than its cap — `O` and `G` overshoot — and it is
  // the drawn box the stack has to make room for, because it is the drawn box a viewer
  // sees. Rounded up: half a pixel of `G` clipped is the half nobody forgives.
  const markHeight = Math.ceil(geometry.height)
  const stack =
    markHeight +
    SIGNATURE_GAP +
    TYPE.tagline.lineHeight +
    BLOCK_GAP +
    TYPE.headline.lineHeight +
    RULE_GAP +
    RULE.height +
    RULE_GAP +
    TYPE.credit.lineHeight
  const top = Math.round(CARD_CENTRE_Y - stack / 2)

  const taglineY = top + markHeight + SIGNATURE_GAP
  const headlineY = taglineY + TYPE.tagline.lineHeight + BLOCK_GAP
  const ruleY = headlineY + TYPE.headline.lineHeight + RULE_GAP
  return {
    width: SAFE_ZONE.right - SAFE_ZONE.left,
    lockup: {
      x: Math.round((FRAME_WIDTH - MARK_WIDTH) / 2),
      y: top,
      width: MARK_WIDTH,
      height: markHeight,
      geometry,
    },
    tagline: { y: taglineY },
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

/** A single frame of pixels on disk, with the shape argv will have to declare. */
export type RawFrame = { path: string; width: number; height: number }

/** Both of the card's rasterised inputs: `MWA`'s ink, and the spark the type wears. */
export type CardSources = { mark: RawFrame; ramp: RawFrame }

/**
 * The card's two rasters, written into `dir` as raw RGBA for ffmpeg to read.
 *
 * Raw rather than encoded: encoding them would mean carrying an encoder for two images
 * that are identical on every render. They are written beside the masters and wiped
 * with them — both are derived from checked-in constants, so neither is ever something
 * to keep.
 *
 * The ramp is cut to the `FORGE` box exactly, because the spark ramps across `FORGE`
 * and nothing else (`CONTEXT.md`, "Spark"): a ramp the width of the whole lockup would
 * put blue under the `F` that belongs a third of the way in.
 */
export async function writeCardSources(dir: string): Promise<CardSources> {
  const { geometry } = cardLayout().lockup
  const forge = forgePixels(geometry)
  const mark = mwaRgba(Math.round(geometry.mwa.width))
  const ramp = sparkRgba(forge.width, forge.height)
  return {
    mark: await writeRaw(join(dir, 'mwa.rgba'), mark),
    ramp: await writeRaw(join(dir, 'spark.rgba'), ramp),
  }
}

async function writeRaw(path: string, frame: Frame): Promise<RawFrame> {
  await writeFile(path, frame.data)
  return { path, width: frame.width, height: frame.height }
}

/** A raster's input arguments — raw pixels carry no header, so the header is argv. */
export function rawFrameInput(frame: RawFrame): string[] {
  return [
    '-f', 'rawvideo',
    '-pixel_format', 'rgba',
    '-video_size', `${frame.width}x${frame.height}`,
    '-i', frame.path,
  ]
}

/**
 * The whole card, from a flat ground and two single frames to a drifting shot.
 *
 * Drawn first and scaled after, so the drift moves the card rather than its elements
 * moving against each other — lockup, type and rule are one object, and a zoom applied
 * per element would read as six things sliding apart.
 */
export function cardChains(
  cues: TextCue[],
  camera: Camera,
  ground: StreamLabel,
  mark: StreamLabel,
  ramp: StreamLabel,
  output: StreamLabel,
): string[] {
  const layout = cardLayout()
  const credit = cardCredit(cues)
  const locked = stream('lockup')
  const drawn = stream('drawn')
  return [
    // One thing, however many halves it is made of: `lockup.ts` owns the seam between
    // traced geometry and type, and this file places a mark (ADR-0010).
    ...lockupChains(layout.lockup.geometry, layout.lockup, ground, mark, ramp, locked),
    `${pad(locked)}${[
      drawLine(TAGLINE, 'tagline', layout.tagline.y, ffmpegColor(INK)),
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
 * credit too wide for the card, and the tagline and headline are constants a test
 * measures, so this centres a line known to fit. No alpha: the card arrives on the
 * reel's one crossfade and holds, so none of its lines has an envelope to ramp.
 */
function drawLine(
  content: string,
  role: 'tagline' | 'headline' | 'credit',
  y: number,
  colour: string,
): string {
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
