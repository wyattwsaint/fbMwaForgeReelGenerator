import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { CARD_ZOOM, cardCamera } from '../src/camera.ts'
import {
  CARD_CENTRE_Y,
  HEADLINE,
  MARK_WIDTH,
  TAGLINE,
  cardChains,
  cardCredit,
  cardLayout,
  creditProblems,
} from '../src/card.ts'
import { escapeValue, stream } from '../src/filtergraph.ts'
import { ACCENT, FONT_FILE, INK, SAFE_ZONE, TYPE } from '../src/house.ts'
import { lineWidth } from '../src/measure.ts'
import { drawnOverlays } from '../src/overlay.ts'
import { CTA_MS, frameCount, planReel } from '../src/plan.ts'
import type { Shot, TextCue } from '../src/plan.ts'
import { wordmarkMask, wordmarkRgba } from '../src/wordmark.ts'

const FRAMES = frameCount(CTA_MS)

/** A reel, so the card's shot and cue are the ones `plan` really writes. */
const REEL = planReel({
  url: 'https://example.test',
  hook: { text: 'Spotless.' },
  beats: [{ selector: '#a' }, { selector: '#b' }, { selector: '#c' }],
  cta: { credit: 'example.test' },
})

/** The card's own shot, taken from the plan rather than hand-built to match it. */
const CARD_SHOT = REEL.shots.at(-1) as Shot

function graph(credit = 'fixture.test', shot: Shot = CARD_SHOT): string {
  const cues: TextCue[] = [
    { shot: 0, content: credit, role: 'cta', startMs: 0, fadeInMs: 0, holdMs: CTA_MS, fadeOutMs: 0 },
  ]
  return cardChains(
    cues,
    cardCamera(shot),
    stream('ground'),
    stream('mark'),
    stream('out'),
  ).join(';')
}

/** The one `drawtext` that draws the tagline, cut out of a graph whole. */
function taglineStage(chains: string): string {
  const at = chains.indexOf(`text=${escapeValue(TAGLINE)}`)
  assert.ok(at > 0, 'the graph never draws the tagline')
  return chains.slice(chains.lastIndexOf('drawtext', at), chains.indexOf(',', at))
}

describe('the wordmark is MWA Forge\u2019s, rasterised from the repo constant', () => {
  test('the mask keeps the SVG\u2019s aspect and is empty at its corners', () => {
    const mask = wordmarkMask(MARK_WIDTH)
    assert.equal(mask.width, MARK_WIDTH)
    // 502 x 200 in the file, so the mask is that ratio and nothing else decides it.
    assert.equal(mask.height, Math.round((MARK_WIDTH * 200) / 502))
    const at = (x: number, y: number) => mask.alpha[y * mask.width + x] as number
    assert.equal(at(0, 0), 0)
    assert.equal(at(mask.width - 1, mask.height - 1), 0)
  })

  test('a stem is solid and the A’s counter is a hole', () => {
    const mask = wordmarkMask(MARK_WIDTH)
    const scale = MARK_WIDTH / 502
    const at = (x: number, y: number) => mask.alpha[Math.round(y) * mask.width + Math.round(x)] as number
    // The M's left stem runs x 0..32, y 20..180 in the file's own units.
    assert.equal(at(16 * scale, 100 * scale), 255)
    // The A's counter sits inside the letter, so an even-odd fill leaves it empty.
    assert.equal(at(427 * scale, 104 * scale), 0)
    // And the gap between the M's stems, which is outside the letter, is empty too.
    assert.equal(at(75 * scale, 170 * scale), 0)
  })

  test('the mark is inked in the house palette, not in a colour of its own', () => {
    const { data, width, height } = wordmarkRgba(MARK_WIDTH)
    assert.equal(data.length, width * height * 4)
    const ink = [1, 3, 5].map((at) => Number.parseInt(INK.slice(at, at + 2), 16))
    let lit = 0
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i + 3] as number) === 0) continue
      lit++
      assert.deepEqual([data[i], data[i + 1], data[i + 2]], ink)
    }
    // A mark that covers everything or nothing is a rasteriser that failed quietly.
    const covered = lit / (width * height)
    assert.ok(covered > 0.1 && covered < 0.5, `the mark covers ${(covered * 100).toFixed(1)}% of its box`)
  })
})

describe('the card is laid out in the boosted safe box', () => {
  const layout = cardLayout()

  test('its content is centred on y 760, not on the frame\u2019s own middle', () => {
    const top = layout.mark.y
    const bottom = layout.credit.y + TYPE.credit.lineHeight
    assert.ok(Math.abs((top + bottom) / 2 - CARD_CENTRE_Y) <= 1, `centred on ${(top + bottom) / 2}`)
  })

  test('nothing reaches outside the box Meta leaves alone', () => {
    assert.ok(layout.mark.y >= SAFE_ZONE.top)
    assert.ok(layout.credit.y + TYPE.credit.lineHeight <= SAFE_ZONE.bottom)
    assert.ok(layout.mark.x >= SAFE_ZONE.left)
    assert.ok(layout.mark.x + layout.mark.width <= SAFE_ZONE.right)
    assert.ok(layout.rule.x >= SAFE_ZONE.left && layout.rule.x + layout.rule.width <= SAFE_ZONE.right)
  })

  test('mark, tagline, headline, rule and credit stack in that order', () => {
    assert.ok(layout.mark.y + layout.mark.height < layout.tagline.y)
    assert.ok(layout.tagline.y + TYPE.tagline.lineHeight <= layout.headline.y)
    assert.ok(layout.headline.y + TYPE.headline.lineHeight <= layout.rule.y)
    assert.ok(layout.rule.y + layout.rule.height < layout.credit.y)
  })

  test('the stack lands on these numbers, which is the card as it ships', () => {
    // The one place the card's own geometry is written down rather than derived. Every
    // other test here asserts a relation — inside the box, in this order, centred on
    // 760 — and a relation survives a type size moving by twenty pixels. These do not:
    // a change to any of `TYPE`'s card roles or to a gap breaks this test first, which
    // is the point. Read off `cardLayout` and checked by eye against a rendered card.
    assert.equal(layout.mark.y, 472)
    assert.equal(layout.tagline.y, 687)
    assert.equal(layout.headline.y, 803)
    assert.equal(layout.rule.y, 959)
    assert.equal(layout.credit.y, 1005)
    assert.equal(layout.credit.y + TYPE.credit.lineHeight, 1049)
  })

  test('the tagline sits closer to the mark than to the headline', () => {
    // #61: the mark and the words for what it sells are one lockup. Set equidistant
    // they read as two separate lines that happen to be stacked, and the tagline
    // starts to look like a second headline instead of the mark's own signature.
    const toMark = layout.tagline.y - (layout.mark.y + layout.mark.height)
    const toHeadline = layout.headline.y - (layout.tagline.y + TYPE.tagline.lineHeight)
    assert.ok(toMark < toHeadline, `the lockup is not one object: ${toMark} vs ${toHeadline}`)
  })

  test('the headline and the tagline both fit the card at the sizes they are set in', () => {
    // Constants, so this is a claim about the repo rather than about a config: the
    // lines nobody can shorten have to fit before they ship.
    assert.ok(lineWidth(HEADLINE, TYPE.headline.size) <= layout.width)
    assert.ok(lineWidth(TAGLINE, TYPE.tagline.size) <= layout.width)
    // And the headline stays the biggest thing on the card — the tagline says what is
    // sold, the headline is where to buy it.
    assert.ok(TYPE.tagline.size < TYPE.headline.size)
  })
})

describe('the card\u2019s filtergraph', () => {
  test('draws the mark, the tagline, the headline, the accent rule and the credit', () => {
    const chains = graph()
    const layout = cardLayout()
    assert.match(chains, /overlay=x=\d+:y=\d+/)
    assert.match(chains, /text=mwaforge\.com/)
    assert.ok(chains.includes(`text=${escapeValue(TAGLINE)}`), 'the card is unsigned')
    // In the checked-in face and at the tagline's own size — not the credit's, and not
    // whatever face the machine running the render happens to have installed.
    assert.ok(
      taglineStage(chains).startsWith(`drawtext=fontfile=${escapeValue(FONT_FILE)}`),
      'the tagline is not set in the checked-in face',
    )
    assert.ok(taglineStage(chains).includes(`fontsize=${TYPE.tagline.size}`))
    assert.match(chains, /text=fixture\.test/)
    assert.match(chains, new RegExp(`drawbox=x=${layout.rule.x}:y=${layout.rule.y}`))
    assert.ok(chains.includes(`color=0x${ACCENT.slice(1)}`), 'the rule is not the house accent')
  })

  test('the credit is muted and the headline is not', () => {
    const chains = graph()
    const headline = chains.slice(chains.indexOf('text=mwaforge.com'))
    assert.match(headline, /fontcolor=0xeef1f6:/)
    assert.match(chains, /fontcolor=0xeef1f6@0\.\d+/)
  })

  test('every line is centred on the card rather than left-aligned in the slot', () => {
    assert.equal(graph().match(/x=\(w-text_w\)\/2/g)?.length, 3)
  })

  test('no config reaches the tagline — an empty credit still leaves it signed', () => {
    // House style, like the face, the mark and the accent: the same words on every
    // reel, for every client. A card with no credit is still MWA Forge's card.
    assert.ok(graph('').includes(`text=${escapeValue(TAGLINE)}`), 'a card with no credit is unsigned')
    // Byte-identical across two different configs: no field reaches these pixels.
    assert.equal(taglineStage(graph('example.test')), taglineStage(graph('pharosacademy.net')))
  })

  test('a credit with a filtergraph metacharacter in it survives being drawn', () => {
    // Escaped once for the graph parser and once for the option parser, like every
    // other line of copy — a credit is whatever a human typed into a config.
    assert.ok(graph('a:b').includes(`text=a${escapeValue(':')}b`))
    assert.ok(graph('a:b').includes('text=a\\\\:b'))
  })

  test('the card scales 1.00 to 1.03 across its own frames and never lands', () => {
    assert.equal(CARD_ZOOM, 1.03)
    // The ramp runs on `on` and reaches its end on the card's last frame, so the card
    // is still moving when the reel stops.
    assert.ok(graph().includes(`z='1+0.03*on/${FRAMES - 1}'`))
    assert.ok(!graph().includes('tmix'), 'the card is blurred, at half a pixel a frame')
  })

  test('the card takes its turn in the drift rotation, pulling as readily as pushing', () => {
    // #52: the card is drawn rather than filmed, so a pull costs it no sharpness — it
    // is rendered at `PRECISION` either way — and it is where an alternation is most
    // visible, being the last thing on screen. Same 3%, read the other way round.
    const pulled = graph('fixture.test', { ...CARD_SHOT, pushPull: 'pull' })
    assert.ok(pulled.includes(`z='1.03-0.03*on/${FRAMES - 1}'`))
    assert.ok(pulled.includes('flags=neighbor'), 'a pull skips the precision round trip')
  })

  test('no site pixels and no client asset reach the card', () => {
    const chains = graph()
    assert.ok(!chains.includes('.jpg'), 'the card names a master')
    // Its only image is the repo's own mark.
    assert.equal(chains.match(/overlay=/g)?.length, 1)
  })
})

describe('each drawer takes the roles that are its own', () => {
  const cue = (role: TextCue['role'], content: string): TextCue => ({
    shot: 0,
    content,
    role,
    startMs: 0,
    fadeInMs: 0,
    holdMs: CTA_MS,
    fadeOutMs: 0,
  })

  test('the card takes the cta line out of a shot’s cues and leaves the rest', () => {
    const cues = [cue('hook', 'Spotless.'), cue('cta', 'example.test'), cue('label', 'A label')]
    assert.equal(cardCredit(cues), 'example.test')
    // The ones drawn over site pixels are `overlay`'s, and neither drawer sees the
    // other's — so nothing upstream of them has to know what a role is.
    assert.deepEqual(drawnOverlays(cues).map((c) => c.content), ['Spotless.', 'A label'])
  })

  test('a config with no credit gets a card with no credit line, not an error', () => {
    assert.equal(cardCredit([cue('hook', 'Spotless.')]), '')
  })
})

describe('the credit is checked like every other line of copy', () => {
  test('a credit that fits the card draws no problem', () => {
    assert.deepEqual(creditProblems('pharosacademy.net'), [])
  })

  test('a credit too wide for the card fails loudly, naming the card', () => {
    const problems = creditProblems('W'.repeat(80))
    assert.equal(problems.length, 1)
    assert.match(problems[0] as string, /^cta\.credit draws \d+px wide at \d+px; the safe box is \d+px$/)
  })
})

describe('the plan already carries the card', () => {
  test('the credit is the card shot\u2019s own cue, brought in by the crossfade', () => {
    const cue = REEL.text.find((c) => c.role === 'cta')
    assert.equal(cue?.content, 'example.test')
    assert.equal(cue?.fadeInMs, 0)
  })
})
