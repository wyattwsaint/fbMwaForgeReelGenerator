# ADR-0001: Per-site config is a checked-in TS module

## Status

Accepted (2026-08-26, resolves #7)

## Context

A reel is generated from a client URL plus a per-site config — the human's only
steering wheel, since automatic highlight detection is out of scope. The config had to
pick a format, a home, and a policy for what happens when a client edits their site out
from under it.

## Decision

One TS module per site at `sites/<slug>.ts`, default-exporting `defineSite({...})`,
checked into this repo. Beat subjects are addressed by **CSS selector** against the
settled page, with `y`/`height` as an escape hatch. A selector that no longer matches is
a **loud failure**, never a skipped beat. No schema version field; no per-beat duration
override; no settle knobs beyond `hook.videoTime`.

## Consequences

- Type errors and autocomplete replace runtime schema validation; annotations live
  inline with the values they explain.
- Client Astro repos stay clean, at the cost of config living apart from the site it
  describes.
- Loud failure means client drift surfaces as a broken render rather than a silently
  shorter reel — the reason the file exists.
- Because config carries no colours (only role overrides) and no timings, a restyle by
  the client is absorbed automatically, while a *structural* change is caught by `check`.
- If configs ever ship outside this repo, the missing version field must be revisited.
