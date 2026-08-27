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
 * The one slot overlay text occupies — left-aligned in the upper band of the safe
 * zone. There is deliberately no per-beat override: a per-beat position is a
 * hand-timed edit by another name (#7's "no duration knobs"), and a slot that shifts
 * between cuts reads as sloppy.
 */
export const TEXT_SLOT = {
  x: SAFE_ZONE.left, // 65
  top: SAFE_ZONE.top, // 270
  bottom: 620,
  width: SAFE_ZONE.right - SAFE_ZONE.left, // 950
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

/**
 * The scrim's shape: opaque at the top of the frame, gone at the text band's foot.
 *
 * The cube keeps it dense across the text and spends the fade in the band's last
 * stretch, where there is nothing to keep legible — a straight ramp is thinnest
 * exactly where a two-line hook's second line sits. It is a wash, not a plate: a hard
 * edge reads as a TV chyron and competes with the card.
 */
export const SCRIM = {
  /** Alpha at the top of the frame. */
  peak: 0.9,
  /** The ramp's exponent — higher holds the wash longer before it lets go. */
  falloff: 3,
  /** Full width, from the top of the frame down to the slot's foot. */
  width: FRAME_WIDTH,
  height: TEXT_SLOT.bottom,
}

/** `#rrggbb` as the three channel values an ffmpeg expression can be handed. */
export function channels(hex: string): { r: number; g: number; b: number } {
  const at = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16)
  return { r: at(1), g: at(3), b: at(5) }
}

/** `#rrggbb` as ffmpeg's own colour literal. */
export function ffmpegColor(hex: string): string {
  return `0x${hex.slice(1)}`
}
