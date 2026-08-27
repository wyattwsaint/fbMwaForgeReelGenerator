# ADR-0003: The wordmark is an SVG, rasterised in this repo

## Status

Accepted (2026-08-27, from the review of #25).

## Context

#9 §5 fixes the CTA card's mark as "MWA Forge wordmark, SVG, repo constant", and §7
fixes the compositing engine as raw ffmpeg and nothing else. Those two hold together
only if something turns the SVG into pixels, because ffmpeg has no SVG decoder in any
build this pipeline can count on — the one it is developed against is compiled without
librsvg, and `-i mark.svg` fails there rather than degrading.

Three ways out:

1. **Check in a PNG instead.** Cheapest today. But the mark then exists twice — the
   drawn source and the raster — and the pair drifts the first time nobody re-exports.
   It also drops the word the spec chose, which was chosen because a mark that is only
   ever a raster cannot be re-inked or re-sized without a design tool.
2. **Require an ffmpeg with librsvg.** Moves the problem into the environment, where it
   fails at render time on a machine that is otherwise fine, and for a reason the error
   message will not explain.
3. **Rasterise the SVG here.**

## Decision

The SVG is the constant, and `src/wordmark.ts` rasterises it into raw RGBA that the
filtergraph reads as a one-frame input.

The reader's dialect is `viewBox` plus `<polygon points>`, which is the whole of what
`assets/brand/mwaforge-wordmark.svg` uses. Anything richer — a path, a transform, a
fill — is **refused by name** rather than ignored: a mark that renders half-drawn is
worse than one that fails to render, and the failure is at the only moment anyone can
act on it.

## Consequences

- The mark's geometry is constrained by the reader, not the other way round. The
  letterforms are straight-line because the dialect is polygons. Widening the mark's
  vocabulary means widening the reader first, deliberately, in a commit that says so.
- The raster is never checked in. It is derived from a checked-in constant, written
  beside the run's masters and wiped with them (ADR-0002's rule: only what cannot be
  regenerated is kept).
- Colour lives in `src/house.ts`, not in the asset, so a palette change re-inks the
  mark without touching it.
- This is a rasteriser, not a renderer. If the card ever wants a second image that is
  not four polygons, revisit this decision rather than growing the dialect a shape at
  a time.
