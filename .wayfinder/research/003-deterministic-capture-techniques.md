---
ticket: 003
title: How do you capture a webpage as frames deterministically?
date: 2026-08-24
status: complete
---

# Deterministic webpage capture: technique comparison

**Decision this feeds:** how to capture a 9:16 (1080x1920) webpage as frames whose
timing is exact enough to cut to a music beat, on a **Windows** machine.

**Bottom line up front.** Only techniques that *drive* the clock — where the tool
decides "this is frame N, render it, hand it to me" — give you beat-alignable
timing. Everything that *observes* a real-time clock (Playwright/Puppeteer video,
`Page.startScreencast`) produces best-effort frames with jitter and drops, and
the recorders paper over it by duplicating frames. Beat cutting needs the
former.

---

## 0. The core distinction

| | Push (real-time) | Pull (frame-stepped) |
|---|---|---|
| Who decides when a frame exists | The browser's vsync/compositor | Your capture loop |
| Frame N's timestamp | Whatever the clock said | Exactly `N / fps` by construction |
| Under CPU load | Frames dropped / duplicated | Runs slower in wall-clock, output unchanged |
| Reproducible across runs | No | Yes (given the page is deterministic) |
| Examples | Playwright `recordVideo`, `Page.startScreencast`, Puppeteer `page.screencast()` | Remotion, timesnap/timecut, puppeteer-capture, hand-rolled seek+screenshot |

Alexey Pelykh (author of `puppeteer-capture`) states the failure modes of the
push model plainly: "every run produces a slightly different result"; frames are
lost under load on heavy pages or constrained CI; and "you cannot guarantee
specific frame rates or durations."
— https://alexey-pelykh.com/blog/why-i-built-puppeteer-capture/

---

## 1. Playwright / Puppeteer video recording

### Playwright `recordVideo`

- Output is **WebM/VP8 only**; no MP4 path. Video is only available after the
  page or browser context is **closed**.
  — https://playwright.dev/docs/videos
- "The video size defaults to the viewport size scaled down to fit 800x800."
  You can set `size` explicitly, but the default alone would destroy a 1080x1920
  capture. — https://playwright.dev/docs/videos
- **Frame rate is not guaranteed.** Playwright's recorder receives variable-rate
  screencast frames and maps each one onto a constant-rate timeline —
  `frameNumber = floor((nowMs - startMs) * fps / 1000)` (default 25 fps) —
  **filling gaps with copies of the previous frame**. That is the definition of
  best-effort: a slow paint becomes a duplicated frame, not a delayed one.
  — https://github.com/microsoft/playwright/issues/35776 (P3, closed as
    collecting-feedback; reports accumulated rounding error from
    `Math.round(fps * durationSec)` causing effective-fps drift over a recording)
- Encoder settings are hardcoded: ~1 Mbit/s target, single thread, VP8
  `qmin 0 / qmax 50`, `deadline realtime`. Users report visible mosquito noise
  around glyph edges — bad for on-screen text in a Reel.
  — https://github.com/microsoft/playwright/issues/31424
  — https://github.com/microsoft/playwright/issues/17217 (request to configure fps — still open)

### Puppeteer `page.screencast()`

- Produces **WebM/VP9 at 30 fps by default**, and **requires ffmpeg installed on
  the system**. — https://pptr.dev/api/puppeteer.page.screencast
- Same underlying mechanism (CDP screencast), same best-effort character.

**Verdict:** unusable for beat alignment. Fine only as a debugging artifact.

---

## 2. CDP `Page.startScreencast`

The primitive both of the above sit on. Experimental.
— https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-startScreencast

Parameters: `format` (`jpeg`|`png`), `quality` (0–100), `maxWidth`, `maxHeight`,
`everyNthFrame` ("Send every n-th frame"), `maxFramesInFlight` ("Maximum number
of frames sent until `screencastFrameAck` is required. Defaults to 3"), and
`sendLastFrame` (keeps the most recent frame in memory for immediate delivery,
"trading overall performance for a better latency").

What determines dropped frames:

1. **Nothing in the API promises a rate.** Frames are emitted when the compositor
   swaps. There is no `fps` parameter — only `everyNthFrame`, which *decimates*.
2. **Backpressure.** With `maxFramesInFlight` (default 3), Chrome stops sending
   until you `Page.screencastFrameAck`. If your consumer (JPEG decode, disk
   write, ffmpeg pipe) is slower than the page, frames are simply never produced.
3. **Encoding cost per frame** is paid inside the browser, at 1080x1920 for our case.
4. The `screencastFrame` metadata does carry a **`timestamp` ("Frame swap timing")** —
   so you *can* know when each frame really happened, and resample honestly in
   ffmpeg rather than trusting a nominal fps. That is the one thing screencast is
   genuinely good for.

**Verdict:** the honest read of a screencast is "a variable-frame-rate stream with
timestamps." You could resample it to a fixed grid yourself and do better than
Playwright's duplicate-fill — but you still can't *place* a specific visual event
on a specific millisecond, which is what beat cutting requires.

---

## 3. Frame-stepped screenshotting (the mainstream answer)

The loop every serious project converges on:

```
for i in 0..totalFrames:
    seek the page to t = i / fps      # a pure function of frame index
    wait for the page to be settled
    capture one image
```

### How the reference projects do it

**Remotion** — everything renders "purely off the value of `useCurrentFrame()`",
i.e. "a function that transforms a frame number into an image", so frames can be
rendered **in any order and in parallel across tabs**. It explicitly warns that
"animations that run independent of `useCurrentFrame()` will break", and that
even `--concurrency=1` does not make time-dependent code correct — results "will
differ across machines."
— https://www.remotion.dev/docs/flickering

Render mechanics: one image per frame; `imageFormat` defaults to `"jpeg"`
"because it is the fastest"; `jpegQuality` 0–100 (browser default ~80); `png`
only for alpha; `concurrency` defaults to "half of the CPU threads available";
`timeoutInMilliseconds` default `30000` for `delayRender()` gates.
— https://www.remotion.dev/docs/renderer/render-frames

**timesnap / timecut / timeweb** (tungs) — retrofits the same idea onto *arbitrary*
pages by monkey-patching the clock. It overwrites "`new Date()`, `Date.now`,
`performance.now`, `requestAnimationFrame`, `setTimeout`, `setInterval`,
`cancelAnimationFrame`, `cancelTimeout`, and `cancelInterval`" with a virtual
timeline, letting "JavaScript computation to complete before taking a
screenshot." Default 60 fps. Screenshot mode (Puppeteer screenshots, captures
div/svg/canvas, "usually runs slower") vs. experimental canvas-capture mode
(faster, canvas only). Pipe-to-ffmpeg mode exists but has "observed stability
issues"; disk-cached frames are the stable path.
— https://github.com/tungs/timecut

> **The limitation that matters most to us, verbatim:** "timeweb (and timesnap
> and timecut by extension) only overwrites JavaScript functions and video
> playback, so pages where changes occur via other means (e.g. through
> transitions/animations from CSS rules) will likely not render as intended."

That is the whole problem with capturing *someone else's marketing site*: its
motion is mostly CSS, and CSS motion does not live on the JS clock.

**HyperFrames** (HeyGen) — production loop is literally
`page.evaluate(t => window.__hf.seek(t), time)` then a frame capture, "One seek,
one beginFrame, one frame on disk. No retries. No flaky frames. Deterministic."
It also notes the failure mode of plain `Page.captureScreenshot`: it returns
images "as soon as the compositor is willing to hand one over", so you can catch
a frame where "text hasn't rendered yet" or an "SVG fill is still the unanimated
default." Fonts are handled by rewriting Google Fonts `@import`s "to point at a
local, base64-embedded copy" to eliminate network variance.
— https://www.heygen.com/research/html-to-video

### Freezing CSS animations / transitions / video

Ordered from most-supported to most-exotic:

1. **`document.getAnimations()`** — returns all `Animation` objects for **CSS
   Animations, CSS Transitions, and Web Animations**; each supports `pause()`,
   `currentTime = ms`, and `playbackRate`. Baseline widely available since
   Sept 2020. This is the one lever that actually reaches CSS motion, and it is
   the right primary tool.
   — https://developer.mozilla.org/en-US/docs/Web/API/Document/getAnimations
   Caveat: it only sees animations *currently in effect*. Scroll-triggered
   animations that haven't started yet won't be in the list; you must seek the
   scroll first, then re-enumerate each frame.

2. **Playwright `page.screenshot({ animations: 'disabled' })`** — "Stops CSS
   animations, transitions, and Web Animations before capturing." Useful for
   stills, useless for motion (it kills the motion rather than seeking it).
   — https://playwright.dev/docs/api/class-page#page-screenshot

3. **CDP `Animation` domain** — `Animation.setPaused({animations, paused})`,
   `Animation.seekAnimations({animations, currentTime})` ("Seek a set of
   animations to a particular time within each animation"),
   `Animation.setPlaybackRate({playbackRate})` ("Sets the playback rate of the
   document timeline"), plus `animationCreated`/`animationStarted` events so you
   can catch animations as they appear. Requires tracking animation ids;
   `document.getAnimations()` covers the same ground from inside the page with
   less bookkeeping. `setPlaybackRate(0)` on the document timeline is a blunt
   global freeze that is often the simplest starting point.
   — https://chromedevtools.github.io/devtools-protocol/tot/Animation/

4. **`<video>` elements** — set `video.pause()` then `video.currentTime = t` and
   await `seeked`. HyperFrames warns that parallel rendering breaks here:
   "video-heavy compositions can time out in parallel mode because Chrome can't
   seek multiple `<video>` elements simultaneously without running out of
   decoders." Client sites with hero background video are exactly this case.
   — https://www.heygen.com/research/html-to-video

### Per-frame cost at 1080x1920

**No primary source gives a millisecond figure at this resolution.** State this
plainly rather than guessing; the prototype ticket should measure it. What the
sources *do* establish:

- JPEG vs PNG **generation** speed in Puppeteer is roughly a wash; the difference
  is file size and transfer. Remotion nevertheless defaults to JPEG "because it
  is the fastest" over the whole pipeline.
  — https://www.bannerbear.com/blog/ways-to-speed-up-puppeteer-screenshots/
  — https://www.remotion.dev/docs/renderer/render-frames
- Puppeteer's `optimizeForSpeed` screenshot option uses faster encoding
  (restricting PNG compression to zlib q1 / RLE) and can meaningfully cut
  screenshot time.
  — https://screenshotone.com/blog/optimize-for-speed-when-rendering-screenshots-in-puppeteer-and-chrome-devtools-protocol/
- Cost scales roughly with pixel count; a third-party analysis estimates a 4K
  render at "roughly nine times as long per frame as its 720p equivalent" but
  explicitly labels this an estimate, not a benchmark, noting "Chromium's
  compositing pipeline has fixed overheads that make the ratio somewhat better
  than 9x." Treat as a shape, not a number.
  — https://rendercomp.com/blog/remotion-render-time-benchmarks/
- Wall-clock model: `≈ (durationInFrames / concurrency) × avgFrameTime`. Same
  source, same caveat.

Order-of-magnitude planning, to be replaced by measurement: 1080x1920 is ~2.07 MP,
about the same pixel count as 1080p landscape. A 20 s reel at 30 fps is **600
frames**; at 60 fps, 1200. If a frame costs 50 ms you finish 600 frames in ~30 s
single-threaded; at 200 ms, ~2 minutes. Either is acceptable for an
agency-side CLI. **Runtime is not the constraint here — correctness is.**

---

## 4. `HeadlessExperimental.beginFrame` (the rigorous variant of #3)

Instead of screenshotting whenever the compositor is willing, you *drive* the
compositor: "beginFrame lets you request frames on demand — you tell Chrome to
render a frame now, Chrome renders it, and you get the result." Chrome runs
exactly one layout→paint→composite cycle per request, then waits. The Chromium
announcement: "The new BeginFrameControl (BFC) allows you to replace chromium's
default vsync signal and issue BeginFrames manually via DevTools instead."
— https://groups.google.com/a/chromium.org/g/headless-dev/c/S5CoLs46AiE

Required flags (`puppeteer-capture` adds these automatically):
`--deterministic-mode`, `--enable-begin-frame-control`,
`--disable-new-content-rendering-timeout`, `--run-all-compositor-stages-before-draw`,
`--disable-threaded-animation`, `--disable-threaded-scrolling`,
`--disable-checker-imaging`, `--disable-image-animation-resync`,
`--enable-surface-synchronization`. Default `fps` option is 60; ffmpeg is
resolved from `FFMPEG` env → PATH → `ffmpeg-static`.
— https://github.com/alexey-pelykh/puppeteer-capture

### Why this is a shrinking bet — read this before choosing it

- **It only exists in the legacy `chrome-headless-shell` binary.** `beginFrame`
  "is not available in `--headless=new`."
  — https://github.com/alexey-pelykh/puppeteer-capture
- Chrome 132 removed old headless mode from the Chrome binary; the shell is now
  a separate download.
  — https://developer.chrome.com/blog/removing-headless-old-from-chrome
- **Chromium 147+ removed the `HeadlessExperimental.beginFrame` CDP command**,
  per multiple downstream reports (HyperFrames issue #294 and its
  troubleshooting docs; HyperFrames ≥0.4.2 now auto-detects support and falls
  back to screenshot capture). This is a secondary source — verify against the
  protocol JSON for your pinned Chrome before betting on it.
  — https://github.com/heygen-com/hyperframes/issues/294
  — https://github.com/NousResearch/hermes-agent/blob/main/optional-skills/creative/hyperframes/references/troubleshooting.md
- **Windows support is disputed between the two best sources.**
  `puppeteer-capture` lists "Linux, Windows" as supported and says macOS is
  unsupported "because the API behaves differently there"; HyperFrames says
  "Linux only; macOS/Windows fall back to heuristics." Given our target is
  Windows, this is a **must-verify-in-prototype** item, not something to design
  around on faith.
  — https://alexey-pelykh.com/blog/why-i-built-puppeteer-capture/
  — https://www.heygen.com/research/html-to-video
- Historical caveats acknowledged by Chromium engineers: "at this point it
  doesn't yet allow fully-deterministic rendering in all circumstances"; and BFC
  "doesn't work well during renderer initialization or window resizes yet."
  A user in that thread measured screenshot timing that "deviates from perfect
  by up to 100 ms" via `frameTime`.
  — https://groups.google.com/a/chromium.org/g/headless-dev/c/QBQEm5Yd3_E
  — https://groups.google.com/a/chromium.org/g/headless-dev/c/S5CoLs46AiE
  `puppeteer-capture` also documents intermittent crashes with the deterministic
  flags on Chrome 117–120, and that viewport changes after capture starts need
  delays.

**Verdict:** the most rigorous option, and simultaneously the most fragile
dependency in this whole document — experimental, legacy-binary-only, possibly
removed upstream, with contradictory Windows claims. For a small-N agency tool
maintained by one person on Windows, that is a bad ratio.

---

## 5. CDP virtual time (`Emulation.setVirtualTimePolicy`)

"Turns on virtual time for all frames (replacing real-time with a synthetic time
source)... this supersedes any previous time budget."
— https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setVirtualTimePolicy

Parameters:
- `policy`: `advance` ("the virtual time base may fast forward to allow the next
  delayed task (if any) to run"), `pause` ("The virtual time base may not
  advance"), `pauseIfNetworkFetchesPending` ("may not advance if there are any
  pending resource fetches").
- `budget`: "If set, after this many virtual milliseconds have elapsed virtual
  time will be paused and a `virtualTimeBudgetExpired` event is sent."
- `maxVirtualTimeTaskStarvationCount`: "the maximum number of tasks that can be
  run before virtual is forced forwards to prevent deadlock."
- `initialVirtualTime`: "If set, `base::Time::Now` will be overridden to initially
  return this value" — useful for making `new Date()`-dependent content
  reproducible.

Can it give truly deterministic capture? **In principle yes for the timer/clock
half of the problem, and it is a better-built version of what timeweb hacks in
JS.** The pattern is: `pause` → set a budget of `1000/fps` ms → wait for
`virtualTimeBudgetExpired` → capture → repeat.

What breaks / what to watch:

- **It is experimental and the Chromium engineers of the era treated it as
  incomplete**, describing virtual time as still-under-development alongside
  BFC. — https://groups.google.com/a/chromium.org/g/headless-dev/c/QBQEm5Yd3_E
- **Hangs.** A well-documented failure: with
  `pauseIfNetworkFetchesPending` and a budget, the budget can never expire and
  the session hangs. The known workaround is to call `setVirtualTimePolicy`
  *after* `Page.loadEventFired`, and always set
  `maxVirtualTimeTaskStarvationCount`.
  — https://github.com/Szpadel/chrome-headless-render-pdf/issues/29
- **It advances the clock, it does not force a paint.** Virtual time expiring
  does not guarantee the compositor has produced a frame reflecting the new
  state. Without `beginFrame` you are back to `Page.captureScreenshot`'s
  "whenever the compositor is willing" race described in §3. Pairing virtual
  time with a settle step (`requestAnimationFrame` double-rAF, or explicit
  animation seeking) is mandatory.
- Interaction with the compositor's own animation timeline is not documented in
  the protocol reference. **Do not assume CSS animations advance correctly under
  virtual time — measure it.** This is the single highest-value experiment for
  the prototype ticket.
- No fps or per-frame cost figures exist in any primary source for this path.

**Verdict:** a strong *supporting* mechanism (kills `setTimeout`-driven drift,
makes `Date.now()` reproducible via `initialVirtualTime`), not a complete
solution on its own. Best used as belt-and-braces alongside explicit animation
seeking, and only after the hang workaround is in place.

---

## 6. Stills + synthetic motion in ffmpeg

Capture a handful of *static* screenshots (no timing problem at all — the page is
frozen, you have all the time in the world to get it perfect), then manufacture
the motion in ffmpeg with `zoompan` or animated `crop`.

`zoompan` parameters: `zoom`/`z` (zoom factor per frame), `x`, `y` (pan
coordinates), `d` — "Set the number of frames for which the zoom and pan effect
has to last", `s` (output size), `fps` (output frame rate).
— https://ffmpeg.org/ffmpeg-filters.html#zoompan

**Timing is exact by construction.** You are generating frames at a fixed `fps`
from a formula in `n` (frame number). A move that must land on beat at t=4.200 s
lands on frame `round(4.2*fps)`, full stop. No browser is involved in the timing.

**Quality ceiling / artifacts:**

- **Jitter is the known defect.** `zoompan` computes `x`/`y` at integer pixel
  positions, so slow pans/zooms visibly jiggle. The standard fix is to upscale
  the still before the filter: feeding an ~8000px-wide intermediate makes one
  source pixel ~0.24 output pixels at 1920 wide, so a one-pixel rounding error is
  invisible. Rule of thumb from the same sources: ~4x output width covers slow
  moves, 8x is the safe general recommendation. Put `scale` *before* `zoompan`
  and `format=yuv420p` *after*; use `scale=8000:-2` (not `-1`) so libx264 doesn't
  reject an odd height.
  — https://www.ffmpeg-micro.com/blog/ffmpeg-zoompan-filter-ken-burns-zoom-and-pan-without-the-jitter
  — https://www.datarecoveryunion.com/video-ffmpeg-smooth-zoompan-with-no-jiggle/
  (Note: the ffmpeg manual itself documents the parameters but does **not**
  document the jitter or the workaround — these are community sources.)
- **Resolution headroom.** Synthetic zoom on a 1080x1920 still means zooming into
  fewer than 1080 real pixels. Capture the stills at 2–3x device scale factor
  (`deviceScaleFactor: 3` gives 3240x5760) so the zoom has real detail to eat.
  Text stays crisp; that is the difference between this looking premium and
  looking like a slideshow.
- **What you cannot fake:** the site's own motion. Scroll reveals, hover states,
  hero video, carousels, parallax. Synthetic motion produces camera moves over a
  frozen page, not a page that is doing something.

**Verdict:** unbeatable on timing precision and robustness, materially limited on
what it can depict. Its natural role is not "the alternative" — it is the
*fallback and the seasoning*: it gives every beat a guaranteed-exact hit, and it
covers any site whose motion refuses to be captured.

A middle path worth naming: **frame-stepped scroll** — screenshot a still at each
of N scroll positions, which is a pure function of scroll offset with no clock
involved at all, then let ffmpeg (or just the frame sequence at fixed fps) supply
the timing. This gets you the site's real scroll-reveal content with §6's exact
timing, and sidesteps the entire CSS-animation problem for anything that isn't
scroll-driven.

---

## 7. Knowing the page is *done* — fonts and lazy content

This is where captures actually fail in practice, and it is largely orthogonal to
which capture technique you pick.

### Fonts

- **`await document.fonts.ready`** is the correct primitive. It resolves when the
  document has completed loading fonts, **layout operations are complete**, and no
  further font loads are needed.
  — https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/ready
  Caveat: it reflects the font set *at that moment*. Fonts requested later (by a
  scroll-triggered component, or a lazily-mounted section) will not re-trigger it —
  so re-await it after each scroll step, and after any DOM change.
- **Better than waiting: remove the network from the loop.** HyperFrames rewrites
  Google Fonts `@import`s "to point at a local, base64-embedded copy" from
  `@fontsource` specifically "to eliminate network variance." For our own client
  sites we control the source, so pre-warming a browser profile / HTTP cache, or
  intercepting font requests and serving them from disk, buys the same
  determinism without touching the site.
  — https://www.heygen.com/research/html-to-video
- Remotion's guidance echoes this: ensure fonts load before calling
  text-measurement functions, and gate rendering behind `delayRender()` until
  they do. — https://www.remotion.dev/docs/flickering

### Lazy content

- **`networkidle` is explicitly discouraged by Playwright**: "'networkidle' -
  **DISCOURAGED** consider operation to be finished when there are no network
  connections for at least 500 ms. Don't use this method for testing, rely on
  web assertions to assess readiness instead." Load states available are
  `commit`, `domcontentloaded`, `load`, `networkidle`.
  — https://playwright.dev/docs/api/class-page#page-wait-for-load-state
  For a *capture* tool (not a test), `networkidle` is more defensible than for
  testing, but it is a heuristic with a 500 ms floor and it silently fails on
  polling/analytics/websocket pages.
- **`loading="lazy"` images and IntersectionObserver components will not be there
  if you never scrolled past them.** The established recipe is: scroll a viewport
  at a time to the bottom, pausing to let content load, then scroll back to the
  top. For a scroll-driven capture this is free — you are scrolling anyway — but
  do a **priming pass** before the capture pass so nothing loads mid-shot.
- **Positive assertions beat timeouts.** Per-site config should carry an explicit
  readiness contract rather than a sleep:
  - a CSS selector that must be visible (`page.waitForSelector`),
  - `await Promise.all([...document.images].map(i => i.complete ? null : i.decode()))`
    — `decode()` resolves when the image is decoded and ready to paint without
    causing a frame drop, which is stronger than `complete`,
  - `await document.fonts.ready`,
  - a double-`requestAnimationFrame` settle before the capture.
  This is exactly the shape of Remotion's `delayRender()` gate (default timeout
  `30000` ms). — https://www.remotion.dev/docs/renderer/render-frames
- **Neutralize the nondeterministic stuff up front**, once, in the capture
  harness: inject CSS to disable `scroll-behavior: smooth`, force
  `prefers-reduced-motion` off/on deliberately, block analytics/chat-widget
  domains via request interception, and dismiss cookie banners via a per-site
  selector.

### Assembling the frames

Once you have `frame_%05d.jpg`, the encode side is fully deterministic. The
image2 demuxer's `framerate` option "Set the frame rate for the video stream. It
defaults to 25" — set it explicitly to your capture fps; `start_number` "Set the
index of the file matched by the image file pattern to start to read from.
Default value is 0"; `pattern_type` selects `sequence` (`%0Nd`) vs `glob`.
— https://ffmpeg.org/ffmpeg-formats.html#image2-1

Frame N is at exactly `N/fps` seconds. **This is the property beat cutting needs,
and it is the reason the frame-sequence intermediate is non-negotiable — never
capture straight to video.**

---

## 8. Comparison table

| Technique | Timing exactness | Captures site's own motion | Quality ceiling | Windows risk | Complexity |
|---|---|---|---|---|---|
| Playwright `recordVideo` | ✗ best-effort, dup-filled, 25 fps default, VP8 1 Mbit/s | ✓ all of it | Low (visible artifacts on text) | None | Trivial |
| Puppeteer `page.screencast()` | ✗ best-effort, 30 fps VP9 | ✓ all of it | Medium | Needs ffmpeg | Trivial |
| CDP `startScreencast` (self-resampled) | ~ VFR + real timestamps; can resample honestly but can't *place* events | ✓ all of it | Medium–high | None | Medium |
| Frame-stepped screenshot + `getAnimations()` seeking | ✓ exact by construction | ✓ JS + Web Animations + CSS (via seeking); `<video>` needs explicit seek | High (PNG/JPEG q90+) | None | Medium |
| `HeadlessExperimental.beginFrame` | ✓✓ compositor-level, byte-identical runs | ✓ same as above, no paint races | High | **High** — legacy binary, possibly removed in Chromium 147+, contradictory Windows claims | High |
| CDP virtual time | ✓ for clocks; ✗ alone (no paint guarantee) | ~ JS timers yes; CSS/compositor unverified | n/a (a modifier) | Hang risk, needs workaround | Medium |
| Stills + ffmpeg `zoompan` | ✓✓ perfect, no browser in the timing path | ✗ camera moves only | High *if* stills captured at 2–3x and pre-upscaled ~8x before zoompan | None | Low |

---

## 9. Recommendation

**Primary: frame-stepped capture — one `Page.captureScreenshot` per frame,
page state a pure function of frame index — with `document.getAnimations()`
seeking and scroll position as the two things being stepped. Frame sequence to
disk, ffmpeg `image2` at the exact fps. Secondary: stills + `zoompan` for
segments where the site's motion won't cooperate or a beat must be hit
surgically.**

Reasoning:

1. It is the only approach that is both exact *and* low-risk on Windows. Every
   other exact option (`beginFrame`) rests on a legacy binary that upstream
   appears to be removing, with sources that disagree about whether it works on
   Windows at all.
2. `document.getAnimations()` is baseline-available and reaches CSS animations
   and transitions — the exact thing timeweb/timecut admits it cannot handle.
   That is what makes frame-stepping viable against *real client marketing sites*
   rather than only against purpose-built React compositions.
3. The map's standing constraint — "small-N bespoke client sites Wyatt built
   himself, capture may assume cooperative pages" — is decisive. We can add a
   capture-mode stylesheet or a `data-capture` hook to a site we own, which
   collapses most of the CSS-animation difficulty. This is leverage Remotion,
   timecut, and puppeteer-capture never had.
4. Runtime is not a real constraint (a 20 s / 600-frame reel finishes in seconds
   to low minutes at any plausible per-frame cost), so we should spend runtime
   freely on settling: `document.fonts.ready`, image `decode()`, double-rAF, and
   a scroll priming pass before every capture pass.
5. Keeping the frame sequence as the intermediate — never encoding straight to
   video — is what makes beat alignment arithmetic instead of guesswork, and it
   makes the compositing-engine decision (still open on the map) independent of
   the capture decision.

**Open items for the prototype ticket (deliberately not answered here):**

- Measure actual per-frame `Page.captureScreenshot` cost at 1080x1920 on the
  target Windows machine, JPEG q90 vs PNG, with and without `optimizeForSpeed`.
  No primary source publishes this number.
- Verify whether CSS animations advance correctly under
  `Emulation.setVirtualTimePolicy`. If they do, virtual time becomes a clean
  belt-and-braces addition; if they don't, `getAnimations()` seeking carries the
  load alone.
- Verify whether `chrome-headless-shell` + `beginFrame` still works on Windows
  with the Chrome version we'd pin. If it does and it's stable, it is a
  strictly-better capture step that drops into the same loop — but design so
  it's optional.
- Determine whether a paint race is actually observable with
  `captureScreenshot` + double-rAF settle, or whether HyperFrames' warning only
  bites at higher throughput than we need.
