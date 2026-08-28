import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { configProblems, loadSite, sitePath } from '../src/config.ts'
import { DEFAULT_VIDEO_TIME } from '../src/frame.ts'
import {
  DEFAULT_TRACK,
  panTravelAvailable,
  panTravelNeeded,
  pastFitCap,
  planReel,
} from '../src/plan.ts'
import type { SiteConfig } from '../src/site.ts'

/**
 * The checked-in configs, as configs (#29, #67). Everything about them that can be
 * asserted without the live site — the shape of the reel each one plans, and which of
 * #7's hatches each one reaches for.
 *
 * A hard-coded list rather than a glob of `sites/`: a config that is not named here is
 * not covered here, and a glob would let one arrive uncovered while the suite went on
 * passing.
 *
 * Nothing here loads a page: the suite serves its own fixture and never touches a
 * client's, so what a real site does today is `reel check`'s job and not a test's.
 */
const ROOT = fileURLToPath(new URL('../', import.meta.url))
const SLUGS = ['brobst', 'pharos', 'mwaforge']

async function site(slug: string): Promise<SiteConfig> {
  return await loadSite(slug, ROOT)
}

describe('sites/', () => {
  test('brobst plans the 15.7s three-beat reel', async () => {
    assert.equal(planReel(await site('brobst')).durationMs, 15700)
  })

  test('pharos plans the 19.2s four-beat reel', async () => {
    assert.equal(planReel(await site('pharos')).durationMs, 19200)
  })

  test('mwaforge plans the 19.2s four-beat reel', async () => {
    assert.equal(planReel(await site('mwaforge')).durationMs, 19200)
  })

  test('no config says anything wrong about itself', async () => {
    for (const slug of SLUGS) {
      assert.deepEqual(configProblems(await site(slug), ROOT), [], slug)
    }
  })

  test('brobst names nothing but sections, punch, two labels and a credit line', async () => {
    const config = await site('brobst')
    assert.deepEqual(Object.keys(config).sort(), ['beats', 'cta', 'hook', 'url'])
    assert.deepEqual(Object.keys(config.hook), ['text'])
    // No move, direction, push/pull, url or video pin anywhere: the reel's whole shape
    // is still the plan's. A label is the one override #62 can force on a config that
    // wanted none — a beat that says nothing now draws its section's heading, and two
    // of Brobst's are too long to draw (55 and 40 characters).
    for (const beat of config.beats) {
      assert.deepEqual(
        Object.keys(beat).sort().filter((key) => key !== 'label'),
        ['punchFactor', 'selector'],
        beat.selector,
      )
    }
    assert.deepEqual(
      config.beats.map((beat) => beat.label),
      [undefined, 'One person, start to finish', 'After the second visit'],
    )
  })

  test('pharos names the hero video pin rather than inheriting it', async () => {
    // The value is #6's default; writing it out is what makes the blurred LQIP the
    // config's problem rather than a constant's.
    assert.equal((await site('pharos')).hook.videoTime, DEFAULT_VIDEO_TIME)
  })

  test("pharos pans laterally across the week, with the punch to travel", async () => {
    const shot = planReel(await site('pharos')).shots[1]
    assert.equal(shot?.direction, 'lateral')
    // Lateral travel comes from the punch alone, so it is knowable without the page.
    assert.ok(
      panTravelAvailable('x', shot.punchFactor, 0) >= panTravelNeeded(shot.durationMs),
      `a punchFactor of ${shot.punchFactor} leaves the pan nowhere to travel`,
    )
  })

  test('every reel is cut to a track that is really in this checkout', async () => {
    for (const slug of SLUGS) {
      const file = planReel(await site(slug)).audio.file
      assert.ok(existsSync(resolve(ROOT, file)), `${slug}: ${file} is missing`)
    }
  })

  test('the client reels take the signature track; the house reel names its own', async () => {
    // #67 made the signature track the piece a reel *falls back to* rather than the
    // only one. What that changed is which file the house's own reel is cut to; what
    // it did not change is what a config naming nothing gets, which is the assertion
    // the two client configs are still carrying.
    for (const slug of ['brobst', 'pharos']) {
      assert.equal(planReel(await site(slug)).audio.file, DEFAULT_TRACK, slug)
    }
    assert.equal(planReel(await site('mwaforge')).audio.file, 'audio/quiet-confidence.mp3')
  })

  test('no config carries a Meta Sound Collection path', async () => {
    // #8 ruled the collection out, so the `audio/meta/…` paths in #7's examples are
    // the one thing the configs written from them had to correct. Read as source: a
    // config that named one would resolve it, and the assertion above would pass it.
    for (const slug of SLUGS) {
      const source = readFileSync(sitePath(slug, ROOT), 'utf8')
      assert.ok(!source.includes('audio/meta/'), `${slug} still names a Meta track`)
    }
  })

  test('pharos names the bed so it can slide it; brobst just takes the default', async () => {
    assert.equal((await site('pharos')).music?.file, DEFAULT_TRACK)
    assert.ok((await site('pharos')).music?.offset)
    assert.equal((await site('brobst')).music, undefined)
  })

  test('mwaforge opens on a live hook, and it is the only config that does', async () => {
    // #63/#64's whole point is that `still` is the default: the two client reels are
    // unaffected by the capability the house's own reel exists to exercise.
    assert.equal((await site('mwaforge')).hook.motion, 'scroll')
    for (const slug of ['brobst', 'pharos']) {
      assert.equal((await site(slug)).hook.motion, undefined, slug)
    }
    const hook = planReel(await site('mwaforge')).shots[0]
    assert.equal(hook?.motion, 'scroll')
    // #63: a live hook keeps its place in the rotation and still pushes, because the
    // softest frame is spent last rather than on the thumbnail.
    assert.equal(hook?.move, 'drift')
    assert.equal(hook?.pushPull, 'push')
  })

  test('mwaforge fits the portfolio, and drifts rather than pans over it', async () => {
    const config = await site('mwaforge')
    const beat = config.beats[1]
    assert.equal(beat?.fit, true)
    // The window is the fit: `#work` at its own 5312px is past the cap (#66), and
    // 2134px is what widens the viewport to the 1200 this page lays its grid out
    // three-across at. Anchored on the section's top, so the reflow moves it.
    assert.equal(beat?.height, 2134)
    assert.equal(beat?.y, undefined)
    assert.ok(!pastFitCap(beat?.height ?? 0), 'the fit window is past the cap')
    // A fit section is exactly one frame, so a pan over it is a move that cannot move
    // — and the plan already knows that, whatever index the beat sits at. So the
    // config names no `move` and gets the drift fit is entitled to.
    const shot = planReel(config).shots[2]
    assert.equal(shot?.fit, true)
    assert.equal(shot?.move, 'drift')
    assert.equal(beat?.move, undefined)
  })

  test('mwaforge writes every label rather than inheriting any', async () => {
    // Three of the four headings are over the 28-character budget and #62 would fail
    // `check` on them. The fourth — 'Real sites. Real businesses.' — would draw, and
    // is overridden anyway: it belongs to the fit beat, which puts the heading itself
    // on screen, so the default would be the same words twice in one frame.
    assert.deepEqual(
      (await site('mwaforge')).beats.map((beat) => beat.label),
      [
        'No agency runaround',
        'Five builds, all live',
        "You don't pay till it's live",
        'A shop that picks up',
      ],
    )
  })
})
