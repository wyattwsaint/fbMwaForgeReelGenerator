import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { capturePlan } from '../src/capture.ts'
import { FRAME_HEIGHT, FRAME_WIDTH } from '../src/frame.ts'
import { planReel } from '../src/plan.ts'
import type { Beat, SiteConfig } from '../src/site.ts'

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

  test('the card is in no group — it has no site pixels in it', () => {
    const groups = planFor([beat(), beat(), beat()])
    assert.ok(!groups.some((group) => group.shots.some((shot) => shot.kind === 'cta')))
  })
})
