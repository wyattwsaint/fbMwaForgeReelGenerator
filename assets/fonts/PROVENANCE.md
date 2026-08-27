# assets/fonts/ provenance

## SpaceGrotesk-Bold.ttf

- **Family**: Space Grotesk — #9's house display face, frozen as a repo constant in
  `src/house.ts`. Every overlay and card on every reel is set in it.
- **Designer**: Florian Karsten
- **Upstream**: <https://github.com/floriankarsten/space-grotesk>, release `2.0.0`
  (`SpaceGrotesk-2.0.0.zip`, `ttf/static/SpaceGrotesk-Bold.ttf`)
- **Downloaded**: 2026-08-26
- **Licence**: SIL Open Font License 1.1 — `OFL.txt`, verbatim from the same release.
  Bundling and embedding in rendered video are permitted; the font is not sold on its
  own and is not renamed.

Checked in rather than fetched, for the same reason the signature track is
(ADR-0002): a render that reaches the network to learn what MWA Forge looks like is a
failure mode with no upside, and a reel that renders in a different face because a
machine has a different font installed is a reel Wyatt cannot reproduce.

Only the Bold static is carried. The variable font would leave the weight up to
whatever default instance freetype picks, and the other statics have no role: #9's
layout is one display face at two sizes.
