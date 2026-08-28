import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { configProblems, loadSite, sitePath } from '../src/config.ts'
import { DEFAULT_VIDEO_TIME } from '../src/frame.ts'
import {
  DEFAULT_TRACK,
  panAxes,
  panTravelAvailable,
  panTravelNeeded,
  pastFitCap,
  planReel,
} from '../src/plan.ts'
import type { Beat, Direction, SiteConfig } from '../src/site.ts'

/**
 * The checked-in configs, as configs (#29) — two clients and MWA Forge's own (#67).
 * Everything about them that can be asserted without the live site: the shape of the
 * reel each one plans, and which of #7's hatches each one reaches for.
 *
 * Nothing here loads a page: the suite serves its own fixture and never touches a
 * client's, so what a real site does today is `reel check`'s job and not a test's.
 *
 * The list is written out rather than globbed, so a config added to `sites/` and not
 * added here is uncovered loudly at review rather than silently forever.
 */
const ROOT = fileURLToPath(new URL('../', import.meta.url))
const SLUGS = ['brobst', 'mwaforge', 'pharos']

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

  test('every reel is cut to a bed that is really on disk', async () => {
    for (const slug of SLUGS) {
      const file = planReel(await site(slug)).audio.file
      assert.ok(existsSync(resolve(ROOT, file)), `${slug}: ${file} is missing`)
    }
  })

  test('the client reels are cut to the signature track; MWA Forge brings its own', async () => {
    // The resolution rule, both ways round (#67): the signature track is what a config
    // that names no bed falls back to, and naming one is what makes that a fallback
    // rather than the only answer. A second track in `audio/` changes neither client.
    for (const slug of ['brobst', 'pharos']) {
      assert.equal(planReel(await site(slug)).audio.file, DEFAULT_TRACK, slug)
    }
    assert.equal(
      planReel(await site('mwaforge')).audio.file,
      'audio/quiet-confidence.mp3',
    )
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

  test('no bed is timed to anything — the second track brings no beat-locking', async () => {
    // #8's rule, re-stated now that there are two beds to break it with: a track is
    // trimmed and faded to the reel, and the reel is never cut to the track. Said as
    // the thing that would break if it stopped being true — take the bed away and every
    // shot boundary in the reel is where it was, whichever track was under it.
    for (const slug of SLUGS) {
      const config = await site(slug)
      const { music: _dropped, ...bedless } = config
      assert.deepEqual(planReel(bedless).shots, planReel(config).shots, slug)
    }
    // And MWA Forge's bed starts where its track does: nothing in the reel is aligned
    // to it, so there is nothing an offset would be sliding the reel against.
    assert.equal((await site('mwaforge')).music?.offset, undefined)
  })

  test('mwaforge opens on a live hook it had to name, and fits its portfolio', async () => {
    const config = await site('mwaforge')
    // The hero is a <header>, so #63's default — the first <section> of <main> — finds
    // the pricing strip instead. Both halves matter: a live motion, on the right hero.
    assert.equal(config.hook.motion, 'scroll')
    assert.equal(config.hook.selector, 'header.hero')

    // The one fit beat (#65), and the window that keeps it under #66's cap: #work is
    // 5312px whole, which fit would refuse and pan instead.
    const fits = config.beats.filter((beat) => beat.fit)
    assert.equal(fits.length, 1)
    const [work] = fits as [Beat]
    assert.ok(work.height !== undefined && !pastFitCap(work.height), `${work.height}px is past the fit cap`)
    // Fit and punch are the two ends of one axis, so a fit beat naming a punch is a
    // config error — and the plan drifts it at 1.0 whatever the rotation would have said.
    assert.equal(work.punchFactor, undefined)
    const shot = planReel(config).shots[2]
    assert.equal(shot?.fit, true)
    assert.equal(shot.move, 'drift')
  })

  test('mwaforge opens every window wide enough for the pan it draws', async () => {
    // Every beat on this page is a `y`/`height` window, opened because the sections are
    // 576-687px and a punch that fills a frame out of one crops the layout to a column.
    // A window is a number the config wrote, so what it leaves a pan to travel is
    // knowable here rather than only against the live page — which is the whole reason
    // the windows are wider than the punch strictly needs.
    const config = await site('mwaforge')
    const shots = planReel(config).shots
    let panned = 0
    for (const [index, beat] of config.beats.entries()) {
      const shot = shots[index + 1]
      if (shot?.move !== 'pan') continue
      panned += 1
      // Both axes, because the rotation picks the direction and the window has to
      // survive whichever one it drew: a lateral pan travels on the punch alone, a
      // vertical one on what the window has over a punched frame.
      for (const axis of panAxes(shot.direction as Direction)) {
        assert.ok(
          panTravelAvailable(axis, shot.punchFactor, beat.height as number) >=
            panTravelNeeded(shot.durationMs),
          `beats[${index}]: a ${beat.height}px window at ${shot.punchFactor} leaves the ${axis} pan nowhere to travel`,
        )
      }
    }
    assert.equal(panned, 2)
  })
})
