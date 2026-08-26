/** The per-site config schema (#7, as amended by #9). ADR-0001. */

export type Direction = 'vertical' | 'lateral' | 'lateral-reversed' | 'diagonal'

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
  /** Override; otherwise alternates from the hook. */
  move?: Move
  /** Override; otherwise the deterministic rotation. */
  direction?: Direction
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
