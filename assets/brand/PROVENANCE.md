# assets/brand/ provenance

Both files here describe one thing, the **lockup** (`CONTEXT.md`, "Lockup"; #9 §5,
#25, #106): the word `MWA` beside the word `FORGE`. It is MWA Forge's own asset,
drawn for this repo, and a **repo constant** — no site config reaches it, and no
client brand asset is ever drawn in its place. The full name is not the lockup's
job; `mwaforge.com` is the headline set beside it.

The lockup's two halves are made differently — `MWA` is drawn geometry, `FORGE` is
the house display face set as type (ADR-0010) — so the two files below are the two
halves' two answers to the same question, plus the render the pair is checked
against.

## mwaforge-mwa.svg

- **What**: the `MWA` half, retraced from `mwaforge-lockup.png` at ticket #106.
  Was `mwaforge-wordmark.svg`; renamed with the glossary, which retired "wordmark"
  in favour of **lockup** for the whole and `MWA`/`FORGE` for the halves.
- **Geometry**: three filled polygons, one outline per letter. There is no fourth:
  the brand `A` has **no enclosed counter** — its crossbar hangs off the right leg
  only and stops short of the left leg, so the counter opens down-and-left between
  the legs. The `M`'s four middle edges meet at a single point, where the outline
  touches itself; the crossing-number test handles that. The `A`'s right leg
  carries a wedge across the crossbar's rows, where the bar's right end overshoots
  the leg — it is in the 6680px original, not a downscale artifact, and leaving it
  out was the single largest error in the earlier trace.
- **Coordinates**: `viewBox="0 0 735.22 154"`. The height **is** the cap height, so
  `viewBox.width / viewBox.height` = 4.77416 is the `MWA` half's ratio-to-cap
  directly, and the derived geometry in `src/` needs no frozen offset table.
- **Colour**: none. Every polygon is a shape, not a swatch; the rasteriser reads
  the set as a coverage mask and inks it in house `INK`. A mark that carried its
  own hex would be a second palette beside `src/house.ts`.
- **Dialect**: `viewBox` plus `<polygon points>`, and nothing else — that is the
  whole of what the rasteriser reads, and why, is ADR-0003. The fill stays even-odd
  because that is the dialect; with no overlapping polygons it is identical to a
  union fill.

## mwaforge-lockup.png

- **What**: the exported lockup, whole — both halves, transparent ground,
  6680x1440 RGBA. Not drawn at render time and never composited into a reel: it is
  the **source of truth the render is diffed against**. `mwaforge-mwa.svg` was
  traced from it, and the `FORGE` metrics in `src/` were measured off it.
- **Why it is checked in**: the gate test renders the composed lockup through the
  real filtergraph and diffs the result against this file. Without the PNG in the
  repo the gate has nothing to be a gate against, and the brand facts in `src/`
  become numbers no test can contradict.
- **What it settles**: cap height 154 in its own quarter-res ink coordinates,
  `FORGE` tracking 0.100em with one `F`→`O` kern of −6.5 units, and the
  whole-lockup width of 10.05 caps. Where the design system and this file
  disagree, this file wins — it is what the gate diffs.

Checked in rather than fetched, for the same reason the signature track and the
display face are (ADR-0002): a render that reaches the network to learn what MWA
Forge looks like is a failure mode with no upside.

## Out of scope

`mwaforge-monogram.svg` — the interlocked M+W — is not here and is not wanted: it
does not reach the reel.
