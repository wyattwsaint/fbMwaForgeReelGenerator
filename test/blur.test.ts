import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { masterSize } from '../src/camera.ts'
import type { MasterSize } from '../src/camera.ts'
import { ffmpeg, renderShot } from '../src/compose.ts'
import { frameCount } from '../src/plan.ts'
import type { Shot } from '../src/plan.ts'
import { acutance, frame, workspace } from './helpers.ts'
import type { Workspace } from './helpers.ts'

/**
 * The blur, on the pixels (#11, #23).
 *
 * `camera.test.ts` asserts the sample count is derived and capped; this asks the
 * second, harder half — whether the samples are actually averaged into the frame.
 * The subject is a hard-edged stripe pattern, because a smear is only measurable
 * against an edge: the same master, the same punch, the same duration, moved fast
 * one way and slowly the other, and the fast one comes out softer.
 */
const STRIPE_PX = 8
/** Punched enough that a lateral pan has room to run at #12's full pace. */
const PUNCH = 2
const SECTION_HEIGHT = 1200
const SHOT_MS = 3500

let ws: Workspace
let master: string
let size: MasterSize

/**
 * The same shot twice over, told apart only by its move: a lateral pan, which is the
 * fast one, and a drift, which is the slow one. A drift takes no direction.
 */
function stripes(move: Shot['move']): Shot {
  return {
    kind: 'beat',
    index: 0,
    // Distinct, because a shot's file is named after where it starts: two shots at
    // the same millisecond would render over each other.
    startMs: move === 'pan' ? 0 : SHOT_MS,
    durationMs: SHOT_MS,
    move,
    ...(move === 'pan' ? { direction: 'lateral' as const } : {}),
    punchFactor: PUNCH,
    source: { url: 'https://example.test/', selector: '#stripes' },
  }
}

before(async () => {
  ws = await workspace()
  size = masterSize(stripes('pan'), SECTION_HEIGHT)

  // A master built rather than photographed: vertical stripes at a known period, so
  // a lateral move of PAN_PX_PER_FRAME smears nearly a whole stripe into each frame.
  const raw = join(ws.root, 'stripes.rgb')
  const row = Buffer.alloc(size.width * 3)
  for (let x = 0; x < size.width; x++) {
    const value = Math.floor(x / STRIPE_PX) % 2 === 0 ? 0 : 255
    row.fill(value, x * 3, x * 3 + 3)
  }
  await writeFile(raw, Buffer.concat(Array.from({ length: size.height }, () => row)))

  master = join(ws.root, 'stripes.png')
  await ffmpeg([
    '-f', 'rawvideo',
    '-pix_fmt', 'rgb24',
    '-s', `${size.width}x${size.height}`,
    '-i', raw,
    '-frames:v', '1',
    master,
  ])
})

after(() => ws.dispose())

/** One frame from the middle of a shot rendered off the stripe master. */
async function midFrame(shot: Shot): Promise<Buffer> {
  const path = await renderShot({ shot, path: master, size }, shot, ws.root)
  return frame(path, Math.floor(frameCount(SHOT_MS) / 2))
}

describe('motion blur', () => {
  test('a fast move comes out softer than a slow one over the same master', async () => {
    // The pan crosses 7px a frame — most of a stripe — and is averaged from 7
    // sub-frames. The drift's fastest pixel travels about one px a frame and is
    // averaged from 2. Nothing but the move differs, so the edges do the telling.
    const panned = acutance(await midFrame(stripes('pan')))
    const drifted = acutance(await midFrame(stripes('drift')))

    assert.ok(drifted > 20, `the stripes never reached the drift (${drifted.toFixed(2)})`)
    assert.ok(
      panned < drifted / 2,
      `the fast pan is not measurably softer: ${panned.toFixed(2)} vs ${drifted.toFixed(2)}`,
    )
  })
})
