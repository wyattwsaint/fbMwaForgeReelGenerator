# ADR-0005: A pan travels a whole master pixel a frame, rather than every pan being oversampled

## Status

Accepted (2026-08-27, resolves #51).

## Context

#51 reported a punched pan reading as micro-jerky rather than as one continuous move,
and named two mechanisms in the move path that compound:

1. **A pan can only sit on whole master pixels.** The move is a `crop`, and ffmpeg
   rounds `crop`'s `x`/`y` to an integer. A non-diagonal pan is captured at
   `oversampleOf` 1, so its window is exactly frame-sized and the `scale` after it is
   an identity — nothing resamples, and nothing softens the rounding. A diagonal
   escapes it: `DIAGONAL_OVERSAMPLE` halves the quantum and the lanczos downscale
   spreads what is left.
2. **The sub-frame ramp did not land on the output grid.** The ramp ran across
   `frames * samples - 1` sub-frames while the output frames span
   `(frames - 1) * samples` of them, so the shot stopped short of the camera it was
   given and its output frames were not evenly spaced along the way.

Both bite hardest where a punch is tight, which is where `defaultLateralPunchFactor`
puts a lateral or diagonal pan by construction.

Mechanism 2 is arithmetic and free to correct. Mechanism 1 is not: #51 framed the
choice as whether to give every pan the oversample only diagonals get today, which
doubles the captured pixels of every panning beat — a cost `CONTEXT.md` already names
as the reason a diagonal is expensive.

## Decision

**The ramp is written over the output grid.** `moveRamp` gives the sub-frame a move's
first and last *output* frames sit on, and every ramp in the pipeline — a pan's crop, a
shot drift's `zoompan`, the card's — is written across it. A move now starts on `from`
and lands on `to`.

**A pan's travel is rounded down to a whole master pixel per output frame,** and every
pan keeps the oversample it has today. Rounding makes consecutive output frames an
equal integer distance apart, which removes the staircase exactly rather than blurring
it: a diagonal is not smoother than a lateral, both are uniform. A move also keeps one
step of its room in hand, because the blur is averaged from sub-frames half a frame
past each end of the move and ffmpeg would otherwise clamp those onto the edge.

**Every pan is not oversampled.** With the rounding in place the oversample no longer
buys smoothness, so it would be bought for travel alone — and the travel it saves is
under a master pixel a frame.

## Consequences

- The smoothness claim is arithmetic, not a viewing: `test/camera.test.ts` evaluates
  the crop offsets straight out of the filtergraph and asserts consecutive output
  frames are an equal distance apart. #51's discriminator render — the same beat as
  `vertical` and as `diagonal` — was never run, so nothing here rests on one.
- **A clamped pan travels slightly less far than its room allows.** At #12's pace the
  rounding costs nothing, because the pace is already a whole number of pixels. Clamped,
  it costs whatever fraction the room left, up to a pixel a frame. A pan at `check`'s
  own floor keeps `MIN_PAN_PX_PER_FRAME` — `check` counts the travel a pan needs over
  its frames and a pan spends it over the gaps between them, which is a pixel a frame
  more than the rounding can take — and there is a test that says so.
- **Direction now bears on speed, in the small.** A diagonal's master is oversampled, so
  its rounding is to half an output pixel where a single-axis pan's is to a whole one,
  and a clamped diagonal therefore keeps more of the same room. `CONTEXT.md`'s
  **Direction** entry no longer says speed is unaffected by the choice.
- The oversample question is open rather than closed: if a pan still reads as jerky
  with the travel uniform, what is left is resolution, and this is the ADR to reverse.
