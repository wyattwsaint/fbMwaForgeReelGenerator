/**
 * ffmpeg plumbing — how a colour and a stream name reach a filtergraph.
 *
 * Split from `house.ts` (#36): the house style is what a reel looks like and this is
 * how any of it is spelled to ffmpeg. A restyle touches the table and never this
 * file; a change of encoder touches this file and never the table.
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
