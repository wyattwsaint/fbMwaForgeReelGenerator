# ADR-0011: The reel may choose a cover hero's crop

## Status

Accepted (2026-08-31). Answers ADR-0008 without reversing it, and extends ADR-0006.

## Context

ADR-0008 found why `sites/pharos.ts` records dead and left it there: the hero is a
1920x1080 painting under `object-fit: cover`, covering a 1080x1920 box scales it to
3413px wide, and 31.6% of the source is on screen. The moving water is outside that
column. Measured as framed, the hero reads 1.97 against a floor of 5; measured at
1920x1080, the same hero on the same page reads 7.67. Nothing about the page or the
browser is different. The frame is.

That ADR's decision — gate the recording and degrade to `still` — is the right
response to a dead reading. It is not an answer to *why* the reading is dead, and
here the why is knowable: the frame threw the motion away.

But "the frame" is two decisions, not one, and ADR-0008 only ever looked at the
first. A 9:16 box shows a column of a landscape hero — that is the frame's aspect,
and it is fixed. *Which* column is `object-position`, and that is the site's, chosen
for a visitor scrolling a page on a phone. Profiled column by column across the loop,
this painting's motion is entirely on its right (68% of it past the halfway line) and
its subject is on its left (the lighthouse the school is named for). The site points
its crop at the lighthouse and gets 9% of the motion. The reel had been accepting
that number as a fact about the page.

It is not a fact about the page. Swept at the frame the shot is actually cut in:

| `object-position` | reading |
| --- | --- |
| 22% (the site's) | 1.97 |
| 50% | 6.31 |
| 70% | 13.71 |
| 85% | 18.61 |
| 100% | 21.64 |

Every crop from the middle rightward clears the floor. The hero was never dead.

The site's own crop reads 1.97 here where ADR-0008 recorded 1.46. Neither is wrong: the
probe takes the highest of three pairs sampled across two seconds, this painting's loop
is longer than that, and a reading that low is a sliver of surviving water caught at
whatever phase the sample landed on. A dead reading wanders and a live one does not need
to be defended to the decimal — which is why ADR-0008 put the floor in open ground.

## Decision

**A hook may name which column of a cover-cropped hero the frame takes.**
`hook.heroPosition`, 0 (left edge) to 1 (right); absent leaves the site's own
`object-position` alone, which is every reel before this. It is applied to
cover-cropped `<video>` and `<img>` inside the hook's own element, on every path that
frames the hook, and it moves the horizontal half only — the site's answer to "which
band of a too-tall source" is a different question, and clobbering it would reframe an
axis nobody measured.

**This is the pipeline changing the page it films, and that is the thing being
decided.** The previous draft of this ADR rejected exactly this, in one line: "the
reel would be showing a page that does not exist." That objection is real but it
proves too much, and here is where it stops. Every pixel in the shot is still the
site's own — nothing is generated, recoloured or composited in. The crop is one the
site's own stylesheet could have written and one a viewer on a wider screen sees more
of. What moves is a *framing* decision, on the one shot whose aspect fights the
page's, in the direction the frame needs. A reel already chooses where a beat's window
opens (`y`/`height`), how far into a section it punches (`punchFactor`), and how wide
a viewport a **fit** beat is laid out in — each of them a framing the site never
authored. This is that same authority, pointed at the one crop the browser performs
before the pipeline can see it.

The line it does not cross: the reel picks a *window onto* the site's pixels. It does
not draw any.

**A per-site knob, and deliberately one.** The motion floor, the scroll's pace and the
band's aspect are house constants because there is no page for which the right answer
differs on taste. This is the opposite kind of number: it answers a question only this
hero can be looked at to answer, exactly as `punchFactor` does. The site's own
`object-position` is itself such a number — this is the reel disagreeing with it about
one shot.

**The probe measures the repositioned crop.** ADR-0008's whole claim is that the probe
measured the frame the shot is cut in, so the reposition happens before the probe, and
a hero that still reads dead still degrades to `still`. The chain is unchanged:
`scroll -> ambient -> still`. This decision does not add a step to it; it changes what
the first reading is taken of.

**A still hook's master gets it too.** A reel whose hook records dead still opens on
the framing it was written for, so the reposition is on the screenshot path as well as
the recording path.

**It does not extend to beats.** A beat is a section of a page, and a section is
exactly as wide as the viewport it is laid out in — no cover crop is throwing anything
away, and `fit` (ADR-0007) already widens the viewport for a section too big for the
frame. The case here is a hero whose *aspect* fights the frame, and only the hook
has one.

## Considered options

1. **Fix the site.** Rejected on the merits, not on cost: every 9:16 crop of this
   painting drops either the lighthouse or the water, and a phone hero that drops the
   school's namesake is a worse site. Offered and declined.
2. **A phone-only media band on the site** — show the painting whole to phone
   visitors too. Not rejected; it remains a good fix *if* the site wants it, and it is
   a site decision. This ADR is what the reel can do without asking the client to
   redesign a hero.
3. **Band the hook** — record the hero in a landscape viewport (4:3) and composite it
   across the frame on house ground, showing the page whole and smaller. Built and
   measured: it reads 7.67 and it works. Rejected on what it costs the shot. A band
   spends 58% of the frame on ground, makes frame 0 — the in-feed thumbnail (#5) — a
   poster rather than an image, and asks the site for a tablet layout it was not
   filmed in. Repositioning gets a higher reading than the band did while filling the
   frame with the site's own phone layout, which is the thing the reel is selling.
   The band remains the answer for a hero whose *subject* must survive alongside its
   motion; pharos' need not, because the school's namesake is in the lockup, in the
   logo, and in the name read aloud on the card.
4. **Take the right edge (1.0), the highest reading.** Rejected by eye at 0.15 of a
   crop: at 100% the painting is open water and the shore is gone, and at 85% it reads
   as a coast — the same subject the rest of the reel is about. 18.61 against 21.64 is
   3.7x the floor against 4.3x, and both are far enough into open ground that the
   choice is composition rather than measurement.

## Consequences

- The hook that ADR-0008 gated is live again, and the gate is untouched — a hero that
  reads dead at the crop the config names still degrades. ADR-0008 is strengthened by
  this rather than weakened: its reading was correct and its conclusion was correct
  *about the frame it was given*.
- The reel now shows pharos' hero without its lighthouse. That is the trade, it is
  argued above, and it is written into `sites/pharos.ts` where the number is.
- The site's own lockup sits partly under the text scrim, which runs full width across
  the copy band. `Pharos Academy` and the mark read clear above it; `H.O.P.E. for
  Families` and the tagline go under the wash. Accepted: the wash exists to hold up the
  reel's own line, and a hero whose lockup is *readable* through it is a hero competing
  with the hook for the same slot.
- `hookRect` and the reposition resolve the hero through one `heroHandle`, so `check`
  and `capture` cannot disagree about which element the hook is.
- A hero laid out some other way — a `background-image`, a canvas — has no
  `object-position` to move and is silently left alone. There is no cover crop there
  for this to undo, so nothing is missed; the probe still reports what such a hook
  reads.
