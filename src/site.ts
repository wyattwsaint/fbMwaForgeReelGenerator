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
