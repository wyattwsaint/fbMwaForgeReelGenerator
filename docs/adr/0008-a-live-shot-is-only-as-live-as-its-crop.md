# ADR-0008: A live shot is only as live as its crop

## Status

Accepted (2026-08-30). Extends ADR-0006, which it does not reverse.

## Context

ADR-0006 let the hook be a **live shot** and named a video background as the first
case it was for. Configured on the first such hero (`sites/pharos.ts`, a looping
`hero/hope-1920.mp4`), it recorded 3.0s of a hero that does not visibly move —
strictly worse than the `still` it replaced, which at least pinned `videoTime` and
spent a 10% drift where the breath spends 3%. Nothing failed: `check` passed, the
render exited 0, the frame count matched. The hook was simply dead.

The obvious reading — and the one #88 was filed under — is that headless Chromium
decodes a `<video>` and never composites it into captured pixels. It does not hold.
Measured against the live site, headless and headed are indistinguishable, and the
variable is the **viewport**:

| capture | viewport | mean | band 5 / 6 | neighbours |
| --- | --- | --- | --- | --- |
| headless screenshot | 1920x1080 | 2.43 | 5.24 / **7.67** | ~0.7 |
| headless screenshot | 1080x1920 | 0.96 | 1.28 / 1.50 | ~0.65 |
| headed screenshot | 1080x1920 | 1.07 | 1.31 / 1.49 | ~0.85 |
| headless `recordVideo` | 1080x1920 | 2.24 | flat, all bands | — |

The video decodes throughout (clock advances, `paused: false`, 85-170 frames). The
cause is framing. The source is 1920x1080 under `object-fit: cover` with
`object-position: 22% 50%`; covering a 1080x1920 box scales it 1.78x to a rendered
width of 3413px, so 31.6% of the source is on screen. The moving water is mostly
outside that column. The reel's own frame is 9:16, and this hero's motion is not.

That generalises past one site. A 9:16 crop of a landscape hero throws away most of
the frame, and the case ADR-0006 named first — a video background — is the case most
likely to have its motion thrown away with it.

## Decision

**An `ambient` shot is gated on measured motion, as framed.** Before it is recorded,
the stabilised page — framed exactly as the recording would frame it, at the shot's
own viewport — is sampled three times over 2s and the samples differenced per
horizontal band. If the highest band mean is below the **motion floor**, the shot is
not recorded; it degrades to `still` and `check` says so. This is the **motion
probe**.

*Amended on implementation.* This paragraph originally had `check` and the render each
ask the probe on their own page, the way both already ask `scrollEffectsRefire`. That
cannot be built, and the reason is worth keeping: the scroll question changes only how
the recording is driven, so two callers can answer it independently and neither has to
tell the other. This one changes the **plan** — a `still` hook is punched from a frozen
master and drifts 10% where a live one breathes 3% over a recording — and the plan is
made before a browser is open. A capture pass that probed for itself could stop
recording but could not turn the shot it was handed back into a still one, so it would
land a frozen master under a live shot's camera: the dead hook again, one layer down.
So the probe is asked once, in `check`, and its verdict rides back with the headings
and the heights (#66) into `planReel`. "Both ask and agree" becomes "the preflight
decides and the render plans it", which is the same guarantee bought more cheaply.

The scroll question had to move with it. Left where it was, a capture pass could still
answer it differently from the preflight and fall back to an `ambient` dwell — and that
hook is never probed, because a `scroll` that passes in `check` is deliberately not
(under a scripted scroll every page reads live). So ADR-0006's second ask is gone too,
and capture walks when the plan says `scroll`. What that gives up is the case where a
page would not re-fire today; a walked viewport is live footage whatever the reveals
do, so it gives up nothing this ADR is about.

It measures the capture, not the page, and so is blind to *why* a hook records dead —
a cropped hero, a genuinely static one, or a compositing hole of the kind this ADR
looked for and did not find. That is the property worth having, given that the cause
here was not the suspected one.

**A note, never a problem.** The chain is three deep and each step is named:
`scroll` -> `ambient` -> `still`.

**It errs towards `still`**, which is the inverse of `scrollEffectsRefire`'s bias.
The asymmetry is real: a false positive ships the dead hook, and a false negative
ships a `still` — deterministic frame 0, `videoTime` restored, a 10% drift. One
failure mode is strictly better than the thing it replaces.

**`ambient` only**, including a `scroll` already degraded to it. Under a scripted
scroll the viewport moves, so every page passes and the probe measures nothing.

## Considered options

1. **Launch headed for live shots.** Rejected on measurement: headed reads 1.07
   against headless's 1.08 at the capture viewport. It buys nothing.
2. **A `<video>`-shaped refusal in `check`.** Rejected as the wrong shape — the
   subject's element type is not what predicts a dead hook. mwaforge's hero is five
   CSS-drifting blocks and reads 35.03; pharos's is a `<video>` and reads 1.46.
3. **Find the headless compositing flag.** Moot: nothing to fix. For the record,
   `--use-gl=angle --use-angle=swiftshader` and `channel: 'chromium'` were tried
   before the framing cause was found, and changed nothing — because nothing about
   headless was wrong.

## Consequences

- The floor is **5.0** on the highest band mean. Calibration, framed at 1080x1920,
  headless: mwaforge 35.03 (live), pharos 1.46 (dead as framed), legacyroof and
  brobst 0.00 (static heroes). The gap between dead and live is 1.46 to 35.03 with
  nothing in it.
- A dead-as-framed hook reads **nonzero** (1.46, the sliver of moving water that
  survives the crop), so "did anything change at all" is not the test. Two headless
  screenshots of a static page are bit-identical, so the probe's own noise floor is
  0.00 — the 2.0-2.9 seen in a rendered master is the mp4 encoder, not the capture.
- A single sample pair can land on an unlucky loop phase: pharos read 1.46 at 2s
  apart and 0.70 at 6s. Hence three samples, max pairwise.
- The probe is predictive rather than post-hoc — screenshots before the recording,
  not frames of the master afterwards. It is cheaper, and the master's encoder noise
  sits close enough to the dead signal to make a post-hoc threshold jumpy.
- `sites/pharos.ts` returns to `still` with `videoTime: 2.0`. It was the first
  `ambient` site and it is not a good one.
