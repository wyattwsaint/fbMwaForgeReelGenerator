# fbMwaForgeReelGenerator

Automated 15–30s highlight reels of a website, cut to music.

Capture a real site with a headless browser, assemble the frames into a short
beat-aligned clip with ffmpeg, and emit a 9:16 Facebook Reel.

## The CLI

Three commands, one positional argument each, no flags
([`18-cli-and-review.md`](.wayfinder/spec/18-cli-and-review.md)):

```
reel check  <site>          # settle + resolve; seconds, no capture pass
reel render <site>          # not built yet
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
