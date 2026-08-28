import assert from 'node:assert/strict'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { masterSize } from '../src/camera.ts'
import { capturePlan, trimRecording } from '../src/capture.ts'
import { ffmpeg } from '../src/compose.ts'
import { FRAME_HEIGHT, FRAME_WIDTH } from '../src/frame.ts'
import { frameCount, planReel } from '../src/plan.ts'
import type { Shot } from '../src/plan.ts'
import type { Beat, SiteConfig } from '../src/site.ts'
import { probe, withWorkspace } from './helpers.ts'

/**
 * The capture plan is the one part of the capture pass that needs no browser, so
 * this is what makes "which page loads at which resolution" assertable as data.
 */

function config(beats: Beat[]): SiteConfig {
  return {
    url: 'https://example.test/',
    hook: { text: 'Spotless, every time.' },
    beats,
    cta: { credit: 'example.test' },
  }
}

/** The same three beats, with the hook recorded from the running page instead (#63). */
function ambient(): SiteConfig {
  const site = config([beat(), beat(), beat()])
  return { ...site, hook: { ...site.hook, motion: 'ambient' } }
}

/** Drifting beats, so nothing but an explicit `punchFactor` moves the punch. */
function beat(overrides: Partial<Beat> = {}): Beat {
  return { selector: '#s', move: 'drift', ...overrides }
}

function planFor(beats: Beat[]) {
  const site = config(beats)
  return capturePlan(site, planReel(site))
}

type Group = ReturnType<typeof capturePlan>[number]

/** Which shots a group serves, named the way `capture` names their master files. */
function shotNames(group: Group): string[] {
  return group.shots.map((shot) => (shot.kind === 'beat' ? `beat-${shot.index}` : shot.kind))
}

/** The one group a single-load plan has. */
function only(groups: Group[]): Group {
  assert.equal(groups.length, 1)
  return groups[0]!
}

describe('capturePlan', () => {
  test('beats on one page at one punch share a load, named with its viewport and scale', () => {
    const group = only(planFor([beat(), beat(), beat()]))
    assert.equal(group.url, 'https://example.test/')
    assert.deepEqual(group.viewport, { width: FRAME_WIDTH, height: FRAME_HEIGHT })
    assert.equal(group.scale, 1)
    assert.deepEqual(shotNames(group), ['hook', 'beat-0', 'beat-1', 'beat-2'])
  })

  test('two punch factors on one page are two loads', () => {
    const groups = planFor([beat(), beat({ punchFactor: 1.4 }), beat()])
    assert.equal(groups.length, 2)
    assert.deepEqual(shotNames(groups[0]!), ['hook', 'beat-0', 'beat-2'])
    assert.deepEqual(shotNames(groups[1]!), ['beat-1'])
    assert.equal(groups[0]!.scale, 1)
    assert.equal(groups[1]!.scale, 1.4)
  })

  // Not a second punch factor, but a second *scale*: the group key is what the page is
  // rasterised at, and a diagonal doubles that for its second axis.
  test('a diagonal pan is its own load, at twice the punch', () => {
    const beats = [beat({ move: 'pan', direction: 'diagonal', punchFactor: 1 }), beat(), beat()]
    const groups = planFor(beats)
    assert.equal(groups.length, 2)
    assert.deepEqual(shotNames(groups[1]!), ['beat-0'])
    assert.equal(groups[1]!.scale, 2)
  })

  test('a beat with its own url is its own load', () => {
    const groups = planFor([beat(), beat({ url: 'https://example.test/other' }), beat()])
    assert.equal(groups.length, 2)
    assert.deepEqual(shotNames(groups[0]!), ['hook', 'beat-0', 'beat-2'])
    assert.equal(groups[1]!.url, 'https://example.test/other')
    assert.deepEqual(shotNames(groups[1]!), ['beat-1'])
  })

  test('the card is in no group — it has no site pixels in it', () => {
    const groups = planFor([beat(), beat(), beat()])
    assert.ok(!groups.some((group) => group.shots.some((shot) => shot.kind === 'cta')))
  })

  test('a live hook is its own load, even at the punch its beats share', () => {
    // #63: a live load is stabilised and never frozen, so a beat that shared it would
    // take its master off a page still moving. The scale is the same 1.0 on both, so
    // the motion is the only thing that can split them — and it does.
    const site = ambient()
    const groups = capturePlan(site, planReel(site))
    assert.equal(groups.length, 2)
    assert.deepEqual(shotNames(groups[0]!), ['hook'])
    assert.equal(groups[0]!.motion, 'ambient')
    assert.deepEqual(shotNames(groups[1]!), ['beat-0', 'beat-1', 'beat-2'])
    assert.equal(groups[1]!.motion, undefined)
    assert.equal(groups[0]!.scale, groups[1]!.scale)
    // And a recording is exactly one frame of pixels, whatever the hero's height.
    assert.deepEqual(masterSize(groups[0]!.shots[0]!, 9000), {
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      over: 1,
    })
  })
})

describe('trimRecording', () => {
  /** The ambient hook as the plan draws it — the one shot that is ever recorded. */
  const shot = planReel(ambient()).shots[0] as Shot
  const size = masterSize(shot, FRAME_HEIGHT)

  test('refuses a recording the browser never got to the end of', async () => {
    // #63: a failed recording fails loudly. Half a second of file against a 3.4s
    // window is a hook that would otherwise be padded out with black, and a reel is
    // never cut from a black hook.
    await withWorkspace(async (ws) => {
      const raw = join(ws.root, 'short.mp4')
      await ffmpeg(['-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=30:d=0.5', raw])
      await assert.rejects(
        () => trimRecording(raw, join(ws.root, 'hook.mp4'), shot, size, 3400),
        /hook — the browser recorded 0\.5\ds of a 3\.40s window/,
      )
    })
  })

  test('cuts the shot out of the end of a recording that has one', async () => {
    await withWorkspace(async (ws) => {
      const raw = join(ws.root, 'long.mp4')
      const output = join(ws.root, 'hook.mp4')
      // Five seconds of it, of which the last 3.4 is the window the browser held open.
      await ffmpeg(['-f', 'lavfi', '-i', 'color=c=red:s=64x64:r=17:d=5', raw])
      await trimRecording(raw, output, shot, size, 3400)
      // Exactly the hook, at the timeline's own rate and the pixels the camera was
      // planned over — whatever rate and size the browser happened to record at.
      const stream = await probe(output, 'stream=nb_frames,width,height', 'v:0')
      assert.equal(Number(stream.nb_frames), frameCount(shot.durationMs))
      assert.deepEqual([Number(stream.width), Number(stream.height)], [size.width, size.height])
    })
  })
})
