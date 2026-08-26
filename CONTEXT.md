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
zoom) and **pan** (slow vertical travel). Both are slow, both are **continuous**:
a move runs for its shot's whole duration and never lands. A move that has to be
blurred to read is a move that is too fast for this reel.

**Move assignment** — which move each beat gets. Deterministic given the config:
pan and drift alternate, so no move repeats across a cut. The hook drifts, so
beat 1 pans. Per-beat override in config.

**CTA** — the closing 2.5s. A card, crossfaded in, showing the client's domain in
large type with logo on brand color.

**Card** — a rendered frame containing no site pixels. Currently the CTA is the
only card.

## Distinctions worth holding

**Beat vs. shot.** A beat is *what is being shown* (a section of the site); a
shot is *how it is being shown* (one camera move). They are currently 1:1, but
they are not the same idea — the beat count is set by the site's config, the
shot is the render primitive.

**Move vs. rest.** There is no rest. Nothing in a reel is static — not a beat,
not the hook, not the moment before the CTA. A static shot reads as a stall.

**Site pixels vs. card.** The hook and the beats are captured from the real page;
the CTA is drawn. Anything that needs the client's brand kit is a card.

**Frame 0** is the thumbnail Facebook shows in-feed. It is a constraint, not a
by-product: hook text is fully drawn on it and may not animate in.
