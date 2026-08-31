/**
 * The MWA Forge lockup, from two checked-in constants to pixels (#9 §5, #25, #106).
 *
 * The lockup is one thing and it is made two ways: `MWA` is drawn geometry, traced
 * from the exported asset and checked in as an SVG; `FORGE` is the house display face,
 * set as type at run time. That is an implementation seam and not a domain one
 * (ADR-0010) — a viewer sees one mark — so both halves are laid out here, against one
 * cap height, and the seam never reaches `card.ts`.
 *
 * Why type rather than a second trace: `FORGE` *is* the face, unmodified, and a trace
 * of it would be a copy of something already in the repo that could drift from it. Why
 * a trace rather than type for `MWA`: it is drawn art and no face has it.
 *
 * ffmpeg has no SVG decoder in any build this pipeline can count on — the one it is
 * developed against is compiled without librsvg — so `MWA` is rasterised here and
 * handed to the filtergraph as raw pixels. That is cheaper than it sounds: it is three
 * filled polygons, and a coverage rasteriser for polygons is smaller than the argument
 * for shipping a second copy of the mark as a PNG that could drift from the SVG it was
 * made from.
 *
 * The SVG dialect read here is `viewBox` plus `<polygon points>` and nothing else,
 * which is the whole of what `assets/brand/mwaforge-mwa.svg` uses. Anything richer —
 * a path, a transform, a fill — would be silently dropped, so it is refused instead:
 * a mark that renders half-drawn is worse than one that fails to render.
 */

import { readFileSync } from 'node:fs'
import { channels, drawText, pad, stream } from './filtergraph.ts'
import type { StreamLabel } from './filtergraph.ts'
import { FONT_FILE, INK, MWA_SVG_FILE, SPARK } from './house.ts'
import { capUnits, glyphMetrics, unitsPerEm } from './measure.ts'
import { FPS } from './plan.ts'

/** A coverage mask: one byte of alpha a pixel, and no colour anywhere. */
export type Mask = { width: number; height: number; alpha: Uint8Array }

/** Sub-samples per axis. 4x4 is 17 levels of edge, which no viewer can see step. */
const SUPERSAMPLE = 4

type Polygon = [number, number][]
type Artwork = { width: number; height: number; polygons: Polygon[] }

let artwork: Artwork | null = null

/** Parsed once — the file is a repo constant and cannot change under a process. */
function loadedArtwork(): Artwork {
  if (!artwork) artwork = readArtwork(MWA_SVG_FILE)
  return artwork
}

function readArtwork(path: string): Artwork {
  const svg = readFileSync(path, 'utf8')
  const box = /viewBox="([-\d.\s]+)"/.exec(svg)
  const numbers = box?.[1]?.trim().split(/\s+/).map(Number)
  if (!numbers || numbers.length !== 4 || numbers[0] !== 0 || numbers[1] !== 0) {
    throw new Error(`${path} — expected a viewBox anchored at 0 0`)
  }
  const polygons = [...svg.matchAll(/<polygon[^>]*points="([^"]+)"/g)].map(pointsOf)
  if (polygons.length === 0) throw new Error(`${path} — no <polygon> to draw`)

  // Everything this reader ignores, refused by name rather than dropped quietly.
  const drawn = svg.replace(/<polygon\b[^>]*>/g, '')
  const other = /<(path|circle|ellipse|rect|line|polyline|text|use|g)\b/.exec(drawn)
  if (other) throw new Error(`${path} — <${other[1]}> is outside this reader's dialect`)
  // A polygon's own attributes are dialect too, and the more dangerous half of it: a
  // `transform` or a `fill` reaches this reader as a shape it *can* draw, drawn in the
  // wrong place or not at all, where an unknown element at least looks like a hole.
  for (const tag of svg.match(/<polygon\b[^>]*>/g) ?? []) {
    const extra = /\s([\w-]+)\s*=/.exec(tag.replace(/\spoints\s*=\s*"[^"]*"/, ''))
    if (extra) throw new Error(`${path} — <polygon ${extra[1]}> is outside this reader's dialect`)
  }

  return { width: numbers[2] as number, height: numbers[3] as number, polygons }
}

function pointsOf(match: RegExpMatchArray): Polygon {
  return (match[1] as string)
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(',').map(Number)
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`bad point '${pair}'`)
      return [x, y] as [number, number]
    })
}

/** The `MWA` half's aspect, so a layout can ask its size without rasterising it. */
export function mwaHeight(width: number): number {
  const art = loadedArtwork()
  return Math.round((width * art.height) / art.width)
}

/**
 * `MWA` as coverage, at `width` frame pixels.
 *
 * Filled even-odd across the whole set, which is ADR-0003's dialect. There is nothing
 * for it to do here — the three letters are outlines and do not overlap — but it stays
 * the fill because it is the dialect, and because the `M`'s outline touches itself at
 * the point its four middle edges meet, which is a case a fill rule has to have an
 * answer to. Even-odd's answer and a union's agree there.
 */
export function mwaMask(width: number): Mask {
  const art = loadedArtwork()
  const height = mwaHeight(width)
  const scale = art.width / width
  const alpha = new Uint8Array(width * height)
  const step = 1 / SUPERSAMPLE
  const offset = step / 2

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hits = 0
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const px = (x + offset + sx * step) * scale
          const py = (y + offset + sy * step) * scale
          let crossings = 0
          for (const polygon of art.polygons) if (contains(polygon, px, py)) crossings++
          if (crossings % 2 === 1) hits++
        }
      }
      alpha[y * width + x] = Math.round((hits * 255) / (SUPERSAMPLE * SUPERSAMPLE))
    }
  }
  return { width, height, alpha }
}

/** The crossing-number test, which is a point-in-polygon test for any simple shape. */
function contains(polygon: Polygon, x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i] as [number, number]
    const [xj, yj] = polygon[j] as [number, number]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** One frame of RGBA, as the filtergraph takes it: raw pixels and their shape. */
export type Frame = { data: Buffer; width: number; height: number }

/**
 * `MWA` as RGBA, inked in the house palette.
 *
 * Colour is applied here rather than carried in the SVG for the reason the palette is
 * frozen in `house.ts` at all: a mark with its own hex in it is a second palette, and
 * the first one to drift is the one nobody is looking at.
 */
export function mwaRgba(width: number): Frame {
  const mask = mwaMask(width)
  const { r, g, b } = channels(INK)
  const data = Buffer.alloc(mask.width * mask.height * 4)
  for (let i = 0; i < mask.alpha.length; i++) {
    const at = i * 4
    data[at] = r
    data[at + 1] = g
    data[at + 2] = b
    data[at + 3] = mask.alpha[i] as number
  }
  return { data, width: mask.width, height: mask.height }
}

/**
 * `FORGE`'s letterspacing, in ems — a brand constant, and the reason the two halves
 * can be laid out against one another at all.
 *
 * 0.100 and not the design system's 0.14: reduced from the exported asset's five ink
 * positions, the four gaps come out at a flat 0.100em (ADR-0010). Where the design
 * system and the asset disagree, the asset wins, because the asset is what the gate
 * test diffs the render against.
 */
export const TRACKING = 0.1

/**
 * The one kern pair in `FORGE`, in font units.
 *
 * Fitting the tracking to the whole word gives 0.094em, which is not a brand number
 * and not what any gap is: it is 0.100em with this single `F`→`O` adjustment smeared
 * across all four gaps. The face carries it in `GPOS`, and it is a named constant here
 * rather than a lookup in `measure.ts` because one pair is not a shaping engine — and
 * because the glyphs are drawn one `drawtext` at a time, so nothing downstream is ever
 * in a position to apply it for us.
 */
export const KERN_FO = -6.5

/**
 * The air between `MWA` and `FORGE`, in cap heights.
 *
 * Of the cap and not of the em, because every proportion in the lockup is of the cap:
 * the exported asset has a cap height to measure against and no em box. Measured off
 * the asset, like the tracking.
 */
export const WORD_GAP = 0.48416

/** The letters of the lockup's typeset half, in order. */
const FORGE = [...'FORGE']

/** A box in the lockup's own coordinates: origin at the drawn box's top-left. */
export type Box = { x: number; y: number; width: number; height: number }

/**
 * The lockup at a given width, in frame pixels.
 *
 * Everything is solved from `width`, so there is no frozen offset table to keep in step
 * with the asset: the two halves' ratios-to-cap are read from the SVG's own viewBox and
 * from the face's own metrics, they sum with `WORD_GAP` to the whole lockup's
 * ratio-to-cap, and the cap height falls out of the division. Against the exported
 * asset that sum is 10.04903 where the measured lockup is 10.05000 — a thousandth of a
 * cap, or 0.15px at the asset's own size.
 */
export type LockupGeometry = {
  /** The cap height every proportion here is a multiple of. Not an integer: rounding it
   * would round the whole lockup, and the two halves have to agree to a pixel. */
  capHeight: number
  /** What `drawtext` is set at: the cap divided by the face's cap-to-em ratio. */
  fontSize: number
  width: number
  /** Taller than the cap: `O` and `G` overshoot a flat capital at both ends. */
  height: number
  mwa: Box
  forge: Box
  gap: number
  /** Where each of `FORGE`'s glyphs is drawn, in the *forge box's* own coordinates —
   * a pen origin and a baseline, which is what `drawtext` is given. */
  glyphs: { character: string; x: number }[]
  baseline: number
}

export function lockupGeometry(width: number): LockupGeometry {
  const art = loadedArtwork()
  const upm = unitsPerEm()
  const cap = capUnits()
  const forge = FORGE.map((character) => ({ character, ...glyphMetrics(character) }))
  const first = forge[0] as (typeof forge)[number]
  const last = forge[forge.length - 1] as (typeof forge)[number]

  // Pen positions, in font units, relative to `F`'s own origin: one advance and one
  // tracking a gap, plus the `F`→`O` kern once. The ink starts a left side bearing in
  // from the first pen and ends a right edge out from the last, which is why the word's
  // ink width is neither a sum of advances nor a sum of ink widths.
  const pens: number[] = []
  let pen = 0
  for (const [index, glyph] of forge.entries()) {
    pens.push(pen)
    pen += glyph.advance + TRACKING * upm + (index === 0 ? KERN_FO : 0)
  }
  const forgeInk = (pens[pens.length - 1] as number) + last.xMax - first.xMin

  // The lockup's three ratios-to-cap. `MWA`'s viewBox height *is* its cap height, so
  // the SVG's own aspect is its ratio directly.
  const mwaRatio = art.width / art.height
  const forgeRatio = forgeInk / cap
  const capHeight = width / (mwaRatio + WORD_GAP + forgeRatio)

  const toPixels = (units: number) => (units * capHeight) / cap
  // The drawn box is the type's, not the cap's: it opens at `O`'s overshoot above the
  // cap and closes at its overshoot below the baseline. `MWA` is exactly cap-tall, so
  // it sits that same overshoot down from the box's top.
  const ascent = Math.max(...forge.map((glyph) => glyph.yMax))
  const descent = Math.min(...forge.map((glyph) => glyph.yMin))
  const overshoot = toPixels(ascent - cap)

  const mwa = { x: 0, y: overshoot, width: mwaRatio * capHeight, height: capHeight }
  const gap = WORD_GAP * capHeight
  const forgeBox = {
    x: mwa.width + gap,
    y: 0,
    width: toPixels(forgeInk),
    height: toPixels(ascent - descent),
  }

  return {
    capHeight,
    fontSize: (capHeight * upm) / cap,
    width: forgeBox.x + forgeBox.width,
    height: forgeBox.height,
    mwa,
    forge: forgeBox,
    gap,
    // Relative to the forge box, whose left edge is `F`'s ink and not `F`'s pen.
    glyphs: forge.map((glyph, index) => ({
      character: glyph.character,
      x: toPixels((pens[index] as number) - first.xMin),
    })),
    baseline: toPixels(ascent),
  }
}

/**
 * The `FORGE` half's box in whole pixels.
 *
 * The ramp is allocated at this size, the mask is drawn at this size and the overlay
 * places a picture of this size, and `alphamerge` refuses the pair if any two of them
 * disagree — so the rounding happens once, here, rather than being repeated wherever a
 * caller happens to need it.
 */
export function forgePixels(geometry: LockupGeometry): { width: number; height: number } {
  return { width: Math.round(geometry.forge.width), height: Math.ceil(geometry.forge.height) }
}

/**
 * The whole lockup, laid onto a ground as filter chains.
 *
 * The seam is here rather than in `card.ts` (ADR-0010): one half arrives as rasterised
 * pixels and the other is set as type at run time, and a caller that had to know which
 * was which would be a caller maintaining half a lockup. `card.ts` hands over a ground,
 * the two rasters this module asked it to write, and where the lockup goes, and gets
 * back a ground with a mark on it.
 *
 * `at` is the drawn box's top-left in frame pixels. Everything else is the geometry's,
 * rounded to whole pixels here because `overlay` places whole pixels — a fractional
 * offset would be silently truncated and the two halves would part company.
 */
export function lockupChains(
  geometry: LockupGeometry,
  at: { x: number; y: number },
  ground: StreamLabel,
  mark: StreamLabel,
  ramp: StreamLabel,
  output: StreamLabel,
): string[] {
  const marked = stream('marked')
  const forge = stream('forge')
  const place = (box: Box) =>
    `overlay=x=${at.x + Math.round(box.x)}:y=${at.y + Math.round(box.y)}:shortest=1`
  return [
    // The raster is one frame and the card is seventy-five. Looped rather than re-read,
    // and given a frame rate as well as timestamps — `overlay` counts frames.
    `${pad(mark)}${asPicture()}${pad(stream('mark'))}`,
    `${pad(ground)}${pad(stream('mark'))}${place(geometry.mwa)}${pad(marked)}`,
    ...forgeChains(geometry, ramp, forge),
    `${pad(marked)}${pad(forge)}${place(geometry.forge)}${pad(output)}`,
  ]
}

/** A single raw frame, made into something a graph can overlay for a whole shot. */
function asPicture(): string {
  return `format=rgba,loop=loop=-1:size=1:start=0,fps=${FPS}`
}

/**
 * `FORGE`, as the spark wearing the shape of five letters.
 *
 * Five separate `drawtext`s rather than one, at pen positions solved from the face:
 * the lockup's letterspacing is a brand fact and `drawtext` has no letterspacing
 * option, so the only way to set the word at the right tracking is to place each glyph
 * where the geometry says it goes. It also puts the `F`→`O` kern in our hands, which is
 * where it has to be — see `KERN_FO`.
 *
 * The mask is drawn white on black and handed to `alphamerge` as *luma*, not as an
 * alpha channel, which is what that filter reads: the ramp is the picture and the type
 * is its transparency. Drawn into a box of its own rather than onto the card, so the
 * ramp can be the size of the word instead of the size of the frame.
 */
function forgeChains(
  geometry: LockupGeometry,
  ramp: StreamLabel,
  output: StreamLabel,
): string[] {
  const { width, height } = forgePixels(geometry)
  const looped = stream('ramp')
  const mask = stream('mask')
  return [
    `${pad(ramp)}${asPicture()}${pad(looped)}`,
    `color=c=black:s=${width}x${height}:r=${FPS},${geometry.glyphs
      .map((glyph) =>
        drawText({
          content: glyph.character,
          fontFile: FONT_FILE,
          size: geometry.fontSize,
          // White, because this is a mask and not type: the colour it ends up is the
          // ramp's, and a mask drawn in `INK` would dim the spark by INK's own luma.
          colour: 'white',
          x: String(Math.round(glyph.x)),
          y: Math.round(geometry.baseline),
          yAlign: 'baseline',
        }),
      )
      .join(',')},format=gray${pad(mask)}`,
    `${pad(looped)}${pad(mask)}alphamerge${pad(output)}`,
  ]
}

/**
 * The **spark** as one frame of RGBA: the brand gradient, left to right, at the size
 * of the box it will be ramped through.
 *
 * A buffer rather than an ffmpeg gradient source, for the reason `MWA` is a buffer: the
 * `gradients` filter interpolates in ffmpeg's own space and with its own stop rules,
 * and a brand gradient that looks slightly different from the exported asset because a
 * filter rounded a stop differently is a bug nobody will find by reading the graph.
 * Here the stops are the ones in `house.ts` and the interpolation is the obvious one.
 *
 * Opaque, and flat down every column: it is a colour supply, and the shape it takes is
 * the glyph mask's, applied by `alphamerge` in the graph.
 */
export function sparkRgba(width: number, height: number): Frame {
  const data = Buffer.alloc(width * height * 4)
  const row = Buffer.alloc(width * 4)
  for (let x = 0; x < width; x++) {
    // Pixel centres, so the two end stops land on the ramp's ends rather than half a
    // pixel inside them — the same convention the rasteriser above samples on.
    const { r, g, b } = sparkAt(width === 1 ? 0 : (x + 0.5) / width)
    row[x * 4] = r
    row[x * 4 + 1] = g
    row[x * 4 + 2] = b
    row[x * 4 + 3] = 255
  }
  for (let y = 0; y < height; y++) row.copy(data, y * width * 4)
  return { data, width, height }
}

/** The table in channels rather than hex — the same stops, asked the way a ramp asks. */
const STOPS = SPARK.map((stop) => ({ ...channels(stop.color), at: stop.at }))

/** The spark's colour at a fraction across it, interpolated between its two nearest stops. */
function sparkAt(fraction: number): { r: number; g: number; b: number } {
  const stops = STOPS
  const first = stops[0] as (typeof stops)[number]
  const last = stops[stops.length - 1] as (typeof stops)[number]
  if (fraction <= first.at) return first
  for (let i = 1; i < stops.length; i++) {
    const from = stops[i - 1] as (typeof stops)[number]
    const to = stops[i] as (typeof stops)[number]
    if (fraction > to.at) continue
    const t = (fraction - from.at) / (to.at - from.at)
    return {
      r: Math.round(from.r + (to.r - from.r) * t),
      g: Math.round(from.g + (to.g - from.g) * t),
      b: Math.round(from.b + (to.b - from.b) * t),
    }
  }
  return last
}
