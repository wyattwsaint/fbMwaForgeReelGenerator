/**
 * Review stills (#18, #27) — the two jpgs emitted beside every scratch render.
 *
 * A 17.2s 9:16 mp4 is awkward to judge on a desktop, and the two things that actually
 * go wrong are both stills: frame 0, the title card Facebook shows in-feed,
 * and the cuts, which are only ever looked at one frame at a time. So the reel is
 * re-read for those frames rather than a second render being asked to produce them —
 * a still derived from anything but the mp4 is a still that can disagree with it.
 *
 * They are scratch, like the render they describe: they stay in `out/`, they are never
 * promoted, and neither has a life after the judgment. Handing them to a human to look
 * at is the CLI's business, not theirs.
 */

import { join } from 'node:path'
import { ffmpeg } from './compose.ts'
import { FRAME_HEIGHT, FRAME_WIDTH } from './frame.ts'
import { ffmpegColor } from './filtergraph.ts'
import { GROUND } from './house.ts'
import { CROSSFADE_MS, frameCount } from './plan.ts'
import type { Timeline } from './plan.ts'

/** JPEG quality, ffmpeg's scale — 2 is its top notch short of lossless. */
const STILL_QUALITY = 2

/** A quarter of the frame's width, so a sheet of 5-7 tiles fits a desktop window. */
const TILE_WIDTH = 270

/** One contact-sheet tile, in output pixels — the frame's own aspect, scaled down. */
export const SHEET_TILE = {
  width: TILE_WIDTH,
  height: Math.round((TILE_WIDTH * FRAME_HEIGHT) / FRAME_WIDTH),
  gap: 8,
}

/**
 * How big a sheet of `tiles` comes out — one row, a gap between each and the same gap
 * round the outside. Exported because the geometry is the sheet's, not `tile`'s, and
 * something that reads a sheet back has to agree with what wrote it.
 */
export function sheetSize(tiles: number): [number, number] {
  const { width, height, gap } = SHEET_TILE
  return [tiles * width + (tiles + 1) * gap, height + 2 * gap]
}

/**
 * The frame each contact-sheet tile is taken from — one per shot, so n+3 of them.
 *
 * A tile per *cut point* and a tile per *shot* are the same n+2 frames plus frame 0,
 * because every shot but the title begins on one. The card is the exception: its cut
 * point is where its crossfade *starts*, and a tile of a card a tenth of the way in
 * shows neither the beat it is leaving nor the card itself, so it is taken from the
 * first frame the card is alone on screen.
 */
export function tileFrames(timeline: Timeline): number[] {
  return timeline.shots.map((shot) =>
    frameCount(shot.kind === 'cta' ? shot.startMs + CROSSFADE_MS : shot.startMs),
  )
}

/**
 * Write `<slug>-frame0.jpg` and `<slug>-sheet.jpg` beside the reel, and return them
 * in the order they are worth looking at.
 */
export async function reviewStills(
  reelPath: string,
  dir: string,
  slug: string,
  timeline: Timeline,
): Promise<string[]> {
  const frame0 = join(dir, `${slug}-frame0.jpg`)
  const sheet = join(dir, `${slug}-sheet.jpg`)
  await writeFrame0(reelPath, frame0)
  await writeSheet(reelPath, sheet, tileFrames(timeline))
  return [frame0, sheet]
}

/**
 * Frame 0, straight off the front of the file.
 *
 * No `select`, no seek: the first frame the decoder hands over *is* frame 0, and the
 * hook is drawn on it at full alpha (#9), which is the constraint this still exists
 * to let someone check.
 */
async function writeFrame0(reelPath: string, output: string): Promise<void> {
  await ffmpeg(['-i', reelPath, '-frames:v', '1', '-q:v', String(STILL_QUALITY), output])
}

/**
 * The contact sheet — one row, in reel order, so it reads as the cut it describes.
 *
 * One pass over the file: the wanted frames are selected out of the decode, scaled to
 * tile size and laid out by `tile`, rather than seeking the file once per tile.
 */
async function writeSheet(reelPath: string, output: string, frames: number[]): Promise<void> {
  // Escaped, because the comma inside `eq(n,0)` would otherwise end the filter.
  const select = frames.map((at) => `eq(n\\,${at})`).join('+')
  const { width, height, gap } = SHEET_TILE
  await ffmpeg([
    '-i', reelPath,
    '-vf',
      `select='${select}',scale=${width}:${height},` +
      `tile=layout=${frames.length}x1:margin=${gap}:padding=${gap}:` +
      `color=${ffmpegColor(GROUND)}`,
    // `select` drops most of the stream, and the timestamps it keeps are the reel's.
    // Passthrough stops those being read as a frame rate to re-time the tiles to.
    '-fps_mode', 'passthrough',
    '-frames:v', '1',
    '-q:v', String(STILL_QUALITY),
    output,
  ])
}
