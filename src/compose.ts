/**
 * ffmpeg (#11, #1). Every camera move is synthesised here from a static master:
 * sub-frames are rendered at a multiple of the frame rate and averaged back down,
 * which is the whole of the motion blur — no `frei0r`, no compositing engine.
 *
 * Each shot is rendered on its own, then the shots are concatenated on hard cuts, the
 * card is crossfaded in and the bed is laid under the lot. Shot files are debris on
 * purpose: a render that fails leaves the shots that did work behind to be looked at.
 */

import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { cameraFor, cardCamera, moveRamp } from './camera.ts'
import { cardChains, wordmarkInput, writeWordmark } from './card.ts'
import type { Camera, Ramp } from './camera.ts'
import { FRAME_HEIGHT, FRAME_WIDTH } from './frame.ts'
import { ffmpegColor, pad, rampFraction, stream, zoomStage } from './filtergraph.ts'
import { GROUND } from './house.ts'
import { drawnOverlays, overlayChains } from './overlay.ts'
import type { Master } from './capture.ts'
import { CROSSFADE_MS, FPS, frameCount, isLive } from './plan.ts'
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

/**
 * ffmpeg with its output read back as *bytes* rather than written to a file — one pass
 * whose answer is pixels rather than a picture (#91).
 *
 * The same launcher as `ffmpeg`, because it is the same tool asked the same way; only
 * the plumbing of stdout differs, and a string is exactly the wrong container for a
 * frame. The caller says what shape it asked for and reads it back on that promise:
 * this decodes nothing.
 *
 * No `-y`, unlike `ffmpeg`: the output is stdout, and there is no file here to be
 * asked about overwriting.
 */
export function ffmpegPixels(args: string[]): Promise<Buffer> {
  return runBytes('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', ...args])
}

async function run(bin: string, args: string[]): Promise<string> {
  return (await runBytes(bin, args)).toString()
}

function runBytes(bin: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true })
    const stdout: Buffer[] = []
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', (error) =>
      reject(new Error(`${bin} — ${error.message} (is it on PATH?)`)),
    )
    child.on('close', (code) =>
      code === 0
        ? resolve(Buffer.concat(stdout))
        : reject(new Error(`${bin} exited ${code}\n${stderr.trim()}`)),
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
  if (shot.kind === 'cta') return renderCard(shot, dir, cues)
  const output = shotPath(shot, dir)
  const frames = frameCount(shot.durationMs)

  const filter = master ? moveFilter(cameraFor(shot, master.size), isLive(shot)) : null
  await ffmpeg([
    ...(master ? ['-i', master.path] : ['-f', 'lavfi', '-i', groundSource()]),
    ...shotFilter(filter, shot, drawnOverlays(cues)),
    '-frames:v',
    String(frames),
    '-an',
    ...intermediateEncode(),
    output,
  ])
  return output
}

/**
 * The card (#9 §5, #25) — the one shot with no site pixels and no master.
 *
 * It is built rather than filmed: house ground, MWA Forge's mark, its headline, the
 * accent rule and the client's credit, all of it drifting. The client's domain
 * reaches it as `cta.credit` and nothing else does, which is the difference between
 * a credit and a card.
 */
async function renderCard(shot: Shot, dir: string, cues: TextCue[]): Promise<string> {
  const output = shotPath(shot, dir)
  const camera = cardCamera(shot)
  const mark = await writeWordmark(dir)
  const card = stream('card')
  const graph = cardChains(cues, camera, stream('0:v'), stream('1:v'), card).join(';')

  await ffmpeg([
    '-f', 'lavfi',
    '-i', groundSource(),
    ...wordmarkInput(mark),
    '-filter_complex', graph,
    '-map', pad(card),
    '-frames:v', String(camera.frames),
    '-an',
    ...intermediateEncode(),
    output,
  ])
  return output
}

function shotPath(shot: Shot, dir: string): string {
  return join(dir, `shot-${String(shot.startMs).padStart(6, '0')}-${shot.kind}.mp4`)
}

/** House ground, full frame — the card's ground and every shot's fallback. */
function groundSource(): string {
  return `color=c=${ffmpegColor(GROUND)}:s=${FRAME_WIDTH}x${FRAME_HEIGHT}:r=${FPS}`
}

/**
 * The shot's whole filtergraph — the move, then the overlay over it.
 *
 * A shot with no overlay stays a plain `-vf` chain, which is most of them: the scrim
 * needs a second source to blend, and a filtergraph that names its inputs for a shot
 * that has only one is a graph to read for no reason.
 */
function shotFilter(move: string | null, shot: Shot, cues: TextCue[]): string[] {
  const moved = stream('moved')
  const overlaid = stream('overlaid')
  const chains = overlayChains(cues, shot, move ? moved : stream('0:v'), overlaid)
  if (chains.length === 0) return move ? ['-vf', move] : []
  const graph = [...(move ? [`${pad(stream('0:v'))}${move}${pad(moved)}`] : []), ...chains].join(';')
  return ['-filter_complex', graph, '-map', pad(overlaid)]
}

/**
 * The encode every intermediate in the pipeline shares — near-lossless, so the one
 * real encode is the last. Exported because a live shot's recording is an intermediate
 * exactly like a shot file, and two encodes that had to match by hand would drift.
 */
export function intermediateEncode(): string[] {
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
 *
 * A live shot arrives as a recording instead, and a recording is already a stream: the
 * loop is *dropped* rather than reconfigured (#63). Nothing else in the chain changes,
 * because a live shot only ever breathes — 3% over 3.0s is well under a pixel a frame,
 * so its `samples` is 1 and there are no sub-frames to have stepped through.
 *
 * Exported for the tests: the crop offsets a move actually lands on are readable
 * straight out of the chain, which is how #51's staircase is measured without a render.
 */
export function moveFilter(camera: Camera, live = false): string {
  const { samples } = camera
  const subFps = FPS * samples

  const stages = [
    ...(live ? [] : [`loop=loop=-1:size=1:start=0`]),
    `setpts=N/${subFps}/TB`,
    ...moveStages(camera, moveRamp(camera)),
    ...(samples > 1
      ? [`tmix=frames=${samples}`, `select='not(mod(n+1,${samples}))'`]
      : []),
    `setpts=N/${FPS}/TB`,
  ]
  return stages.join(',')
}

function moveStages(camera: Camera, ramp: Ramp): string[] {
  const { window, from, to, zoom } = camera
  // `crop`'s x and y are expressions evaluated per sub-frame, which is the whole move.
  const crop = (x: string, y: string) =>
    `crop=w=${window.width}:h=${window.height}:x=${x}:y=${y}`

  if (zoom.from === zoom.to) {
    // A pan slides a fixed window, so the whole move is one crop expression. It is the
    // move with no zoom to it, which is what this asks — a drift ramps in one
    // direction or the other and never stands still (#52).
    const at = (a: number, b: number) =>
      a === b ? String(a) : `${a}+(${b - a})*${rampFraction(ramp, 'n')}`
    return [crop(at(from.x, to.x), at(from.y, to.y)), scaleToFrame()]
  }
  // A drift holds the window and zooms into it. Cropping first makes the zoom's input
  // the frame's own aspect, so nothing is stretched on the way out.
  return [
    crop(String(from.x), String(from.y)),
    zoomStage(zoom, ramp, { width: FRAME_WIDTH, height: FRAME_HEIGHT }, FPS * camera.samples),
  ]
}

function scaleToFrame(): string {
  return `scale=${FRAME_WIDTH}:${FRAME_HEIGHT}:flags=lanczos`
}

/**
 * Cut the shots together and encode #1's container.
 *
 * Hard cuts everywhere, and the card arrives on the one crossfade — which overlaps
 * the last beat, so it costs the reel 0.3s of runtime rather than adding any. `track`
 * is the bed the plan named, already resolved to a real file — the encode neither
 * looks it up nor asks anything about it (#8: no licence check anywhere in here).
 */
export async function assemble(
  shots: string[],
  timeline: Timeline,
  output: string,
  track: string,
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
    // Input seeking, so the decoder skips to the offset rather than decoding five
    // minutes of track to throw it away. Frame-granular on an mp3, so the bed lands
    // within a few tens of milliseconds — which is exact enough for something nothing
    // is timed to, and would not be if anything were.
    ...(timeline.audio.offsetMs > 0 ? ['-ss', seconds(timeline.audio.offsetMs)] : []),
    '-i', track,
    '-filter_complex', `${graph};${bedChain(timeline, `${audio}:a`)}`,
    '-map', '[v]',
    '-map', '[a]',
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

/**
 * The bed, trimmed and faded to the reel's own length (#8), as the chain that lands
 * on `[a]`.
 *
 * `apad` before `atrim` is what keeps the length the reel's rather than the track's:
 * a bed that runs out — a short file, or an offset near its end — is padded instead
 * of leaving the container short, so #8's "total duration is unchanged by the
 * presence of music" holds whatever file is handed in. The fade is the last thing, so
 * music ends *with* the reel rather than being cut off. None of it is timing: no
 * length here is derived from the track.
 */
function bedChain(timeline: Timeline, input: string): string {
  const durationMs = timeline.durationMs
  const fadeMs = Math.min(timeline.audio.fadeOutMs, durationMs)
  return (
    `[${input}]aresample=${AUDIO_SAMPLE_RATE},aformat=channel_layouts=stereo,apad,` +
    `atrim=duration=${seconds(durationMs)},asetpts=N/SR/TB,` +
    `afade=t=out:st=${seconds(durationMs - fadeMs)}:d=${seconds(fadeMs)}[a]`
  )
}

function seconds(ms: number): string {
  return (ms / 1000).toFixed(3)
}
