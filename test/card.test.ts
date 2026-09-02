import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { CARD_ZOOM, cardCamera } from '../src/camera.ts'
import {
  CARD_CENTRE_Y,
  HEADLINE,
  MARK_WIDTH,
  TAGLINE,
  TITLE_LINE,
  cardChains,
  cardCredit,
  cardLayout,
  creditProblems,
  titleChains,
  titleLayout,
} from '../src/card.ts'
import { escapeValue, stream } from '../src/filtergraph.ts'
import { ACCENT, FONT_FILE, INK, SAFE_ZONE, SPARK, TYPE } from '../src/house.ts'
import { KERN_FO, TRACKING, lockupGeometry, mwaMask, mwaRgba, sparkRgba } from '../src/lockup.ts'
import { capUnits, glyphMetrics, lineWidth, unitsPerEm } from '../src/measure.ts'
import { drawnOverlays } from '../src/overlay.ts'
import { CTA_MS, frameCount, planReel } from '../src/plan.ts'
import type { Shot, TextCue } from '../src/plan.ts'

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
    stream('ramp'),
    stream('out'),
  ).join(';')
}

/** The `MWA` half's box, which is what the rasteriser is asked for. */
const MWA_WIDTH = Math.round(lockupGeometry(MARK_WIDTH).mwa.width)

/** The title shot's graph, built the way `compose` builds it. */
function titleGraph(): string {
  return titleChains(
    cardCamera(REEL.shots[0] as Shot),
    stream('ground'),
    stream('mark'),
    stream('ramp'),
    stream('out'),
  ).join(';')
}

/** The one `drawtext` that draws the title's line, cut out of its graph whole. */
function titleStage(chains: string): string {
  const at = chains.indexOf(`text=${escapeValue(TITLE_LINE)}`)
  assert.ok(at > 0, 'the graph never draws the title line')
  return chains.slice(chains.lastIndexOf('drawtext', at), chains.indexOf(',', at))
}

/** The one `drawtext` that draws the tagline, cut out of a graph whole. */
function taglineStage(chains: string): string {
  const at = chains.indexOf(`text=${escapeValue(TAGLINE)}`)
  assert.ok(at > 0, 'the graph never draws the tagline')
  return chains.slice(chains.lastIndexOf('drawtext', at), chains.indexOf(',', at))
}

describe('MWA is MWA Forge\u2019s own geometry, rasterised from the repo constant', () => {
  /** The SVG's own coordinates, so a point here is a point on the asset. */
  const sample = () => {
    const mask = mwaMask(MWA_WIDTH)
    const scale = MWA_WIDTH / 735.22
    return (x: number, y: number) =>
      mask.alpha[Math.round(y * scale) * mask.width + Math.round(x * scale)] as number
  }

  test('the mask keeps the SVG\u2019s aspect, which is the ratio the layout solved on', () => {
    const mask = mwaMask(MWA_WIDTH)
    assert.equal(mask.width, MWA_WIDTH)
    // 735.22 x 154 in the file, and the height *is* the cap height \u2014 which is what
    // lets `lockupGeometry` read the half's ratio-to-cap off the viewBox directly.
    assert.equal(mask.height, Math.round((MWA_WIDTH * 154) / 735.22))
  })

  test('a stem is solid and the space between the M’s stems is not', () => {
    const at = sample()
    // The M's left stem runs x 0..29.80 all the way down to the baseline.
    assert.equal(at(15, 140), 255)
    // Below where its four middle edges meet, the space between the stems is outside
    // the letter — the notch, not a counter.
    assert.equal(at(114, 140), 0)
  })

  test('the A has no enclosed counter: the space between its legs opens downward', () => {
    // #106. The brand A's crossbar hangs off the right leg only and stops short of the
    // left one, so what looks like a counter is a bay open at the bottom left. That is
    // why `mwaforge-mwa.svg` is three polygons and not four — there is no hole to state.
    const at = sample()
    // First that there is an `A` here at all: both legs and the crossbar between them.
    // Every claim below is a claim about *empty* pixels, and an `A` that failed to
    // rasterise would satisfy all of them.
    assert.equal(at(575, 70), 255, 'the A’s left leg is not drawn')
    assert.equal(at(670, 70), 255, 'the A’s right leg is not drawn')
    assert.equal(at(660, 110), 255, 'the A’s crossbar is not drawn')
    // Above the crossbar, between the legs: empty, as a counter would also be.
    assert.equal(at(625, 70), 0)
    // But at the crossbar's own rows there is a channel between the left leg's inner
    // edge and the bar's left end, and it runs on down past the baseline. A closed
    // counter has no such row.
    for (const y of [100, 110, 120]) assert.equal(at(595, y), 0, `the bay is closed at y ${y}`)
    assert.equal(at(595, 150), 0)
  })

  test('MWA is inked in the house palette, not in a colour of its own', () => {
    const { data, width, height } = mwaRgba(MWA_WIDTH)
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
    assert.ok(covered > 0.2 && covered < 0.6, `MWA covers ${(covered * 100).toFixed(1)}% of its box`)
  })
})

describe('the lockup’s proportions are solved, not tabulated', () => {
  test('the two halves are set to one cap height, and MWA’s box is exactly it', () => {
    const geometry = lockupGeometry(MARK_WIDTH)
    assert.equal(geometry.mwa.height, geometry.capHeight)
    // `FORGE`'s box is taller, because `O` and `G` overshoot a flat capital at both
    // ends — and `MWA` sits that overshoot down from the drawn box's top so the two
    // halves' flat capitals line up.
    assert.ok(geometry.forge.height > geometry.capHeight)
    assert.ok(geometry.mwa.y > 0 && geometry.mwa.y < 3)
    assert.equal(geometry.forge.y, 0)
  })

  test('the cap height falls out of the width — no offset table, at any size', () => {
    // The whole point of solving it: the same three ratios at any `MARK_WIDTH`, so
    // nothing has to be re-measured when the card's one image changes size.
    const small = lockupGeometry(440)
    const large = lockupGeometry(880)
    assert.ok(Math.abs(large.capHeight / small.capHeight - 2) < 1e-9)
    assert.ok(Math.abs(large.gap / large.capHeight - small.gap / small.capHeight) < 1e-9)
    // And the fontsize is the cap read through the face's own cap-to-em ratio: 0.70
    // for Space Grotesk, so a cap of 87.57 is set at 125.10.
    assert.ok(Math.abs(large.fontSize * (capUnits() / unitsPerEm()) - large.capHeight) < 1e-9)
  })

  test('FORGE is tracked at a round 0.100em, with the F→O kern carried separately', () => {
    // #106: fitting one number to the whole word gives 0.094em, which is that single
    // `GPOS` pair smeared across four gaps. The face has no legacy `kern` table and
    // each glyph is drawn on its own, so nothing downstream would ever apply it — the
    // pen positions have to carry it, and they are checked here against the asset's.
    assert.equal(TRACKING, 0.1)
    assert.equal(KERN_FO, -6.5)
    const { glyphs, capHeight } = lockupGeometry(MARK_WIDTH)
    const units = (index: number) =>
      (((glyphs[index] as { x: number }).x - (glyphs[0] as { x: number }).x) * capUnits()) /
      capHeight
    // Measured off the exported PNG, in font units relative to `F`'s pen.
    for (const [index, measured] of [627.27, 1403.91, 2135.5, 2897.23].entries()) {
      assert.ok(
        Math.abs(units(index + 1) - measured) < 1,
        `pen ${index + 1} is ${units(index + 1).toFixed(2)}, the asset says ${measured}`,
      )
    }
  })

  test('the drawn box is the type’s, so the O and the G are not clipped', () => {
    const { height, capHeight } = lockupGeometry(MARK_WIDTH)
    const drawn = glyphMetrics('O').yMax - glyphMetrics('O').yMin
    assert.ok(Math.abs(height - (capHeight * drawn) / capUnits()) < 1e-9)
  })
})

describe('the spark is the one gradient in a reel', () => {
  test('it ramps blue to purple to pink across its width and nowhere else', () => {
    const width = 100
    const { data } = sparkRgba(width, 3)
    const at = (x: number) => [data[x * 4], data[x * 4 + 1], data[x * 4 + 2]] as number[]
    const [firstR, , firstB] = at(0) as [number, number, number]
    const [lastR, , lastB] = at(width - 1) as [number, number, number]
    // Blue at the left, pink at the right: red climbs and blue falls across the ramp.
    assert.ok(firstR < lastR && firstB > lastB)
    for (let x = 0; x < width; x++) {
      // Flat down every column — the shape is the glyph mask's to give, not the ramp's.
      assert.deepEqual(
        [...data.subarray(x * 4, x * 4 + 4)],
        [...data.subarray((2 * width + x) * 4, (2 * width + x) * 4 + 4)],
      )
      // Opaque: `alphamerge` reads the mask's luma for transparency, so a ramp that
      // carried alpha of its own would be a second opinion about the same pixels.
      assert.equal(data[x * 4 + 3], 255)
    }
  })

  test('the accent is the spark’s middle stop rather than a second purple', () => {
    // `CONTEXT.md`, "Spark": the flat accent and the gradient's middle are one colour,
    // so a restyle of one cannot leave the other behind.
    assert.equal(SPARK[1]?.color, ACCENT)
    assert.equal(SPARK[1]?.at, 0.55)
  })
})

describe('the card is laid out in the boosted safe box', () => {
  const layout = cardLayout()

  test('its content is centred on y 760, not on the frame\u2019s own middle', () => {
    const top = layout.lockup.y
    const bottom = layout.credit.y + TYPE.credit.lineHeight
    assert.ok(Math.abs((top + bottom) / 2 - CARD_CENTRE_Y) <= 1, `centred on ${(top + bottom) / 2}`)
  })

  test('nothing reaches outside the box Meta leaves alone', () => {
    assert.ok(layout.lockup.y >= SAFE_ZONE.top)
    assert.ok(layout.credit.y + TYPE.credit.lineHeight <= SAFE_ZONE.bottom)
    // The lockup keeps a breath of ground either side rather than reaching the edges:
    // a mark that touches the box it is centred in reads as cropped by the frame, and
    // `<=` would pass on the equality that is exactly that failure (#106).
    const breath = 20
    assert.ok(layout.lockup.x >= SAFE_ZONE.left + breath, `the lockup starts at ${layout.lockup.x}`)
    assert.ok(layout.lockup.x + layout.lockup.width <= SAFE_ZONE.right - breath)
    assert.ok(layout.rule.x >= SAFE_ZONE.left && layout.rule.x + layout.rule.width <= SAFE_ZONE.right)
  })

  test('lockup, tagline, headline, rule and credit stack in that order', () => {
    assert.ok(layout.lockup.y + layout.lockup.height < layout.tagline.y)
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
    assert.equal(layout.lockup.y, 517)
    assert.equal(layout.lockup.height, 92)
    assert.equal(layout.tagline.y, 641)
    assert.equal(layout.headline.y, 757)
    assert.equal(layout.rule.y, 913)
    assert.equal(layout.credit.y, 959)
    assert.equal(layout.credit.y + TYPE.credit.lineHeight, 1003)
  })

  test('the tagline sits closer to the lockup than to the headline', () => {
    // #61: the lockup and the words for what it sells are one signature. Set
    // equidistant they read as two separate lines that happen to be stacked, and the
    // tagline starts to look like a second headline instead of the lockup's own signing.
    const toLockup = layout.tagline.y - (layout.lockup.y + layout.lockup.height)
    const toHeadline = layout.headline.y - (layout.tagline.y + TYPE.tagline.lineHeight)
    assert.ok(toLockup < toHeadline, `the signature is not one object: ${toLockup} vs ${toHeadline}`)
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

describe('the title shot is the same mark, saying the reel\u2019s first line', () => {
  const layout = titleLayout()
  const card = cardLayout()

  test('the lockup lands where the card\u2019s does, and only the stack under it differs', () => {
    // The reel opens and closes on one object: a mark that moved between the two
    // would read as two different marks rather than as the same one, twice.
    assert.equal(layout.lockup.x, card.lockup.x)
    assert.equal(layout.lockup.width, card.lockup.width)
    assert.equal(layout.lockup.height, card.lockup.height)
  })

  test('its content is centred on y 760, inside the box Meta leaves alone', () => {
    const top = layout.lockup.y
    const bottom = layout.line.y + TYPE.label.lineHeight
    assert.ok(Math.abs((top + bottom) / 2 - CARD_CENTRE_Y) <= 1, `centred on ${(top + bottom) / 2}`)
    assert.ok(top >= SAFE_ZONE.top)
    assert.ok(bottom <= SAFE_ZONE.bottom)
  })

  test('the line sits under the mark, at the size every beat\u2019s line is set in', () => {
    assert.ok(layout.lockup.y + layout.lockup.height < layout.line.y)
    const stage = titleStage(titleGraph())
    assert.ok(stage.includes(`fontsize=${TYPE.label.size}`), stage)
    // The house face, centred on the frame, in house ink, and with no alpha
    // expression: the title has no envelope, exactly as the card's lines have none.
    assert.ok(stage.startsWith(`drawtext=fontfile=${escapeValue(FONT_FILE)}`), stage)
    assert.ok(stage.includes('x=(w-text_w)/2'), stage)
    assert.ok(stage.includes(`fontcolor=${INK.replace('#', '0x')}`), stage)
    assert.ok(!stage.includes('alpha='), stage)
  })

  test('the line fits the card at the size it is set in', () => {
    // A constant, like the tagline: the line nobody can shorten has to fit before it
    // ships, and type never shrinks to fit.
    assert.ok(lineWidth(TITLE_LINE, TYPE.label.size) <= card.width)
  })

  test('it opens the sentence the card finishes', () => {
    // #106: one sentence with the proof in the middle of it. Not the same line twice,
    // and not two unrelated claims either.
    assert.notEqual(TITLE_LINE, TAGLINE)
    assert.ok(TITLE_LINE.startsWith('Websites that'), TITLE_LINE)
    assert.ok(TAGLINE.startsWith('Websites that'), TAGLINE)
    assert.ok(TITLE_LINE.endsWith('...'), TITLE_LINE)
  })

  test('it draws the mark and nothing the card carries under it', () => {
    const chains = titleGraph()
    assert.match(chains, /overlay=x=\d+:y=\d+/)
    assert.ok(!chains.includes(`text=${escapeValue(HEADLINE)}`), 'the title carries the headline')
    assert.ok(!chains.includes(`text=${escapeValue(TAGLINE)}`), 'the title carries the tagline')
    assert.ok(!chains.includes('drawbox='), 'the title carries the accent rule')
    // One line of type on it, and it is this one. Six `drawtext`s: the lockup sets
    // `FORGE` a glyph at a time (ADR-0010), and the sixth is the line.
    assert.equal((chains.match(/drawtext=/g) ?? []).length, 6)
    assert.deepEqual(
      [...chains.matchAll(/:text=([^:]+)/g)].map((match) => match[1]),
      [...'FORGE', escapeValue(TITLE_LINE)],
    )
  })

  test('it drifts for its whole shot, like every other shot in the reel', () => {
    const shot = REEL.shots[0] as Shot
    assert.equal(shot.kind, 'title')
    const camera = cardCamera(shot)
    assert.equal(camera.frames, frameCount(shot.durationMs))
    assert.notEqual(camera.zoom.from, camera.zoom.to)
    assert.ok(titleGraph().includes('zoompan'), 'the title is a still')
  })
})

describe('the card\u2019s filtergraph', () => {
  test('draws the lockup, the tagline, the headline, the accent rule and the credit', () => {
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
    // Three: the tagline, the headline and the credit. `FORGE`'s five glyphs are not
    // lines of copy — each is placed at a pen position the face decided.
    assert.equal(graph().match(/x=\(w-text_w\)\/2/g)?.length, 3)
  })

  test('FORGE is five drawtexts on one baseline, cut out of the spark', () => {
    const chains = graph()
    const { geometry } = cardLayout().lockup
    for (const glyph of geometry.glyphs) {
      assert.ok(
        chains.includes(`text=${glyph.character}:expansion=none:fontcolor=white`),
        `${glyph.character} is not drawn into the mask`,
      )
    }
    // On a baseline solved from the face, not on a top the five letters happen to share.
    assert.equal(chains.match(/y_align=baseline/g)?.length, 5)
    assert.ok(chains.includes(`fontsize=${geometry.fontSize}`))
    // White on black and read as luma: `alphamerge` takes the mask's brightness for
    // the ramp's transparency, so the mask is a `gray` picture and not an alpha channel.
    assert.ok(chains.includes('color=c=black:'))
    assert.ok(chains.includes('format=gray[mask]'))
    assert.ok(chains.includes('[ramp][mask]alphamerge[forge]'))
  })

  test('the spark ramps across FORGE and across nothing else', () => {
    // `CONTEXT.md`, "Spark". The ramp is cut to the `FORGE` box, so the blue end lands
    // on the `F` — a ramp the width of the lockup would spend its blue under `MWA`.
    const { geometry } = cardLayout().lockup
    assert.ok(geometry.forge.width < geometry.width * 0.6)
    assert.ok(!graph().includes('gradients'), 'the spark is a buffer, not an ffmpeg gradient')
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
    // Its only image is the repo's own lockup, which lands in two overlays because it
    // is drawn in two halves — `MWA`'s pixels, then `FORGE`'s.
    assert.equal(chains.match(/overlay=/g)?.length, 2)
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
