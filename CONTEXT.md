# Context

Domain glossary for the Facebook Reels highlight generator. Vocabulary only — no
implementation detail. See `docs/agents/domain.md`.

## Reel structure

**Reel** — the deliverable: a 9:16, 15–30s `.mp4`. Composed as
`hook → beat × n → cta`, where `n` is 3–5.

**Hook** — the opening 3.0s. The client site's own hero section, drifting from
frame 0, with an overlay line drawn on frame 0. A hook is a single shot: it is
never cut.

**Beat** — one section of the client's site (hero, services, gallery, pricing),
named by a CSS selector in the site's config. 3.5s, **one shot**. The middle of
the reel is 3–5 beats.

**Shot** — one continuous camera move over a beat's section. The unit between
cuts. A beat is one shot, so every cut falls on a beat boundary.

**Move** — the camera behaviour of a shot. The deck is two: **drift** (slow
zoom) and **pan** (slow travel across the section). Both are slow, both are
**continuous**: a move runs for its shot's whole duration and never lands. A move
that has to be blurred to read is a move that is too fast for this reel.

**Direction** — a parameter of pan, not a move of its own: **vertical**,
**lateral**, **lateral-reversed**, or **diagonal**. Vertical is the default.
Directions rotate deterministically across a reel's pan beats, so no direction
repeats back-to-back; per-beat override in config. Every direction travels the
same path length in the same time, so speed and blur are unaffected by the
choice — but a diagonal pan needs punch-in headroom on *both* axes, so it costs
roughly twice the captured pixels of a vertical one.

**Move assignment** — which move each beat gets. Deterministic given the config:
pan and drift alternate, so no move repeats across a cut. The hook drifts, so
beat 1 pans. Each pan then takes the next direction in the rotation.
Per-beat override in config.

**CTA** — the closing 2.5s. A card, crossfaded in, carrying **MWA Forge's** call
to action: the MWA wordmark and `mwaforge.com` in large type, with the client's
domain credited beneath it. The reel is MWA Forge's marketing, so the viewer's
next step is hiring MWA Forge; the client site is the proof, and the credit line
attributes it. The card drifts like everything else.

**Card** — a rendered frame containing no site pixels. Currently the CTA is the
only card, and it is drawn in the house style — a card is never the client's.

## On-screen text

**Overlay** — burned-in text over site pixels: the hook line, and a beat's
optional label. It is what makes a muted reel watchable. Never captions: there is
no spoken audio in a reel, so all text is editorial.

**House style** — the one visual treatment every overlay and card uses, on every
reel, for every client: MWA Forge's own display face, ink, ground and accent,
frozen as constants in this repo. The client's brand reaches the viewer as site
pixels; the overlay is the author's voice, not the subject's.

**Slot** — the single fixed region overlay text occupies: left-aligned, in the
upper band of the safe zone. It does not move per beat. A slot that shifts
between cuts reads as sloppy, and a per-beat position is a hand-timed edit.

**Safe zone** — the region of the 1080x1920 frame Meta's own UI does not cover:
top 14%, sides 6%, bottom 35%. The bottom figure is the *boosted* one; reels are
designed to it because boosting is planned, and a reel that must be re-cut to be
boosted is a trap.

**Scrim** — the gradient wash behind overlay text that keeps it legible over an
arbitrary screenshot. Constant colour, never sampled from the page, and it lives
and dies with the text it serves: no text on screen, no scrim, because a
permanent scrim dims the site the reel exists to show off.

**Budget** — the character allowance for a line of copy. Exceeding it fails
loudly at `check`, like a missing selector. Type never shrinks to fit: a reel
whose type size depends on how much Wyatt typed is a reel a viewer can feel is
off without being able to say why.

## Capture

**Master** — the single static, high-resolution capture a shot's camera move is
computed over. One master per beat, framed on that beat's section. Camera motion
is never stepped in the browser; it is synthesised in post from the master. A
master is **run-scoped**: it survives long enough to feed the render attempts of
one session and is then discarded. It is never a build artifact, because a kept
master is a photograph of a page that may no longer exist.

**Settle** — the routine that puts the page into a deterministic state before a
master is taken: fonts loaded, every image forced eager and decoded serially,
videos paused and seeked to a fixed time with the page's own `play()` stubbed
out, finite animations finished and infinite ones parked. A settled page
captures bit-identically run to run.

**Punch-in** — cropping into a section so the master is larger than the frame.
Sections are usually shorter than 1920px, so a pan only has room to travel if the
beat is punched in. Per-beat punch factor lives in config.

**Page chrome** — sticky and fixed page furniture (nav, announcement bars). It
belongs to the page, not to a section, so it appears only in the hook. Capturing
a master without scrolling the page excludes it by construction.

## Retention

**Kept reel** — a reel that actually shipped. The only record of what a reel was, since
a config plus a later version of the site renders something different. Kept reels are
durable and named by the day they were cut.

**Scratch render** — everything rendered while iterating towards a cut. Disposable by
construction; a scratch render becomes a kept reel only by a human deciding it should.

**Promotion** — the act of turning a scratch render into a kept reel: moving it into
`reels/` and committing it **on its own**. The decision is human and always will be; the
mechanics are not, because a reel committed alongside anything else stops being
recoverable from its own history.

**Review stills** — the two images emitted beside every scratch render so a cut can be
judged without squinting at a tall sliver of video: **frame 0**, and a **contact
sheet** carrying one tile per cut point. Scratch, like the render they describe — never
promoted, since the reel itself is the record and both are recoverable from it.

**Signature track** — the one commissioned piece of music reused across MWA Forge's
reels. Not reproducible from the prompt that made it, so the file itself is the asset.

**Provenance** — the record of where a track came from and under what terms it may be
used. It belongs to the track, not to any site that uses it, and it is a document to be
read, never a value the renderer checks.

## Distinctions worth holding

**Beat vs. shot.** A beat is *what is being shown* (a section of the site); a
shot is *how it is being shown* (one camera move). They are currently 1:1, but
they are not the same idea — the beat count is set by the site's config, the
shot is the render primitive.

**Move vs. rest.** There is no rest. Nothing in a reel is static — not a beat,
not the hook, not the moment before the CTA. A static shot reads as a stall.

**Site pixels vs. card.** The hook and the beats are captured from the real page;
the CTA is drawn. Every drawn pixel in a reel — overlay, scrim, card — is MWA
Forge's house style. There is no derived client brand kit; that idea died when
the CTA turned out to belong to MWA Forge.

**Text vs. motion.** Text fades; it never travels, scales or types on. The camera
is already moving under every frame, so kinetic type competes with the shot — and
it is the one choice that would cost the pipeline its raw-ffmpeg simplicity.

**Judgment vs. mechanics.** The human step in this pipeline is deciding that a cut is
good, and nothing automates it. Everything downstream of that decision — the move, the
solo commit, the file name — is mechanics, and automating those protects the judgment
rather than replacing it.

**Reproducible vs. deterministic.** The pipeline is deterministic — one config plus one
page state always gives one reel. It is not reproducible: the page state is the client's
to change, so a reel can never be reconstructed, only re-cut into a new one.

**Frame 0** is the thumbnail Facebook shows in-feed. It is a constraint, not a
by-product: hook text is fully drawn on it and may not animate in.

## Config

**Site config** — one TS module per client site, `sites/<slug>.ts`, checked into this
repo. The human's entire steering wheel: a URL, hook text, 3–5 beat selectors, and a
CTA. Everything else in the file is an **override**.

**Override** — a config field that exists because a real site broke a default. Move,
direction, punch factor, beat label and video pin are all overrides; a config that
names none of them still renders. Timings are not overridable — 3.5s per beat is a
finding, not a preference.

**Check** — the render pipeline stopped after settle: resolves every beat's selector and
reports missing selectors, sections shorter than the frame, and punch factors that leave
a pan no room to travel. Catches client drift in seconds rather than a full capture pass.
A **preflight**, never a monitor: it is run when a new reel is about to be cut, and
nothing schedules it or reacts to it on its own. A render runs it first and refuses on
failure — it is the settle the render was going to do anyway.

**Drift** (client drift) — the client editing their own site until a config's selectors
no longer describe it. Always a loud failure, never a silently shorter reel. Drift says
nothing about reels already kept: a kept reel does not become wrong when the site
changes, only **dated**.
