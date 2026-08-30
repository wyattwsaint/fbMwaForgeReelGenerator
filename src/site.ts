/** The per-site config schema (#7, as amended by #9). ADR-0001. */

export type Direction = 'vertical' | 'lateral' | 'lateral-reversed' | 'diagonal'

/**
 * Which way a drift zooms (#52) — drift's own parameter, as `Direction` is pan's.
 *
 * Its own union rather than a value bolted onto `Direction`: the two moves share no
 * value, so one union across both would let a config ask for a `diagonal` drift and
 * a `pull` pan and have the type say nothing.
 *
 * Named for its values rather than for the move, because `Drift` is already spoken
 * for twice — the move a shot gets, and `CONTEXT.md`'s client drift — and a `drift`
 * field on a shot whose `move` is `'drift'` says nothing about which of the three it
 * means. `CONTEXT.md` glossarises this one as **Push / pull**.
 */
export type PushPull = 'push' | 'pull'

/** The whole deck (#12): both continuous, neither ever lands. */
export type Move = 'drift' | 'pan'

/**
 * How a hook's site pixels are got (#63, ADR-0006).
 *
 * `still` is the doctrine every shot was built on: one frozen master, with the camera
 * synthesised over it in post. `ambient` records the stabilised hero animating on its
 * own clock — a video background, a carousel, a parallax idle — for exactly the hook's
 * duration, which is the one thing the freeze was always throwing away. `scroll`
 * records the same hero while a scripted scroll runs from the top of the page through
 * it (#64), so the effects keyed to the viewport *moving* fire on camera too.
 *
 * The two live motions differ in what the page is doing, not in how it is captured:
 * `ambient` waits for the page to move on its own, `scroll` makes it move. A `scroll`
 * hook on a page whose reveals cannot re-fire degrades to `ambient`, and `check` says
 * so — the scroll's pace and distance are house constants either way (`./scroll.ts`).
 *
 * The hook's alone. Beats stay master-based; if a section below the fold earns motion
 * later, ADR-0006 is the decision to extend rather than reverse.
 */
export type HookMotion = 'still' | 'ambient' | 'scroll'

/**
 * A motion that is *recorded* rather than synthesised — every `HookMotion` but `still`.
 *
 * Written as the exclusion rather than as its own list so a third motion cannot be
 * added to one and forgotten in the other.
 */
export type LiveMotion = Exclude<HookMotion, 'still'>

/**
 * The motion this config asked for, before any page has been looked at.
 *
 * A function rather than four spellings of `config.hook?.motion ?? 'still'`, because
 * the default is a decision — a config that names no motion plans exactly the reel it
 * planned before #63 — and a decision spelled out at every reader is one that can be
 * changed at three of them. What a *page* then does to it is `check`'s business
 * (`./check.ts`); this is only the ask.
 */
export function configuredMotion(config: SiteConfig): HookMotion {
  return config.hook?.motion ?? 'still'
}

export type Beat = {
  /** Required — resolved on the settled page. */
  selector: string
  /** Escape hatch when no element wraps the subject. */
  y?: number
  height?: number
  /** Default 1.0 — how far into this section the master is punched. */
  punchFactor?: number
  /**
   * Show the whole section in one frame by widening the capture viewport (#65).
   * The other end of `punchFactor`, so naming both is a config error.
   */
  fit?: boolean
  /** Override; otherwise alternates from the hook. */
  move?: Move
  /** Override; otherwise the deterministic rotation. */
  direction?: Direction
  /** Override; otherwise the deterministic rotation. Read only on a drift. */
  pushPull?: PushPull
  /** Optional on-screen line. */
  label?: string
  /** Override — a beat that lives on another route. */
  url?: string
}

export type SiteConfig = {
  url: string
  hook: {
    /** Default: the hero, first section of <main>. */
    selector?: string
    /** Drawn fully on frame 0, never animates in. */
    text: string
    /** Default `still` — whether the hook is synthesised from a master or recorded. */
    motion?: HookMotion
    /** Default 2.0 — seek time for a <video> hero. */
    videoTime?: number
  }
  /** Length is n, validated 3..5. */
  beats: Beat[]
  cta: {
    /** The client's domain, credited on MWA Forge's card. */
    credit: string
  }
  music?: { file: string; offset?: number }
}

/**
 * Identity at runtime; the whole point is the type error instead of the runtime
 * surprise. The rules a type cannot express — 3..5 beats, a music file that is
 * really on disk — are checked by `staticProblems` in `./config.ts`, so `check`
 * still fails loudly on a config TypeScript was happy with.
 */
export function defineSite(config: SiteConfig): SiteConfig {
  return config
}
