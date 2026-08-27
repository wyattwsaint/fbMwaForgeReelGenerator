/**
 * ffmpeg plumbing — how a value reaches a filtergraph.
 *
 * Split from `house.ts` (#36): the house style is what a reel looks like and this is
 * how any of it is spelled to ffmpeg — a colour, a stream name, a line of type, a
 * zoom. A restyle touches the table and never this file; a change of encoder touches
 * this file and never the table.
 *
 * Nothing here reads the table, which is why `drawText` takes a face and a size rather
 * than a role: this file knows how a `drawtext` is spelled and has no opinion about
 * what is in one. It is also why the two drawers can share it — `overlay.ts` draws
 * over site pixels and `card.ts` draws over house ground (`CONTEXT.md`), and neither
 * is the other's place to keep the spelling.
 */

/** `#rrggbb` as the three channel values an ffmpeg expression can be handed. */
export function channels(hex: string): { r: number; g: number; b: number } {
  const at = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16)
  return { r: at(1), g: at(3), b: at(5) }
}

/** `#rrggbb` as ffmpeg's own colour literal. */
export function ffmpegColor(hex: string): string {
  return `0x${hex.slice(1)}`
}

declare const streamLabel: unique symbol

/**
 * Every pad name the pipeline has. Closed on purpose: a name is either on this list
 * or it does not compile, so `stream('washd', 0)` is a type error at the call site
 * rather than an ffmpeg error about an unconnected pad on a render that has already
 * spent a minute capturing. The list is also the only place to read what a graph in
 * this repo is wired out of.
 *
 * `0:v` and `1:v` are ffmpeg's own input pads rather than ours; the rest are named
 * where they are made.
 */
export type StreamName =
  | '0:v'
  | '1:v'
  /** `compose`: the master after its move, and the shot after its overlay. */
  | 'moved'
  | 'overlaid'
  /** `overlay`: the wash, the shot under it, and the shot with its text on. */
  | 'scrim'
  | 'washed'
  | 'drawn'
  /** `card`: the mark looped, the ground with it on, and the finished card. */
  | 'mark'
  | 'marked'
  | 'card'
  /** Named by a caller that is wiring a graph of its own — the tests, today. */
  | 'ground'
  | 'in'
  | 'out'

/**
 * The name of one stream inside a filtergraph.
 *
 * Branded, so a label can only come from `stream()` and never from a string that
 * happened to be lying around — and `stream()` only takes a name off `StreamName`, so
 * the typo the brand cannot catch is caught by the list.
 */
export type StreamLabel = string & { readonly [streamLabel]: true }

/**
 * A stream label, optionally numbered — `stream('scrim', 0)` is `scrim0`.
 *
 * Numbered because a shot can carry more than one cue, and each cue's chain needs
 * pads of its own.
 */
export function stream(name: StreamName, index?: number): StreamLabel {
  return `${name}${index ?? ''}` as StreamLabel
}

/** A label as it is written in a graph: `[washed0]`. */
export function pad(label: StreamLabel): string {
  return `[${label}]`
}

/**
 * A ramp, as much of one as spelling it needs: where the count starts and how far it
 * runs. Structural rather than `camera.ts`'s `Ramp`, and declared here for the same
 * reason `zoomStage` takes numbers — this file knows how a ramp is *written* and has
 * no opinion about which sub-frame an output frame sits on.
 */
type Ramp = { offset: number; span: number }

/**
 * A ramp as an expression: 0 on the move's first output frame and 1 on its last,
 * counted in whatever frame variable the filter it lands in offers.
 */
export function rampFraction(ramp: Ramp, variable: string): string {
  const from = ramp.offset === 0 ? variable : `(${variable}-${ramp.offset})`
  return `${from}/${ramp.span}`
}

/**
 * `zoompan`, ramping 1.00 → `zoom` across `ramp` and held on centre.
 *
 * Plain numbers rather than a `Camera`, because both callers reach it with numbers of
 * their own: a shot's zoom is counted in sub-frames at `samples` times the frame rate,
 * and the card's is counted at frame size times the precision it is drawn at. `on`, so
 * the ramp is counted in the frames this filter emits — which the ramp then maps back
 * onto the output frames a viewer sees.
 */
export function zoomStage(
  zoom: number,
  ramp: Ramp,
  size: { width: number; height: number },
  fps: number,
): string {
  // Trimmed rather than padded: `toFixed` alone spells a 3% ramp `0.030000`.
  const depth = Number((zoom - 1).toFixed(6))
  return (
    `zoompan=z='1+${depth}*${rampFraction(ramp, 'on')}':x='iw/2-(iw/zoom/2)':` +
    `y='ih/2-(ih/zoom/2)':d=1:s=${size.width}x${size.height}:fps=${fps}`
  )
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
 * One line of house type, as a `drawtext` filter.
 *
 * Every line drawn anywhere in a reel comes through here — the hook and its labels
 * over site pixels, and the card's own headline and credit over house ground — so the
 * escaping and the refusal to treat copy as a format string are settled once rather
 * than once per drawer. What differs between them is what they pass: `alpha`, because
 * only a line that fades has an envelope, and `x`, because overlay type is
 * left-aligned in its slot while the card's is centred on the card's own axis.
 */
export function drawText(draw: {
  content: string
  /** The face, as a path ffmpeg can open. */
  fontFile: string
  size: number
  /** An ffmpeg colour literal, with an `@alpha` on it when the line is set muted. */
  colour: string
  /** Written as ffmpeg reads it — a number, or an expression like `(w-text_w)/2`. */
  x: string
  y: number
  /** An alpha expression per frame. Absent on a line lit for the whole of its shot. */
  alpha?: string
}): string {
  return [
    'drawtext',
    `=fontfile=${escapeValue(draw.fontFile)}`,
    `:text=${escapeValue(draw.content)}`,
    // Copy is a human's, not a format string: `%{...}` and backslashes are letters.
    ':expansion=none',
    `:fontcolor=${draw.colour}`,
    `:fontsize=${draw.size}`,
    ...(draw.alpha === undefined ? [] : [`:alpha=${escapeValue(draw.alpha)}`]),
    `:x=${draw.x}`,
    `:y=${draw.y}`,
  ].join('')
}
