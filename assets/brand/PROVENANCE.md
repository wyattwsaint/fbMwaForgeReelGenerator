# assets/brand/ provenance

## mwaforge-wordmark.svg

- **What**: the MWA Forge monogram — the mark on the CTA card (#9 §5, #25). MWA
  Forge's own asset, drawn for this repo. It is a **repo constant**: no site config
  reaches it, and no client brand asset is ever drawn in its place.
- **Geometry**: four filled polygons — one outline per letter, plus the A's counter,
  which is a hole because the whole set is filled even-odd. The letterforms are all
  straight-line, which is why the mark is `M W A` and the full name reaches the viewer
  as type in the headline instead.
- **Colour**: none. Every polygon is a shape, not a swatch; `src/card.ts` rasterises
  the union as a coverage mask and inks it in house `INK`. A mark that carried its
  own hex would be a second palette beside `src/house.ts`.
- **Dialect**: `viewBox` plus `<polygon points>`, and nothing else — that is the
  whole of what `src/wordmark.ts` reads. Deliberate: ffmpeg has no SVG decoder in any
  build we can count on, so the mark is rasterised here rather than handed to a
  filtergraph, and the smallest dialect that can express this mark is the one with the
  fewest ways to draw something the renderer would silently drop.

Checked in rather than fetched, for the same reason the signature track and the
display face are (ADR-0002): a render that reaches the network to learn what MWA
Forge looks like is a failure mode with no upside.
