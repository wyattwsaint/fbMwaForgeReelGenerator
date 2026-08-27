/**
 * The MWA Forge mark, from the checked-in SVG to pixels (#9 §5, #25).
 *
 * ffmpeg has no SVG decoder in any build this pipeline can count on — the one it is
 * developed against is compiled without librsvg — so the mark is rasterised here and
 * handed to the filtergraph as raw pixels. That is cheaper than it sounds: the mark is
 * four filled polygons, and a coverage rasteriser for polygons is smaller than the
 * argument for shipping a second copy of the mark as a PNG that could drift from the
 * SVG it was made from.
 *
 * The dialect read here is `viewBox` plus `<polygon points>` and nothing else, which
 * is the whole of what `assets/brand/mwaforge-wordmark.svg` uses. Anything richer —
 * a path, a transform, a fill — would be silently dropped, so it is refused instead:
 * a mark that renders half-drawn is worse than one that fails to render.
 */

import { readFileSync } from 'node:fs'
import { INK, WORDMARK_FILE, channels } from './house.ts'

/** A coverage mask: one byte of alpha a pixel, and no colour anywhere. */
export type Mask = { width: number; height: number; alpha: Uint8Array }

/** Sub-samples per axis. 4x4 is 17 levels of edge, which no viewer can see step. */
const SUPERSAMPLE = 4

type Polygon = [number, number][]
type Artwork = { width: number; height: number; polygons: Polygon[] }

let artwork: Artwork | null = null

/** Parsed once — the file is a repo constant and cannot change under a process. */
function loadedArtwork(): Artwork {
  if (!artwork) artwork = readArtwork(WORDMARK_FILE)
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

/** The mark's aspect, so a layout can ask how tall it draws without rasterising it. */
export function wordmarkHeight(width: number): number {
  const art = loadedArtwork()
  return Math.round((width * art.height) / art.width)
}

/**
 * The mark as coverage, at `width` frame pixels.
 *
 * Filled even-odd across the whole set, which is what gives the A its counter: the
 * letters are outlines and do not overlap each other, so the only place a point is
 * inside two polygons is the triangle inside the A, and there being inside twice is
 * being outside. A union fill would have no way to state a hole at all.
 */
export function wordmarkMask(width: number): Mask {
  const art = loadedArtwork()
  const height = wordmarkHeight(width)
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

/**
 * The mark as RGBA, inked in the house palette.
 *
 * Colour is applied here rather than carried in the SVG for the reason the palette is
 * frozen in `house.ts` at all: a mark with its own hex in it is a second palette, and
 * the first one to drift is the one nobody is looking at.
 */
export function wordmarkRgba(width: number): { data: Buffer; width: number; height: number } {
  const mask = wordmarkMask(width)
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
