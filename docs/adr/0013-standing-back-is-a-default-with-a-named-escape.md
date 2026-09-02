# ADR-0013: Standing back is a default with a named escape

## Status

Accepted (2026-09-01). Amended 2026-09-01 (resolves #116): a fourth thing stops a
beat, and it stops it *past* the default rather than short of it — see
[Amendment](#amendment-2026-09-01-the-gutter-stops-a-beat-past-the-default).

## Context

Beats were framed tight enough that a shot showed a *detail* of the client's page
rather than the page, and the page is what a reel is selling. #114 pulled pharos back
30% by dividing every punch factor by 1.3. This decision asks for the same move again
— a second ÷1.3 — and asks that it hold for every reel after this one rather than for
pharos alone.

Two of pharos' four beats cannot take it, and neither refusal is about pharos.

**The punch floors at 1.0.** `#teachers` at 1.154 divides to 0.888 and `#inquiry` at
1.231 to 0.947. ADR-0007 settled why 1.0 is a floor and not a midpoint: a punch is a
crop over a page already rasterised at frame width, so a factor under 1.0 asks for
pixels that were never drawn.

**Fit cannot rescue them.** Fit is the sanctioned way past 1.0, but
`fitViewportWidth` clamps at the base width until a section is taller than one frame
— ADR-0007's "fit only ever widens" — so a fit under 1920px is a no-op, and `check`
then refuses the beat as too short for a frame. To fit *and* stand 30% back, a window
must be 2496px. `#teachers` at 2496 reaches y 5733, through `#costs`, through the
whole of `#faith` and 733px into `#inquiry` — half the page, not the pair the window
was opened for. `#inquiry` at 2496 cannot open below y 3956 on a 6452px page, and y
3956 is inside `#teachers`: there is no `y` it could be given.

**Widening the base viewport was tried and is worse.** If the punch cannot pull out,
the capture viewport is the other lever — the same mechanism fit uses. It was
implemented at 1404px (1080 × 1.3) and measured. A frame at punch 1.0 then covers
2496 CSS px of page height rather than 1920, because `punchedFrameHeight` scales with
the viewport; sections did not shrink to match, and pharos reflowed *taller*
(`#week` 1310 → 1336, `#faith` 810 → 865). Every beat in every site failed `check`,
mwaforge's hand-written windows ran off the page, and the suite went from 0 failures
to 40. Widening the base does not stand the camera back — it makes the frame hungrier
and pushes every punch factor *up*. Fit works because it trades a section's excess
height for width at a fixed frame; making it the base leaves nothing to trade
against.

## Decision

**Derive punches at the pulled-back distance. Where the floor or the page refuses,
stop there and say so in the beat.**

The default is the arithmetic: a beat's punch is what it was, divided by 1.3. It is a
default and not a constant — it lives in this ADR and in each beat's own comment, and
sites go on writing final numbers. Nothing in `frame.ts` or `plan.ts` applies it,
because a blanket division would have driven `#teachers` and `#inquiry` under the
floor with no human in the loop, on sites nobody re-measured.

**A beat may stop short of the default, and a beat that does must name what stopped
it.** ~~There are three things that stop one, and all three are already checked:~~
Three things stop a beat *short* of the default and all three are checked; a fourth
stops it *past* the default and is checked by nothing (see the Amendment):

- the 1.0 punch floor (`config.ts`),
- the section height one punched frame needs (`check.ts`), which rises as the punch
  falls and is what makes standing back cost window height,
- `panTravelNeeded` — a pan's travel is bought with the same punch, so pulling out
  spends it. A punch that leaves a pan under `MIN_PAN_PX_PER_FRAME` clamps at the
  pan's own floor instead.

**The base viewport stays 1080 × 1920.** Standing back is a per-beat framing
decision, in the same family as `punchFactor` and `heroPosition` — not a house
constant, and not something a viewport width can be made to mean.

## Consequences

- **pharos is the worked example, in all four beats.** `#faith` takes the full 30%
  twice (2.7 → 1.598) because it has the deepest punch in the reel to spend. `#week`
  clamps at 1.194, the lateral pan's own floor, standing 14% further out rather than
  30% — it is the reel's only lateral pan, and 1.065 would leave it 0.67px a frame.
  ~~`#teachers` and `#inquiry` hold at 1.154 and 1.231 and each says which of the two
  refusals it hit.~~ `#inquiry` holds at 1.231; `#teachers` stands at 1.04 as of the
  Amendment below.
- **A reel is no longer uniformly framed, and should not be read as if it were.**
  Beats now stand at whatever distance their section and their move allow. That is
  the honest state of a page whose sections are not all the same height.
- **Standing back is paid for in window height, and the bill lands on neighbours.**
  `#week`'s window grows to 1609px and takes the first 292px of `#teachers` — which
  `beats[1]` opens on a cut later. `#faith`'s grows to 1333px and its pan now ends
  523px inside `#inquiry` where it ended 243px in. Each further ÷1.3 buys less
  distance for more overlap, and the overlap is where the next reel will feel it
  first.
- **`#faith`'s pan now runs at exactly `MIN_PAN_PX_PER_FRAME`.** It has no margin
  left. A third ÷1.3 on that beat is a drift, whatever the config calls it.
- **brobst, legacyroof and mwaforge are unchanged.** This is a rule for reels framed
  after it, not a retrofit — none of their windows have been re-derived, and #114's
  first 30% never reached them either.
- **The refusals are per-page, not permanent.** `#inquiry` is stuck because it is the
  last section on a 6452px page. A longer page, or a beat that is not last, hits
  neither wall — which is why the escape is named in the beat rather than encoded as
  a lower bound somewhere central.

## Amendment (2026-09-01): the gutter stops a beat past the default

The Decision above names three things that stop a beat short of the ÷1.3 default and
says all three are checked. #116 found a fourth, and it does not fit that shape: it
stops a beat *past* the default, and nothing checks it.

A punch crops a column `1080 / punch` wide out of the **middle** of a frame-wide
render, so the first thing it spends is the client page's own left and right margins —
its **gutter** (`CONTEXT.md`). Past the punch that leaves the gutter exactly covered,
the next thing cropped is the start of every line in the shot. pharos' `#teachers` was
there at 1.154, losing 2–4 characters off two of the page's headings for the shot's
whole duration, and it is out at 1.04 — a *deeper* stand-back than this decision asked
for, driven by a constraint this decision does not name.

Its lower bound is a fifth unchecked thing: standing back costs window height, and a
window tall enough eventually reaches the next section's first line of type and slices
it. `#teachers` stops at 1.0323 for that reason and not for the punch floor.

Neither is a candidate for `check`. A gutter is a page fact — it is whatever the
client's layout uses — and where the next line of type begins is another; both are
read off the settled page, and turning either into a refusal would be `check` deciding
the
framing rather than reporting on it, which is the line this repo's **check** entry
draws. They are named here and argued in the beat instead.

## Amended decision

**A beat may stand past the default as well as short of it, and either way it names
what put it where it is.** The default is still `punch ÷ 1.3` and still lives here
rather than in `frame.ts` or `plan.ts`. What changes is that the distance a beat ends
up at is not bounded above by the default: a page fact the pipeline does not check —
today, the gutter — may ask for more, and a beat that takes more says so in its own
comment with the measurement beside it.

Everything else stands. The 1.0 floor is real, `fit` is still the only sanctioned way
past it, and the base viewport is still 1080 × 1920.

## Amended consequences

- **`#teachers` stands at 1.04, not 1.154, and its window is 1847px.** The arithmetic
  and the per-frame measurements live in `sites/pharos.ts`, which is where a reader
  goes to change the number.
- **The ÷1.3 ask is still refused.** 1.154 ÷ 1.3 = 0.888 is under the floor, and 1.04
  is not that ask met — it is a different constraint landing between the ask and where
  the beat was.
- **A drift cannot hold a gutter for a whole shot.** `DRIFT_ZOOM` ramps 10% inside the
  window the punch already cropped, so holding the gutter across the ramp would want a
  punch of 0.955. A config-only fix therefore buys one end of the ramp, not the shot;
  `#teachers` buys the shallow end, which its pull makes the last frame.
- **That fix rides on the push/pull rotation.** `#teachers` pins `pushPull` rather than
  inheriting it, because a rotation that quietly turned the pull into a push would move
  the whole-heading frame to frame 0 with nothing failing.
- **`#week` is not covered by any of this.** Its heading clips because a lateral pan
  travels off it, not because the punch crops into it; #122 has it.
