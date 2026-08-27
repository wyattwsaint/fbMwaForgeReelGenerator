# ADR-0004: Promotion is a command; the judgment is not

## Status

Accepted (2026-08-27, resolves #28). Supersedes one consequence of
[ADR-0002](0002-published-reels-and-the-signature-track-are-checked-in.md): promotion
is no longer a manual `mv`.

## Context

ADR-0002 recorded that promotion from `out/` to `reels/` is "a manual `mv`,
deliberately not a CLI command", because judging a cut good enough to ship is the
pipeline's one human step and a `--keep` flag would make keeping the default path of a
render.

That reasoning is about the *judgment*. What #14 rejected was a flag on `render` — a
knob that decides before a human has watched anything. It says nothing about the
mechanics that follow a judgment already made, and conflating the two left the most
error-prone step of the pipeline done by hand.

The mechanics are error-prone precisely because ADR-0002 loaded them: the commit that
adds a reel *is* that reel's manifest, so `git log --follow` recovers the config that
produced it. One `git add .` that sweeps a config edit into that commit destroys that
recovery permanently, and a dirty tree is the normal case — you tune, render, judge and
keep in one sitting. A rule that is only ever enforced by remembering it is a rule that
erodes.

## Decision

`reel keep out/<file>.mp4` performs promotion: it moves the file to
`reels/<slug>-<YYYY-MM-DD>.mp4` and commits it on its own.

It runs **after** the judgment, about a file Wyatt named. It takes an explicit `.mp4`
path — never a slug, never "the latest" — so there is nothing to promote that a human
did not choose, and debris from a render that died mid-pass cannot be promoted at all.
There is no flag on `keep` and still no `--keep` on `render`.

Both git calls are pathspec-scoped to the one path, and a dirty working tree succeeds:
refusing on one would refuse on the happy path. `keep` prints the resulting commit's
one-line stat, so that nothing rode along is *visible* rather than asserted.

The date in the kept name replaces the scratch name's `-<n>beat`: `n` is recoverable
from the config the commit pins, and the day the reel was cut is not.

## Consequences

- ADR-0002's "manual `mv`" consequence no longer holds; everything else in ADR-0002 —
  tracked `reels/`, tracked `audio/`, no per-reel manifest, commit a kept reel on its
  own — is unchanged, and this is how the last of those is now kept.
- Keeping two cuts of one site on one day writes the same path twice. The second
  supersedes the first in the tree, and both remain in the history that kept them.
- `keep` assumes a git repo with a committer identity. There is one machine, and it has
  both; if git refuses, the reel has already moved, so the failure says where it now is
  rather than leaving Wyatt to look for it in a wiped `out/`.
