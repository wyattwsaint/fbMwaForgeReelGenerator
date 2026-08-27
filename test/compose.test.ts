import assert from 'node:assert/strict'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { assemble, ffmpeg } from '../src/compose.ts'
import { SIGNATURE_TRACK_FILE, trackPath } from '../src/house.ts'
import { AUDIO_FADE_OUT_MS, FPS } from '../src/plan.ts'
import type { Shot, Timeline } from '../src/plan.ts'
import { assertFadesOut, meanVolume, probe, workspace } from './helpers.ts'
import type { Workspace } from './helpers.ts'

/**
 * The bed, asserted on the mp4 rather than on the arguments that laid it down.
 *
 * A real render is a browser and four masters; the bed is none of that, so it is
 * exercised here against two flat-colour shots and a track built to be readable by
 * ear: silence for the first two seconds, then a steady tone. Where the reel is loud
 * says which second of the track it started on, which is the whole of `music.offset`.
 */
const TONE_STARTS_AT = 2
const SHOT_MS = 2000
const CROSSFADE_MS = 300
/** Two 2s shots, the second of which is the card arriving on the crossfade. */
const REEL_MS = SHOT_MS * 2 - CROSSFADE_MS

let ws: Workspace
let shots: string[]
let track: string

before(async () => {
  ws = await workspace()
  track = join(ws.root, 'track.mp3')
  await ffmpeg([
    '-f', 'lavfi',
    '-i', `anullsrc=r=48000:cl=mono:d=${TONE_STARTS_AT}`,
    '-f', 'lavfi',
    '-i', 'sine=f=440:r=48000:d=30',
    '-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1[track]',
    '-map', '[track]',
    '-c:a', 'libmp3lame',
    track,
  ])
  shots = []
  for (const [index, colour] of ['black', 'white'].entries()) {
    const path = join(ws.root, `shot-${index}.mp4`)
    await ffmpeg([
      '-f', 'lavfi',
      '-i', `color=c=${colour}:s=1080x1920:r=${FPS}`,
      '-frames:v', String((SHOT_MS * FPS) / 1000),
      '-an',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      path,
    ])
    shots.push(path)
  }
})

after(() => ws.dispose())

/** A two-shot reel whose bed starts `offsetMs` into the track. */
function timeline(offsetMs: number): Timeline {
  const shot = (startMs: number): Shot => ({
    kind: 'beat',
    index: 0,
    startMs,
    durationMs: SHOT_MS,
    move: 'drift',
    punchFactor: 1,
  })
  return {
    durationMs: REEL_MS,
    fps: FPS,
    shots: [shot(0), { ...shot(SHOT_MS - CROSSFADE_MS), kind: 'cta' }],
    cutPoints: [SHOT_MS - CROSSFADE_MS],
    text: [],
    audio: { file: 'track.mp3', offsetMs, fadeOutMs: AUDIO_FADE_OUT_MS },
  }
}

async function assembled(offsetMs: number, name: string): Promise<string> {
  const output = join(ws.root, `${name}.mp4`)
  await assemble(shots, timeline(offsetMs), output, track)
  return output
}

describe('the signature bed', () => {
  test('is a real AAC-LC 48kHz stereo stream, and the reel is no longer for it', async () => {
    const output = await assembled(0, 'plain')
    const audio = await probe(output, 'stream=codec_name,profile,sample_rate,channels', 'a:0')
    assert.match(audio.codec_name ?? '', /aac/)
    assert.equal(audio.profile, 'LC')
    assert.equal(audio.sample_rate, '48000')
    assert.equal(audio.channels, '2')
    // #8: timing does not move at all — the reel is exactly as long with music as without.
    const { duration } = await probe(output, 'format=duration')
    assert.equal(Number(duration).toFixed(1), (REEL_MS / 1000).toFixed(1))
  })

  test('starts where music.offset says, and nowhere else', async () => {
    // The track is silent until 2s. At offset 0 the reel opens on that silence; slide
    // the track two seconds and the same opening second is the tone.
    const opening = { start: 0, duration: 1 }
    assert.ok(
      (await meanVolume(await assembled(0, 'unoffset'), opening)) < -40,
      'the reel opens loud on a track that opens silent',
    )
    assert.ok(
      (await meanVolume(await assembled(TONE_STARTS_AT * 1000, 'offset'), opening)) > -30,
      'music.offset did not slide the track',
    )
  })

  test('fades out with the reel rather than being cut off', async () => {
    const output = await assembled(TONE_STARTS_AT * 1000, 'faded')
    await assertFadesOut(output, REEL_MS / 1000, AUDIO_FADE_OUT_MS / 1000)
  })

  test('runs to the reel’s end even when the track runs out first', async () => {
    // An offset near the end of the track leaves less music than reel. The bed is
    // padded rather than the container cut short, so #8's "total duration is
    // unchanged by the presence of music" holds for a bed that ran out.
    const output = await assembled(31_500, 'ranout')
    const { duration } = await probe(output, 'format=duration')
    assert.equal(Number(duration).toFixed(1), (REEL_MS / 1000).toFixed(1))
  })
})

describe('where a bed comes from', () => {
  test('is the signature track when the config says nothing about music', () => {
    // Beside the face and the mark, so it is found wherever `reel` is run from —
    // which is not necessarily beside the site config being rendered.
    assert.equal(trackPath(undefined, 'C:/somewhere/else'), SIGNATURE_TRACK_FILE)
  })

  test('is the human’s own file, from the directory they ran in', () => {
    // Including one that spells out the signature track's path: there is no name the
    // resolver treats as special, so what you write is what you get.
    assert.equal(trackPath('audio/other.mp3', ws.root), join(ws.root, 'audio', 'other.mp3'))
    assert.equal(trackPath(track, ws.root), track)
  })
})
