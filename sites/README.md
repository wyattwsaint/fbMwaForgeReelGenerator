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
    { selector: '#services', punchFactor: 1.8 },
    { selector: '#about', punchFactor: 2.3 },
    { selector: '#reviews', punchFactor: 2.1 },
  ],
  cta: { credit: 'brobstcleaning.com' },
})
```

That is `brobst.ts`, whole — no `music`, because `music` is one of those overrides.
Leave it out and the reel gets the signature track, which is the point of a signature
track. Write it out, as `pharos.ts` does, and you get the same file — configs live in
this repo, so `audio/…` resolves to the same place — which is how you hang an `offset`
off the default bed, since the schema wants a `file` whenever you write a `music` block
at all. `offset` is seconds into the track, sliding the bed against the hook. Every
path here is resolved from the directory you run `reel` in.

The annotated examples in `7-site-config.md` are illustrative: their selectors were
written from a reading of the sites, not measured against them, and none of them
resolve today. The two configs beside this file were measured — `brobst.ts` is the
minimum above and `pharos.ts` reaches for most of the hatches, each one commented with
the page behaviour that forced it. Write a config, run `check`, fix what it names.
