import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { MOTION_FLOOR } from '../src/motion.ts'
import { survey } from '../src/survey.ts'
import type { SiteConfig } from '../src/site.ts'
import { startFixtureSite } from './fixture/server.ts'
import type { FixtureSite } from './fixture/server.ts'

/**
 * The survey itself, against a real page (ADR-0009).
 *
 * The judgment over a survey is pure and is asserted as one in `test/verdict.test.ts`,
 * over a survey a test writes down. What a literal cannot say is that the survey itself
 * measured a real page correctly — a survey that read the wrong height would make every
 * pure test above it pass and every reel wrong. So this file is the seam's other side:
 * the fixture site and its server, with the measuring running through them and none of
 * the judging.
 */

let fixture: FixtureSite

before(async () => {
  fixture = await startFixtureSite()
})
after(async () => {
  await fixture.close()
})

/** The config as a value, for the tests that survey a page without the CLI. */
function site(
  url: string,
  beats: SiteConfig['beats'],
  hook: Partial<SiteConfig['hook']> = {},
): SiteConfig {
  return {
    url,
    hook: { text: 'Spotless, every time.', ...hook },
    beats,
    cta: { credit: 'fixture.test' },
  }
}

/** Three sections no survey test about the hook is about. */
const SECTIONS: SiteConfig['beats'] = [
  { selector: '#hero' },
  { selector: '#services' },
  { selector: '#gallery' },
]

describe('survey', () => {
  test('a section measures at the height the page lays it out at', async () => {
    const taken = await survey(
      site(fixture.url, [
        { selector: '#hero' },
        { selector: '#short' },
        { selector: '#tall' },
        { selector: '#gallery' },
        { selector: '#gone' },
      ]),
    )
    // The numbers every pure test states as a literal, read off the page that lays
    // them out — and off the *settled* page: #gallery has no height of its own until
    // its lazy images load, so 2800px is a measurement a load alone would not get.
    assert.deepEqual(
      taken.beats.map((beat) => beat.height),
      [3000, 400, 4400, 2800, null],
    )
    // A selector that does not resolve is nothing measured, which is exactly what the
    // judgment reads as "no element matches".
    assert.equal(taken.beats[4]?.rect, null)
    // y 120, not 0: the fixture's sticky nav takes its 120px of flow above main.
    assert.deepEqual(taken.beats[0]?.rect, { x: 0, y: 120, width: 1080, height: 3000 })
    // The hook names no selector, so the hero is the one the page's own shape gives
    // up — the first candidate section, which is #hero. Stated as the rect rather than
    // as `beats[0]`'s, because the claim is *which element* the hook resolved to, and
    // comparing one survey field against another would pass however wrong both were.
    assert.deepEqual(taken.heroRect, { x: 0, y: 120, width: 1080, height: 3000 })
    // 120 + 3000 + 2400 + 400 + 2800 + 1200 + 4400: the page's own height, which is
    // what says whether a beat runs off the foot of it.
    assert.deepEqual(
      taken.pages.map((page) => [page.scrollHeight, page.failure]),
      [[14_320, null]],
    )
  })

  test('a heading is read as one line, from inside the beat’s own slice', async () => {
    // Every section on noid.html is addressed through `main`, so all three beats
    // resolve to the same element and the heading each one draws is the one inside its
    // own y/height window — not the page's first, which is what an ancestor would
    // otherwise hand every beat on the page (#7, #62).
    const taken = await survey(
      site(`${fixture.url}/noid.html`, [
        { selector: 'main', y: 0, height: 2000 },
        { selector: 'main', y: 2000, height: 2000 },
        { selector: 'main', y: 2000, height: 2000, label: 'Enrolling now' },
      ]),
    )
    assert.deepEqual(
      taken.beats.map((beat) => beat.heading),
      [
        // Set in two by a `<br>` and carrying a line the page never paints: a heading
        // is one line of the copy a viewer actually sees, so the break is a space and
        // the hidden span is not there at all.
        'First section',
        'Enrolling now for the autumn term',
        // A beat that names a label is drawing that label whatever the page says, so
        // the heading it overrides is never read and never weighed.
        null,
      ],
    )
    // And the height is the window's, not the resolved element's: `main` is 4000px
    // tall, and the hatch is what says which 2000px of it this beat is about.
    assert.deepEqual(
      taken.beats.map((beat) => beat.height),
      [2000, 2000, 2000],
    )
  })

  /**
   * Which live readings were *taken*, which is the one thing a written-down survey
   * cannot say (#64, #88). The pure tests over `resolvedMotion` state a reading and
   * assert what it means; a page is what proves the reading was gathered at all — and
   * that the questions nobody asked were left unasked, since a probe run under a
   * scripted scroll measures its own camera rather than the hero.
   */
  test('a scroll hook whose page can re-fire its reveals is never handed to the probe', async () => {
    const taken = await survey(site(fixture.url, SECTIONS, { motion: 'scroll' }))
    // The fixture's reveals are observed for good, so the scroll stays a scroll.
    assert.equal(taken.scrollRefires, true)
    // And a scroll is never probed: the viewport itself moves under one, so every page
    // on earth would read far above the floor.
    assert.equal(taken.motionReading, null)
  })

  test('a scroll hook whose reveals fired once is answered no, and then probed', async () => {
    // `once.html`'s reveal unobserves itself, and `stabilise` has already made it fire.
    const taken = await survey(site(`${fixture.url}/once.html`, SECTIONS, { motion: 'scroll' }))
    assert.equal(taken.scrollRefires, false)
    // Which is what puts the hook in front of the motion probe: the second question is
    // asked *because* the first was answered no, and the page is deliberately still,
    // so the reading it gives up is under the floor.
    assert.ok(taken.motionReading !== null, 'the degraded hook was never probed')
    assert.ok(
      taken.motionReading < MOTION_FLOOR,
      `once.html read ${taken.motionReading}, which is not a still page`,
    )
  })

  test('an ambient hook is probed without ever being asked about scroll', async () => {
    // The fixture hero plays a video and animates a block inside the frame, so this is
    // the reading that says "record it" — taken with no scroll question in front of it.
    const taken = await survey(site(fixture.url, SECTIONS, { motion: 'ambient' }))
    assert.equal(taken.scrollRefires, null)
    assert.ok(
      taken.motionReading !== null && taken.motionReading >= MOTION_FLOOR,
      `the fixture hero read ${taken.motionReading}, which is not a moving one`,
    )
  })

  test('a hook that is not live is asked neither question', async () => {
    // The default motion. `once.html` degrades only because a `scroll` was asked for:
    // under `still` there is no recording to refuse, so nothing is measured for one.
    const taken = await survey(site(`${fixture.url}/once.html`, SECTIONS))
    assert.equal(taken.scrollRefires, null)
    assert.equal(taken.motionReading, null)
  })
})
