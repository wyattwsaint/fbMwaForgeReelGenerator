# ADR-0010: The lockup is half traced geometry, half type

## Status

Accepted (2026-08-31, resolves #106).

Amends [ADR-0003](./0003-the-wordmark-is-rasterised-in-repo.md), which is unchanged
and still holds. 0003 closed with an instruction: *"If the card ever wants a second
image that is not four polygons, revisit this decision rather than growing the dialect
a shape at a time."* This is that revisit.

## Context

The mark the CTA card has been drawing is not MWA Forge's mark. It is `MWA` alone, in
letterforms ~35% narrower than the brand's. The brand —
`design_handoff_mwa_forge/DESIGN-SYSTEM.md`, direction "Electric Plasma Forge" — is a
two-part lockup: `MWA` in `--text`, then
`FORGE` in the brand gradient, Space Grotesk 700 at `+0.14em`.

Measured off `mwaforge-lockup-transparent-6680px.png`:

| | letter width ÷ cap height | block |
|---|---|---|
| brand `MWA` | 1.45 | 735 × 160 |
| the SVG this repo ships | 0.94 | 502 × 160 |

The lockup's real ink aspect is **10.05:1** (the PNG's 4.64:1 canvas is mostly padding),
and the gap between the words is **0.48416 × cap height**. Both are re-measurements: the
figures this ADR was drafted with — 9.68:1 and 0.47 — came off an edge finder that
added half a pixel in its scan direction and scanned outward from inside its own ink,
so every width it reported was a pixel too wide. Nothing else in this decision turns on which set
is right, but the numbers here are the ones `src/lockup.ts` is built from.

Two things about that are outside ADR-0003 by construction. `FORGE` is not four
polygons, and the lockup is not one colour — 0003's reader emits a coverage mask that
`src/lockup.ts` inks in a single house constant.

Three ways out:

1. **Outline `FORGE` to polygons too**, one SVG for the whole lockup. Widens the
   dialect to two ink zones, and puts five more glyphs of hand-traced geometry in the
   repo — geometry that is *already* in the repo, exactly, as a font file.
2. **Check in the lockup PNG and draw it.** Kills 0003 outright, four days after it was
   accepted, for reasons 0003 already weighed and rejected: the mark then exists twice
   and the pair drifts the first time nobody re-exports.
3. **Trace `MWA`, set `FORGE` as type.**

## Decision

Three, plus the gradient generated rather than filtered.

**`MWA` is retraced** to the brand's proportions, in 0003's own dialect — filled
polygons and nothing else — so the dialect is not widened by a single shape.

It comes out **three** polygons rather than 0003's four. The brand `A` has no enclosed
counter: its crossbar hangs off the right leg only and stops short of the left, so what
looks like a counter is a bay open at the bottom left and there is no hole to state.
Even-odd stays the fill anyway, because it is the dialect and because the `M`'s outline
touches itself where its four middle edges meet — a case a fill rule has to have an
answer to, and one where even-odd's answer and a union's agree. The `A`'s right leg also
carries a **wedge** across the crossbar's rows, the bar's right end overshooting the leg
by 1.54px at the asset's full resolution; it is small enough to look like noise and it is
in the 6680px original, and leaving it out costs 246 of 255 on the worst pixel.

**`FORGE` is type**, set in `assets/fonts/SpaceGrotesk-Bold.ttf`, which this repo
already ships for every other line it draws. Rendering it and comparing against the
6680px PNG confirms the face: the flat-topped `G` with its straight spur, the `R`'s
straight leg, the `E`'s equal arms. `drawtext` has no letter-spacing option, so the
tracking is drawn glyph by glyph, at x-positions **measured from the face at run time**
rather than frozen as constants — a frozen offset table is a second copy of the font's
metrics, and going stale silently is the drift 0003 rejected option 1 to avoid.

The tracking is **0.100em, not the design system's `+0.14em`**, and it carries an
`F`→`O` kern of **−6.5 font units** beside it. Reduced from the exported asset's five
ink positions, the four gaps come out at a flat 0.100em with that one pair adjusted;
fitting a single number to the whole word instead gives 0.094em, which is not a brand
number at all — it is 0.100 with the kern smeared across four gaps. Where the design
system and the asset disagree, **the asset wins**, because the asset is what the gate
test diffs the render against. The kern is a named constant rather than a `GPOS` read:
one pair is not a shaping engine, and each glyph is a `drawtext` of its own, so nothing
downstream is ever handed a pair to shape. (The build this is developed against is
compiled `--enable-libharfbuzz`, so `drawtext` *would* apply `GPOS` given a pair — which
changes nothing here, and is worth writing down so the reason is not restated as the
stale one about `FT_Get_Kerning`.)

**The spark is generated in TypeScript** as a one-frame RGBA input and alphamerged
through the glyph mask, the same shape as 0003's rasteriser. Not ffmpeg's `gradients`:
it spaces its colours evenly and cannot place the brand's middle stop at 55%, so it is
wrong on the pixels before portability is even the question.

**The source PNG is checked in** to `assets/brand/`, and a test diffs the rasterised
lockup against it. The trace's source cannot be regenerated from this repo (ADR-0002's
rule), and without it "is the mark still the brand's mark?" is a question only a human
eye can answer — which is how a traced mark gets nudged and never re-checked.

## Consequences

- **The lockup is one thing with a seam inside it.** `src/wordmark.ts` stops being a
  rasteriser and becomes `src/lockup.ts`, which owns the lockup: it reports the geometry
  — `MWA` box, `FORGE` box, gap, cap height, pen positions, baseline — and `card.ts`
  places one thing. The proportions are brand facts,
  identical wherever the mark is drawn, so they do not belong to card layout.
- **The mark reads smaller, and that is the trade.** At 10.05:1 the lockup cannot hold
  the old `MWA`-only optical weight on a 1080-wide frame. `MARK_WIDTH` goes to 880 — a
  35px breath inside the safe box rather than filling it, so the mark is not read as
  cropped by the frame — giving an 87.6px cap in a 92px drawn box, against the old
  147. Stacking `MWA` over `FORGE` would keep the cap tall and is rejected: it invents a second lockup to
  maintain against the real one.
- **The box is now tight on all four sides.** The old `viewBox` padded 20px top and
  bottom, which `cardLayout` then spent as if it were mark. The layout constants now
  mean what they say.
- **The gradient is contained.** `SPARK` joins `ACCENT` in `src/house.ts` rather than
  replacing it, and ramps across `FORGE`'s own box — blue at the `F`, pink at the `E`.
  A ramp starting under `MWA` arrives at the `E` half-spent. `--spark-glow` is not
  carried: it exists to lift a logo off a page with content around it, and on a bare
  `GROUND` card at this size it encodes as banding.
- **The glossary moves with the code.** `CONTEXT.md` gains **lockup**, **spark** and
  **signature**, and its **card**, **tagline** and **house style** entries are rewritten
  around them; `wordmark` is retired, taking `src/wordmark.ts` and
  `assets/brand/mwaforge-wordmark.svg` with it. #106 said those entries were already
  written and they were not, which is the fourth of the ticket's claims this decision
  had to correct — the other three being the polygon count, the tracking, and the
  measurements above.
- **The gate is `test/lockup.test.ts`.** It renders frame 0 of the real card chain,
  crops the lockup's box out of it, and diffs it against the checked-in PNG scaled to
  that box: IoU over the whole lockup and over each half, the column profile fitting
  best at a shift of zero rather than at ±1, and every letter gap opening on the asset's
  own column. It needs ffmpeg, so it is its own file rather than part of `card.test.ts`.
  The thresholds are not near 1.0, and the residual is understood: the render is read as
  distance from `GROUND` and the reference as alpha coverage, which are not symmetric
  tests, so `FORGE` reads slightly thicker here than it is set.
- **If the lockup ever wants a shape that is neither a polygon nor a glyph**, revisit
  this decision — not the dialect, and not the font.
