/**
 * The scripted scroll a `scroll` hook is recorded under (#64, ADR-0006).
 *
 * A hero built on scroll-triggered reveals and parallax shows nothing at all to a
 * camera that never scrolls: the effects are keyed to the viewport moving, and every
 * other capture in this pipeline deliberately holds it still. So a `scroll` hook is
 * recorded while the page is walked from the top of the document down through the
 * hero, and the effects fire on camera.
 *
 * Pace and distance are house constants, for the same reason the timings are: no reel
 * is hand-timed. A per-site scroll speed would be a hand edit wearing a config field,
 * and the point of a deterministic plan is that the human's steering wheel is *what*
 * is shown rather than how fast the camera moves over it.
 */

import type { Page } from 'playwright'

/**
 * How fast the scripted scroll travels, in CSS pixels a second.
 *
 * Nearly a viewport across the hook's 3.0s — brisk enough that a reveal below the fold
 * at frame 0 is fully on screen well before the cut, slow enough to read as a scroll
 * rather than as a jump. The distance follows from it and the shot's own duration: a
 * scroll that ran a fixed *distance* over a longer shot would be a different gesture
 * at every shot length, and the pace is the thing a viewer actually reads.
 */
export const SCROLL_PACE = 500

/** How far a shot of this length scrolls — the pace, spent over the shot. */
export function scrollDistance(durationMs: number): number {
  return Math.round((SCROLL_PACE * durationMs) / 1000)
}

/** How long the probe below dwells after a walk before reading the page. */
const SETTLE_MS = 200

/**
 * Walk the page from the top down through the hero, at the house pace, for exactly the
 * shot's duration.
 *
 * Resolves when the walk finishes, which is the moment the shot ends — the caller is
 * recording across that same window, and awaiting this is how it knows the page was
 * driven for all of it rather than for as long as the browser felt like.
 *
 * `scroll-behavior` is forced to `auto` first: a page that asked for smooth scrolling
 * would ease towards each step on its own curve, and the pace would be the site's
 * rather than the house's.
 */
export function scriptedScroll(page: Page, durationMs: number): Promise<void> {
  return page.evaluate(
    async (walk) => {
      document.documentElement.style.scrollBehavior = 'auto'
      const started = performance.now()
      for (;;) {
        const t = Math.min(1, (performance.now() - started) / walk.durationMs)
        window.scrollTo(0, walk.distance * t)
        if (t >= 1) break
        // ~60Hz, stepped rather than driven by rAF: a rAF loop needs a named callback,
        // and the TS loader renames functions into a helper that does not exist inside
        // the page (see `freeze`).
        await new Promise((r) => setTimeout(r, 16))
      }
    },
    { durationMs, distance: scrollDistance(durationMs) },
  )
}

/**
 * Whether this page's scroll effects fire *again* — the known limit ADR-0006 states
 * rather than chases, asked as a question that has an answer.
 *
 * `stabilise` has already step-scrolled the whole page to trip the observers behind
 * lazy images, so a reveal wired to fire once has already fired and never will again.
 * The scripted scroll returns to the top and re-runs it where the site allows that;
 * where it does not, there is nothing for a `scroll` hook to record that an `ambient`
 * one would not, and it degrades to one.
 *
 * The page is walked to where the shot would take it and back, and what is compared is
 * every element's opacity, transform and visibility — the three properties a reveal or
 * a parallax moves, and none of which a video background or a height animation touches.
 * A page that changes none of them across the walk changes nothing a scroll could show.
 *
 * The comparison errs towards scrolling: an unrelated infinite transform animation, on
 * a page that is stabilised rather than frozen, reads as an effect that re-fires, and
 * what that buys is the scroll the config asked for. The costly mistake is the other
 * one — silently dwelling on a hero that was built to reveal.
 */
export function scrollEffectsRefire(page: Page, durationMs: number): Promise<boolean> {
  return page.evaluate(
    async (walk) => {
      document.documentElement.style.scrollBehavior = 'auto'
      const samples: string[] = []
      for (const target of [0, walk.distance]) {
        // Stepped rather than jumped, so an observer sees the viewport cross an element
        // rather than teleport past it.
        const from = window.scrollY
        for (let step = 1; step <= 8; step++) {
          window.scrollTo(0, from + ((target - from) * step) / 8)
          await new Promise((r) => setTimeout(r, 40))
        }
        await new Promise((r) => setTimeout(r, walk.settleMs))
        const parts: string[] = []
        for (const element of [...document.querySelectorAll('body *')].slice(0, 400)) {
          const style = getComputedStyle(element)
          parts.push(style.opacity, style.transform, style.visibility)
        }
        samples.push(parts.join('|'))
      }
      window.scrollTo(0, 0)
      await new Promise((r) => setTimeout(r, walk.settleMs))
      return samples[0] !== samples[1]
    },
    { distance: scrollDistance(durationMs), settleMs: SETTLE_MS },
  )
}

/**
 * What `check` says about a `scroll` hook it found nothing to scroll for. A note and
 * never a problem: the reel still renders, and what it renders is a perfectly good
 * ambient hook — but ADR-0006's trade was made for the reveals, and a human who asked
 * for them and is silently handed a dwell has no way to tell.
 */
export const AMBIENT_DEGRADATION =
  "hook.motion 'scroll' — this page's scroll effects do not re-fire, " +
  "so the hook is recorded as 'ambient'"
