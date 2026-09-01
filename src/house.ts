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
 * The `MWA` half of the lockup, drawn for this repo and checked in beside the face —
 * see `assets/brand/PROVENANCE.md`. The lockup is the card's one image, and it is
 * never the client's: the client reaches the viewer as site pixels and as a credit.
 *
 * Half, because the lockup's two halves are made differently: `MWA` is drawn geometry
 * and `FORGE` is the display face above, set as type (ADR-0010). That is an
 * implementation seam and not a domain one — there is no "MWA" in the glossary, only
 * a lockup — which is why the constant is named for the file it points at rather than
 * for a thing the brand has.
 */
export const MWA_SVG_FILE = fileURLToPath(
  new URL('../assets/brand/mwaforge-mwa.svg', import.meta.url),
)

/**
 * The exported lockup, whole, at 6680x1440 — the source of truth, not a source of
 * pixels. No reel ever draws it: the gate test renders the composed lockup through
 * the real filtergraph and diffs the result against this file, so the brand facts
 * in `src/` have something that can contradict them.
 */
export const LOCKUP_PNG_FILE = fileURLToPath(
  new URL('../assets/brand/mwaforge-lockup.png', import.meta.url),
)

/**
 * The signature track, checked in beside the face and the mark and for the same
 * reason (ADR-0002): it is MWA Forge's, reused across the body of work, so it
 * travels with the renderer rather than with any site's config.
 */
export const SIGNATURE_TRACK_FILE = fileURLToPath(
  new URL('../audio/quiet-confidence.mp3', import.meta.url),
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
 * The **spark** — MWA Forge's brand gradient, and the only gradient in a reel: blue
 * to purple to pink, left to right, ramping across `FORGE` and nothing else.
 *
 * `ACCENT` stays a flat colour and is the middle stop here rather than a second
 * purple, which is the whole of why the two live next to each other: two gradients on
 * a 2.5s card is one too many, and two purples that were meant to be the same purple
 * is worse.
 *
 * The middle stop sits at 55% and not at half. Blue-to-purple is a shorter trip for
 * the eye than purple-to-pink, so a centred stop reads as pink arriving early; the
 * extra 5% spends the ramp where the change is actually visible. Set by eye, like the
 * scrim's numbers, and against the exported lockup.
 */
export const SPARK = [
  { color: '#3b82f6', at: 0 },
  { color: ACCENT, at: 0.55 },
  { color: '#ec4899', at: 1 },
] as const

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
  /** A label is set at the hook's size, not under it. The scale used to step down
   * here on the reading that a hook is the reel's claim and a label is a caption on
   * someone else's page. That is the wrong picture of who is watching: a reel is
   * silent, plays at thumb size in a feed, and a beat's line is the only thing in
   * those 3.5 seconds that says what the shot is *for*. A caption the viewer has to
   * lean in for is a caption they skip, and the beat then reads as a pretty
   * scroll-past. So there is one voice across the reel and it is one size. */
  label: { size: 76, lineHeight: 92 },
  /** The card's own three roles (#9 §5, #61). The headline is the largest type on a
   * reel: it is the only line the whole reel is asking the viewer to act on, and it
   * sits on a flat ground with nothing to compete with. The credit is set small on
   * purpose — it is attribution, not the subject of the card.
   *
   * The tagline falls between them, and has a role of its own rather than borrowing
   * the credit's: it is not attribution, it is what MWA Forge sells, said in words
   * next to the mark for the viewer who catches only the last two seconds. Set below
   * the headline because it explains the offer rather than making the ask, and above
   * the credit because it is the card's own voice rather than a footnote. */
  tagline: { size: 48, lineHeight: 60 },
  headline: { size: 96, lineHeight: 116 },
  credit: { size: 34, lineHeight: 44 },
}

/**
 * The legibility floor under **fit** (#66): the smallest fraction of its own size the
 * client's page may be drawn at in the frame.
 *
 * Here rather than with the capture geometry because it is the same doctrine as the
 * table above, read from the other end. Type never shrinks to fit, and a fit beat
 * shrinks the site's *whole* type — the section's own body copy included — so past
 * some scale a fit section is a section nobody can read. Half is that scale: a site's
 * 16px body copy draws at 8px in a 1080-wide frame, far under anything the table above
 * sets, and past it the copy is a texture rather than a line.
 *
 * One number, chosen once, and by eye like the scrim's: no finding fixes it. What it
 * buys is that the failure is loud — a beat that would cross it is fit to width and
 * panned instead, and `check` says so by name rather than letting a human find an
 * unreadable section in the render.
 */
export const MIN_FIT_SCALE = 0.5

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
/** The **fall**: the stretch below the copy the wash takes to go back to nothing. */
const SCRIM_FALL = 160
const SCRIM_TOP = TEXT_SLOT.top - SCRIM_RELEASE
const SCRIM_FOOT = TEXT_SLOT.bottom + SCRIM_FALL

/**
 * The scrim's shape: released above the text band, at full density across the band,
 * and fallen back to nothing a breath below the copy's foot.
 *
 * Anchored to the copy at both ends (#60, as amended): the wash exists to hold up the
 * text, so it is as tall as the text needs and no taller. It used to run to the foot
 * of the frame on the argument that there was nothing below the band to fade towards —
 * the last 35% being under Meta's UI once the reel is boosted. That is true of a
 * boosted reel and false of an organic one, where it spent ~720px of frame washing out
 * the client's own site to hold up nothing. The site is the thing the reel is selling;
 * it gets those pixels back.
 *
 * What the foot anchor was really buying was the absence of a bottom edge, and a hard
 * edge reads as a TV chyron and competes with the card. So the wash does not stop
 * below the copy, it *falls* — the same cube, mirrored. Shorter than the release
 * because the eye is not being led into anything down there: it is being let go.
 *
 * The cube is the same cube: it reaches density fast and spends its tail at the thin
 * end, which over a rising ramp means the wash is already solid where the first line
 * starts and the eye never finds the edge. Mirrored under the copy, the same shape
 * holds density through the last line and spends its thin tail at the foot.
 *
 * `peak`, `falloff`, `release` and `fall` cite no finding, because there is none to
 * cite: #9 fixes the scrim's colour and its gradient and stops there. The numbers were
 * set by eye, and the only pixels they have ever been read against are the fixture
 * site's own — `test/render.test.ts` decodes the band off a rendered fixture reel and
 * asserts the wash rides with its text, which is the shape and not these values. No
 * client capture (`sites/`) has been reviewed for them. A hero that reads through the
 * wash, or copy that goes muddy over one, is a reason to retune them here — and the
 * retuning is a finding, at which point this comment cites it instead.
 */
export const SCRIM = {
  /** Alpha across the text band, between the release and the fall. */
  peak: 0.9,
  /** The ramp's exponent — higher reaches density sooner and leaves a longer thin tail. */
  falloff: 3,
  /** Full width: the wash is bounded vertically, never horizontally. */
  width: FRAME_WIDTH,
  /** Where the wash begins, at zero alpha: one release above the slot's head. */
  top: SCRIM_TOP, // 776
  /** How tall it is: from the release point down to the fall's end. */
  height: SCRIM_FOOT - SCRIM_TOP, // 584
  /** The stretch the wash takes to go from nothing to `peak`, ending at the slot's head. */
  release: SCRIM_RELEASE,
  /** The stretch it takes to go back to nothing, starting at the slot's foot. */
  fall: SCRIM_FALL,
  /**
   * Where the fall begins, in the wash's *own* coordinates rather than the frame's.
   *
   * Named here rather than derived at the filter, because the wash's geometry is this
   * object's to own: `overlay` writes a gradient against it and should no more compute
   * this than it computes `top`. It is the slot's foot, seen from the wash's head.
   */
  fallTop: SCRIM_FOOT - SCRIM_FALL - SCRIM_TOP, // 424
}
