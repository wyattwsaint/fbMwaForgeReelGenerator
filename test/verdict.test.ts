import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { judge, verdict } from '../src/check.ts'
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
      beats: sections({ 1: { heading: 'Enrolling for Fall, apply now before the doors shut' } }),
    })
    assert.deepEqual(problems, ['beats[1] heading is 51 characters; the budget is 42'])
  })

  test('a heading inside the count still fails when it draws too wide', () => {
    // Capitals draw wider than the count that stands in for them, so a line the budget
    // admits can still run out of the safe box — measured, not counted (#9).
    const site = config(3)
    const { problems } = report(site, {
      beats: sections({ 1: { heading: 'WWWWWWWWWWWWWWWWWWWWWWWWWWWW' } }),
    })
    assert.deepEqual(problems, [
      'beats[1] heading draws 1911px wide at 76px; the safe box is 950px',
    ])
  })

  test('a section shorter than the frame its punch captures is refused (#18)', () => {
    const site = config(3)
    const { problems } = report(site, { beats: sections({ 1: { height: 900 } }) })
    assert.deepEqual(problems, ["beats[1] '#s1' is 900px tall; a punchFactor of 1 needs 1920px"])
  })

  test('fit is no exemption from the frame a section has to fill (#65, #18)', () => {
    // `fit` only ever widens the capture viewport, and widening cannot make a section
    // that already sits inside one frame fill it. So a short beat is refused in exactly
    // the same words whether or not it asked to be fitted — the fix is a punch or a
    // taller subject, and there is no flag that buys it out.
    const site = config(3, [{}, {}, { fit: true }])
    const { problems, notes } = report(site, { beats: sections({ 2: { height: 400 } }) })
    assert.deepEqual(problems, ["beats[2] '#s2' is 400px tall; a punchFactor of 1 needs 1920px"])
    assert.deepEqual(notes, [])
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

/**
 * The whole report, which is the config's own problems and then the page's — the one
 * composition `check` performs once it has a survey.
 *
 * Asserted here and not only through `planReel`, because the two sites of a sentence
 * are not one test: the plan *throws* over a beat count it cannot describe, and the
 * judgment deliberately never reaches the plan when the count is out of range. A
 * `configProblems` that stopped counting beats would leave `reel check` exiting 0 on a
 * config no reel can be cut from, with every pure test over the throw still green.
 */
describe('judge', () => {
  // The repo itself, so the signature track resolves and the only problems a config
  // reports are the ones it was written to have.
  const ROOT = fileURLToPath(new URL('../', import.meta.url))

  /** Every beat roomy but the ones a test states, so a report is about what it stated. */
  function roomy(n: number, stated: Record<number, Partial<BeatFacts>>): {
    beats: Partial<BeatFacts>[]
  } {
    return { beats: Array.from({ length: n }, (_, i) => ({ height: ROOMY, ...stated[i] })) }
  }

  function reportOf(site: SiteConfig, n: number, stated: Record<number, Partial<BeatFacts>> = {}) {
    return judge(site, ROOT, surveyed(site, roomy(n, stated)))
  }

  test('a beat count no reel can be cut from is named by `check`, not only by the plan', () => {
    for (const n of [2, 6]) {
      assert.deepEqual(reportOf(config(n), n).problems, [
        `beats: a reel is 3-5 beats, this config has ${n}`,
      ])
    }
  })

  test('a punchFactor below 1 is rejected — there is no punching out', () => {
    // On beat 1, which drifts, and over a section tall enough for the frame that punch
    // captures: the only thing wrong with this config is the number itself.
    const site = config(3, [{}, { punchFactor: 0.7 }])
    assert.deepEqual(reportOf(site, 3, { 1: { height: 3000 } }).problems, [
      'beats[1].punchFactor is 0.7; 1 is "no punch"',
    ])
  })

  test('a beat naming both fit and punchFactor fails — they are opposite ends', () => {
    const site = config(3, [{}, { fit: true, punchFactor: 1.4 }])
    assert.deepEqual(reportOf(site, 3).problems, [
      'beats[1] names both fit and punchFactor; fit shows the whole section, ' +
        'punchFactor crops into it',
    ])
  })

  test('music without a file fails by name', () => {
    const site = { ...config(3), music: { offset: 0.42 } as { file: string; offset: number } }
    assert.deepEqual(reportOf(site, 3).problems, ['music.file is required when music is set'])
  })

  test('an offset that runs backwards out of the track fails by name', () => {
    // A real track, so the only thing wrong with this config is the offset.
    const site = { ...config(3), music: { file: 'audio/mwaforge-signature.mp3', offset: -2 } }
    assert.deepEqual(reportOf(site, 3).problems, [
      'music.offset is -2; an offset slides forward into the track',
    ])
  })

  test('a copy budget problem carries the field the human would go and edit', () => {
    // What the template is handed, not just what it says: `copyProblem` is asserted
    // over a field name a test passes it, so nothing else proves that the name reaching
    // it is `hook.text` rather than `hook` — or `beats[1].label` rather than `label`.
    const long = { ...config(3), hook: { text: 'x'.repeat(43) } }
    assert.deepEqual(reportOf(long, 3).problems, ['hook.text is 43 characters; the budget is 42'])

    const labelled = config(3, [{}, { label: 'y'.repeat(43) }])
    assert.deepEqual(reportOf(labelled, 3).problems, [
      'beats[1].label is 43 characters; the budget is 42',
    ])
  })
})
