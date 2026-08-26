# The CLI, review, and promotion

Settles [#18](https://github.com/wyattwsaint/fbMwaForgeReelGenerator/issues/18) —
the last stretch of the pipeline: how a cut gets from `out/` to `reels/`.

## The command surface

Three commands, one positional argument each, **no flags**.

```
reel check  <site>          # settle + resolve; seconds, no capture pass
reel render <site>          # runs check, refuses on failure; writes out/
reel keep   out/<file>.mp4  # mv to reels/ + solo commit
```

Invoked through a `bin` entry in `package.json`, `npm link`ed once on the one
Windows machine this runs on. Not `npx tsx cli.ts` and not npm scripts: `reel check
brobst` is what gets written into docs, `PROVENANCE.md` and commit messages, and a
runner prefix in those places dates badly.

**No flags at all — in particular no `--beats 3|4|5`.** [#7](https://github.com/wyattwsaint/fbMwaForgeReelGenerator/issues/7)
made `beats.length` *be* `n` and cut every duration knob; a command-line flag that
changes `n` would make a kept reel's config no longer describe the reel, which breaks
[#14](https://github.com/wyattwsaint/fbMwaForgeReelGenerator/issues/14)'s
commit-is-the-manifest guarantee outright. To cut three beats, comment two out of the
config — and then the file on disk says so.

## `check`

The render path stopped after settle (#7). Run standalone when *you* decide to cut,
and run automatically as `render`'s first act — it is the settle `render` was going to
do anyway, so it is free, and it turns a drifted selector into a two-second failure
instead of one discovered deep into a capture pass.

**Reports every failure, then exits non-zero** — never fails fast. A drifted site
usually breaks several selectors at once, and fail-fast turns one fix-and-rerun cycle
into four. Identical output whether standalone or as a preflight: one implementation,
one thing to learn to read.

Checked: every beat selector resolves; no section shorter than the frame; no
`punchFactor` that leaves a pan no room to travel; no text line that overflows its slot
(#9); the `music.file` exists (#8).

## `render`

**Wipes `out/` at start.** `out/` is disposable by construction (#14), masters are
run-scoped, and the failure mode of accumulating scratch is real and unrecoverable:
promoting yesterday's cut because it was still lying around. One render at a time, one
thing in `out/`, so `keep`'s argument is unambiguous.

**Progress: one checkpointed line per phase, with timings.**

```
check      ok         1.7s
master 1/5 hero       2.4s
shot   1/5 drift      9.1s
...
mux                   3.2s
done  out/brobst-2026-08-26.mp4  15.7s   [42.6s total]
```

The phases are countable and few (n+2), so a line each is a real progress signal *and*
survives being scrolled back through after a failure — which a redrawing progress bar
does not. Timings per line because the reason to look is almost always "which beat is
slow".

**A render that dies mid-pass leaves its debris.** No cleanup on failure: the partial
masters are exactly what you want to look at, `out/` is gitignored, and `keep` takes an
explicit `.mp4` path that a failed run never produced — so debris cannot be promoted by
accident.

## Review

A 15.7s 9:16 mp4 is awkward to judge on a desktop, and the two things that actually go
wrong are both stills. So `render` also emits, into `out/`:

- **`<slug>-frame0.jpg`** — frame 0, which is the Facebook in-feed thumbnail (#6), and a
  constraint rather than a by-product: hook text is fully drawn on it.
- **`<slug>-sheet.jpg`** — a contact sheet, one tile per cut point (n+2 tiles).

All three files `start` on completion — mp4 included. The judgment is "does it play
right *and* is the thumbnail right"; opening two of three is how a bad frame 0 ships.

**No preview app.** A phone-framed HTML player with a safe-zone overlay was considered
and rejected: #9 froze the house style and its boosted safe zone (top 14%, sides 6%,
bottom 35%, card content at y 760), so the overlay is a one-time check of the *style*,
not a per-reel check of a *reel*. Two jpgs solve what is left; a preview UI is a thing to
build and keep working.

**Review stills are scratch.** They stay in `out/` and are never promoted: the mp4 is the
record (#14), frame 0 is recoverable from it with one ffmpeg command, and the sheet has
no life after the judgment.

## `keep` — promotion

#14 rejected a `--keep` flag on `render`, so that judging a cut shippable stays the
pipeline's one human step. `keep <file>` is not that flag: it runs *after* the judgment,
about a file you chose, and what it automates is only the mechanics.

Those mechanics are worth automating, because #14's solo-commit rule is exactly the
discipline that erodes by hand — one `git add .` that sweeps a config edit into the reel
commit destroys `git log --follow`'s ability to recover that reel's config, permanently.

```
mv out/<slug>-<date>.mp4 reels/<slug>-<date>.mp4
git add   -- reels/<slug>-<date>.mp4
git commit -- reels/<slug>-<date>.mp4 -m "Keep <slug> reel, <YYYY-MM-DD>"
```

**Pathspec-scoped `add` and `commit`, and a dirty tree is fine.** Uncommitted config
edits are the *normal* case — you tune, render, judge and keep in one sitting — so
refusing on a dirty tree would refuse on the happy path. Scoping both git calls to the
one path gets the solo commit without touching anything else. `keep` prints the
resulting commit's one-line stat, so it is visible that nothing rode along.
