# ADR-0002: Published reels and the signature track are checked into git

## Status

Accepted (2026-08-26, resolves #14). Reverses the `audio/` half of #8.

## Context

A reel is not reproducible. The site config is deterministic, but the live client site
underneath it is not, the brand kit is sampled at render time, and a Suno track cannot
be regenerated from its prompt (#8). So a rendered `.mp4` is the only record of what a
reel actually was, and the signature track is unrecoverable rather than re-downloadable.
#8 had recorded `audio/` as gitignored plus "a real backup" — written while music was
still imagined as per-client library tracks under a third party's licence. #15 then
found Suno *assigns* rights outright and perpetually, leaving one file, a few MB, owned
by MWA Forge, with no redistribution concern in a private repo.

## Decision

Binaries that cannot be regenerated are **checked into this repo**:

- **Published reels** live in a tracked `reels/`, named `<slug>-<YYYY-MM-DD>.mp4`.
  Only reels that actually shipped are kept; everything rendered while iterating stays
  in gitignored `out/` scratch.
- **The signature track** lives in a tracked `audio/`, alongside an `audio/PROVENANCE.md`
  recording tier, generation date, download date and ToS version (written by #17).

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
