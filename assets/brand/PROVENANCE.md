# assets/brand/ provenance

## mwaforge-wordmark.svg

- **What**: the MWA wordmark — the mark on the CTA card (`CONTEXT.md`, "CTA"; #9 §5,
  #25). MWA Forge's own asset, drawn for this repo. It is a **repo constant**: no site
  config reaches it, and no client brand asset is ever drawn in its place. The full
  name is not the mark's job — `mwaforge.com` is the headline set beside it.
- **Geometry**: four filled polygons — one outline per letter, plus the A's counter,
  which is a hole because the whole set is filled even-odd.
- **Colour**: none. Every polygon is a shape, not a swatch; `src/wordmark.ts` rasterises
  the set as a coverage mask and inks it in house `INK`. A mark that carried its own hex
  would be a second palette beside `src/house.ts`.
- **Dialect**: `viewBox` plus `<polygon points>`, and nothing else — that is the whole
  of what `src/wordmark.ts` reads, and why, is ADR-0003.

Checked in rather than fetched, for the same reason the signature track and the
display face are (ADR-0002): a render that reaches the network to learn what MWA
Forge looks like is a failure mode with no upside.
