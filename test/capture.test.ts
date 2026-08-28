import assert from 'node:assert/strict'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { masterSize } from '../src/camera.ts'
import { capturePlan, captureMasters } from '../src/capture.ts'
import { FRAME_HEIGHT, FRAME_WIDTH, fitViewportWidth } from '../src/frame.ts'
import { planReel } from '../src/plan.ts'
import type { Shot } from '../src/plan.ts'
import type { Beat, SiteConfig } from '../src/site.ts'
import { startFixtureSite } from './fixture/server.ts'
import type { FixtureSite } from './fixture/server.ts'
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
})

async function size(path: string): Promise<[number, number]> {
  const { width, height } = await probe(path, 'stream=width,height', 'v:0')
  return [Number(width), Number(height)]
}
