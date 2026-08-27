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
import type { Direction, Move, PushPull, SiteConfig } from './site.ts'

export type { Move, PushPull } from './site.ts'

export type Shot = {
  kind: 'hook' | 'beat' | 'cta'
  /** Position within its own kind: the hook and the card are 0, beats are 0..n-1. */
  index: number
  startMs: number
  durationMs: number
  move: Move
  direction?: Direction
  /** Which way a drift zooms. Absent on a pan, which has no zoom to point. */
  pushPull?: PushPull
  punchFactor: number
  /** Absent on the card — it is the one shot with no site pixels in it. */
  source?: { url: string; selector?: string; y?: number; height?: number }
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
  /** n + 2: the hook, the beats, the card. */
  shots: Shot[]
  /** ms; n + 1 entries. The last is the crossfade start, not a hard cut. */
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
/** #9: the hook is drawn on frame 0 and fades over the hook's final 0.5s. */
export const HOOK_FADE_OUT_MS = 500

/** One frame, in milliseconds — the step an envelope spends to land inside its shot. */
export const FRAME_MS = Math.round(1000 / FPS)

/** #8: one signature track across reels; config overrides the file, never the terms. */
export const DEFAULT_TRACK = 'audio/mwaforge-signature.mp3'
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
  label: { lines: 1, chars: 28 },
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
 * The rotation ordinal of beat `i` — seeded on the beat index alone, so two configs
 * with the same n plan the same moves.
 *
 * Beats alternate pan/drift from a drifting hook, so by default only even beats pan
 * and their ordinals run 0, 1, 2, ... — exactly "the next in the rotation". A beat
 * overridden to `pan` at an odd index is a pan the rotation did not plan for, so it
 * takes the step *opposite* the two beats it sits between: it can repeat neither
 * neighbour, and neither neighbour's direction moves because of it.
 */
function rotationOrdinal(index: number): number {
  return Math.floor(index / 2) + (index % 2) * 2
}

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
 * The reel's whole shape. Throws when the config cannot describe a reel at all —
 * `check` reports those by name before it ever gets here.
 */
export function planReel(config: SiteConfig): Timeline {
  const beats = config.beats
  const n = beats.length
  if (n < MIN_BEATS || n > MAX_BEATS) {
    throw new Error(`a reel is ${MIN_BEATS}-${MAX_BEATS} beats, this config has ${n}`)
  }

  const hookSelector = config.hook?.selector
  const shots: Shot[] = [
    {
      kind: 'hook',
      index: 0,
      startMs: 0,
      durationMs: HOOK_MS,
      // The hook drifts, which is why beat 1 pans.
      move: 'drift',
      // And it pushes, out of the rotation: frame 0 is the thumbnail (#5), and a pull
      // starts at the zoom, so a pulling hook spends its softest frame where every
      // in-feed viewer looks. A push spends it on the last frame, where nobody does.
      pushPull: 'push',
      punchFactor: DEFAULT_PUNCH_FACTOR,
      source: { url: config.url, ...(hookSelector ? { selector: hookSelector } : {}) },
    },
  ]

  beats.forEach((beat, index) => {
    const move = beat.move ?? defaultMove(index)
    const rotated = DIRECTIONS[rotationOrdinal(index) % DIRECTIONS.length] as Direction
    const direction = move === 'pan' ? (beat.direction ?? rotated) : undefined
    const pushPull = move === 'drift' ? (beat.pushPull ?? rotatedPushPull(index)) : undefined
    const lateral = direction !== undefined && panAxes(direction).includes('x')
    const punchFactor =
      beat.punchFactor ?? (lateral ? DEFAULT_LATERAL_PUNCH_FACTOR : DEFAULT_PUNCH_FACTOR)
    shots.push({
      kind: 'beat',
      index,
      startMs: HOOK_MS + BEAT_MS * index,
      durationMs: BEAT_MS,
      move,
      ...(direction ? { direction } : {}),
      ...(pushPull ? { pushPull } : {}),
      punchFactor,
      source: {
        url: beat.url ?? config.url,
        selector: beat.selector,
        ...(beat.y !== undefined ? { y: beat.y } : {}),
        ...(beat.height !== undefined ? { height: beat.height } : {}),
      },
    })
  })

  const ctaStartMs = HOOK_MS + BEAT_MS * n - CROSSFADE_MS
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
  // not where the last beat ends.
  const cutPoints = [...Array.from({ length: n }, (_, i) => HOOK_MS + BEAT_MS * i), ctaStartMs]

  const text: TextCue[] = [
    {
      shot: 0,
      content: config.hook?.text ?? '',
      role: 'hook',
      startMs: 0,
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
    if (!beat.label) return
    const shot = shots[index + 1] as Shot
    const startMs = shot.startMs + LABEL_LEAD_IN_MS
    // Measured against the moment the reel moves on, not the beat's own end: for the
    // last beat that moment is the crossfade, and a label still lit under a card
    // arriving is the same dropped-frame read a label across a hard cut gives.
    const doneMs = (cutPoints[index + 1] as number) - LABEL_TAIL_MS
    text.push({
      shot: index + 1,
      content: beat.label,
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
    durationMs: HOOK_MS + BEAT_MS * n + CTA_MS - CROSSFADE_MS,
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
  const problems: string[] = []
  for (const axis of panAxes(shot.direction)) {
    const available = panTravelAvailable(axis, shot.punchFactor, sectionHeight)
    if (available >= need) continue
    problems.push(
      `beats[${shot.index}] '${selector}' — a ${shot.direction} pan needs ${need}px of ` +
        `travel, a punchFactor of ${shot.punchFactor} leaves ${Math.max(available, 0)}px ` +
        `(needs ${punchFactorFor(axis, need, sectionHeight)})`,
    )
  }
  return problems
}
