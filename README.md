# fbMwaForgeReelGenerator

Automated 15–30s highlight reels of a website, cut to music.

Capture a real site with a headless browser, assemble the frames into a short
beat-aligned clip with ffmpeg, and emit a 9:16 Facebook Reel.

## The CLI

Three commands, one positional argument each, no flags
([`18-cli-and-review.md`](.wayfinder/spec/18-cli-and-review.md)):

```
reel check  <site>          # settle + resolve; seconds, no capture pass
reel render <site>          # check, capture, composite; writes out/<slug>-<n>beat.mp4
reel keep   out/<file>.mp4  # not built yet
```

Install it once on the machine that cuts reels:

```
npm install
npx playwright install chromium
npm link                    # puts `reel` on PATH
```

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

```
$ reel render brobst
render ok  brobst  41.2s  outrobst-3beat.mp4
```

Masters are **run-scoped**: they are written under `out/masters/`, wiped by the next
render, and never reused across runs — a kept master is a photograph of a page that
may no longer exist. A failed render leaves its debris there to diagnose from.

The overlay text, the CTA card, the music bed, `out/` hygiene and the review stills
are each their own ticket; the audio stream is present but silent until then, so that
the container satisfies the Reels API from the first render.

Site configs live in [`sites/`](sites/README.md); the vocabulary they are written in
is [`CONTEXT.md`](CONTEXT.md).

## Tests

```
npm test        # node:test via tsx
npm run typecheck
```

The suite serves its own fixture site and never touches a client's — it carries the
five hazards #6 found on real sites (a `<video>` hero the page re-plays, lazy images
below the fold, an infinite animation, sticky chrome, and sections both taller and
shorter than the frame), so every run exercises settle.
