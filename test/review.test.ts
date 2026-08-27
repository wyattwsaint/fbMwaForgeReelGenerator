import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { planReel } from '../src/plan.ts'
import { tileFrames } from '../src/review.ts'
import type { SiteConfig } from '../src/site.ts'

function site(beats: number): SiteConfig {
  return {
    url: 'https://example.test',
    hook: { text: 'Spotless, every time.' },
    beats: Array.from({ length: beats }, (_, i) => ({ selector: `#s${i}` })),
    cta: { credit: 'example.test' },
  }
}

describe('the contact sheet', () => {
  test('has one tile per shot — n + 2 of them', () => {
    for (const n of [3, 4, 5]) {
      const timeline = planReel(site(n))
      assert.equal(tileFrames(timeline).length, n + 2)
      assert.equal(tileFrames(timeline).length, timeline.shots.length)
    }
  })

  test('takes every tile but the card’s from a cut point', () => {
    // A tile per cut point and a tile per shot are the same frames plus frame 0,
    // because every shot but the hook begins on one.
    const timeline = planReel(site(3))
    const frames = tileFrames(timeline)
    assert.deepEqual(frames.slice(0, -1), [0, 90, 195, 300])
    assert.deepEqual(
      timeline.cutPoints.slice(0, -1).map((ms) => Math.round((ms * timeline.fps) / 1000)),
      frames.slice(1, -1),
    )
  })

  test('takes the card’s tile from the frame it is alone on screen', () => {
    // Its cut point is where the crossfade *starts*, and a card a tenth of the way in
    // shows neither the beat it is leaving nor the card itself.
    const timeline = planReel(site(3))
    const frames = tileFrames(timeline)
    const cardIn = timeline.cutPoints.at(-1) as number
    assert.equal(frames.at(-1), 405)
    assert.ok((frames.at(-1) as number) > Math.round((cardIn * timeline.fps) / 1000))
  })
})
