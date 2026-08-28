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
Leave it out and the reel falls back to the signature track, which is the point of a
signature track. Write it out and you name a file: `pharos.ts` names the same one it
would have got — configs live in this repo, so `audio/…` resolves to the same place —
which is how you hang an `offset` off the default bed, since the schema wants a `file`
whenever you write a `music` block at all. `mwaforge.ts` names the other checked-in
track, `audio/quiet-confidence.mp3`. `offset` is seconds into the track, sliding the
bed against the hook, and how far you can slide it is the track's own length: the
signature track runs 5:24 and Quiet Confidence one minute flat. Every path here is
resolved from the directory you run `reel` in.

`hook.motion` is the one override that changes how a shot's pixels are *got* rather
than what is done with them (ADR-0006). Leave it out — or write `still` — and the hook
is synthesised from one frozen screenshot, which is how the two client reels are cut.
Write `ambient` and the hero is recorded while it runs, for exactly the hook's 3.0s:
reach for it when the hero's whole point is motion a screenshot kills — a video
background, a carousel, a parallax idle. Write `scroll`, as `mwaforge.ts` does, and the
same recording is made while the page is walked from the top down through the hero at
the house pace, so the effects keyed to the viewport *moving* fire on camera too; where
a page's reveals cannot re-fire, `check` says so and the shot is an `ambient` one. The
cost either way is that no two renders of it are alike, so a live hook is judged by eye
off the review stills rather than by re-running it. Beats are always still; there is no
`motion` on a beat.

`fit: true` is the other end of `punchFactor` — the punch crops *in*, and `fit` pulls
*out* by widening the capture viewport until the whole section lands in one frame. Name
one or the other, never both. It only helps a section already taller than a frame, and
only up to the legibility cap; past that the beat is fit to width and panned instead,
and `check` says so as a note. You do not have to give a fit beat a move: a fit section
is exactly one frame, so there is nothing for a pan to travel and the plan drifts it.
Name `move: 'pan'` anyway and you get one, and `check` says what it left it to travel
with.

## The loop

```
reel sections <url>     # what is on the page: selectors, heights, the punch each needs
                        # paste the sections you want, in the order you want them
reel check <slug>       # what is wrong with the file you just wrote
                        # fix what it names, and run it again
```

`sections` is the half that reports the page and `check` is the half that argues with
your config; neither replaces the other. `sections` takes the **URL**, because it is
what you run before the config beside this file exists — every other command takes a slug,
since a site *is* its config file.

Paste from it, do not transcribe it. The report prints every candidate section, and a
reel is 3–5 of them in an order you chose; it marks the hero `hook`, which is the one
row that must **not** become a beat, since a reel that opens on the hero twice opens
twice. The punch factors it prints are generous on purpose — they are what a section
that height needs whatever move the beat draws — so `check` will accept them, and a
smaller one is yours to try.

The annotated examples in `7-site-config.md` are illustrative: their selectors were
written from a reading of the sites, not measured against them, and none of them
resolve today. The three configs beside this file were measured — `brobst.ts` is the
minimum above, `pharos.ts` reaches for most of the hatches, and `mwaforge.ts` is the
house's own reel and the one that names a live hook, a fit beat and the second track.
Each override in all three is commented with the page behaviour that forced it. Write a
config, run `check`, fix what it names.
