/**
 * How wide a line of copy actually draws, in frame pixels (#9, #24).
 *
 * The character budget in `COPY_BUDGETS` is #9's table and stays what it is, but a
 * character count is a proxy: 42 characters of "MMMM..." and 42 of "iiii..." are the
 * same number and nowhere near the same width, and only one of them fits. So the
 * budget catches copy that is too *long* and this catches copy that is too *wide* —
 * the second is the one the viewer sees, because type never shrinks to fit and
 * `drawtext` will happily run a hook off the side of the frame.
 *
 * Measured from the checked-in face rather than from a render, for the reason the
 * face is checked in at all: a `check` that has to shell out to ffmpeg — or worse,
 * reach the network — to answer "does this fit" has a failure mode with no upside.
 * The tables below are the ones freetype reads to lay the line out, so this is the
 * same arithmetic, done early.
 */

import { readFileSync } from 'node:fs'
import { FONT_FILE, SAFE_ZONE, TYPE } from './house.ts'

/** The roles with a size in `TYPE` — the ones drawn into the slot. */
export type TypeRole = keyof typeof TYPE

/**
 * What one glyph is worth to a layout, in font units.
 *
 * `advance` is what the pen moves; `xMin`/`xMax` are where the ink actually is. A
 * line's *width* is a sum of advances, but a line's *ink box* is neither — it starts
 * at the first glyph's `xMin` and ends at the last glyph's pen plus its `xMax`, and
 * for a lockup measured off an exported PNG the ink box is the thing that has to
 * match. Overflow needs the first number, the lockup needs the second.
 */
export type GlyphMetrics = {
  advance: number
  xMin: number
  xMax: number
  /** Vertical ink, off the baseline. `O`'s `yMax` is above the cap and its `yMin` is
   * below zero: a round letter overshoots a flat one at both ends, which is what makes
   * a line of type taller than its cap height. */
  yMin: number
  yMax: number
}

/**
 * A face reduced to the questions asked of it: how wide a line runs, how tall a
 * capital stands, and where one glyph's ink sits inside its own advance (#106).
 *
 * Advances only — no kerning, at any of them. Whether a pair is adjusted on the way to
 * the screen is not this file's question to answer: the face carries its adjustments in
 * `GPOS`, and whether they are applied depends on how the ffmpeg doing the drawing was
 * built — a `--enable-libharfbuzz` build shapes and a build without it does not. Either
 * way a pair adjustment draws a line slightly *narrower*, never wider, so an unkerned
 * sum is the honest upper bound under both, which is exactly what a copy-fits check
 * wants. The one pair that matters to the lockup is a brand constant in `lockup.ts`
 * rather than a lookup here — see `KERN_FO`, which says why.
 */
type Face = {
  unitsPerEm: number
  /** `OS/2.sCapHeight` — the flat-topped capital's height, in font units. */
  capHeight: number
  advanceOf: (codePoint: number) => number
  metricsOf: (codePoint: number) => GlyphMetrics
}

let face: Face | null = null

/** Parsed once. The file is checked in and cannot change under a running process. */
function loadedFace(): Face {
  if (!face) face = readFace(FONT_FILE)
  return face
}

function readFace(path: string): Face {
  const font = readFileSync(path)
  const tables = tableDirectory(font)
  const head = required(tables, 'head', path)
  const hhea = required(tables, 'hhea', path)
  const hmtx = required(tables, 'hmtx', path)
  const os2 = required(tables, 'OS/2', path)
  const glyf = required(tables, 'glyf', path)
  const loca = required(tables, 'loca', path)

  const unitsPerEm = font.readUInt16BE(head + 18)
  // Runs of glyphs at the end of `hmtx` share the last entry's advance, which is how
  // a monospaced tail is stored. Clamping the index is exactly that rule.
  const longMetrics = font.readUInt16BE(hhea + 34)
  const cmap = cmapLookup(font, required(tables, 'cmap', path), path)

  // `sCapHeight` only exists from version 2 of `OS/2`. Every face this repo will ever
  // load has it — the check is here so a face that does not says so rather than
  // reporting whatever bytes follow the table.
  if (font.readUInt16BE(os2) < 2) throw new Error(`${path} — OS/2 is too old for sCapHeight`)
  const capHeight = font.readInt16BE(os2 + 88)

  const bounds = glyphBounds(font, head, loca, glyf, path)

  const advanceOf = (codePoint: number) =>
    font.readUInt16BE(hmtx + Math.min(cmap(codePoint), longMetrics - 1) * 4)

  return {
    unitsPerEm,
    capHeight,
    advanceOf,
    metricsOf: (codePoint) => ({ advance: advanceOf(codePoint), ...bounds(cmap(codePoint)) }),
  }
}

/**
 * A glyph id to the extent of its outline, in font units.
 *
 * `loca` says where each glyph's outline starts and `glyf` opens every outline with
 * its own bounding box, so the ink extent is four bytes in and needs no curve walked.
 * A glyph with no outline — a space, `.notdef` in some faces — has a zero-length
 * `loca` entry, and zero ink is the honest answer for it.
 */
function glyphBounds(
  font: Buffer,
  head: number,
  loca: number,
  glyf: number,
  path: string,
): (glyph: number) => { xMin: number; xMax: number; yMin: number; yMax: number } {
  // Short `loca` stores halved offsets, which is what caps a short-form face at 128KB
  // of outlines. The format is the face's to declare, not ours to assume.
  const longForm = font.readInt16BE(head + 50) === 1
  if (!longForm && font.readInt16BE(head + 50) !== 0) {
    throw new Error(`${path} — indexToLocFormat is neither short nor long`)
  }
  const offsetAt = (index: number) =>
    longForm ? font.readUInt32BE(loca + index * 4) : font.readUInt16BE(loca + index * 2) * 2

  return (glyph) => {
    const start = offsetAt(glyph)
    if (offsetAt(glyph + 1) === start) return { xMin: 0, xMax: 0, yMin: 0, yMax: 0 }
    const outline = glyf + start
    return {
      xMin: font.readInt16BE(outline + 2),
      yMin: font.readInt16BE(outline + 4),
      xMax: font.readInt16BE(outline + 6),
      yMax: font.readInt16BE(outline + 8),
    }
  }
}

function tableDirectory(font: Buffer): Map<string, number> {
  const tables = new Map<string, number>()
  const count = font.readUInt16BE(4)
  for (let i = 0; i < count; i++) {
    const record = 12 + i * 16
    tables.set(font.toString('ascii', record, record + 4).trim(), font.readUInt32BE(record + 8))
  }
  return tables
}

function required(tables: Map<string, number>, tag: string, path: string): number {
  const offset = tables.get(tag)
  if (offset === undefined) throw new Error(`${path} has no '${tag}' table`)
  return offset
}

/**
 * Codepoint to glyph id, from the face's Unicode `cmap`.
 *
 * Format 4 only, which is the segmented BMP mapping every text face ships and the
 * only one this face has. Anything it does not cover — an astral codepoint, an emoji
 * pasted into a hook — maps to glyph 0, whose advance is `.notdef`'s. That is also
 * what the frame will show, so measuring it is measuring the truth.
 */
function cmapLookup(font: Buffer, cmap: number, path: string): (codePoint: number) => number {
  const subtable = unicodeSubtable(font, cmap)
  if (subtable === null || font.readUInt16BE(subtable) !== 4) {
    throw new Error(`${path} has no format 4 Unicode cmap`)
  }

  const segments = font.readUInt16BE(subtable + 6) / 2
  const ends = subtable + 14
  const starts = ends + segments * 2 + 2
  const deltas = starts + segments * 2
  const rangeOffsets = deltas + segments * 2

  return (codePoint) => {
    if (codePoint > 0xffff) return 0
    for (let segment = 0; segment < segments; segment++) {
      if (font.readUInt16BE(ends + segment * 2) < codePoint) continue
      const start = font.readUInt16BE(starts + segment * 2)
      if (start > codePoint) return 0

      const rangeOffset = font.readUInt16BE(rangeOffsets + segment * 2)
      // A zero range offset means the segment is a straight run: add the delta and
      // you have the glyph. Otherwise the offset points into a glyph id array that
      // begins where it was read from, which is why its own address is part of the sum.
      if (rangeOffset === 0) return (codePoint + font.readInt16BE(deltas + segment * 2)) & 0xffff
      const at = rangeOffsets + segment * 2 + rangeOffset + (codePoint - start) * 2
      const glyph = font.readUInt16BE(at)
      return glyph === 0 ? 0 : (glyph + font.readInt16BE(deltas + segment * 2)) & 0xffff
    }
    return 0
  }
}

/** The first Unicode subtable: platform 3/1 (Windows BMP) or platform 0 (Unicode). */
function unicodeSubtable(font: Buffer, cmap: number): number | null {
  const count = font.readUInt16BE(cmap + 2)
  for (let i = 0; i < count; i++) {
    const record = cmap + 4 + i * 8
    const platform = font.readUInt16BE(record)
    const encoding = font.readUInt16BE(record + 2)
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10))
    if (unicode) return cmap + font.readUInt32BE(record + 4)
  }
  return null
}

/** How wide one line draws at `fontSize`, in frame pixels. */
export function lineWidth(line: string, fontSize: number): number {
  const { unitsPerEm, advanceOf } = loadedFace()
  let units = 0
  // By codepoint, not by code unit: a surrogate pair is one glyph, not two.
  for (const character of line) units += advanceOf(character.codePointAt(0) as number)
  return Math.round((units * fontSize) / unitsPerEm)
}

/**
 * What one character is worth to a layout, in font units.
 *
 * Font units and not pixels, because the caller that wants this is placing a glyph
 * against a *ratio* — the lockup's proportions are brand facts that hold at any size
 * (ADR-0010), and a metric already divided by some particular font size cannot be
 * one of them. Divide by `capUnits()` for a figure in caps, or by `unitsPerEm()` for
 * one in ems, at the point where a pixel is finally wanted.
 */
export function glyphMetrics(character: string): GlyphMetrics {
  return loadedFace().metricsOf(character.codePointAt(0) as number)
}

/** The face's design grid — the denominator under every metric above. */
export function unitsPerEm(): number {
  return loadedFace().unitsPerEm
}

/**
 * The face's cap height in font units, which is the lockup's own unit.
 *
 * The lockup is measured in caps and not in ems because a cap is a thing on the page
 * that can be held against a ruler: the exported PNG has a cap height and no em box.
 * `capUnits() / unitsPerEm()` is the ratio that turns one into the other — 0.70 for
 * this face, which is why a cap of 154 is set at 220 pixels per em.
 */
export function capUnits(): number {
  return loadedFace().capHeight
}

/**
 * The width every line of copy is measured against.
 *
 * One number for the slot and the card both, because both are the boosted safe box's
 * own width (#9 §3) — there is no second budget to name, so the report names the box.
 */
const COPY_WIDTH = SAFE_ZONE.right - SAFE_ZONE.left

/**
 * Every line of `content` that draws wider than its box, named with what it costs.
 *
 * A list, not a first failure, for the reason `check` reports everything at once: a
 * hook whose two lines are both long is one rewrite, and finding that out one line
 * per run is two.
 */
export function overflowProblems(field: string, content: string, role: TypeRole): string[] {
  const { size } = TYPE[role]
  const lines = content.split('\n')
  const problems: string[] = []
  lines.forEach((line, index) => {
    const width = lineWidth(line, size)
    if (width <= COPY_WIDTH) return
    const where = lines.length > 1 ? `${field} line ${index + 1}` : field
    problems.push(`${where} draws ${width}px wide at ${size}px; the safe box is ${COPY_WIDTH}px`)
  })
  return problems
}
