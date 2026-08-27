/**
 * The package's public surface — what a `sites/<slug>.ts` config can import.
 *
 * The house palette is deliberately not here (#36). #9 killed the derived client
 * brand kit — the overlay is the author's voice rather than the subject's — and
 * ADR-0001 records the consequence: a config carries role overrides, no colours and
 * no timings. An exported `INK` or `TYPE` is an invitation to configure exactly what
 * those decisions froze, so the table stays inside `src/`, where a restyle is a
 * commit rather than a per-site setting.
 */

export { defineSite } from './site.ts'
export type { Beat, Direction, SiteConfig } from './site.ts'
export { COPY_BUDGETS, planReel } from './plan.ts'
export type { CopyBudget, Move, Shot, TextCue, Timeline } from './plan.ts'
