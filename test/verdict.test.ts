import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { verdict } from '../src/check.ts'
import { MAX_FIT_SECTION_HEIGHT } from '../src/plan.ts'
import type { Beat, SiteConfig } from '../src/site.ts'
import { surveyed } from './helpers.ts'
import type { BeatFacts, PageFacts } from './helpers.ts'

/**
 * The judgment, over a survey a test wrote down (ADR-0009).
 *
 * Every rule here used to need a fixture site served over HTTP to state one number
 * about a page. It states the number instead: what `check` reports is a pure function
 * of the config and the facts one settled load gave up, so a 4400px section is the
 * literal `4400`, and the report is a value to assert rather than stdout to match.
 */

/** The minimum #7 allows, with `n` beats named only by selector. */
function config(n: number, beats: Partial<Beat>[] = []): SiteConfig {
  return {
    url: 'https://example.test',
    hook: { text: 'Spotless, every time.' },
    beats: Array.from({ length: n }, (_, i) => ({ selector: `#s${i}`, ...beats[i] })),
    cta: { credit: 'example.test' },
  }
}

/**
 * A comfortable section: tall enough for an unpunched frame and for a vertical pan to
 * travel across, short enough for the fit cap. What a beat no test is about measured.
 */
const ROOMY = 2400

/** Three sections no test is about, with whatever this one *is* about stated over them. */
function sections(stated: Record<number, Partial<BeatFacts>> = {}): Partial<BeatFacts>[] {
  return [0, 1, 2].map((i) => ({ height: ROOMY, ...stated[i] }))
}

/** What `check` would report, over a survey stating exactly these facts. */
function report(site: SiteConfig, facts: PageFacts = {}) {
  return verdict(site, surveyed(site, facts))
}

describe('verdict', () => {
  test('a survey of three roomy sections reports nothing at all', () => {
    // The baseline every test below is a departure from — and the proof that what
    // those tests report is the fact they stated rather than the survey's defaults.
    assert.deepEqual(report(config(3), { beats: sections() }), {
      problems: [],
      notes: [],
    })
  })

  test('a fit section past the legibility cap is noted as panned instead (#66)', () => {
    const site = config(3, [{}, {}, { fit: true }])
    const { problems, notes } = report(site, { beats: sections({ 2: { height: 4400 } }) })
    assert.deepEqual(notes, [
      "beats[2] '#s2' is 4400px tall; fit pulls out to at most 3840px, so this beat is " +
        'fit to width and panned vertically instead',
    ])
    // A note and never a problem: the beat renders, as something other than what was
    // asked for, and the reel is still cut.
    assert.deepEqual(problems, [])
  })

  test('a fit section inside the cap says nothing — the cap is not a new report', () => {
    const site = config(3, [{}, {}, { fit: true }])
    assert.deepEqual(report(site, { beats: sections({ 2: { height: MAX_FIT_SECTION_HEIGHT } }) }), {
      problems: [],
      notes: [],
    })
  })

  test("a page's own heading is held to the label budget it would be drawn as (#62)", () => {
    const site = config(3)
    const { problems } = report(site, {
      beats: sections({ 1: { heading: 'Enrolling for Fall, apply now' } }),
    })
    assert.deepEqual(problems, ['beats[1] heading is 29 characters; the budget is 28'])
  })

  test('a heading inside the count still fails when it draws too wide', () => {
    // Capitals draw wider than the count that stands in for them, so a line the budget
    // admits can still run out of the safe box — measured, not counted (#9).
    const site = config(3)
    const { problems } = report(site, {
      beats: sections({ 1: { heading: 'WWWWWWWWWWWWWWWWWWWWWWWWWWWW' } }),
    })
    assert.deepEqual(problems, [
      'beats[1] heading draws 1106px wide at 44px; the safe box is 950px',
    ])
  })

  test('a section shorter than the frame its punch captures is refused (#18)', () => {
    const site = config(3)
    const { problems } = report(site, { beats: sections({ 1: { height: 900 } }) })
    assert.deepEqual(problems, ["beats[1] '#s1' is 900px tall; a punchFactor of 1 needs 1920px"])
  })

  test('a punch that leaves a pan no travel is named on each axis it fails (#7)', () => {
    // A diagonal pan travels on both, so a punch that leaves neither enough is two
    // findings and not one: the fix is a number, and each axis has its own.
    const site = config(3, [{ move: 'pan', direction: 'diagonal', punchFactor: 1.05 }])
    const { problems } = report(site, { beats: sections({ 0: { height: 1950 } }) })
    assert.deepEqual(problems, [
      "beats[0] '#s0' — a diagonal pan needs 210px of travel, a punchFactor of 1.05 " +
        'leaves 54px (needs 1.2)',
      "beats[0] '#s0' — a diagonal pan needs 210px of travel, a punchFactor of 1.05 " +
        'leaves 128px (needs 1.1)',
    ])
  })

  test('a beat running past the foot of its page is refused, with both numbers', () => {
    const site = config(3)
    const { problems } = report(site, {
      beats: sections({ 2: { top: 2000 } }),
      scrollHeight: 3000,
    })
    assert.deepEqual(problems, ["beats[2] '#s2' runs to 4400px; the page is 3000px tall"])
  })

  test('a selector nothing measured is named as one that did not match', () => {
    // Nothing measured is a section that was not there: the survey carries no rect and
    // no height for it, which is exactly what a page that has no `#s1` gives up.
    const site = config(3)
    const { problems } = report(site, { beats: [{ height: ROOMY }, {}, { height: ROOMY }] })
    assert.deepEqual(problems, ["beats[1] selector '#s1' — no element matches"])
  })

  test('a hero nothing found is a problem, named as the config named the hook', () => {
    const site = config(3)
    const facts = { beats: sections(), heroRect: null }
    assert.deepEqual(report(site, facts).problems, [
      'hook — no hero found; name one with hook.selector',
    ])
    const named = { ...site, hook: { ...site.hook, selector: '#hero' } }
    assert.deepEqual(verdict(named, surveyed(named, facts)).problems, [
      "hook.selector '#hero' — no element matches",
    ])
  })
})
