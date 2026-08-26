# On-screen text — drafting, styling, animation (resolves #9)

Burned-in text is what makes a muted screen-recording reel watchable. This spec
fixes what text a reel carries, how it is written, how it is styled, and how it
moves. It also closes the map's compositing-engine question.

Premise, corrected in #8: these are **MWA Forge's own marketing reels**. The
client site is the subject; MWA Forge is the author and the advertiser. Every
decision below follows from that.

## 1. Drafting — a human writes every line

**No LLM in the pipeline.** Copy lives in the site config (#7): `hook.text`, the
optional `beats[].label`, and the CTA's credit line. A reel carries 1–3 short
lines total; an LLM saves no meaningful work and makes the render depend on a
non-deterministic service. A separate `draft <site>` helper that *proposes* lines
for a human to paste is a possible later effort, deliberately not this one.

Drafting at render time is ruled out outright: it would break the pipeline's
determinism (`CONTEXT.md`, "reproducible vs. deterministic").

## 2. How much text

| Slot | Presence | Budget |
| --- | --- | --- |
| Hook | always | 2 lines, 42 chars |
| Beat label | optional, default **none** | 1 line, 28 chars |
| CTA | always | fixed layout (§5) |

A beat is 3.5s under a continuous move. A line on every beat reads as a
slideshow, so labels are the exception, not the rhythm — most reels ship with
hook + CTA only.

**Overflow fails loudly** at `check`, naming the field and the budget. No
auto-shrink, no auto-wrap past the budget: variable type size across reels is a
difference a viewer can feel and cannot explain, and it is #7's missing-selector
rule applied to copy.

## 3. Styling — one house style, MWA Forge's own

The client's brand already fills the frame as site pixels. The overlay is the
author's voice, so it is the **same on every reel**:

| Role | Value |
| --- | --- |
| Display face | Space Grotesk |
| Ink | `#eef1f6` |
| Scrim / card ground | `#0a0c10` |
| Accent | `#8b5cf6` |

These are **frozen constants in this repo**, not scraped. #7 rejected frozen hex
because a *client* restyle is outside our control; mwaforge.com is not, and a
render that fetches a live site to learn its own brand is a failure mode with no
upside.

### The derived client brand kit is dead

With an MWA-branded CTA (§5) and house type, nothing consumes the sampled client
kit. `brand2.mjs`, the `brand.{bg,fg,accent}` role overrides, the `font`
override and `cta.logo.raster` are all cut from #7's schema. This also dissolves
#13's hardest constraint — Brobst's PNG-only mark — because the card now carries
MWA Forge's own SVG mark. **#13 is ruled out of scope, not answered.**

### Geometry — the boosted safe zone

Meta unified the 9:16 safe zones in March 2026: top 14% (270px), sides 6%
(65px), bottom 20% organic but **35% (672px) once the creative carries an ad
CTA**. Boosting is planned (#8), so the reel is designed to the boosted box:

```
usable: x 65..1015, y 270..1248     (950 x 978)
text slot: left-aligned at x 65, top band y 270..620
card content: centred on the usable box — centre y 760, NOT 960
```

A reel that cannot be boosted without being re-cut is a trap; the cost is only
vertical room the layout does not need.

**One fixed slot, no per-beat placement override.** Per-beat positioning is a
hand-timed edit by another name (#7, "no duration knobs"), and a slot that moves
between cuts reads as sloppy.

### Legibility — a gradient scrim, riding with the text

Text sits over an arbitrary screenshot that may be white, black, or a photo. The
treatment is a top-down gradient scrim in `#0a0c10`, full-width over the text
band, fading to transparent at the band's foot.

- Not a plate or lower-third: reads as a TV chyron, and it is a second rectangle
  competing with the card.
- Not a bare drop shadow: fails over mid-grey.
- Not sampled from the page: the scrim is constant, so no per-site tuning and no
  dependency on what the section happens to look like.

The scrim shares the text's alpha envelope — **it is only on screen when text
is**. An always-on scrim dims the site pixels for the whole reel, and the site is
the thing being showcased.

## 4. Animation — fade only

Text is drawn, holds, and fades. **No kinetic type**, no word-by-word, no
typewriter.

- **Hook**: fully drawn on frame 0 and never animates in (fixed by #5 — frame 0
  is the FB thumbnail). Text *and* scrim fade out over the final 0.5s of the
  3.0s hook. Text still lit when a hard cut lands reads as a dropped frame.
- **Beat label**: fades in 0.3s starting 0.2s after the cut, holds, fades out
  0.3s ending 0.2s before the next. No label is ever alive across a cut.
- **CTA**: no separate text animation — the 0.3s crossfade into the card brings
  it in.

Camera motion is already continuous under every frame (#12). Type that animates
while the camera moves reads as busy, and kinetic type is the single choice that
would have forced a layout engine.

## 5. The CTA card

The call to action belongs to **MWA Forge**. The viewer's next step is hiring
Wyatt, not visiting the client. The client's domain stays on the card as
**credit** — it is the proof, and proof needs attribution.

```
ground     #0a0c10, full frame
mark       MWA Forge wordmark, SVG, repo constant
headline   mwaforge.com — large Space Grotesk, ink #eef1f6
credit     pharosacademy.net · built by MWA Forge — small, muted
rule       accent #8b5cf6
motion     scale 1.00 -> 1.03 over 2.5s
```

All of it centred in the boosted-safe box (centre y 760). The drift is not
decoration: #12 established there is no rest in this reel, and a static final
2.5s reads as the video having ended early.

### Schema consequence for #7

```diff
  cta: {
-   domain: string
-   logo: { src: string; raster?: boolean }
+   credit: string     // the client's domain, credited on MWA Forge's card
  }
- brand?: { bg?: string; fg?: string; accent?: string }
- font?: string
```

`cta.domain` changes meaning, not just name — it was the subject of the card and
is now a credit line on someone else's card. The mark is a repo constant.

## 6. Accessibility

There is **no spoken audio** anywhere in a reel — the signature track is
instrumental and sits underneath (#8). So there is nothing to caption: no SRT, no
burned-in subtitles, no caption track. All text is editorial.

The reel is legible muted by construction, which is the whole reason §1–§5 exist.
Meta's auto-captions are a publish-time toggle, and publishing is out of scope.

## 7. Compositing engine — raw ffmpeg

**Remotion and every other layout engine are ruled out.** What the overlay needs
is `drawtext` with alpha expressions, a gradient `overlay`, and a crossfade —
all first-party ffmpeg. #11 already proved raw ffmpeg synthesises the camera
motion without `frei0r`; §4 removed the only remaining reason to want a real
renderer, and a React-video pass would add a Node render farm to draw two lines
of static text.

This closes the map's oldest fog patch. The pipeline is: headless capture →
ffmpeg filtergraph → mp4. Nothing else.
