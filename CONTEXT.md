# Context

Domain glossary for the Facebook Reels highlight generator. Vocabulary only — no
implementation detail. See `docs/agents/domain.md`.

## Reel structure

**Reel** — the deliverable: a 9:16, 15–30s `.mp4`. Composed as
`hook → beat × n → cta`, where `n` is 3–5.

**Hook** — the opening 3.0s. The client site's own hero section, drifting from
frame 0, with an overlay line drawn on frame 0. A hook is a single shot: it is
never cut. It is the one shot that may be a **live shot** rather than synthesised
from a **master**.

**Beat** — one section of the client's site (hero, services, gallery, pricing),
named by a CSS selector in the site's config. 3.5s, **one shot**. The middle of
the reel is 3–5 beats.

**Shot** — one continuous camera move over a beat's section. The unit between
cuts. A beat is one shot, so every cut falls on a beat boundary.

**Move** — the camera behaviour of a shot. The deck is two: **drift** (slow
zoom, in or out) and **pan** (slow travel across the section). Both are slow, both
are **continuous**: a move runs for its shot's whole duration and never lands. A move
that has to be blurred to read is a move that is too fast for this reel.

**Direction** — a parameter of pan, not a move of its own: **vertical**,
**lateral**, **lateral-reversed**, or **diagonal**. Vertical is the default.
Directions rotate deterministically across a reel's pan beats, so no direction
repeats back-to-back; per-beat override in config. A pan's two axes always travel
the same distance, so a diagonal reads as a diagonal rather than as a vertical
with a wobble — but a diagonal needs punch-in headroom on *both* axes, so it
costs roughly twice the captured pixels of a vertical one. Those pixels are also
the one way direction bears on speed, because a bigger master gives up less
travel to the grain a move is cut at (see **Punch-in**).

**Push / pull** — a parameter of drift, not a move of its own: a **push** zooms in
across its shot and a **pull** zooms back out. Same depth either way, so the two are
one move read in either direction — a pull ramps inside the window a drift already
crops, so it costs no extra captured pixels and asks nothing of the punch. Drifts
rotate deterministically across a reel, so no reel is one repeated gesture; per-beat
override in config. The hook is the one exemption: it always pushes, because of
**Frame 0**. A pull is not the snap pull #12 cut: what #12 objected to there was
speed, and a drift is slow in both directions.

**Move assignment** — which move each beat gets. Deterministic given the config:
pan and drift alternate, so no move repeats across a cut. The hook drifts, so
beat 1 pans. Each pan then takes the next direction in the rotation, and each drift
the next of push and pull — both seeded on the beat index alone, so overriding one
beat never moves another's. The card is in the drift rotation and the hook is not.
Per-beat override in config.

**Timeline** — a reel's whole shape, derived from its config before anything is
captured: its length, its shots and their moves, its cut points and every
overlay's alpha envelope. Deterministic given the config alone, so it is the
reel's plan, not a record of one — a kept reel is the record.

**Cut point** — a moment the reel changes shot. All but the last are hard cuts on
a beat boundary; the last is where the CTA's crossfade starts, which is a
transition rather than a cut, and it is the only one two shots share.

**CTA** — the closing 2.5s. A card, crossfaded in, carrying **MWA Forge's** call
to action: the MWA wordmark, the **tagline** beneath it, `mwaforge.com` in large
type, and the client's domain credited under that. The reel is MWA Forge's
marketing, so the viewer's next step is hiring MWA Forge; the client site is the
proof, and the credit line attributes it. The card drifts like everything else, and
takes its turn at pushing and pulling: it is drawn rather than filmed, so a pull costs
it no sharpness, and it is the last thing on screen, which is where an alternation is
most visible.

**Tagline** — the line on the CTA card that says what MWA Forge sells:
`Websites by MWA Forge`, set between the wordmark and `mwaforge.com`. House
style, not config — the same words on every reel, like the face, the mark and the
accent. It is not the **credit**: a credit attributes the client's site, a tagline
is the author's own signature. Set smaller than `mwaforge.com`, which stays the
largest type on the card because it is the one line asking the viewer to act.

**Card** — a rendered frame containing no site pixels. Currently the CTA is the
only card, and it is drawn in the house style — a card is never the client's.

## On-screen text

**Overlay** — burned-in text over site pixels: the hook line, and a beat's label.
It is what makes a muted reel watchable. Never captions: there is no spoken audio
in a reel, so all text is editorial.

**Label** — a beat's own line of overlay copy. Every beat can carry one without
the human writing one: a beat whose config names no label takes its section's
**heading**. Naming a label in config wins, so the editorial voice stays the
human's, and naming it as an empty string means that shot carries no text at all.
A section with no heading gives its beat no label, which is an unlabelled shot
rather than a problem.

**Heading** — the first heading inside a section, read off the settled page as one
line. A **label**'s default, not a second kind of copy: it is held to the same
**budget** and the same **slot overflow** check as a written line, and `check`
fails on one that breaks either. So a page with a long heading fails until a human
writes a shorter label — the pressure is the point, because type never shrinks to
fit.

**House style** — the one visual treatment every overlay and card uses, on every
reel, for every client: MWA Forge's own display face, ink, ground, accent and
**tagline**, frozen as constants in this repo. The client's brand reaches the
viewer as site pixels; the overlay is the author's voice, not the subject's.

**Slot** — the single fixed region overlay text occupies: left-aligned, in the
lower band of the safe zone, its foot a breath clear of the boosted bottom
boundary — that is where a Reels viewer is already looking. It does not move per
beat. A slot that shifts between cuts reads as sloppy, and a per-beat position is
a hand-timed edit. Hook line and beat labels alike draw here, top-down from the
slot's head, and it is exactly deep enough for a two-line hook.

**Safe zone** — the region of the 1080x1920 frame Meta's own UI does not cover:
top 14%, sides 6%, bottom 35%. The bottom figure is the *boosted* one; reels are
designed to it because boosting is planned, and a reel that must be re-cut to be
boosted is a trap.

**Cue** — one overlay's life on screen: when it is drawn, and how it fades in and
out. Fade only — an overlay never travels, scales or types on — and a cue is
never lit across a cut point.

**Scrim** — the gradient wash behind overlay text that keeps it legible over an
arbitrary screenshot. Constant colour, never sampled from the page, and it lives
and dies with the text it serves: no text on screen, no scrim, because a
permanent scrim dims the site the reel exists to show off. It is anchored to the
frame's foot, where the slot is: dense from the slot's head down, and spending
its whole **release** — the stretch above the copy it takes to come up from
nothing — easing the site into the wash rather than stopping at a line.

**Budget** — the character allowance for a line of copy. Exceeding it fails
loudly at `check`, like a missing selector. Type never shrinks to fit: a reel
whose type size depends on how much Wyatt typed is a reel a viewer can feel is
off without being able to say why.

**Slot overflow** — copy that draws wider than the text slot. The budget counts
characters, which is a proxy: capitals cost nearly twice what it assumes, so a
line inside the count can still run off the side of the frame. So `check` also
measures the line against the checked-in face and fails on the width, which is
the constraint the viewer actually sees.

## Capture

**Live shot** — a shot **recorded** from the running page over time instead of
synthesised from a still. Config picks it per site, on the hook alone: `still` is
today's behaviour and the default, and `ambient` dwells on the stabilised hero
while its own animation runs — a video background, a carousel, a parallax idle.
The trade is deliberate (ADR-0006): the page animates on a clock this pipeline
does not own, so no two recordings are alike. Recording starts at a fixed
post-stabilise moment, so **frame 0** is at least reproducible in *composition* —
and the hook line is still drawn fully on it and still never animates in.

A live shot's camera only breathes: the card's 3% zoom rather than a beat's 10%,
because the page is already moving and a full drift on top of it competes with the
shot. It still pushes and still takes its turn in the rotation. A recording is
exactly one frame of pixels — a browser records its viewport at the size the page
is laid out at, whatever resolution it is asked for — so a live shot cannot be
**punched**, and its breath spends 3% of upscale where a beat's drift spends 10%.

**Recording** — what a live shot is made of, as a master is what a still shot is
made of: the viewport over the shot's own duration, at the reel's frame rate and
the frame's own size.
Run-scoped exactly like a master, discarded with them, never a build artifact and
never promoted. It is the one capture that *scrolls* to its subject, because a
recording is the viewport — so a live hook carries whatever page chrome sits over
its hero.

**Master** — the single static, high-resolution capture a shot's camera move is
computed over. One master per beat, framed on that beat's section. Camera motion
is never stepped in the browser; it is synthesised in post from the master. A
master is **run-scoped**: it survives long enough to feed the render attempts of
one session and is then discarded. It is never a build artifact, because a kept
master is a photograph of a page that may no longer exist.

**Settle** — the routine that puts the page into a deterministic state before a
master is taken: **stabilise**, then **freeze**. A settled page captures
bit-identically run to run. A live shot is stabilised and never settled.

**Stabilise** — the half of settle every capture needs, whether or not it wants
the page still: fonts loaded, every image forced eager and decoded serially. It
step-scrolls the page and returns to 0 to trip the observers behind lazy images,
so a reveal that only fires once has already fired by the time anything is
recorded.

**Freeze** — the half only a master needs: videos paused and seeked to a fixed
time with the page's own `play()` stubbed out, finite animations finished and
infinite ones parked. It is what makes two runs of one master identical, so it is
exactly what a shot of the page's own motion must not have.

**Punch-in** — cropping into a section so the master is larger than the frame.
Sections are usually shorter than 1920px, so a pan only has room to travel if the
beat is punched in. Per-beat punch factor lives in config. A section is exactly as
wide as the frame, so a lateral or diagonal pan has *no* travel unpunched: the plan
punches those to the minimum that gives them travel when config names no factor. A
factor the config does name is the human's, and `check` says whether it travels.

A punch buys travel, and it also buys the *grain* that travel is cut at: the move
is a crop, and a crop lands on whole master pixels, so a pan is only smooth if it
covers a whole number of them a frame. A punched pan therefore travels slightly
less far than its room allows, and the bigger the master the less it gives up
(#51).

**Fit** — capturing a beat's section whole, by widening the **capture viewport**
instead of punching in. A section is exactly as wide as whatever viewport it is laid
out in, so loading the page wider makes the section proportionally shorter against the
frame; the page is then rasterised back down so the master is still frame resolution.
The other end of the punch, not a punch below 1.0 — a punch crops a narrower column
out of a page already rendered at frame width, and asking for less than all of it asks
for pixels that were never drawn. Per-beat, and mutually exclusive with a punch factor.

Fit only ever widens. A section already inside one frame has nothing to fit, and
narrowing to reach it would shoot the site's phone layout, which is a different site
rather than a wider view of this one — so such a section stays at the base viewport
and `check` refuses it for the reason it always did: too short for a frame.

Two things follow. A fit beat sees a **different layout**: widening reflows the site,
so its section is measured twice — once at the base viewport to learn the width, once
after the reflow to frame the clip — and the second measurement is the one that is
shot. The reflow moves the height either way and the width is not re-derived from it:
a fit clip is one frame exactly, centred on the section, because a fit master that
came back taller than a frame would be a fit beat quietly not fitting. And a fit beat
**cannot share a page load** with a non-fit one: a page load is
per url, per viewport width and per raster scale, so two fit beats at the same width
are one load and a fit and a non-fit beat on the same url are two.

A fit section is one frame, so it has no room for a pan to travel and the plan drifts
it — the same reasoning that punches a lateral pan config left flat, read the other
way round. A beat that names `move: 'pan'` anyway gets one, and `check` says what it
left the pan to travel.

Fit has a floor, and it is a **legibility** one: a fit draws the client's whole page
smaller, its body copy included, so past some scale a fit section is a section nobody
can read. The floor is one house constant, sitting beside the type sizes it defends,
and it is the copy **budget**'s doctrine applied to the site's own type — type never
shrinks to fit. A floor on the scale is a **cap** on the height — a section is fit by
being made proportionally shorter against the frame, so the two are one rule said from
either end, and the code names both. Past it a fit beat falls back to what a section that
tall got before fit existed: fit to width, covered by a vertical pan. The fallback is a **note** rather than
a problem — the beat renders — and `check` names the beat and the section that was too
tall, because a human who wrote `fit: true` and is getting a pan should hear it at the
preflight rather than find it in the render.

**Page chrome** — sticky and fixed page furniture (nav, announcement bars). It
belongs to the page, not to a section. Capturing a master without scrolling the page
keeps it out of every beat by construction: a clip carries chrome only where it
reaches the top of the document, and a beat's clip never does. The hook's can — it is
framed on the hero, so a hero that starts at the very top of the page, under an
overlaying nav, brings the furniture with it, and a hero that starts below the nav
leaves it out. Chrome is therefore in the hook or in nothing at all.

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
sheet**. Scratch, like the render they describe — never promoted, since the reel itself
is the record and both are recoverable from it.

**Contact sheet** — one tile per shot, in reel order: n+2 of them, which is frame 0 and
then the frame each cut point lands on, every shot but the hook beginning on one. The
card is the exception, because its cut point is where its crossfade *starts* — a tile
taken there shows neither the beat being left nor the card, so the card's tile is the
first frame it is alone on screen.

**Signature track** — the one commissioned piece of music reused across MWA Forge's
reels. Not reproducible from the prompt that made it, so the file itself is the asset.
It is MWA Forge's, like the face and the mark, so it is found beside them in this repo
rather than beside any site's config.

**Bed** — the signature track as it appears under one reel: slid by an **offset**,
trimmed to the reel's length and faded out at the end, so the music ends *with* the
reel rather than being cut off. It sits underneath and nothing is timed to it — no
beat-locking, no BPM — so a reel is exactly as long with a bed as without. A track is
minutes long and a reel is seconds, so only the stretch the offset lands on is ever
heard.

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
to change, so a reel can never be reconstructed, only re-cut into a new one. A **live
shot** moves that same line inside a single run: the page animates on its own clock, so
two renders of one config differ in the hook's pixels while still agreeing about its
composition.

**Frame 0** is the thumbnail Facebook shows in-feed. It is a constraint, not a
by-product: hook text is fully drawn on it and may not animate in, and the hook
always pushes rather than pulling — a pull starts at the zoom, so its first frame is
its most upscaled one, and that is the frame the whole feed is shown. A push spends
that softest frame last, where nobody is looking.

## Config

**Site config** — one TS module per client site, `sites/<slug>.ts`, checked into this
repo. The human's entire steering wheel: a URL, hook text, 3–5 beat selectors, and a
CTA. Everything else in the file is an **override**.

**Override** — a config field that exists because a real site broke a default. Move,
pan direction, push / pull, punch factor, beat label, video pin and hook motion are all
overrides; a config that names none of them still renders. A beat label overrides the
section's own **heading** rather than an absence, so a reel carries copy whether or not
the config says a word. Timings are not overridable — 3.5s per beat is a finding, not a
preference.

**Check** — the render pipeline stopped after settle: resolves every beat's selector and
reports missing selectors, sections shorter than the frame, punch factors that leave
a pan no room to travel, and **headings** that break a **label**'s budget. Catches
client drift in seconds rather than a full capture pass.
A **preflight**, never a monitor: it is run when a new reel is about to be cut, and
nothing schedules it or reacts to it on its own. A render runs it first and refuses on
failure — it is the settle the render was going to do anyway.

**Note** — something `check` says the run *did*, as against a problem, which is
something it refuses to do. A **fit** past its legibility floor is the first: the beat
is planned as a vertical pan instead and still renders, so refusing the reel over it
would be the pipeline declining to do the thing it just decided to do. A note never
changes an exit code, and it is printed whether or not anything else failed.

**Sections report** — the page measured before a config exists: every **candidate
section** with a selector that resolves, its height, the punch factor that height
needs, and the **heading** it leads with — so the **labels** a config is about to
get for free are visible before it is written. The other half of `check` — `check`
can only say what is wrong with the selectors already guessed, and this says what is
on the page. A report and never a
proposal: it ranks nothing and writes nothing, because which sections become beats, in
what order, is the human's whole job.

**Candidate section** — a direct child of the page's `main` that draws something. The
level a beat is written at. Named by its own `id` where it has one, since an id is the
selector that survives the client's next edit; one without an id is addressed through
`main` by `y` and `height`.

**Drift** (client drift) — the client editing their own site until a config's selectors
no longer describe it. Always a loud failure, never a silently shorter reel. Drift says
nothing about reels already kept: a kept reel does not become wrong when the site
changes, only **dated**.
