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

import { channels, drawText, escapeValue, ffmpegColor, pad, stream } from './filtergraph.ts'
import type { StreamLabel } from './filtergraph.ts'
import { FONT_FILE, GROUND, INK, SCRIM, TEXT_SLOT, TYPE } from './house.ts'
import { FPS, envelopeFrames, envelopeOf } from './plan.ts'
import type { Envelope, Shot, TextCue } from './plan.ts'

/** The roles drawn over site pixels. The card's own text belongs to the card (#9 §5). */
const OVERLAY_ROLES = new Set(['hook', 'label'])

/**
 * The ones drawn over site pixels, from cues already narrowed to a shot. The card's
 * cue survives being handed around and is drawn by `card.ts` instead — a shot carries
 * all of its own text, and each drawer takes the roles that are its own.
 */
export function drawnOverlays(cues: TextCue[]): TextCue[] {
  return cues.filter((cue) => OVERLAY_ROLES.has(cue.role) && cue.content !== '')
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
  const { start, lit, held, dark } = envelopeFrames(envelope)

  let expr = dark > held ? `if(lt(n,${dark}),(${dark}-n)/${dark - held},0)` : '0'
  expr = `if(lt(n,${held}),1,${expr})`
  if (lit > start) expr = `if(lt(n,${lit}),(n-${start})/${lit - start},${expr})`
  if (start > 0) expr = `if(lt(n,${start}),0,${expr})`
  return expr
}

/**
 * The scrim: a wash of house ground, densest at the foot of the frame and gone one
 * release above the text band's head, sharing its text's envelope exactly.
 *
 * Generated once and looped rather than evaluated per frame — the gradient is
 * constant, never sampled from the page, so there is nothing about it that could
 * change between frames. The envelope is `fade` on the alpha channel, whose ramp is
 * the same `(n - start) / length` the text's expression uses.
 */
function scrimChain(envelope: Envelope, label: StreamLabel): string {
  const { r, g, b } = channels(GROUND)
  // Y is measured from the wash's own head, so both ramps are written against their own
  // stretch rather than against `H`: `release` above the copy and `fall` below it, with
  // the band between them at peak. The two are the same cube mirrored, multiplied
  // together — each is 1 outside its own stretch, so neither touches the other's end.
  const rise = `(1-pow(clip((${SCRIM.release}-Y)/${SCRIM.release},0,1),${SCRIM.falloff}))`
  const fall = `(1-pow(clip((Y-${SCRIM.fallTop})/${SCRIM.fall},0,1),${SCRIM.falloff}))`
  const alpha = `255*${SCRIM.peak}*${rise}*${fall}`
  const { start, lit, held, dark } = envelopeFrames(envelope)

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
  if (lit > start || start > 0) {
    stages.push(`fade=t=in:alpha=1:start_frame=${start}:nb_frames=${Math.max(1, lit - start)}`)
  }
  if (dark > held) {
    stages.push(`fade=t=out:alpha=1:start_frame=${held}:nb_frames=${dark - held}`)
  }
  return `${stages.join(',')}${pad(label)}`
}

/**
 * The text: one `drawtext` a line, top-down from the slot.
 *
 * A line each rather than one multi-line draw, so the leading is this repo's number
 * and not freetype's, and so a config's newline never has to survive two levels of
 * filtergraph escaping on the way to the frame.
 */
function textChain(
  cue: TextCue,
  envelope: Envelope,
  input: StreamLabel,
  output: StreamLabel,
): string {
  const type = cue.role === 'hook' ? TYPE.hook : TYPE.label
  const alpha = alphaExpr(envelope)
  const draws = cue.content.split('\n').map((line, index) =>
    drawText({
      content: line,
      fontFile: FONT_FILE,
      size: type.size,
      colour: ffmpegColor(INK),
      x: String(TEXT_SLOT.x),
      y: TEXT_SLOT.top + index * type.lineHeight,
      alpha,
    }),
  )
  return `${pad(input)}${draws.join(',')}${pad(output)}`
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
  input: StreamLabel,
  output: StreamLabel,
): string[] {
  const chains: string[] = []
  let source = input
  cues.forEach((cue, index) => {
    const envelope = envelopeOf(cue, shot)
    const scrim = stream('scrim', index)
    const washed = stream('washed', index)
    const drawn = index === cues.length - 1 ? output : stream('drawn', index)
    chains.push(scrimChain(envelope, scrim))
    chains.push(`${pad(source)}${pad(scrim)}overlay=x=0:y=${SCRIM.top}:shortest=1${pad(washed)}`)
    chains.push(textChain(cue, envelope, washed, drawn))
    source = drawn
  })
  return chains
}
