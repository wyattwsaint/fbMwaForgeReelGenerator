# ADR-0006: A live hook trades the freeze for the page's own motion

## Status

Accepted (2026-08-27).

## Context

Every shot has been synthesised from a **master**: one static screenshot, with all
camera motion computed in post. Settle exists to make that master deterministic —
it pauses videos, stubs `play()`, finishes finite animations and parks infinite
ones. That doctrine deliberately throws away the one thing some heroes are built
on: ambient motion (video backgrounds, carousels, parallax) and scroll-triggered
effects. A reel of those sites shows a dead version of their best moment.

The alternatives were real: keep the freeze and accept still heroes, fake the
motion in post (more synthesised moves), or record the running page. Faked motion
cannot reproduce a site's own animation, which is the immersiveness being sold.

## Decision

**The hook may be a live shot**: recorded from the running page over time rather
than synthesised from a master. Config picks per site — `still` (today's
behaviour, the default), `ambient` (dwell and record the hero animating), or
`scroll` (record while a scripted scroll runs from the top through the hero;
scroll pace is a house constant, not config). Beats stay master-based; if a
section below the fold earns motion later, this is the ADR to extend, not
reverse.

**Settle splits.** *Stabilise* (fonts, eager images, serial decode) runs before
every capture. *Freeze* runs only before a master. A live shot is stabilised,
never frozen: videos autoplay, animations run.

**Determinism is spent, reproducibility is kept.** The page animates on its own
clock, so no two recordings are bit-identical. Recording starts at a fixed
post-stabilise moment so frame 0 — the Facebook thumbnail, with the hook line
fully drawn on it — is at least reproducible in composition. This is the
distinction `CONTEXT.md` already holds for the pipeline against the live site;
it now applies within a single run for live shots.

**The camera under a live shot only breathes.** A subtle card-grade drift (the
3% zoom, not the 10% beat drift), still taking its turn in the push/pull
rotation. The page's motion is the shot; a full drift on top competes with it.

## Consequences

- A live hook's render is no longer checkable by re-capture comparison; a bad
  recording is judged by eye (review stills), which is already where hook
  judgment lived.
- Recording needs resolution headroom for the drift, so a live hook captures
  more pixels than a still one — the diagonal-pan cost argument, paid at the
  hook only.
- Sites configured `still` render byte-identically to before; nothing existing
  moves.
