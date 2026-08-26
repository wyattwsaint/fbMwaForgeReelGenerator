# Prototype — #12 pacing ladder (THROWAWAY)

Answers "how fast should the moves actually be?" Reuses #11's masters
(`master2.png`, `hero135.png`, `f.ttf`) — copy them in alongside these scripts,
then `bash reelA.sh` (~2 min) and `bash reelB.sh` (~1 min).

- `reelA.sh` → `pacing-moves.mp4` — same push at 0.6/1.0/1.5/2.0s, same whip at
  0.5/0.8/1.2s. Sample counts per #11's `ceil(17.28/T)`, capped 32.
- `reelB.sh` → `pacing-beats.mp4` — one beat at 3 / 2 / 1 shots per 3.5s, plus
  2 shots per 4.5s. Content constant, only cut rate varies.

Generated media is not committed. Verdict is in the #12 resolution comment.

- `reelC.sh` → `revised-deck-n3.mp4` — the revised deck cut as a real n=3 reel.
- `sections.mjs` — enumerates the target site's sections (selector, y, height).
- `capsections.mjs` — captures one master per beat, framed on its own section.
- `reelD.sh` → `revised-deck-sections.mp4` — one section per beat, drift/reveal/hold.
- `reelE.sh` → `pan-variants.mp4` — lateral vs vertical, continuous vs settling.
- `reelG.sh` → `continuous-deck.mp4` — **the accepted cut**: pan/drift, no holds.

Needs `playwright` on the path for the capture scripts (proto11 has an install).
