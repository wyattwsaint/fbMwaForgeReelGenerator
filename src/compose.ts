/**
 * ffmpeg (#11, #1). Every camera move is synthesised here from a static master:
 * sub-frames are rendered at a multiple of the frame rate and averaged back down,
 * which is the whole of the motion blur — no `frei0r`, no compositing engine.
 *
 * Each shot is rendered on its own, then the shots are concatenated on hard cuts and
 * the card is crossfaded in. Shot files are debris on purpose: a render that fails
 * leaves the shots that did work behind to be looked at.
 */

import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { cameraFor } from './camera.ts'
import type { Camera } from './camera.ts'
import { FRAME_HEIGHT, FRAME_WIDTH } from './frame.ts'
import { GROUND, ffmpegColor } from './house.ts'
import { overlayChains } from './overlay.ts'
import type { Master } from './capture.ts'
import { CROSSFADE_MS, FPS, frameCount } from './plan.ts'
import type { Shot, TextCue, Timeline } from './plan.ts'

/** #1's container, and #11 found no mud at this bitrate. */
const VIDEO_BITRATE = '3M'
const AUDIO_SAMPLE_RATE = 48_000

/** Shot files are intermediates — near-lossless, so the one real encode is the last. */
const INTERMEDIATE_CRF = 12

export async function ffmpeg(args: string[]): Promise<void> {
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args])
}

export async function ffprobe(args: string[]): Promise<string> {
  return run('ffprobe', ['-hide_banner', '-loglevel', 'error', ...args])
}

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', (error) =>
      reject(new Error(`${bin} — ${error.message} (is it on PATH?)`)),
    )
    child.on('close', (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(`${bin} exited ${code}\n${stderr.trim()}`)),
    )
  })
}

/**
 * Render one shot to its own file and return the path.
 *
 * The overlay is drawn *after* the move, because it does not move: the camera travels
 * under a line that is nailed to the frame (#9's fade-only rule), so the text meets a
 * shot that has already been cropped, blurred and scaled to frame size.
 */
export async function renderShot(
  master: Master | null,
  shot: Shot,
  dir: string,
  cues: TextCue[] = [],
): Promise<string> {
  const output = join(dir, `shot-${String(shot.startMs).padStart(6, '0')}-${shot.kind}.mp4`)
  const frames = frameCount(shot.durationMs)
  const input = master
    ? ['-i', master.path]
    : // The card carries no site pixels, so there is nothing to move: it is a flat
      // field of house ground until the CTA ticket draws on it.
      [
        '-f', 'lavfi',
        '-i', `color=c=${ffmpegColor(GROUND)}:s=${FRAME_WIDTH}x${FRAME_HEIGHT}:r=${FPS}`,
      ]
  const filter = master ? moveFilter(cameraFor(shot, master.size)) : null

  await ffmpeg([
    ...input,
    ...shotFilter(filter, shot, cues),
    '-frames:v',
    String(frames),
    '-an',
    ...intermediateEncode(),
    output,
  ])
  return output
}

/**
 * The shot's whole filtergraph — the move, then the overlay over it.
 *
 * A shot with no overlay stays a plain `-vf` chain, which is most of them: the scrim
 * needs a second source to blend, and a filtergraph that names its inputs for a shot
 * that has only one is a graph to read for no reason.
 */
function shotFilter(move: string | null, shot: Shot, cues: TextCue[]): string[] {
  const chains = overlayChains(cues, shot, move ? 'moved' : '0:v', 'overlaid')
  if (chains.length === 0) return move ? ['-vf', move] : []
  const graph = [...(move ? [`[0:v]${move}[moved]`] : []), ...chains].join(';')
  return ['-filter_complex', graph, '-map', '[overlaid]']
}

function intermediateEncode(): string[] {
  return [
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', String(INTERMEDIATE_CRF),
    '-pix_fmt', 'yuv420p',
    '-r', String(FPS),
    '-fps_mode', 'cfr',
  ]
}

/**
 * The move, as one filter chain.
 *
 * The master is looped in memory rather than re-decoded per frame, stepped at
 * `samples` times the frame rate, cropped (a pan) or cropped and zoomed (a drift) at
 * each sub-frame, and then averaged back down to the frame rate. The average *is* the
 * motion blur, which is why no sample-count knob exists to expose.
 */
function moveFilter(camera: Camera): string {
  const { samples, frames } = camera
  const subFrames = frames * samples
  const subFps = FPS * samples
  const last = Math.max(1, subFrames - 1)

  const stages = [
    `loop=loop=-1:size=1:start=0`,
    `setpts=N/${subFps}/TB`,
    ...moveStages(camera, last),
    ...(samples > 1
      ? [`tmix=frames=${samples}`, `select='not(mod(n+1,${samples}))'`]
      : []),
    `setpts=N/${FPS}/TB`,
  ]
  return stages.join(',')
}

function moveStages(camera: Camera, last: number): string[] {
  const { window, from, to, zoom } = camera
  // `crop`'s x and y are expressions evaluated per frame, which is the whole move.
  const crop = (x: string, y: string) =>
    `crop=w=${window.width}:h=${window.height}:x=${x}:y=${y}`

  if (zoom === 1) {
    // A pan slides a fixed window, so the whole move is one crop expression.
    const at = (a: number, b: number) => (a === b ? String(a) : `${a}+(${b - a})*n/${last}`)
    return [crop(at(from.x, to.x), at(from.y, to.y)), scaleToFrame()]
  }
  // A drift holds the window and zooms into it. Cropping first makes the zoom's input
  // the frame's own aspect, so nothing is stretched on the way out.
  return [
    crop(String(from.x), String(from.y)),
    `zoompan=z='1+${(zoom - 1).toFixed(6)}*on/${last}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
      `d=1:s=${FRAME_WIDTH}x${FRAME_HEIGHT}:fps=${FPS * camera.samples}`,
  ]
}

function scaleToFrame(): string {
  return `scale=${FRAME_WIDTH}:${FRAME_HEIGHT}:flags=lanczos`
}

/**
 * Cut the shots together and encode #1's container.
 *
 * Hard cuts everywhere, and the card arrives on the one crossfade — which overlaps
 * the last beat, so it costs the reel 0.3s of runtime rather than adding any. The
 * audio bed is silent in this ticket but real: #1 wants an AAC-LC 48kHz stereo stream
 * whether or not there is music, so the music ticket is a swap, not a new stream.
 */
export async function assemble(
  shots: string[],
  timeline: Timeline,
  output: string,
): Promise<void> {
  const body = shots.slice(0, -1)
  const card = shots.length - 1
  const bodyMs = timeline.shots
    .slice(0, -1)
    .reduce((total, shot) => total + shot.durationMs, 0)
  const audio = shots.length

  // `concat` and a demuxed shot disagree about time base, and `xfade` refuses a pair
  // that does not match — so both sides are put on one before they meet.
  const graph = [
    `${body.map((_, i) => `[${i}:v]`).join('')}concat=n=${body.length}:v=1:a=0,settb=AVTB[body]`,
    `[${card}:v]settb=AVTB[card]`,
    `[body][card]xfade=transition=fade:duration=${seconds(CROSSFADE_MS)}:` +
      `offset=${seconds(bodyMs - CROSSFADE_MS)}[v]`,
  ].join(';')

  await ffmpeg([
    ...shots.flatMap((path) => ['-i', path]),
    '-f', 'lavfi',
    '-i', `anullsrc=r=${AUDIO_SAMPLE_RATE}:cl=stereo`,
    '-filter_complex', graph,
    '-map', '[v]',
    '-map', `${audio}:a`,
    '-t', seconds(timeline.durationMs),
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-pix_fmt', 'yuv420p',
    '-r', String(timeline.fps),
    '-fps_mode', 'cfr',
    '-b:v', VIDEO_BITRATE,
    '-maxrate', VIDEO_BITRATE,
    '-bufsize', '6M',
    '-c:a', 'aac',
    '-profile:a', 'aac_low',
    '-ar', String(AUDIO_SAMPLE_RATE),
    '-ac', '2',
    '-b:a', '128k',
    '-movflags', '+faststart',
    output,
  ])
}

function seconds(ms: number): string {
  return (ms / 1000).toFixed(3)
}
