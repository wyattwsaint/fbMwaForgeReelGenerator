/**
 * `planReel(config) -> Timeline` — the reel's shape as a pure function (#20, #22).
 *
 * Everything about a reel that needs no browser and no ffmpeg: how long it is,
 * which move each shot gets, where every cut lands, and each line's alpha
 * envelope. Pure and synchronous — no browser, no filesystem, no clock — so it is
 * the one place #12's timings, #6's rotation and #9's budgets are encoded, and
 * capture, composition and the review stills read from its output rather than
 * re-deriving any of it.
 */

import { DEFAULT_PUNCH_FACTOR, FRAME_HEIGHT, FRAME_WIDTH, MAX_BEATS, MIN_BEATS } from './frame.ts'
import { MIN_FIT_SCALE } from './house.ts'
import { STILL_DEGRADATION, movesEnough } from './motion.ts'
import { AMBIENT_DEGRADATION } from './scroll.ts'
import { configuredMotion } from './site.ts'
import type {
  Beat,
  Direction,
  HookMotion,
  LiveMotion,
  Move,
  PushPull,
  SiteConfig,
} from './site.ts'
// Type-only, and only ever type-only: `survey.ts` imports this module for real, so a
// value import here would be a runtime cycle between the page and the plan of it.
import type { Survey } from './survey.ts'

export type { HookMotion, LiveMotion, Move, PushPull } from './site.ts'
export type { Rect, Survey, SurveyedBeat, SurveyedPage } from './survey.ts'

export type Shot = {
  kind: 'title' | 'hook' | 'beat' | 'cta'
  /** Position within its own kind: the title, the hook and the card are 0, beats are
   * 0..n-1. */
  index: number
  startMs: number
  durationMs: number
  move: Move
  direction?: Direction
  /** Which way a drift zooms. Absent on a pan, which has no zoom to point. */
  pushPull?: PushPull
  punchFactor: number
  /**
   * Capture this shot in a viewport wide enough to put its whole section in one
   * frame (#65). Absent unless config asked for it: `fit` is an override like every
   * other, so a config that names it nowhere plans exactly the reel it did before.
   */
  fit?: true
  /**
   * How this shot's site pixels are got. Absent is `still` — one frozen master, with
   * the move synthesised over it — which is every shot but a live hook (#63, #64).
   *
   * Present is the whole of what downstream needs: the input is a recording rather
   * than a screenshot, so the page was stabilised and never frozen, and the chain
   * that turns one image into a stream has nothing to do.
   */
  motion?: LiveMotion
  /** Absent on the title shot and on the card — the two shots with no site pixels
   * in them. */
  source?: { url: string; selector?: string; y?: number; height?: number }
}

/**
 * Whether a shot is recorded rather than synthesised.
 *
 * A predicate rather than the field comparison spelled out at each call site: "is this
 * live" is the question `camera` and `compose` both ask, and neither cares *which*
 * live motion it is: an `ambient` hook and a `scroll` one differ in what the page is
 * doing under the lens, and by the time either reaches a camera it is a recording.
 */
export function isLive(shot: Shot): boolean {
  return shot.motion !== undefined
}

export type TextCue = {
  /** Index into `shots`. */
  shot: number
  content: string
  role: 'hook' | 'label' | 'cta'
  /**
   * Reel time, not shot time. A label's envelope starts after its cut, so the
   * offset is part of the plan rather than a constant the compositor re-derives.
   */
  startMs: number
  fadeInMs: number
  holdMs: number
  fadeOutMs: number
}

export type Timeline = {
  durationMs: number
  fps: number
  /** n + 3: the title, the hook, the beats, the card. */
  shots: Shot[]
  /** ms; n + 2 entries. The last is the crossfade start, not a hard cut. */
  cutPoints: number[]
  text: TextCue[]
  audio: { file: string; offsetMs: number; fadeOutMs: number }
}

/** #1: constant frame rate, and 30 is the middle of Meta's 24-60. */
export const FPS = 30

/**
 * A duration in milliseconds as a whole number of frames.
 *
 * Beside `FPS` because every caller has to round the same way: the camera counts a
 * shot's frames, the overlay counts a cue's, and a scrim that rounds down where its
 * text rounded up is a wash that lets go a frame early. One rounding, one place.
 */
export function frameCount(durationMs: number): number {
  return Math.round((durationMs * FPS) / 1000)
}

/**
 * The title shot's length (#106) — the reel's own opening frame, and the only shot
 * before the hook.
 *
 * Short on purpose. It is a mark and one line, both drawn at full alpha on frame 0,
 * and there is nothing on it to read twice: a viewer has the whole of it in well
 * under a second, and every frame past that is a frame the client's site is not on
 * screen. 1.5s is long enough to register as a title rather than a flash, and it
 * spends half of what a beat costs.
 *
 * Not overridable, like the other three: what a reel is made of is the house's.
 */
export const TITLE_MS = 1500

/** #12, as corrected by its own addendum. Not overridable — a finding, not a preference. */
export const HOOK_MS = 3000
export const BEAT_MS = 3500
export const CTA_MS = 2500
/** The card's crossfade *overlaps* the last beat, so it costs 0.3s of runtime. */
export const CROSSFADE_MS = 300

/** #9: a label is never lit across a cut, so it starts late and finishes early. */
export const LABEL_LEAD_IN_MS = 200
export const LABEL_FADE_MS = 300
export const LABEL_TAIL_MS = 200

/**
 * What every drawn line ends with, house style — the hook's and every beat label's
 * alike. The line is a lead-in to the shot it sits on, not a caption closing it, and
 * the trail says so. Applied to the drawn text, so a config never writes it and a
 * heading never has to carry it.
 */
export const COPY_TRAIL = '...'

/**
 * A line as it is drawn: the written text, trailed.
 *
 * A closing full stop is dropped first, because `well....` is a typo and not a
 * trail; a `?` or `!` stays, because the trail then reads as the line trailing off
 * after its own mark. A line already ending in the trail is left alone. Empty stays
 * empty — an empty label is a human saying no text, not a shot that says `...`.
 */
export function trailed(copy: string): string {
  if (!copy || copy.endsWith(COPY_TRAIL)) return copy
  return `${copy.replace(/\.$/, '')}${COPY_TRAIL}`
}
/** #9: the hook is drawn whole on its own first frame and fades over its final 0.5s. */
export const HOOK_FADE_OUT_MS = 500

/** One frame, in milliseconds — the step an envelope spends to land inside its shot. */
export const FRAME_MS = Math.round(1000 / FPS)

/** #8: the track a config names none; an override changes the file, never the terms. */
export const DEFAULT_TRACK = 'audio/quiet-confidence.mp3'
/** #8: the bed is trimmed and faded to length, so music ends with the reel. */
export const AUDIO_FADE_OUT_MS = 1000

/** #6: every pan takes the next of these, and none repeats back-to-back. */
export const DIRECTIONS: readonly Direction[] = [
  'vertical',
  'lateral',
  'diagonal',
  'lateral-reversed',
]

export type CopyBudget = { lines: number; chars: number }

/**
 * #9's table, carried as data so `check` and the compositor cannot disagree about
 * what overflows. Type never shrinks to fit, so over budget is a loud failure.
 *
 * A count, and counts are a proxy — `measure.ts` checks the width the line actually
 * draws, which is the constraint this table stands in for.
 */
export const COPY_BUDGETS: { hook: CopyBudget; label: CopyBudget } = {
  hook: { lines: 2, chars: 42 },
  // The same budget as the hook, because a label is now set at the hook's size
  // (`TYPE` in house.ts) and this table is a proxy for the width that size draws.
  // A label's one line and 28 characters were the 44px scale's allowance; carried
  // over unchanged they would refuse a line that fits and admit one that does not,
  // which is a proxy pointing at nothing. The text slot is two hook lines tall by
  // construction, so two is what there is room for.
  label: { lines: 2, chars: 42 },
}

/**
 * Below this the camera is moving but not visibly: #11 derives blur samples from
 * per-frame displacement, and a pan under a couple of pixels a frame renders at one
 * sample — which is the drift the shot was not asked for. #6's accepted pan runs
 * ~7px a frame, so this is a floor, not a target.
 */
export const MIN_PAN_PX_PER_FRAME = 2

/** The travel a pan of this length needs, in output pixels. */
export function panTravelNeeded(durationMs: number): number {
  return Math.round((MIN_PAN_PX_PER_FRAME * FPS * durationMs) / 1000)
}

/** Which axes a direction travels along. Diagonal needs headroom on both. */
export function panAxes(direction: Direction): ('x' | 'y')[] {
  if (direction === 'vertical') return ['y']
  if (direction === 'diagonal') return ['x', 'y']
  return ['x']
}

/**
 * The travel a punched section actually offers, in output pixels.
 *
 * A punch captures a column `FRAME_WIDTH / punch` wide, so a full-width page gives
 * the frame `FRAME_WIDTH * (punch - 1)` of lateral room — and none at all without a
 * punch. Vertically the section's own height is the source: what is left once one
 * frame's worth is spent is what a vertical pan travels across.
 */
export function panTravelAvailable(
  axis: 'x' | 'y',
  punchFactor: number,
  sectionHeight: number,
): number {
  if (axis === 'x') return Math.round(FRAME_WIDTH * (punchFactor - 1))
  return Math.round(sectionHeight * punchFactor - FRAME_HEIGHT)
}

/** Lateral travel comes from the punch alone, so the section's height does not enter. */
function lateralPunchFor(needed: number): number {
  return Math.ceil((1 + needed / FRAME_WIDTH) * 100) / 100
}

/** The punch factor that would give `needed` px of travel on `axis`. */
export function punchFactorFor(axis: 'x' | 'y', needed: number, sectionHeight: number): number {
  if (axis === 'x') return lateralPunchFor(needed)
  return Math.ceil(((FRAME_HEIGHT + needed) / sectionHeight) * 100) / 100
}

/**
 * The punch a lateral or diagonal pan gets when config names none.
 *
 * 1.0 is "no punch" and a section is exactly as wide as the frame, so a lateral pan
 * at 1.0 is not a slow move — it is no move. Vertical needs no default: the section's
 * own height past one frame is its travel. So the plan punches the pans that would
 * otherwise be impossible, and a punch the human *does* name is theirs, right or
 * wrong — `check` says which.
 */
export const DEFAULT_LATERAL_PUNCH_FACTOR = lateralPunchFor(panTravelNeeded(BEAT_MS))

/**
 * The tallest section **fit** may pull out to, in the base viewport's own pixels.
 *
 * `MIN_FIT_SCALE` said as a height, because a height is what a section is measured in:
 * fitting a section of `h` draws the page at `FRAME_HEIGHT / h` of its own size, so the
 * floor on that scale is a ceiling on that height (#66).
 *
 * Here rather than in `frame.ts` beside `fitViewportWidth`, which is the geometry it
 * caps: the floor itself belongs beside the type sizes it defends, and `frame.ts` is
 * what `house.ts` is built out of. So the cap lives with the other findings a beat is
 * held to once its section has actually been measured.
 */
export const MAX_FIT_SECTION_HEIGHT = Math.floor(FRAME_HEIGHT / MIN_FIT_SCALE)

/** Whether a section this tall is past the floor a **fit** may not draw the page under. */
export function pastFitCap(sectionHeight: number): boolean {
  return sectionHeight > MAX_FIT_SECTION_HEIGHT
}

/**
 * A `fit: true` that did not fit, named with the section that was too tall — or null
 * where the beat asked for no fit, or asked for one it is entitled to.
 *
 * A note rather than a problem: the beat still renders, so refusing the reel over it
 * would be the pipeline declining to do the thing it just decided to do. What it must
 * not be is silent — the human wrote `fit: true` and is getting a pan, and finding
 * that out in the render is finding it out too late.
 */
export function fitCapFallback(index: number, beat: Beat, sectionHeight: number): string | null {
  if (!beat.fit || !pastFitCap(sectionHeight)) return null
  return (
    `beats[${index}] '${beat.selector}' is ${Math.round(sectionHeight)}px tall; fit pulls out ` +
    `to at most ${MAX_FIT_SECTION_HEIGHT}px, so this beat is fit to width and panned ` +
    'vertically instead'
  )
}

/** Copy over budget, named with the budget it broke — or null when it fits. */
export function copyProblem(field: string, content: string, budget: CopyBudget): string | null {
  const lines = content.split('\n')
  const chars = lines.join('').length
  if (lines.length > budget.lines) {
    return `${field} is ${lines.length} lines; the budget is ${budget.lines}`
  }
  if (chars > budget.chars) {
    return `${field} is ${chars} characters; the budget is ${budget.chars}`
  }
  return null
}

/**
 * The rotation ordinal of beat `i` — seeded on the beat index and on `from`, so two
 * configs with the same n and the same hook plan the same moves.
 *
 * Beats alternate pan/drift from a drifting hook, so by default only even beats pan
 * and their ordinals run 0, 1, 2, ... — exactly "the next in the rotation". A beat
 * overridden to `pan` at an odd index is a pan the rotation did not plan for, so it
 * takes the step *opposite* the two beats it sits between: it can repeat neither
 * neighbour, and neither neighbour's direction moves because of it.
 *
 * `from` is where the reel's first pan enters the rotation, and it is what keeps a
 * scroll hook from being followed by a vertical pan (`SCROLLED_ROTATION_START`). It
 * shifts every beat's ordinal by the same step, so the rotation is still a rotation —
 * a reel that starts one step in repeats no direction across a cut for exactly the
 * same reason one that starts at zero does not.
 */
function rotationOrdinal(index: number, from: number = 0): number {
  return from + Math.floor(index / 2) + (index % 2) * 2
}

/**
 * Where the pan rotation starts behind a **scroll** hook (#12's rule, read across the
 * hook boundary).
 *
 * A scroll hook is a shot travelling *down the page* — that is the whole of what a
 * scripted scroll is (`./scroll.ts`) — and `DIRECTIONS` opens on `vertical`, which is a
 * pan travelling down the page. Between them sits a hard cut, and the two moves either
 * side of it read as one long downward slide that stutters in the middle: the same
 * gesture twice, which is the one thing the rotation exists to prevent. It just never
 * saw this pair, because the hook is a *drift* and the rotation only ever compared
 * pans to pans.
 *
 * So a scroll hook spends the rotation's vertical step, and the first beat takes the
 * next one. Not a new direction and not an exemption: the hook is counted, the way the
 * card is counted in the drift rotation.
 *
 * Read off the *resolved* motion rather than the config's ask, because a `scroll` whose
 * reveals cannot re-fire is an `ambient` (#64) and an ambient hero does not travel
 * anywhere — there is no downward move for beat 1 to repeat, so there is nothing to
 * step past and the rotation starts where it always did.
 */
export const SCROLLED_ROTATION_START = 1

function defaultMove(index: number): Move {
  return index % 2 === 0 ? 'pan' : 'drift'
}

/**
 * Which way the drift at beat `index` zooms — or at `n`, for the card that follows the
 * last beat (#52).
 *
 * Seeded on the index alone, like the pan rotation, so overriding one beat never moves
 * another's zoom — which is the guarantee #7 asks of every planned move.
 *
 * The rotation is two steps and the hook takes the first: it is ordinal 0 and beats
 * count from 1, because the hook is *exempt* rather than absent. Frame 0 is the
 * thumbnail Facebook shows in-feed and a pull's first frame is its most upscaled one,
 * so the hook pushes whatever the rotation would have said — and starting the sequence
 * on the push it takes anyway costs the reel no alternation, which is what makes the
 * exemption affordable.
 *
 * `defaultMove` drifts the odd beats, so their ordinals run 1, 2, ... — exactly "the
 * next drift". An even beat overridden to drift lands on the same ordinal as the odd
 * beat before it and so repeats it; with two steps there is no step that avoids both
 * neighbours, and the index seeding is worth more than the near miss.
 */
function rotatedPushPull(index: number): PushPull {
  const ordinal = 1 + Math.floor(index / 2)
  return ordinal % 2 === 0 ? 'push' : 'pull'
}

/**
 * Whether the shot the motion probe would be deciding about is an `ambient` one — the
 * chain's first step, as a function of the config and the one reading that step reads.
 *
 * This is the whole reason the probe is gated: a `scroll` that is going to stay a
 * `scroll` has nothing to measure, and a hook that was never going to be `ambient` has
 * nothing for the probe to decide. `resolvedMotion` asks it for step one and
 * `survey.ts` asks it before probing, so the browser and the plan cannot disagree about
 * which hook this is without the disagreement being written down twice first.
 *
 * It takes the *refire* reading rather than a survey, for the reason `movesEnough`
 * takes a number rather than a page (ADR-0009): a survey carries facts and never
 * verdicts, so the browser side may hand its own reading to a pure question, but must
 * never ask the chain for a verdict about a page it is halfway through surveying. Note
 * what is *not* a parameter: the probe's reading. The step this gates is the step
 * before it, so a caller cannot gate the probe on the number the probe is about to
 * take.
 */
export function ambientBeforeProbe(config: SiteConfig, scrollRefires: boolean | null): boolean {
  const configured = configuredMotion(config)
  return configured === 'ambient' || (configured === 'scroll' && scrollRefires === false)
}

/**
 * How the hook is really shot, and what to say about the difference — the two
 * questions a live hook turns on, in the order the answers chain (#64, #88, ADR-0008).
 *
 * A pure function of the config and the two readings the survey carries, here beside
 * the other move decisions rather than in the preflight that took them (ADR-0009): a
 * survey carries facts and never verdicts, and what the page said is a boolean and a
 * number. `planReel` and `check` both call this, so they cannot disagree about which
 * hook is being cut — one function of one value, which is a stronger guarantee than
 * carrying the verdict forward ever bought.
 *
 * The chain runs one way and is three deep: a `scroll` whose reveals cannot re-fire
 * becomes an `ambient`, and an `ambient` that does not move in frame becomes a
 * `still`. So a `scroll` hook can degrade twice in one run, and both steps are named —
 * a human handed a still where they asked for a scroll should be able to read why in
 * two lines rather than infer it from one.
 *
 * An unread reading is what the config asked for, exactly as an unmeasured height is
 * uncapped: a survey nobody took, a page that would not load, or a hero nobody could
 * find degrades nothing and is noted as nothing. The load failure and the missing hero
 * are already problems, and a note about either would be the same defect said twice.
 *
 * The floor stays in `motion.ts`, where the probe that calibrated it is written, and so
 * does the comparison against it — `movesEnough` is asked here rather than the constant
 * re-compared. Step one is `ambientBeforeProbe` above for the same reason: it is the
 * question the survey's probe gate asks, and a condition stated in both places is a
 * condition free to differ. Only *readings* cross the seam, which is what lets a test
 * sit either side of it.
 */
export function resolvedMotion(
  config: SiteConfig,
  survey?: Survey,
): { motion: HookMotion; notes: string[] } {
  const notes: string[] = []
  const configured = configuredMotion(config)
  const ambient = ambientBeforeProbe(config, survey?.scrollRefires ?? null)
  // Only a `scroll` that arrived at `ambient` degraded to get there; one written
  // `ambient` is shot as asked, and has nothing to say about it.
  if (ambient && configured === 'scroll') notes.push(AMBIENT_DEGRADATION)
  const motion: HookMotion = ambient ? 'ambient' : configured
  if (motion !== 'ambient') return { motion, notes }
  const reading = survey?.motionReading ?? null
  if (reading === null || movesEnough(reading)) return { motion, notes }
  notes.push(STILL_DEGRADATION)
  return { motion: 'still', notes }
}

/**
 * The reel's whole shape, from the config and what one settled page load said about it
 * (ADR-0009). Throws when the config cannot describe a reel at all — `check` reports
 * those by name before it ever gets here.
 *
 * The survey is a value rather than a page, because the plan is pure: the page is the
 * one thing about a reel that needs a browser, and a timeline that had to load one
 * would stop being the value #22 made it. It is optional for the same reason it used
 * to be three optional parameters — absent, the plan is exactly the reel the config
 * asked for: every beat unlabelled unless its own config says otherwise (#62), every
 * fit beat uncapped (#66), and the hook shot in the motion it was written with (#64,
 * #88). The plan only knows what it is handed.
 */
export function planReel(config: SiteConfig, survey?: Survey): Timeline {
  const beats = config.beats
  // Null where the survey said nothing, and null where it had nothing to say: a beat
  // past the end of an empty survey is unmeasured in exactly the way a beat whose
  // selector did not resolve is.
  const surveyed = survey?.beats ?? []
  const n = beats.length
  if (n < MIN_BEATS || n > MAX_BEATS) {
    throw new Error(`a reel is ${MIN_BEATS}-${MAX_BEATS} beats, this config has ${n}`)
  }

  const hookSelector = config.hook?.selector
  // `still` unless the config says otherwise, so a config that names no motion plans
  // exactly the reel it planned before #63.
  //
  // The degradation is read here rather than taken on trust from the preflight: a
  // `scroll` whose reveals cannot re-fire is an `ambient` (#64), and an `ambient` whose
  // hero does not move in the frame is a `still` (#88), and both change the *plan* — a
  // still hook is punched, drifts 10% and is synthesised from one frozen master, where
  // a live one breathes 3% over a recording. `check` reads the same chain off the same
  // survey, so the reel it reports on is the reel this plans. Unmeasured is what the
  // config asked for, exactly as an unmeasured height is uncapped: the plan only knows
  // what it is handed.
  const hookMotion = resolvedMotion(config, survey).motion
  const liveHook = hookMotion !== 'still'
  // A scroll hook already travels down the page, so the pan rotation starts past the
  // direction that would travel down it again across the cut.
  const rotationStart = hookMotion === 'scroll' ? SCROLLED_ROTATION_START : 0
  const shots: Shot[] = [
    {
      // The reel opens on MWA Forge's own mark rather than on the client's page: the
      // reel is MWA Forge's marketing and the site is its evidence, so the name goes
      // where the viewer is deciding whether to keep watching.
      kind: 'title',
      index: 0,
      startMs: 0,
      durationMs: TITLE_MS,
      move: 'drift',
      // And it pulls, which is what leaves the hook its push: two pushes back to back
      // across the reel's first cut is the one repeated gesture #52 refuses. The card
      // is why it can — the title is drawn, not filmed, so its most upscaled frame
      // costs it no sharpness, and frame 0 is drawn art at 103% rather than site
      // pixels a viewer would see soften.
      pushPull: 'pull',
      punchFactor: DEFAULT_PUNCH_FACTOR,
    },
    {
      kind: 'hook',
      index: 0,
      startMs: TITLE_MS,
      durationMs: HOOK_MS,
      // The hook drifts, which is why beat 1 pans.
      move: 'drift',
      // And it pushes, out of the rotation: a pull starts at the zoom, so a pulling
      // hook spends its softest frame on the cut the viewer meets the site on. A push
      // spends it on the last frame, under a cut that is already taking the eye.
      pushPull: 'push',
      punchFactor: DEFAULT_PUNCH_FACTOR,
      ...(liveHook ? { motion: hookMotion } : {}),
      source: { url: config.url, ...(hookSelector ? { selector: hookSelector } : {}) },
    },
  ]

  beats.forEach((beat, index) => {
    // The section measured past the legibility floor, so the fit it asked for is one
    // nobody could read (#66). It falls back to what a beat this tall got before fit
    // existed — fit to width, covered by a vertical pan, which is the move a section
    // with this much height to spare is for. Unmeasured is uncapped: the plan only
    // knows what it is handed, and `check` is what hands it a height.
    const height = surveyed[index]?.height
    const capped = beat.fit === true && height != null && pastFitCap(height)
    const fit = beat.fit === true && !capped
    // A fit section is exactly one frame, so there is nothing for a pan to travel
    // across — the same reasoning that makes the plan punch a lateral pan config left
    // flat, read the other way round. An explicit `move: 'pan'` is still the human's,
    // and `check` still says what it leaves a pan to travel. The fallback is that
    // reasoning spent: the section stayed as tall as it measured, so it pans.
    const move = beat.move ?? (fit ? 'drift' : capped ? 'pan' : defaultMove(index))
    const rotated = DIRECTIONS[
      rotationOrdinal(index, rotationStart) % DIRECTIONS.length
    ] as Direction
    // The fallback's pan is vertical by name, not by rotation: it is the one direction
    // a section too tall for one frame is guaranteed the travel for.
    //
    // And it is vertical whatever `direction` says, where the fallback is what supplied
    // the move: a `direction` on a fit beat was a field the plan dropped — fit drifts —
    // so honouring it now would turn a config that passed into a lateral pan at no
    // punch, which is a `check` failure the human never wrote. A `move` the config
    // *did* name is a pan they asked for, and their direction goes with it.
    const fellBack = capped && beat.move === undefined
    const direction =
      move === 'pan' ? (fellBack ? 'vertical' : (beat.direction ?? rotated)) : undefined
    const pushPull = move === 'drift' ? (beat.pushPull ?? rotatedPushPull(index)) : undefined
    const lateral = direction !== undefined && panAxes(direction).includes('x')
    // The plan's lateral punch is not applied to a fit beat: a punch crops back into
    // the section fit just widened the viewport to show whole, so a fit beat that took
    // one would not be fit. `check` reports the pan it leaves no travel instead, which
    // is the finding rather than a silent half-fit.
    const punchFactor = fit
      ? DEFAULT_PUNCH_FACTOR
      : (beat.punchFactor ?? (lateral ? DEFAULT_LATERAL_PUNCH_FACTOR : DEFAULT_PUNCH_FACTOR))
    shots.push({
      kind: 'beat',
      index,
      startMs: TITLE_MS + HOOK_MS + BEAT_MS * index,
      durationMs: BEAT_MS,
      move,
      ...(direction ? { direction } : {}),
      ...(pushPull ? { pushPull } : {}),
      punchFactor,
      ...(fit ? { fit: true as const } : {}),
      source: {
        url: beat.url ?? config.url,
        selector: beat.selector,
        ...(beat.y !== undefined ? { y: beat.y } : {}),
        ...(beat.height !== undefined ? { height: beat.height } : {}),
      },
    })
  })

  const ctaStartMs = TITLE_MS + HOOK_MS + BEAT_MS * n - CROSSFADE_MS
  shots.push({
    kind: 'cta',
    index: 0,
    startMs: ctaStartMs,
    durationMs: CTA_MS,
    // Nothing in this reel rests, the card least of all: a static final 2.5s reads
    // as the video having ended early.
    move: 'drift',
    // In the rotation, at the ordinal a beat after the last one would have had: the
    // card is drawn rather than filmed, so a pull costs it no sharpness, and it is
    // where an alternation is most visible — for n = 4 it is the only place a reel's
    // two beat drifts leave one. Seeded on n, so no override moves it either.
    pushPull: rotatedPushPull(n),
    punchFactor: DEFAULT_PUNCH_FACTOR,
  })

  // One per hard cut, then the crossfade start — which is where the card arrives,
  // not where the last beat ends. The first is the title's own cut into the hook.
  const cutPoints = [
    TITLE_MS,
    ...Array.from({ length: n }, (_, i) => TITLE_MS + HOOK_MS + BEAT_MS * i),
    ctaStartMs,
  ]

  const text: TextCue[] = [
    {
      // Shot 1: the title is shot 0, and its one line is a house constant drawn by
      // `card.ts` rather than a cue — like the end card's tagline, and for the same
      // reason (#9 §5).
      shot: 1,
      // Trailed as drawn, the same as a label: house style is the hook's too, and the
      // three characters are added here rather than typed into a config (#9).
      content: trailed(config.hook?.text ?? ''),
      role: 'hook',
      // Reel time, like every other cue: the hook shot no longer begins the reel, so
      // its line is lit where the hook is rather than at zero.
      startMs: TITLE_MS,
      fadeInMs: 0,
      // A frame short of the hook's own length, because a ramp reaches zero *at* the
      // frame it ends on and the hook ends on the shot's last frame — spend the whole
      // 3.0s and that frame is the one past it, leaving the last frame the reel
      // actually has lit at a fifteenth of full alpha across a hard cut (#36). #24 is
      // explicit that nothing is lit across a cut point, so the fade finishes on the
      // last frame rather than on the first frame of the shot after it.
      holdMs: HOOK_MS - HOOK_FADE_OUT_MS - FRAME_MS,
      fadeOutMs: HOOK_FADE_OUT_MS,
    },
  ]
  beats.forEach((beat, index) => {
    // The config wins, and it wins even when it says nothing: `label: ''` is a human
    // deciding this shot carries no text, which is not the same as never having said.
    // Trailed as drawn: the trail is house style, so it is added here and nowhere
    // else, and `check` measures the same trailed line this draws.
    const content = trailed(beat.label ?? surveyed[index]?.heading ?? '')
    if (!content) return
    const shot = shots[index + 2] as Shot
    const startMs = shot.startMs + LABEL_LEAD_IN_MS
    // Measured against the moment the reel moves on, not the beat's own end: for the
    // last beat that moment is the crossfade, and a label still lit under a card
    // arriving is the same dropped-frame read a label across a hard cut gives.
    const doneMs = (cutPoints[index + 2] as number) - LABEL_TAIL_MS
    text.push({
      shot: index + 2,
      content,
      role: 'label',
      startMs,
      fadeInMs: LABEL_FADE_MS,
      holdMs: doneMs - startMs - LABEL_FADE_MS * 2,
      fadeOutMs: LABEL_FADE_MS,
    })
  })
  text.push({
    shot: shots.length - 1,
    content: config.cta?.credit ?? '',
    role: 'cta',
    startMs: ctaStartMs,
    // The 0.3s crossfade brings the card in; the card's text has no life of its own.
    fadeInMs: 0,
    holdMs: CTA_MS,
    fadeOutMs: 0,
  })

  return {
    durationMs: TITLE_MS + HOOK_MS + BEAT_MS * n + CTA_MS - CROSSFADE_MS,
    fps: FPS,
    shots,
    cutPoints,
    text,
    audio: {
      file: config.music?.file ?? DEFAULT_TRACK,
      offsetMs: Math.round((config.music?.offset ?? 0) * 1000),
      fadeOutMs: AUDIO_FADE_OUT_MS,
    },
  }
}

/**
 * A cue's life, in its shot's own frames.
 *
 * Frames, not seconds: the text's alpha is drawn as an expression and the scrim's as
 * a `fade`, and the two only agree to the frame if they are told the same integers. A
 * scrim that lets go one frame after its text is a wash with nothing under it.
 */
export type Envelope = {
  startFrame: number
  fadeInFrames: number
  holdFrames: number
  fadeOutFrames: number
}

/**
 * A cue's envelope in shot time. Cue times are reel times — a label's envelope starts
 * after its own cut — and a shot is rendered on its own, so the shot's start comes off
 * before anything is drawn.
 *
 * Here rather than with the drawing, because an envelope is a timing and #9's timings
 * live in one place: nothing in it is about how the alpha reaches a pixel.
 */
export function envelopeOf(cue: TextCue, shot: Shot): Envelope {
  return {
    startFrame: frameCount(cue.startMs - shot.startMs),
    fadeInFrames: frameCount(cue.fadeInMs),
    holdFrames: frameCount(cue.holdMs),
    fadeOutFrames: frameCount(cue.fadeOutMs),
  }
}

/**
 * The frames an envelope turns on: dark until `start`, ramping to full at `lit`, held
 * to `held`, and dark again at `dark`.
 */
export type EnvelopeFrames = {
  start: number
  lit: number
  held: number
  dark: number
}

/**
 * The one statement of the envelope, in shot frames.
 *
 * The text's ramp is an ffmpeg expression and the scrim's is a `fade`, written in
 * different filters and built in different places — they share an envelope exactly
 * (#24), so they share these four frames rather than each deriving its own from the
 * same four durations and being kept in step by hand.
 */
export function envelopeFrames(envelope: Envelope): EnvelopeFrames {
  const { startFrame, fadeInFrames, holdFrames, fadeOutFrames } = envelope
  const lit = startFrame + fadeInFrames
  const held = lit + holdFrames
  return { start: startFrame, lit, held, dark: held + fadeOutFrames }
}

/** The frame the cue is finally dark on — one past its last lit frame. */
export function darkFrame(envelope: Envelope): number {
  return envelopeFrames(envelope).dark
}

/**
 * Every way a shot's own punch fails the move it was given, named with the punch that
 * would fix it. It lives here rather than in `check` because it is a finding about
 * moves, and #12's findings are encoded in one place — `check` supplies the one thing
 * the plan cannot know, which is how tall the section actually turned out to be.
 */
export function panTravelProblems(shot: Shot, selector: string, sectionHeight: number): string[] {
  if (shot.move !== 'pan' || !shot.direction) return []
  const need = panTravelNeeded(shot.durationMs)
  // A fit beat's section is one frame by construction, whatever it measured at the
  // base viewport — that is what fit means — so that is the height its pan travels
  // across. Which is none, on either axis: the finding still applies, and it is the
  // finding a fit beat asked to pan has coming.
  const height = shot.fit ? FRAME_HEIGHT : sectionHeight
  const problems: string[] = []
  for (const axis of panAxes(shot.direction)) {
    const available = panTravelAvailable(axis, shot.punchFactor, height)
    if (available >= need) continue
    // What left the pan short, and what would fix it. A punch has a number to raise;
    // a fit beat does not — the only way it travels is by not being fit, so the fix it
    // is offered is the move a fit section can actually take.
    const [cause, fix] = shot.fit
      ? ['a fit section is exactly one frame and', 'drift it instead']
      : [`a punchFactor of ${shot.punchFactor}`, `needs ${punchFactorFor(axis, need, height)}`]
    problems.push(
      `beats[${shot.index}] '${selector}' — a ${shot.direction} pan needs ${need}px of ` +
        `travel, ${cause} leaves ${Math.max(available, 0)}px (${fix})`,
    )
  }
  return problems
}
