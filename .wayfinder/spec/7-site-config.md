# Site config — schema and annotated examples (resolves #7)

The config is the human's entire steering wheel. Everything else in the pipeline is
deterministic given a site config plus the client's live page.

## Shape

One TS module per site, `sites/<slug>.ts`, default-exporting `defineSite({...})`.
Checked into *this* repo, never into the client's Astro repo. TS buys autocomplete,
inline comments, and a type error instead of a runtime surprise; N is small and the
files sit beside the code that reads them, so there is **no schema version field**.

```ts
type SiteConfig = {
  url: string                    // required — the site
  hook: {
    selector?: string            // default: the hero, first section of <main>
    text: string                 // required — drawn fully on frame 0, never animates in
    videoTime?: number           // default 2.0 — seek time for a <video> hero
  }
  beats: Beat[]                  // required — length is n, validated 3..5
  cta: {
    domain: string               // required — large type on the card
    logo: { src: string; raster?: boolean }   // raster: true ⇒ never scale up
  }
  music?: { file: string; offset?: number }   // offset slides the track so its first
                                              // downbeat lands on the hook's cut
  brand?: { bg?: string; fg?: string; accent?: string }  // role overrides only
  font?: string                  // override when the woff2 scrape picks the wrong face
}

type Beat = {
  selector: string               // required — resolved on the settled page
  y?: number; height?: number    // escape hatch when no element wraps the subject
  punchFactor?: number           // default 1.0 — "how far into this section"; the
                                 // renderer doubles the pixel cost for a diagonal pan
  move?: 'drift' | 'pan'         // override; otherwise alternates from the hook
  direction?: Direction          // override; otherwise the deterministic rotation
  label?: string                 // optional on-screen line (#9 owns styling)
  url?: string                   // override — a beat that lives on another route
}
```

## Rules

- **Required is `url` + `hook.text` + 3–5 `beats[].selector` + `cta`.** Everything else
  is an override that exists because a real site broke a default.
- **A missing selector fails loudly** — non-zero exit naming the beat and the selector.
  Silent skip changes `n`, changes duration, and ships an unapproved reel. Catching
  client drift is the reason this file exists.
- **No duration knobs.** 3.5s per beat is #12's finding, not a preference. A per-beat
  override turns every reel into a hand-timed edit.
- **No settle knobs beyond `hook.videoTime`.** #6's hardened settle needed zero
  site-specific tuning on both real sites; a hatch would get used instead of a fix.
- **Rotation seeds on beat index alone.** Hook drifts → beat 1 pans → alternate; each pan
  takes the next of `vertical → lateral → diagonal → lateral-reversed`. A site-derived
  seed gives two clients different reels for no explicable reason.
- **Brand colours are derived at render** (`brand2.mjs` samples from usage), never frozen
  into config — frozen hex goes stale the moment the client restyles. Config assigns
  *roles*, not values.
- **Output is convention**, `out/<slug>-<n>beat.mp4`. Nothing about the site changes it.

## `check <site>`

Same code path as render, stopping after settle: loads the page, resolves every
selector, and reports missing selectors, sections shorter than the frame, and any
`punchFactor` that leaves a pan no room to travel. Seconds instead of a full capture pass.

## Example — `sites/brobst.ts` (the minimum)

The plain site. No video, PNG-only mark, three sections that need nothing but punch.

```ts
export default defineSite({
  url: 'https://brobstcleaning.com',
  hook: { text: 'Spotless, every time.' },
  beats: [
    { selector: '#services', punchFactor: 1.6 },   // 980px tall — a pan needs headroom
    { selector: '#about',    punchFactor: 1.4 },
    { selector: '#contact',  punchFactor: 1.6 },
  ],
  cta: {
    domain: 'brobstcleaning.com',
    logo: { src: 'assets/brobst-mark.png', raster: true },  // PNG only — never scale up
  },
  music: { file: 'audio/meta/steady-hands.mp3', offset: 0.42 },
})
```

Renders 15.7s (`5.5 + 3.5·3 − 0.3`). Brand resolves to #253856 on #F6F0E3, sampled.

## Example — `sites/pharos.ts` (every override earning its place)

The busy site: `<video>` hero, lazy images, a ~20-card gallery, an SVG mark.

```ts
export default defineSite({
  url: 'https://pharosacademy.net',
  hook: {
    text: 'Where curiosity is the curriculum.',
    videoTime: 2.0,        // t=0 catches the site's own fade-in; the poster is a
                           // blurred LQIP, so frame 0 — the FB thumbnail — must seek
  },
  beats: [
    { selector: 'section.programs', punchFactor: 1.5 },
    { selector: 'section.gallery',  punchFactor: 2.2, move: 'pan', direction: 'lateral' },
                           // 20 cards in a wide grid: lateral reads as browsing them,
                           // and the extra punch keeps the travel off the edges
    { selector: 'section.faculty',  punchFactor: 1.4 },
    { selector: 'section.admissions', punchFactor: 1.5,
      label: 'Enrolling for Fall' },
  ],
  cta: {
    domain: 'pharosacademy.net',
    logo: { src: 'https://pharosacademy.net/mark.svg' },   // scalable — no raster flag
  },
  music: { file: 'audio/meta/first-light.mp3', offset: 1.10 },
  brand: { accent: '#E4D9C4' },   // sampler ranks the cream as background; on the card
                                  // it works better as the accent behind the domain
})
```

Renders 19.2s (`5.5 + 3.5·4 − 0.3`).

The pair is the proof that the defaults are defaults: Brobst names nothing but sections,
punch and a logo; Pharos touches every hatch, and each touch traces to a finding in #6.
