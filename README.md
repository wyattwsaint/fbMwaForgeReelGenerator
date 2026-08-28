# fbMwaForgeReelGenerator

Automated 15–30s highlight reels of a website, cut to music.

Capture a real site with a headless browser, assemble the frames into a short
beat-aligned clip with ffmpeg, and emit a 9:16 Facebook Reel.

## The CLI

Four commands, one positional argument each, no flags
([`18-cli-and-review.md`](.wayfinder/spec/18-cli-and-review.md)):

```
reel sections <url>           # settle + measure the page; what a config is written from
reel check    <site>          # settle + resolve; seconds, no capture pass
reel render   <site>          # check, capture, composite; wipes and fills out/
reel keep     out/<file>.mp4  # mv to reels/ + solo commit
```

`sections` is the one that takes a **URL** rather than a site, and it takes one
because it is what you run *before* `sites/<slug>.ts` exists — a slug is the one thing
it cannot ask for. The other three take a site because a site *is* its config file.

Install it once, on the one machine that cuts reels:

```
npm install
npx playwright install chromium
npm link                    # puts `reel` on PATH
```

`npm link` is what makes the examples below literal: every command in this README is
`reel <command> <site>`, never a runner prefix, because the prefix is the part that
dates. `ffmpeg` and `ffprobe` have to be on PATH too — `render` shells out to both.

### `reel sections <url>`

Loads the page, settles it, and prints its candidate sections: a selector that
resolves, where the section sits, how tall it is, the punch factor that height
needs, and the heading it leads with. Enough to paste a first config out of, which
`check` then corrects.

A section taller than one frame also gets a `fit` column — the capture viewport width
`fit: true` would load the page at to show the whole of it. Every section on this page
is already inside a frame, so none of them has one.

```
$ reel sections https://brobstcleaning.com
sections https://brobstcleaning.com  7.1s

  hook  main           y 80      942px                     "Spotless every time"
        #services      y 1022   1231px   punchFactor 1.74  "What we clean"
        #how-it-works  y 2253    267px   punchFactor 7.98  "How it works"
        #about         y 2520    873px   punchFactor 2.44  "About Brobst"
        #reviews       y 3392    965px   punchFactor 2.21  "What people say"
        #quote-cta     y 4357    730px   punchFactor 2.92

6 sections.
```

The heading is the line a beat written against that section draws for free, so the
last column is the copy the config is about to inherit. A section with no heading —
`#quote-cta` above — is a beat that simply carries no text.

A candidate is a direct child of `main` that draws something. It is named by its own
`id` where it has one, because an id is what makes a selector that survives the
client's next edit; a section without one is printed as `main` and addressed by its
`y` and `height`, which is the escape hatch that exists for exactly that page.

The measurements are taken against the **settled** page, so they are the heights a
master is actually clipped at — a section reported at its pre-lazy-load height would
disagree with `check`, which is worse than not reporting it.

The hero is marked `hook` and given no punch factor. It is the hook, not a beat, and a
config that lists it in `beats` is a reel that opens twice on the same section. Every
other punch factor is the one that height needs whatever move the beat draws: the
largest of what any pan direction would ask for, which also covers the drift it might
have been. That is deliberately generous — `check` says whether a smaller one still
travels.

This **reports**, it does not decide. Which sections become beats, in what order, with
what hook line, is the human's, and there is no ranking, scoring or suggesting in it —
nor a `--write-config`, because a generated config is a config nobody read.

### `reel check <site>`

Loads `sites/<site>.ts`, settles the page, and resolves every selector in it — the
render path stopped after settle. It reports **every** problem it finds and then
exits non-zero; a drifted site usually breaks several selectors at once, and
fail-fast would turn one fix-and-rerun cycle into four.

```
$ reel check brobst
check brobst  6.0s

  beats[1] '#about' is 873px tall; a punchFactor of 1.4 needs 1371px
  beats[2] selector '#contact' — no element matches

2 problems.
```

A beat that names no `label` draws its section's heading, and that heading is held to
exactly the budget a written line is — `beats[0] heading is 33 characters; the budget
is 28` is the same failure as `beats[0].label` breaking it. The fix is a shorter
`label` in the config; type never shrinks to fit.

### `reel render <site>`

Runs `check` first and refuses on failure — it is the settle the render was going to
do anyway, and the report is the same one, whichever command printed it. Then one
**master** per shot: a full-page screenshot clipped to the section's rect, at the
resolution that beat's punch factor asks for. Nothing is ever scrolled to and no
motion is stepped in the browser, so a beat can never bake in the page's sticky
chrome and capture costs one screenshot per shot rather than one per frame.

Every camera move is then synthesised from those stills by ffmpeg, with sub-frames
averaged into each output frame for motion blur, and the shots are cut together into
a 1080x1920 H.264 mp4 at a constant 30fps with a 48kHz stereo AAC-LC bed.

Progress is one checkpointed line per phase, with what that phase cost — plain
appended lines rather than a redrawing bar, so the output still reads correctly when
it is scrolled back through after a failure. A config with a `fit` beat prints a
`measure` line ahead of the masters as well — one per page a fit beat lives on, for
the load that learns how wide that page has to be captured.

```
$ reel render brobst
check      ok         6.0s
master 1/4 hook       4.1s
master 2/4 hero       0.9s
...
mux                   3.2s
done  out\brobst-3beat.mp4  15.7s   [41.2s total]
```

`render` **wipes `out/` at start**, before anything else: one render at a time, one
thing in `out/`, so nothing can be promoted by mistake because it was still lying
around. Masters are **run-scoped**: they are written under `out/masters/` and never
reused across runs — a kept master is a photograph of a page that may no longer
exist.

A render that dies mid-pass **leaves its debris**. Nothing is cleaned up on failure:
the partial masters and shots are what the failure is diagnosed from, `out/` is
gitignored, and promotion takes an explicit `.mp4` path a failed run never produced.

### Judging a cut

A 15.7s 9:16 mp4 is awkward to judge on a desktop, and the two things that actually go
wrong are both stills. So `render` also writes, beside the reel:

- `out/<slug>-frame0.jpg` — frame 0, which is the thumbnail Facebook shows in-feed,
  hook text and all.
- `out/<slug>-sheet.jpg` — a contact sheet: one tile per shot, in reel order, which is
  frame 0 and then the frame each cut lands on.

All three `start` on completion — the mp4 included, because the judgment is "does it
play right *and* is the thumbnail right". Both stills are **scratch**: they stay in
`out/` and are never promoted, since the reel is the record and both are recoverable
from it.

Under all of it is the **bed** — the signature track, trimmed to the reel's length
and faded out at the end. It is the default on every reel; `music.file` in a site's
config swaps it and `music.offset` slides it. Nothing is timed to the music: a reel is
exactly as long with a bed as it is without one.

### `reel keep out/<file>.mp4`

Promotion — what happens *after* you have watched a cut and decided it ships. It moves
the file to `reels/<slug>-<YYYY-MM-DD>.mp4` and commits it on its own. That is all it
does; judging a cut shippable stays the pipeline's one human step, which is why there
is no `--keep` flag on `render` and no flag on `keep`.

```
$ reel keep out/brobst-3beat.mp4
a1b2c3d Keep brobst reel, 2026-08-27
 reels/brobst-2026-08-27.mp4 | Bin 0 -> 4633129 bytes
 1 file changed, 0 insertions(+), 0 deletions(-)
```

The mechanics are automated because the solo-commit rule is the discipline that erodes
by hand. A rendered reel is not reproducible — the client's live site underneath it is
theirs to change — so the mp4 is the only record of what a reel was, and the commit
that adds it is its manifest: `git log --follow` on a kept reel recovers the config
that made it. One `git add .` that sweeps a config edit into that commit destroys
that, permanently.

So both git calls are **pathspec-scoped to the one file**, and a **dirty tree is
fine**: uncommitted config edits are the normal case, since you tune, render, judge
and keep in one sitting. `keep` prints the resulting commit's one-line stat, so it is
visible that nothing rode along. The date in the name replaces the scratch name's
`-<n>beat` — `n` is recoverable from the config, the day it was cut is not.

## Writing a site config

One TS module per site, `sites/<slug>.ts`, checked into *this* repo (ADR-0001). The
whole of it is a URL, one line of hook copy, three to five beat selectors and the
client's domain:

```ts
import { defineSite } from 'reel'

export default defineSite({
  url: 'https://brobstcleaning.com',
  hook: { text: 'Spotless, every time.' },
  beats: [{ selector: '#services' }, { selector: '#about' }, { selector: '#reviews' }],
  cta: { credit: 'brobstcleaning.com' },
})
```

Everything else — which beat pans and which drifts, which way each pan travels, where
the cuts land, the bed under it — is derived from that. `beats.length` is the reel's
length: three beats is 15.7s, five is 22.7s. There are no duration knobs and no flags.

Everything else in the schema is an **override**, and each one is there because a real
page broke a default — [`sites/README.md`](sites/README.md) is the field-by-field
reference. The two checked-in configs are the pair that shows the difference:
[`sites/brobst.ts`](sites/brobst.ts) names sections, punch and a credit line and
nothing else; [`sites/pharos.ts`](sites/pharos.ts) reaches for most of the hatches,
each with the page behaviour that forced it written beside it.

The loop is `reel sections <url>` → paste → `reel check <slug>` → fix what it names.
A selector that no longer matches is the whole reason the file is checked in. The
vocabulary all of it is written in is [`CONTEXT.md`](CONTEXT.md).

## Tests

```
npm test        # node:test via tsx
npm run typecheck
```

The suite serves its own fixture site and never touches a client's — it carries the
five hazards #6 found on real sites (a `<video>` hero the page re-plays, lazy images
below the fold, an infinite animation, sticky chrome, and sections both taller and
shorter than the frame), so every run exercises settle.
