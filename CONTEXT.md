# Context

Domain glossary for the Facebook Reels highlight generator. Vocabulary only — no
implementation detail. See `docs/agents/domain.md`.

## Reel structure

**Reel** — the deliverable: a 9:16, 15–30s `.mp4`. Composed as
`hook → beat × n → cta`, where `n` is 3–5.

**Hook** — the opening 3.0s. The client site's own hero section, held then
drifting, with an overlay line drawn on frame 0. A hook is a single shot: it has
no rhythm and is never cut.

**Beat** — one section of the client's site (hero, services, gallery, pricing),
named by a CSS selector in the site's config. 3.5s, cut into three shots. The
middle of the reel is 3–5 beats.

**Shot** — one continuous camera move over a beat's section. The unit between
cuts. Cuts fall between shots, not only between beats.

**Move** — the camera behaviour of a shot. The deck is six: **snap push**,
**snap pull**, **whip pan**, **drift**, **reveal**, **hold**.

**Rhythm** — a named three-shot pattern (moves plus durations) summing to 3.5s,
applied to a beat. Rhythms are rotated deterministically across a reel so no two
adjacent beats feel alike.

**CTA** — the closing 2.5s. A card, crossfaded in, showing the client's domain in
large type with logo on brand color.

**Card** — a rendered frame containing no site pixels. Currently the CTA is the
only card.

## Distinctions worth holding

**Beat vs. shot.** A beat is *what is being shown* (a section of the site); a
shot is *how it is being shown* (one camera move). Fast pacing means several
shots per beat — the two are not interchangeable.

**Site pixels vs. card.** The hook and the beats are captured from the real page;
the CTA is drawn. Anything that needs the client's brand kit is a card.

**Frame 0** is the thumbnail Facebook shows in-feed. It is a constraint, not a
by-product: hook text is fully drawn on it and may not animate in.
