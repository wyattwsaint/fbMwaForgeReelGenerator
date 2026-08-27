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

`music` is one of those overrides. Leave it out and the reel gets the signature track,
which is the point of a signature track. Write it out, as above, and you get the same
file — configs live in this repo, so `audio/…` resolves to the same place — which is
how you hang an `offset` off the default bed, since the schema wants a `file` whenever
you write a `music` block at all. `offset` is seconds into the track, sliding the bed
against the hook. Every path here is resolved from the directory you run `reel` in.

The annotated examples in `7-site-config.md` are illustrative: their selectors were
written from a reading of the sites, not measured against them, and `reel check`
reports several as drifted today. Write a config, run `check`, fix what it names.
