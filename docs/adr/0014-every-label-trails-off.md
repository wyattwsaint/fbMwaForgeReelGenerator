# ADR-0014: Every label trails off

## Status

Accepted (2026-09-02). Adds to ADR-0012's reading of what a label is; changes no
size, budget or slot. Amended 2026-09-02: the hook trails off too — see
[Amendment](#amendment-2026-09-02-the-hook-trails-off-too).

## Context

A beat's label is one line of the reel's own voice over a shot that never stops
moving. Written as a sentence it reads as a caption: a statement closed over the
section under it, which is the caption reading ADR-0012 argued the label out of.
Several shipped labels end in a full stop and read exactly that way.

The alternative was to leave it to the copy: write every label as a lead-in and let
the config carry the mark. That puts a house-style constant in fifteen site files
and in every heading a page hands over as a defaulted label, and a heading is never
going to arrive with one.

## Decision

Every beat label draws with `...` after it, applied at plan time to the drawn line
and nowhere else. A closing full stop is dropped first, a `?` or `!` is kept, a line
already ending in `...` is left alone, and an empty label stays empty. The trail is
part of the line `check` measures, so it counts against the budget and the slot.

## Consequences

- Config and page headings never write the trail; a config that does is left alone,
  not doubled.
- Three characters nobody typed count against the 42: a label written at the budget
  now fails `check`. Every shipped site still fits.
- The hook line is untouched: it is the reel's claim, and a claim does not trail off.
  Superseded by the amendment below.

## Amendment (2026-09-02): the hook trails off too

The original decision drew the line at the hook: a claim does not trail off. On
screen the two lines are the same line — ADR-0012 gave the hook and the label one
voice and one size — and a hook set clean above a reel of trailing labels reads as
two houses rather than one. The hook is a lead-in as much as any label is: it opens
onto the shots under it and does not close over them.

So `trailed` applies to the hook's drawn line as well, by exactly the same rule:
applied at plan time and nowhere else, a closing full stop dropped, `?` and `!` kept,
`...` never doubled, empty left empty. It is part of the line `check` measures, so
the three characters count against the hook's budget and slot the way they count
against a label's. Every shipped site still fits.
