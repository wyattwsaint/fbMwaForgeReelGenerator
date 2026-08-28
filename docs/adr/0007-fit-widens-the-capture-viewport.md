# ADR-0007: Fit widens the capture viewport rather than punching below 1.0

## Status

Accepted (2026-08-28, resolves #77 — records the decision #65 shipped).

## Context

A beat's master is a section of the client's page, framed to 9:16. Sections taller
than a frame have always been handled by **punch-in**: crop a narrower column out of
the page and let the section fill the frame. Sections *shorter* than a frame had no
handling at all — `check` refused them, and a site whose gallery or pricing block is
laid out short simply could not be a beat.

The obvious move was to read the punch factor the other way: a factor above 1.0 crops
in, so a factor below 1.0 should pull out. It cannot. The punch is a crop over a page
**already rasterised at frame width**, so the pixels outside the frame-wide render do
not exist. A factor under 1.0 asks the compositor for page pixels that were never
drawn; the punch could not have expressed fit, ever, at any point in this pipeline's
history. Whatever pulls out has to make the browser render more page, not ask ffmpeg
to crop less of it.

The trade this leaves is the one ADR-0005 weighs in its "every pan is not
oversampled" clause: captured pixels bought at capture time against what the move
path can express afterwards. #65 argued it, and its review argued it again — which is
the signal an ADR exists for, and the legibility-cap work will be argued against
these same premises.

## Decision

**Fit widens the capture viewport**, and `CONTEXT.md`'s **Fit** entry defines the
mechanism. Fit is per-beat and mutually exclusive with a punch factor: the two are
opposite ends of one axis, not settings that compose.

**Fit only ever widens.** A section already inside one frame has nothing to fit.
Narrowing the viewport to reach it would shoot the site's **phone layout** — a
different site, not a wider view of this one — so such a section stays at the base
viewport and `check` refuses it for the reason it always did: too short for a frame.

**A fit beat's section is measured twice, and the width is not re-derived from the
second measurement.** The first measurement, at the base viewport, is what
`fitViewportWidth` turns into a width. Widening reflows the site, so the section that
comes back is not the section that was measured; `capture` re-measures after the
reflow and frames the clip on *that*. But the fit width stands.

**A fit clip is exactly one frame, centred on the section.** A fit master that came
back taller than a frame would be a fit beat quietly not fitting, and everything
downstream reads a master taller than a frame as room to travel — so the overshoot
would not surface as a failure, it would surface as a pan.

## Consequences

- **Fit costs page loads.** A page load is per url, per viewport width and per raster
  scale, so a fit beat cannot share one with a non-fit beat on the same url. That is
  the capture-time price of the decision.
- **A fit beat sees a different layout** than the rest of the reel — its own site,
  reflowed. Judging a fit beat means looking at the beat, not at the base-viewport
  page.
- **A fit section has no room for a pan**, so the plan drifts it — the same reasoning
  that punches a lateral pan, read the other way round. `CONTEXT.md`'s **Fit** entry
  carries what a beat that names `move: 'pan'` anyway gets.
- The fit width is an estimate derived from a pre-reflow measurement. If a site
  reflows hard enough that one pass lands badly, the fix is a second pass or a config
  override — not re-deriving the width from the reflowed height, which is the loop
  this decision closes.
- **Widening has a floor, and #66 set it where the type sizes are.** This decision
  says fit only ever widens; it does not say how far. Widening draws the client's
  whole page smaller, its body copy included, so past some scale a fit section is a
  section nobody can read — which makes the limit a *legibility* question and not a
  capture-geometry one. It is therefore one house constant beside the type sizes it
  defends, not a second number next to `fitViewportWidth`. Past it a fit beat falls
  back to fit-to-width plus a vertical pan, and `check` names the beat and the
  section that was too tall; `CONTEXT.md`'s **Fit** entry carries the rule. Nothing
  above changes: the premises this ADR argued are the ones the cap was argued
  against.
