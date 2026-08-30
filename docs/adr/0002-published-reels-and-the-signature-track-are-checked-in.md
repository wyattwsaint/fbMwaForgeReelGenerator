# ADR-0002: Published reels and the signature track are checked into git

## Status

Accepted (2026-08-26, resolves #14). Reverses the `audio/` half of #8.
Amended 2026-08-27 (resolves #39): the repo is public and the decision stands anyway —
see [Amendment](#amendment-2026-08-27-the-repo-is-public).

## Context

A reel is not reproducible. The site config is deterministic, but the live client site
underneath it is not, the brand kit is sampled at render time, and a Suno track cannot
be regenerated from its prompt (#8). So a rendered `.mp4` is the only record of what a
reel actually was, and the signature track is unrecoverable rather than re-downloadable.
#8 had recorded `audio/` as gitignored plus "a real backup" — written while music was
still imagined as per-client library tracks under a third party's licence. ~~#15 then
found Suno *assigns* rights outright and perpetually, leaving one file, a few MB, owned
by MWA Forge, with no redistribution concern in a private repo.~~ Both halves of that
sentence are false; see the [Amendment](#amendment-2026-08-27-the-repo-is-public).
What is true is that one file, a few MB, is unrecoverable if it is not kept here.

## Decision

Binaries that cannot be regenerated are **checked into this repo**:

- **Published reels** live in a tracked `reels/`, named `<slug>-<YYYY-MM-DD>.mp4`.
  Only reels that actually shipped are kept; everything rendered while iterating stays
  in gitignored `out/` scratch.
- **The signature track** lives in a tracked `audio/`, alongside an `audio/PROVENANCE.md`
  recording tier, generation date, download date and ToS version (written by #17). This
  says *the signature track* because it was the only one; the rule was always about the
  binary being unrecoverable, so it holds for any track a config names — #67 added a
  second, with its own provenance entry, and nothing here had to change.

Regenerable intermediates stay ignored: `out/`, `frames/`. Masters are never persisted
across runs — a cached master is a photograph of a page that may no longer exist, and a
cache hit would silently render an out-of-date reel while `check` stayed quiet.

There is **no per-reel manifest**. The commit that adds a reel pins the whole tree, so
`git log --follow reels/<name>.mp4` recovers the exact config that produced it. This
requires a discipline: **commit a kept reel on its own**, never bundled with config
edits.

## Consequences

- Repo size grows by ~6–9 MB per shipped reel. At a handful of bespoke sites this is
  fine; if the effort ever scales to many clients or many cuts per client, this is the
  decision to revisit first — and by then the history cannot be trimmed cheaply.
- The one thing git does not capture is the brand colours sampled at render. They are
  derived from the live site, so the reel's own pixels are the record.
- ~~Promotion from `out/` to `reels/` is a manual `mv`, deliberately not a CLI command:
  judging a cut good enough to ship is the pipeline's one human step, and a `--keep`
  flag would make keeping the default path of a render.~~ Superseded by
  [ADR-0004](0004-promotion-is-a-command-the-judgment-is-not.md): the judgment stays
  human and there is still no `--keep` flag, but the mechanics — which this ADR is what
  loads — are `reel keep`.
- Because the renderer cannot verify a claimed licence tier, no licence metadata lives
  in site config and no re-render refusal is implemented. Provenance is a document, not
  a check.

## Amendment (2026-08-27): the repo is public

This ADR justified tracking `audio/` and `reels/` partly on a premise that was wrong
when written and is doubly wrong now. Two corrections, and then the decision, unchanged.

**Correction 1 — the rights claim.** #15 did not find that Suno assigns rights outright
and perpetually; it found that Suno assigns Output ownership to **Pro and Premier**
subscribers only. `audio/mwaforge-signature.mp3` was generated on the **free tier**, so
no commercial grant attaches to it. `audio/PROVENANCE.md` has always recorded this
correctly and is the authority; this ADR's summary of #15 was not. That exposure was
decided in #8 and re-affirmed in #17 with #15's findings in hand — it is accepted, not
overlooked, and the exit (one month of Pro, regenerate, one-line config change) stays
cheap and open.

**Correction 2 — the repo is public.** As of 2026-08-27 it is, so "no redistribution
concern in a private repo" no longer holds even on its own terms. Two things are now
published:

- `audio/quiet-confidence.mp3` — the default bed since #87, and the one thing that
  makes a reel recognisably MWA Forge's, now downloadable by anyone. Both tracks in
  `audio/` are free-tier Suno output and both are published; the rights position is
  the same for either, and `audio/PROVENANCE.md` records it per file.
- `reels/` — client work, promoted by `reel keep` ([ADR-0004](0004-promotion-is-a-command-the-judgment-is-not.md)).

## Amended decision

**Both stay tracked.** The alternatives — a release asset, a private submodule, gating
`reel keep` on recorded client consent — each buy less than they cost:

- The track is already published and the history cannot be trimmed cheaply (this ADR's
  own first consequence). Untracking it now hides a file that is already out while
  taking the repo's only backup of an unrecoverable binary with it, which is exactly
  the failure this ADR exists to prevent.
- A reel is marketing MWA Forge intends to boost as paid media. A promoted reel is
  meant to be seen; being fetchable from the repo is a weaker exposure than the
  Facebook post it was cut for. If a client ever needs a reel *not* published, that is
  a reason to revisit — and it is a reason to revisit **before** the first such reel is
  kept, not after.

The distribution is therefore a **choice**, made here with eyes open, not an oversight
to be discovered and quietly patched later. Same standing as the licence position above:
if it changes, change it deliberately.

## Amended consequences

- Anyone can download the signature track. Nothing prevents its reuse; MWA Forge holds
  no exclusivity on any Suno tier in any case ([`audio/PROVENANCE.md`](../../audio/PROVENANCE.md)),
  so keeping the file private would not have bought exclusivity either.
- A kept reel is public the moment it is committed. `reel keep` is a publishing step in
  two senses now — treat the human judgment it records ([ADR-0004](0004-promotion-is-a-command-the-judgment-is-not.md))
  as covering both.
- The first client who needs a reel unpublished reopens this ADR, and reopens it while
  `reels/` is still small enough to move.
