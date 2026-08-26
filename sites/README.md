# `sites/`

One TS module per site, `sites/<slug>.ts`, default-exporting `defineSite({...})`
(ADR-0001, [`7-site-config.md`](../.wayfinder/spec/7-site-config.md)). Checked into
*this* repo, never into the client's. `reel check <slug>` reads the file of that name.

The minimum is a URL, hook text, 3–5 beat selectors and a credit line; everything
else is an override that exists because a real site broke a default.

```ts
import { defineSite } from 'reel'

export default defineSite({
  url: 'https://brobstcleaning.com',
  hook: { text: 'Spotless, every time.' },
  beats: [
    { selector: '#services', punchFactor: 1.6 },
    { selector: '#about' },
    { selector: '#contact' },
  ],
  cta: { credit: 'brobstcleaning.com' },
  music: { file: 'audio/mwaforge-signature.mp3', offset: 0.42 },
})
```

The annotated examples in `7-site-config.md` are illustrative: their selectors were
written from a reading of the sites, not measured against them, and `reel check`
reports several as drifted today. Write a config, run `check`, fix what it names.
