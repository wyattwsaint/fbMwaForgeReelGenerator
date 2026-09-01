# ADR-0012: One voice, one size

## Status

Accepted (2026-08-31). Amends #9's type table; touches nothing else in it.

## Context

`TYPE` has carried five roles since #9, and two of them are the reel's own words over
the client's page: `hook` at 76/92 and `label` at 44/56. The step down was never
argued in writing, but the reading behind it is legible in the table's shape — the
hook is the reel's claim and a label is a caption on someone else's page, so the
caption is set under the claim, the way a figure caption sits under a figure.

That is a picture of a reader, and there is no reader here. A reel is silent, it
plays at thumb size in a feed, and it is over in nineteen seconds. Inside a beat's
3.5 seconds the label is the only thing that says what the shot is *for*: the page
underneath it is the client's, drawn at the client's own scale, and it is saying what
the client sells. Strip the label out and a beat is a pretty scroll-past.

A caption the viewer has to lean in for is a caption they skip. At 44px in a 1080-wide
frame, on a phone, that is what a label is — and it is competing with a page that
frequently sets its own headings larger.

The counter-argument is real and is why the step existed: a label at hook size is a
big piece of type sitting on someone else's design, and it takes the frame. But the
frame is already taken. The scrim is there precisely because the reel's words come
first, and #60 settled that the wash is as tall as the text needs. A label set small
under a full-strength scrim gets the cost of the wash without the benefit of the
voice.

## Decision

**`TYPE.label` is `TYPE.hook`** — 76/92. There is one voice across a reel and it is
one size.

**`COPY_BUDGETS.label` moves with it**, to the hook's `{ lines: 2, chars: 42 }`. The
budget table is a proxy for the width a size draws — `copyProblems` checks the count
first and the drawn width second, and the count is the allowance a human is given
before they ever render. A count calibrated to 44px, carried onto 76px type, refuses
lines that fit and admits lines that do not, which is a proxy pointing at nothing.

Two lines rather than one because that is what the slot holds: `TEXT_SLOT.top` is
`SLOT_FOOT - 2 * TYPE.hook.lineHeight` by construction, so a label at hook size has
exactly the hook's room and no less.

## Consequences

- **Every existing label is re-measured, and some will fail.** They fail loudly, in
  `check`, by drawn width — which is the bargain #9 made. `sites/pharos.ts` produced
  the first one on the day this was written: `Clear and engaging design` draws 979px
  at 76px against a 950px box, and became two lines.
- **A label may now break a line.** That was a hook's privilege, and the privilege was
  really the slot's.
- **The scrim does not move.** It is anchored to the copy at both ends (#60), so it
  grows with a two-line label on its own and there is no second number to keep in
  step.
- **The label role stays in the table** rather than being deleted and aliased to
  `hook`. They are the same numbers today because one argument makes them the same;
  they are not the same thing, and a future finding about a beat's line should have
  somewhere to land.
- The card's three roles — `tagline`, `headline`, `credit` — are untouched. The card
  is a flat ground with nothing to compete with, and its scale was argued on its own
  terms in #61.
