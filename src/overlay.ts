/**
 * The overlay — burned-in house-style text over site pixels (#9, #24).
 *
 * Pure and synchronous, like `plan` and `camera`: this turns a shot's `TextCue`s into
 * the ffmpeg chains that draw them, and nothing else. Every envelope is read from the
 * cue rather than re-derived here, so the plan stays the one place #9's timings live
 * and `compose` never has an opinion about when a line is lit.
 *
 * It is `drawtext` with an alpha expression over a gradient `overlay`, because #9
 * ruled out kinetic type — which was the only thing that would have forced a layout
 * engine into a pipeline that is otherwise raw ffmpeg.
 */

import { FONT_FILE, GROUND, INK, SCRIM, TEXT_SLOT, TYPE, channels, ffmpegColor } from './house.ts'
import { FPS, frameCount } from './plan.ts'
import type { Shot, TextCue } from './plan.ts'

/** The roles drawn over site pixels. The card's own text belongs to the card (#9 §5). */
const OVERLAY_ROLES = new Set(['hook', 'label'])

/**
 * A cue's life, in this shot's own frames.
 *
 * Frames, not seconds: the text's alpha is an expression and the scrim's is a `fade`,
 * and the two only agree to the frame if they are told the same integers. A scrim
 * that lets go one frame after its text is a wash with nothing under it.
 */
export type Envelope = {
  startFrame: number
  fadeInFrames: number
  holdFrames: number
  fadeOutFrames: number
}

/** The cues of one shot, in the order they are drawn. */
export function overlayCues(cues: TextCue[], shotIndex: number): TextCue[] {
  return drawnOverlays(cues.filter((cue) => cue.shot === shotIndex))
}

/**
 * The ones drawn over site pixels, from cues already narrowed to a shot. The card's
 * cue survives being handed around and is drawn by `card.ts` instead — a shot carries
 * all of its own text, and each drawer takes the roles that are its own.
 */
export function drawnOverlays(cues: TextCue[]): TextCue[] {
  return cues.filter((cue) => OVERLAY_ROLES.has(cue.role) && cue.content !== '')
}

/**
 * A cue's envelope in shot time. Cue times are reel times — a label's envelope starts
 * after its own cut — and a shot is rendered on its own, so the shot's start comes off
 * before anything is drawn.
 */
export function envelopeOf(cue: TextCue, shot: Shot): Envelope {
  return {
    startFrame: frameCount(cue.startMs - shot.startMs),
    fadeInFrames: frameCount(cue.fadeInMs),
    holdFrames: frameCount(cue.holdMs),
    fadeOutFrames: frameCount(cue.fadeOutMs),
  }
}

/** The frame the cue is finally dark on — one past its last lit frame. */
export function darkFrame(envelope: Envelope): number {
  const { startFrame, fadeInFrames, holdFrames, fadeOutFrames } = envelope
  return startFrame + fadeInFrames + holdFrames + fadeOutFrames
}

/**
 * The cue's alpha at frame `n`, as an ffmpeg expression.
 *
 * The hook's fade-in is zero frames long, which is not a degenerate case but the
 * point: frame 0 is the Facebook in-feed thumbnail (#5), so the hook is fully drawn
 * on it and the branch that would ramp is simply absent. Constant 1 at n=0 is also
 * what keeps frame 0 bit-identical run to run.
 */
export function alphaExpr(envelope: Envelope): string {
  const { startFrame: f0, fadeInFrames, holdFrames, fadeOutFrames } = envelope
  const f1 = f0 + fadeInFrames
  const f2 = f1 + holdFrames
  const f3 = f2 + fadeOutFrames

  let expr = fadeOutFrames > 0 ? `if(lt(n,${f3}),(${f3}-n)/${fadeOutFrames},0)` : '0'
  expr = `if(lt(n,${f2}),1,${expr})`
  if (fadeInFrames > 0) expr = `if(lt(n,${f1}),(n-${f0})/${fadeInFrames},${expr})`
  if (f0 > 0) expr = `if(lt(n,${f0}),0,${expr})`
  return expr
}

/**
 * One value, escaped for the two parsers it has to survive.
 *
 * A filtergraph is unescaped twice: once when the graph is split into filters, and
 * again when a filter's own arguments are split into options. So every special
 * character is escaped once for each pass, innermost first — a Windows drive letter's
 * colon ends up as `\\:` and an apostrophe in a hook line as `\\\'`. Quoting is not
 * an alternative: a quote is consumed by the *graph* pass, so the colons it looked
 * like it was protecting arrive at the option pass bare.
 *
 * Copy is whatever a human typed into a config, so it goes through here rather than
 * through a list of characters we remembered to worry about.
 */
export function escapeValue(value: string): string {
  const forOptions = value.replace(/[\\':]/g, (char) => `\\${char}`)
  return forOptions.replace(/[\\'[\],;]/g, (char) => `\\${char}`)
}

/**
 * The scrim: a wash of house ground, densest at the top of the frame and gone at the
 * text band's foot, sharing its text's envelope exactly.
 *
 * Generated once and looped rather than evaluated per frame — the gradient is
 * constant, never sampled from the page, so there is nothing about it that could
 * change between frames. The envelope is `fade` on the alpha channel, whose ramp is
 * the same `(n - start) / length` the text's expression uses.
 */
function scrimChain(envelope: Envelope, label: string): string {
  const { r, g, b } = channels(GROUND)
  const alpha = `255*${SCRIM.peak}*(1-pow(Y/H,${SCRIM.falloff}))`
  const { startFrame, fadeInFrames, fadeOutFrames } = envelope
  const lit = startFrame + fadeInFrames + envelope.holdFrames

  const stages = [
    `color=c=${ffmpegColor(GROUND)}:s=${SCRIM.width}x${SCRIM.height}:r=1:d=1`,
    'format=rgba',
    `geq=r=${r}:g=${g}:b=${b}:a=${escapeValue(alpha)}`,
    'loop=loop=-1:size=1:start=0',
    // `fps`, not `setpts`: the looped frames need timestamps *and* a frame count, and
    // `fade` counts frames. Re-stamping the pts alone leaves it counting something
    // else, which is a scrim that lets go a second before the text it serves.
    `fps=${FPS}`,
  ]
  // A cue that starts lit needs no ramp; one that starts dark needs at least the one
  // frame of ramp that tells `fade` where the dark part ends.
  if (fadeInFrames > 0 || startFrame > 0) {
    stages.push(
      `fade=t=in:alpha=1:start_frame=${startFrame}:nb_frames=${Math.max(1, fadeInFrames)}`,
    )
  }
  if (fadeOutFrames > 0) {
    stages.push(`fade=t=out:alpha=1:start_frame=${lit}:nb_frames=${fadeOutFrames}`)
  }
  return `${stages.join(',')}[${label}]`
}

/**
 * The text: one `drawtext` a line, top-down from the slot.
 *
 * A line each rather than one multi-line draw, so the leading is this repo's number
 * and not freetype's, and so a config's newline never has to survive two levels of
 * filtergraph escaping on the way to the frame.
 */
function textChain(cue: TextCue, envelope: Envelope, input: string, output: string): string {
  const type = cue.role === 'hook' ? TYPE.hook : TYPE.label
  const alpha = alphaExpr(envelope)
  const draws = cue.content.split('\n').map((line, index) =>
    [
      'drawtext',
      `=fontfile=${escapeValue(FONT_FILE)}`,
      `:text=${escapeValue(line)}`,
      // Copy is a human's, not a format string: `%{...}` and backslashes are letters.
      ':expansion=none',
      `:fontcolor=${ffmpegColor(INK)}`,
      `:fontsize=${type.size}`,
      `:alpha=${escapeValue(alpha)}`,
      `:x=${TEXT_SLOT.x}`,
      `:y=${TEXT_SLOT.top + index * type.lineHeight}`,
    ].join(''),
  )
  return `[${input}]${draws.join(',')}[${output}]`
}

/**
 * Every chain needed to draw a shot's overlay, from `input` to `output`.
 *
 * Empty when the shot carries no overlay, which is most shots: #9 is explicit that a
 * line on every 3.5s beat reads as a slideshow, so most reels ship with hook and CTA
 * only. Chains are joined with `;` by the caller.
 */
export function overlayChains(
  cues: TextCue[],
  shot: Shot,
  input: string,
  output: string,
): string[] {
  const chains: string[] = []
  let source = input
  cues.forEach((cue, index) => {
    const envelope = envelopeOf(cue, shot)
    const scrim = `scrim${index}`
    const washed = `washed${index}`
    const drawn = index === cues.length - 1 ? output : `drawn${index}`
    chains.push(scrimChain(envelope, scrim))
    chains.push(`[${source}][${scrim}]overlay=x=0:y=0:shortest=1[${washed}]`)
    chains.push(textChain(cue, envelope, washed, drawn))
    source = drawn
  })
  return chains
}
