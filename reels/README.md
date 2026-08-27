# Kept reels

Shipped reels, one file each: `<slug>-<YYYY-MM-DD>.mp4`, put here by `reel keep`.

Tracked deliberately (ADR-0002); put here by a command rather than by hand (ADR-0004).
A reel is **not reproducible** — the client's live
site underneath it is theirs to change — so the mp4 is the only record of what a reel
was, and the commit that adds it is its manifest: `git log --follow` on a kept reel
recovers the config that made it. Each reel is committed **on its own** for exactly
that reason; nothing else belongs in one of these commits.

This repo is public, so a reel is published the moment it is committed here. That is
a deliberate choice (ADR-0002, amended #39), not an oversight — but it is part of what
`reel keep` means, so judge a cut with it in mind.

Scratch cuts and review stills live in `out/`, which is gitignored and wiped by the
next render.
