/**
 * The MWA Forge house style (#9, #24) — frozen constants, one treatment, every reel.
 *
 * Nothing here is config and nothing here is scraped. #7 rejected a frozen hex palette
 * because a *client* restyle is outside our control; this palette is MWA Forge's own,
 * which is not. The client's brand reaches the viewer as site pixels — the overlay is
 * the author's voice, not the subject's — so a per-site override would be a second
 * voice on top of the first.
 */

import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FRAME_HEIGHT, FRAME_WIDTH } from './frame.ts'

/**
 * The display face, checked in beside the signature track and for the same reason: a
 * render that reaches the network to learn what it looks like has a failure mode with
 * no upside. Space Grotesk, SIL OFL 1.1 — see `assets/fonts/OFL.txt`.
 */
export const FONT_FILE = fileURLToPath(
  new URL('../assets/fonts/SpaceGrotesk-Bold.ttf', import.meta.url),
  // Forward slashes on Windows too: the path is handed to a filtergraph, where a
  // backslash is an escape before it is ever a separator.
).replaceAll('\\', '/')

/**
 * The MWA Forge mark, drawn for this repo and checked in beside the face — see
 * `assets/brand/PROVENANCE.md`. It is the card's one image, and it is never the
 * client's: the client reaches the viewer as site pixels and as a credit line.
 */
export const WORDMARK_FILE = fileURLToPath(
  new URL('../assets/brand/mwaforge-wordmark.svg', import.meta.url),
)

/**
 * The signature track, checked in beside the face and the mark and for the same
 * reason (ADR-0002): it is MWA Forge's, reused across the body of work, so it
 * travels with the renderer rather than with any site's config.
 */
export const SIGNATURE_TRACK_FILE = fileURLToPath(
  new URL('../audio/mwaforge-signature.mp3', import.meta.url),
)

/**
 * Where a reel's bed actually lives.
 *
 * No file named is the signature track, found beside the face and the mark wherever
 * the renderer is run from. A file the config *does* name is the human's, so it is
 * resolved from their cwd like every other path they write — including one that
 * spells out the signature track's own path, which from this repo is the same file.
 */
export function trackPath(file: string | undefined, root: string): string {
  if (file === undefined) return SIGNATURE_TRACK_FILE
  return isAbsolute(file) ? file : resolve(root, file)
}

/** #9's table. `SCRIM` is `GROUND`: the wash behind text is the card's ground. */
export const INK = '#eef1f6'
export const GROUND = '#0a0c10'
export const ACCENT = '#8b5cf6'

/**
 * The boosted safe zone — the box Meta's own UI leaves alone once the creative
 * carries an ad CTA (#9): top 14%, sides 6%, bottom 35%. Boosting is planned, so the
 * reel is designed to the boosted box and never has to be re-cut to be promoted. The
 * cost is vertical room this layout does not need.
 */
export const SAFE_ZONE = {
  /** 6% of 1080. */
  left: 65,
  right: FRAME_WIDTH - 65, // 1015
  /** 14% of 1920, rounded up to the round number #9 designs against. */
  top: 270,
  /** 35% of 1920 — the boosted figure, not the 20% organic one. */
  bottom: FRAME_HEIGHT - 672, // 1248
}

/**
 * Type sizes, fixed per role. Type never shrinks to fit — a reel whose type size
 * depends on how much Wyatt typed is a reel a viewer can feel is off without being
 * able to say why — so the size is chosen once against #9's budget and the copy is
 * what gives: overflow fails loudly at `check`.
 *
 * Space Grotesk Bold averages ~0.5em of advance, so a hook line at 76 runs about 25
 * characters across the slot's 950px. A label is secondary to the shot under it, so
 * it is set smaller than the hook rather than at the size its own budget would allow.
 */
export const TYPE = {
  hook: { size: 76, lineHeight: 92 },
  label: { size: 44, lineHeight: 56 },
  /** The card's own two roles (#9 §5). The headline is the largest type on a reel:
   * it is the only line the whole reel is asking the viewer to act on, and it sits on
   * a flat ground with nothing to compete with. The credit is set small on purpose —
   * it is attribution, not the subject of the card. */
  headline: { size: 96, lineHeight: 116 },
  credit: { size: 34, lineHeight: 44 },
}

/** The air between the copy's foot and the boosted bottom boundary. */
const SLOT_BREATH = 48
const SLOT_FOOT = SAFE_ZONE.bottom - SLOT_BREATH

/**
 * The one slot overlay text occupies — left-aligned in the *lower* band of the safe
 * zone, its foot a breath clear of the boosted bottom boundary (#60).
 *
 * Low, because that is where a Reels viewer is already looking: the caption rail, the
 * account name and the audio line all sit down there, so a line up in the top band is
 * a line read last or not at all. Clear of the boundary rather than on it, because
 * the boundary is where Meta's own UI starts and copy that touches it reads as
 * something the app drew.
 *
 * Two hook lines of leading tall, and text fills it top-down: the slot's head is where a
 * line starts whatever its role, so a one-line label and a two-line hook share a
 * first baseline instead of drifting against each other. There is deliberately no
 * per-beat override — a per-beat position is a hand-timed edit by another name (#7's
 * "no duration knobs"), and a slot that shifts between cuts reads as sloppy.
 */
export const TEXT_SLOT = {
  x: SAFE_ZONE.left, // 65
  /** A breath of air under the copy, so the boosted boundary is a margin, not an edge. */
  bottom: SLOT_FOOT, // 1200
  top: SLOT_FOOT - 2 * TYPE.hook.lineHeight, // 1016
  width: SAFE_ZONE.right - SAFE_ZONE.left, // 950
}

/** The **release**: the stretch above the text the wash takes to come up from nothing. */
const SCRIM_RELEASE = 240
const SCRIM_TOP = TEXT_SLOT.top - SCRIM_RELEASE

/**
 * The scrim's shape: released above the text band, at full density from the band's
 * head down to the foot of the frame.
 *
 * Anchored to the foot rather than the top (#60): the wash exists to hold up the text
 * and the text is at the bottom now, so the geometry inverts with it rather than
 * merely sliding. Below the band there is nothing to fade towards — the frame ends,
 * and the last 35% of it is under Meta's UI anyway — so the whole gradient is spent
 * *above* the copy, easing the site into the wash instead of stopping at a line.
 *
 * The cube is the same cube: it reaches density fast and spends its tail at the thin
 * end, which over a rising ramp means the wash is already solid where the first line
 * starts and the eye never finds the edge. It is a wash, not a plate: a hard edge
 * reads as a TV chyron and competes with the card.
 *
 * `peak`, `falloff` and `release` cite no finding, because there is none to cite: #9
 * fixes the scrim's colour and its gradient and stops there. The numbers were set by
 * eye, and the only pixels they have ever been read against are the fixture site's
 * own — `test/render.test.ts` decodes the band off a rendered fixture reel and asserts
 * the wash rides with its text, which is the shape and not these values. No client
 * capture (`sites/`) has been reviewed for them. A hero that reads through the wash,
 * or copy that goes muddy over one, is a reason to retune them here — and the retuning
 * is a finding, at which point this comment cites it instead.
 */
export const SCRIM = {
  /** Alpha at the foot of the frame. */
  peak: 0.9,
  /** The ramp's exponent — higher reaches density sooner and leaves a longer thin tail. */
  falloff: 3,
  /** Full width, from the release point down to the foot of the frame. */
  width: FRAME_WIDTH,
  /** Where the wash begins, at zero alpha: one release above the slot's head. */
  top: SCRIM_TOP, // 776
  height: FRAME_HEIGHT - SCRIM_TOP, // 1144
  /** The stretch the wash takes to go from nothing to `peak`, ending at the slot's head. */
  release: SCRIM_RELEASE,
}
