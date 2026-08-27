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
import { FONT_FILE, TEXT_SLOT, TYPE } from './house.ts'

/** The roles with a size in `TYPE` — the ones drawn into the slot. */
export type TypeRole = keyof typeof TYPE

/**
 * A face reduced to the one question asked of it: the advance of a codepoint.
 *
 * Advances only — no kerning. The face carries its pair adjustments in `GPOS` and
 * not in a legacy `kern` table, so freetype's own kerning lookup finds nothing and
 * `drawtext` lays the line out on bare advances. A shaper that *did* apply `GPOS`
 * would draw the line slightly narrower, never wider, so an unkerned sum stays the
 * honest upper bound either way.
 */
type Face = {
  unitsPerEm: number
  advanceOf: (codePoint: number) => number
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

  const unitsPerEm = font.readUInt16BE(head + 18)
  // Runs of glyphs at the end of `hmtx` share the last entry's advance, which is how
  // a monospaced tail is stored. Clamping the index is exactly that rule.
  const longMetrics = font.readUInt16BE(hhea + 34)
  const cmap = cmapLookup(font, required(tables, 'cmap', path), path)

  return {
    unitsPerEm,
    advanceOf: (codePoint) => {
      const glyph = cmap(codePoint)
      return font.readUInt16BE(hmtx + Math.min(glyph, longMetrics - 1) * 4)
    },
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

/** The box a line has to fit inside, named the way the report names it. */
export type Box = { name: string; width: number }

/** The one every overlay is drawn into. The card names its own (#9 §5). */
const SLOT: Box = { name: 'text slot', width: TEXT_SLOT.width }

/**
 * Every line of `content` that draws wider than its box, named with what it costs.
 *
 * A list, not a first failure, for the reason `check` reports everything at once: a
 * hook whose two lines are both long is one rewrite, and finding that out one line
 * per run is two.
 */
export function overflowProblems(
  field: string,
  content: string,
  role: TypeRole,
  box: Box = SLOT,
): string[] {
  const { size } = TYPE[role]
  const lines = content.split('\n')
  const problems: string[] = []
  lines.forEach((line, index) => {
    const width = lineWidth(line, size)
    if (width <= box.width) return
    const where = lines.length > 1 ? `${field} line ${index + 1}` : field
    problems.push(`${where} draws ${width}px wide at ${size}px; the ${box.name} is ${box.width}px`)
  })
  return problems
}
