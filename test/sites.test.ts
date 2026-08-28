import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { configProblems, loadSite, sitePath } from '../src/config.ts'
import { DEFAULT_VIDEO_TIME } from '../src/frame.ts'
import { DEFAULT_TRACK, panTravelAvailable, panTravelNeeded, planReel } from '../src/plan.ts'
import type { SiteConfig } from '../src/site.ts'

/**
 * The two real client configs, as configs (#29). Everything about them that can be
 * asserted without the client's live site — the shape of the reel each one plans, and
 * which of #7's hatches each one reaches for.
 *
 * Nothing here loads a page: the suite serves its own fixture and never touches a
 * client's, so what a real site does today is `reel check`'s job and not a test's.
 */
const ROOT = fileURLToPath(new URL('../', import.meta.url))
const SLUGS = ['brobst', 'pharos']

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

  test('neither config says anything wrong about itself', async () => {
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

  test('both reels are cut to the signature track', async () => {
    for (const slug of SLUGS) {
      const config = await site(slug)
      const file = planReel(config).audio.file
      assert.equal(file, DEFAULT_TRACK, slug)
      assert.ok(existsSync(resolve(ROOT, file)), `${slug}: ${file} is missing`)
    }
  })

  test('neither config carries a Meta Sound Collection path', async () => {
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
})
