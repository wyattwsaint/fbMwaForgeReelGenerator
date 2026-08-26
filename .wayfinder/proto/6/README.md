# Prototype — #6 capture on the real client sites (THROWAWAY)

Answers "does a static master survive a real client site?" Needs `playwright`
(proto11 has an install) and `f.ttf` copied in alongside these scripts.

- `probe6.mjs <pharos|brobst>` — what threatens a static master: live animations,
  un-revealed content, unloaded lazy images, video state. Snapshots at load, at
  the bottom of the page, and back at the top.
- `sections6.mjs <site>` — sections (selector, y, height) and where the empty
  `<img>`s are.
- `cap6.mjs <site> <v1|v2|v3|v4>` — the same sections under four settling
  routines. **v1** is #12's, **v4** is the accepted one. v2/v3 scroll the page to
  each section and are kept only to show why that's wrong (sticky chrome).
- `cap6b.mjs` — brobstcleaning.com reel masters, punched in per beat.
- `capvar.mjs` — one wide master with headroom on both axes, for pan directions.
- `hero6.mjs <t0|t2|poster>` — the three frame-0 candidates for the Pharos hero.
- `brand.mjs` / `brand2.mjs` — custom properties vs. colours actually used.
- `reelH.sh` → `brobst-v4.mp4` — the plain site cut as a real n=3 reel, 15.7s.
- `reelI.sh` → `pan-directions.mp4` — vertical / lateral / diagonal /
  lateral-reversed, equal path length and equal blur.

Generated media is not committed. Verdict is in the #6 resolution comment.
