import assert from 'node:assert/strict'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { masterSize } from '../src/camera.ts'
import { capturePlan, captureMasters, trimRecording } from '../src/capture.ts'
import { ffmpeg } from '../src/compose.ts'
import { FRAME_HEIGHT, FRAME_WIDTH, fitViewportWidth } from '../src/frame.ts'
import { frameCount, planReel } from '../src/plan.ts'
import type { Shot } from '../src/plan.ts'
import type { Beat, SiteConfig } from '../src/site.ts'
import { startFixtureSite } from './fixture/server.ts'
import type { FixtureSite } from './fixture/server.ts'
import { probe, surveyed, withWorkspace } from './helpers.ts'

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
  return live('ambient')
}

/** The same again, under #64's scripted scroll. */
function live(motion: 'ambient' | 'scroll'): SiteConfig {
  const site = config([beat(), beat(), beat()])
  return { ...site, hook: { ...site.hook, motion } }
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

  describe('fit', () => {
    test('the viewport widens by exactly what the section overflows the frame by', () => {
      // A section one and a half frames tall is fit by loading the page half again as
      // wide.
      assert.equal(fitViewportWidth(FRAME_HEIGHT), FRAME_WIDTH)
      assert.equal(fitViewportWidth(2880), 1620)
      // And a section already inside one frame is left alone: fit pulls out, and
      // narrowing to reach it would shoot the site's phone layout instead.
      assert.equal(fitViewportWidth(1280), FRAME_WIDTH)
    })

    test('a fit beat loads its own viewport, rasterised back down to frame width', () => {
      const site = config([beat({ fit: true }), beat(), beat()])
      const timeline = planReel(site)
      const fit = timeline.shots[1] as Shot
      const groups = capturePlan(site, timeline, new Map([[fit, fitViewportWidth(2880)]]))
      const group = groups.find((candidate) => candidate.shots.includes(fit)) as Group
      assert.deepEqual(group.viewport, { width: 1620, height: FRAME_HEIGHT })
      // The master is still one frame wide: 1080 device pixels out of 1620 CSS ones,
      // so nothing downstream sees a bigger picture, only a wider page.
      assert.equal(group.scale, FRAME_WIDTH / 1620)
      assert.deepEqual(masterSize(fit, 1620, 1620), { width: 1080, height: 1080, over: 1 })
    })

    test('a fit beat and a non-fit beat on one url are two loads', () => {
      const site = config([beat({ fit: true }), beat(), beat()])
      const timeline = planReel(site)
      const groups = capturePlan(site, timeline, new Map([[timeline.shots[1] as Shot, 1620]]))
      assert.equal(groups.length, 2)
      assert.deepEqual(shotNames(groups[0]!), ['hook', 'beat-1', 'beat-2'])
      assert.equal(groups[0]!.viewport.width, FRAME_WIDTH)
      assert.deepEqual(shotNames(groups[1]!), ['beat-0'])
    })

    test('two fit beats that landed on one width share one load; two widths do not', () => {
      const site = config([beat({ fit: true }), beat({ fit: true }), beat({ fit: true })])
      const timeline = planReel(site)
      const [first, second, third] = timeline.shots.slice(1, 4) as [Shot, Shot, Shot]
      const same = capturePlan(
        site,
        timeline,
        new Map([
          [first, 1620],
          [second, 1620],
        ]),
      )
      assert.deepEqual(shotNames(same[1]!), ['beat-0', 'beat-1'])
      const apart = capturePlan(
        site,
        timeline,
        new Map([
          [first, 1620],
          [third, 1300],
        ]),
      )
      assert.equal(apart.length, 3)
      assert.deepEqual(shotNames(apart[1]!), ['beat-0'])
      assert.deepEqual(shotNames(apart[2]!), ['beat-2'])
    })

    test('no fit widths is the plan it has always been', () => {
      const site = config([beat(), beat(), beat()])
      const timeline = planReel(site)
      assert.deepEqual(capturePlan(site, timeline, new Map()), capturePlan(site, timeline))
    })
  })

  test('the card is in no group — it has no site pixels in it', () => {
    const groups = planFor([beat(), beat(), beat()])
    assert.ok(!groups.some((group) => group.shots.some((shot) => shot.kind === 'cta')))
  })

  test('a scroll hook is its own load too, and carries which live motion it is', () => {
    // #64: the group key is what the load *is*, and a walked page and a dwelt one are
    // not the same load — capture reads the motion off the group to decide whether to
    // drive the page. The beats are unmoved either way.
    const site = live('scroll')
    const groups = capturePlan(site, planReel(site))
    assert.equal(groups.length, 2)
    assert.deepEqual(shotNames(groups[0]!), ['hook'])
    assert.equal(groups[0]!.motion, 'scroll')
    assert.deepEqual(shotNames(groups[1]!), ['beat-0', 'beat-1', 'beat-2'])
    assert.equal(groups[1]!.motion, undefined)
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

let fixture: FixtureSite

before(async () => {
  fixture = await startFixtureSite()
})
after(async () => {
  await fixture.close()
})

/**
 * The other half of fit: what actually comes off the page. The plan above says which
 * viewport a fit beat loads in; this says the master that viewport produces.
 */
describe('captureMasters, fit', () => {
  test('a fit beat arrives as exactly one frame, and its neighbours are untouched', () =>
    withWorkspace(async (ws) => {
      const site: SiteConfig = {
        url: fixture.url,
        hook: { text: 'Spotless, every time.' },
        beats: [{ selector: '#hero' }, { selector: '#services', fit: true }, { selector: '#short' }],
        cta: { credit: 'fixture.test' },
      }
      const dir = join(ws.root, 'out')
      const masters = await captureMasters(site, planReel(site), dir)

      // #services is 2400px at the base viewport — a frame and a quarter — so it is
      // fit by loading the page 1350px wide and rasterising back down to 1080.
      const fit = masters.find((master) => master.shot.kind === 'beat' && master.shot.index === 1)
      assert.ok(fit)
      assert.deepEqual(fit.size, { width: FRAME_WIDTH, height: FRAME_HEIGHT, over: 1 })
      assert.deepEqual(await size(fit.path), [FRAME_WIDTH, FRAME_HEIGHT])

      // And the beats that did not ask for it were shot off the base viewport, at the
      // sizes they have always been: #hero at 1:1, and #short — a lateral pan, so
      // punched to 1.2 by the plan — grown to the punched frame it has to fill.
      assert.deepEqual(await size(join(dir, 'masters', 'hook.jpg')), [FRAME_WIDTH, 3000])
      assert.deepEqual(await size(join(dir, 'masters', 'beat-2.jpg')), [1296, 1920])
    }))

  test('a fit beat past the cap is captured as the vertical pan it fell back to', () =>
    withWorkspace(async (ws) => {
      const site: SiteConfig = {
        url: fixture.url,
        hook: { text: 'Spotless, every time.' },
        beats: [{ selector: '#hero' }, { selector: '#services' }, { selector: '#tall', fit: true }],
        cta: { credit: 'fixture.test' },
      }
      const dir = join(ws.root, 'out')
      // The heights `check` measured, which is what the cap is read against (#66).
      const timeline = planReel(site, surveyed({ heights: [3000, 2400, 4400] }))
      const masters = await captureMasters(site, timeline, dir)

      const fell = masters.find((master) => master.shot.kind === 'beat' && master.shot.index === 2)
      assert.ok(fell)
      // No widened viewport: the master is the page at frame width, the section's own
      // 4400px tall — which is a vertical pan's travel, not a fit.
      assert.equal(fell.shot.fit, undefined)
      assert.equal(fell.shot.move, 'pan')
      assert.deepEqual(await size(fell.path), [FRAME_WIDTH, 4400])
    }))
})

async function size(path: string): Promise<[number, number]> {
  const { width, height } = await probe(path, 'stream=width,height', 'v:0')
  return [Number(width), Number(height)]
}

/**
 * A fit beat's first load — the one that measures its section at the base viewport —
 * costs a full settle, and #78 is that it was charged to no phase line at all.
 */
describe('captureMasters, what the pass reports', () => {
  test('reports the fit measurement once per URL measured, beside the masters', () =>
    withWorkspace(async (ws) => {
      const site: SiteConfig = {
        url: fixture.url,
        hook: { text: 'Spotless, every time.' },
        beats: [
          { selector: '#services', fit: true },
          { selector: '#gallery', fit: true },
          { selector: '#wordy', fit: true, url: `${fixture.url}/other.html` },
        ],
        cta: { credit: 'fixture.test' },
      }
      const events: { kind: string; shots: string[] }[] = []
      await captureMasters(site, planReel(site), join(ws.root, 'out'), (event) => {
        assert.ok(event.ms >= 0, 'a reported cost is not a duration')
        const shots = event.kind === 'master' ? [event.shot] : event.shots
        events.push({ kind: event.kind, shots: shots.map(shotName) })
      })

      // Two URLs carry a fit beat, so two measurement loads — never one for the pass,
      // and never one per fit beat: the two on the index page shared a load, and the
      // one line for it names both of them rather than the first answering for both.
      assert.deepEqual(
        events.filter((event) => event.kind === 'measure'),
        [
          { kind: 'measure', shots: ['beat-0', 'beat-1'] },
          { kind: 'measure', shots: ['beat-2'] },
        ],
      )
      // And every master that was taken is still reported as one.
      assert.equal(events.filter((event) => event.kind === 'master').length, 4)
    }))

  test('reports nothing but masters when the config names fit nowhere', () =>
    withWorkspace(async (ws) => {
      const site: SiteConfig = {
        url: fixture.url,
        hook: { text: 'Spotless, every time.' },
        beats: [{ selector: '#hero' }, { selector: '#services' }, { selector: '#short' }],
        cta: { credit: 'fixture.test' },
      }
      const kinds: string[] = []
      await captureMasters(site, planReel(site), join(ws.root, 'out'), (event) =>
        kinds.push(event.kind),
      )
      assert.deepEqual(kinds, ['master', 'master', 'master', 'master'])
    }))
})

/** The name a master file is written under — how this suite says which shot it means. */
function shotName(shot: Shot): string {
  return shot.kind === 'beat' ? `beat-${shot.index}` : shot.kind
}
