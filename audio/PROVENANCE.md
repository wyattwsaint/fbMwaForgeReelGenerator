# audio/ provenance

## mwaforge-signature.mp3

The default bed. A site that names no `music` gets this one (#8), which is what
makes it the signature track rather than the only track.

- **Title on Suno**: Crafted Interface
- **Source**: Suno (<https://suno.com>)
- **Suno song URL**: <https://suno.com/song/b7cd94f9-4b50-4f3e-9352-e65583f1e844>
- **Suno account**: `wmsaint17`
- **Model version**: v4.5
- **Generated**: 2026-08-26 (17:14:09 UTC, per the file's own `comment` tag)
- **Downloaded**: 2026-08-26
- **Suno tier at generation**: Free
- **Suno tier at download**: Free
- **ToS in force at generation**: <https://suno.com/terms-of-service> (eff. 2026-03-26)
- **Visibility**: unpublished
- **File**: MP3, 48 kHz stereo, ~184 kbps, 5:24.8 (324.77 s), 7.47 MB, with an
  embedded 360×360 cover image. Longest reel is 22.7 s (#12), so the bed is
  trimmed and faded to length at render (#8).
- **Prompt** (recorded for the record only — a Suno generation is *not*
  reproducible from its prompt, #8):

  > Create a ~60-second instrumental music bed for a premium web design and
  > development brand. Modern, polished, confident, and understated with an
  > organic tradesman feel. Blend warm acoustic textures, subtle low percussion,
  > restrained bass, light ambient guitar, and tasteful cinematic atmosphere.
  > Think rugged craftsmanship meeting refined Apple-style product presentation,
  > with a hint of Yellowstone-inspired warmth.
  >
  > Keep the tempo steady and confident, not overly upbeat. The music should sit
  > quietly beneath website scrolling, coding, branding, finished projects, and
  > before/after visuals without competing for attention.
  >
  > Add subtle personality through small rhythmic details and warm instrumental
  > flourishes, but avoid anything quirky or comedic. No vocals, no lyrics, no
  > obvious “forge” sound effects, no hammering or metallic industrial
  > clichés.
  >
  > Structure: understated opening, smooth confident groove by 10 seconds, gentle
  > lift around 35–45 seconds, then a clean satisfying finish around 60 seconds.
  >
  > Overall feeling: skilled craftsmen building seriously good modern websites —
  > custom, thoughtful, premium, capable, and quietly cool.

  The prompt asked for ~60 s; Suno returned 5:24. The requested arc (groove by
  0:10, lift at 0:35–0:45, finish at 1:00) therefore does not describe the
  delivered file. Immaterial here — a reel uses at most the first 22.7 s and the
  bed is trimmed and faded to length (#8) — but it is why the opening is the only
  part of this track the pipeline ever hears.

### Rights position — read this before reusing the track

This track was generated on Suno's **free tier**, whose terms restrict output to
"lawful, internal, personal and non-commercial purposes". Suno assigns ownership
of Output only to **Pro and Premier** subscribers. **No commercial grant attached
to this file.**

MWA Forge uses it in its own marketing reels, which are commercial and are
planned to be boosted as paid media. This is a **known and accepted exposure**,
decided in #8 and re-affirmed in #17 with the full findings of #15 in hand. It is
not an oversight and should not be "discovered" and quietly patched — if the
position changes, change it deliberately.

There is also **no exclusivity on any tier** ("granting commercial use rights
does not guarantee copyright protection") and **no indemnity**, unlike Meta Sound
Collection. UMG and Sony are still litigating; Warner settled Nov 2025.

**The exit is cheap and stays open.** One month of Suno Pro (~$8) regenerates a
cleared bed with perpetual assigned rights surviving cancellation (#15 §4).
Nothing downstream depends on *which* track this is — config references the file,
never a prompt or URL (#8) — so swapping it is a one-line config change and a
re-render.

Full findings: [`.wayfinder/research/004-suno-licence.md`](../.wayfinder/research/004-suno-licence.md)

## mwaforge-quiet-confidence.mp3

MWA Forge's own bed, named by `sites/mwaforge.ts` (#67). The first track a config
names for the sound of it rather than to hang an `offset` off the default — which
is what the resolution rule was always for.

- **Title on Suno**: Quiet Confidence
- **Source**: Suno (<https://suno.com>)
- **Suno song id**: `be289bdc-3395-4baf-82b2-1aaaf87ac931`
- **Suno account**: `wmsaint17`
- **Generated**: 2026-08-26 (17:13:01 UTC, per the file's own `comment` tag) — one
  minute before the signature track, in the same session on the same account
- **Downloaded**: 2026-08-26
- **Suno tier at generation**: Free
- **Suno tier at download**: Free
- **ToS in force at generation**: <https://suno.com/terms-of-service> (eff. 2026-03-26)
- **Visibility**: unpublished
- **File**: MP3, 48 kHz stereo, ~175 kbps, 59.97 s, 1.25 MB, with an embedded
  360×360 cover image and a `[Instrumental]` lyrics tag. Longest reel is 22.7 s
  (#12), so the bed is trimmed and faded to length at render (#8) exactly as the
  signature track is — a second track buys a different sound, not a second
  timing rule, and nothing in this reel is locked to it.
- **Prompt**: not recorded. The generation is not reproducible from its prompt
  (#8), and unlike the signature track's there is no gap between what was asked
  for and what came back that a later reader would need explaining: this file is
  59.97 s and a reel uses at most the first 22.7 s of it.

### Rights position — the signature track's, unchanged

Same account, same day, same free tier, one minute apart. So the rights position,
the accepted exposure and the exit are the signature track's above, and are not
restated here: **no commercial grant, no exclusivity, no indemnity**, a use in
MWA Forge's own boosted marketing that is a known exposure decided in #8 and
re-affirmed in #17, and a cheap exit through one month of Suno Pro (#15 §4).

Two consequences of there now being two of them:

- The exit costs no more. #15 §4's grant attaches to whatever is generated **and
  downloaded** during a paid term, and does not flow backwards — so the exit was
  always "regenerate the bed on Pro", never "buy a licence for this file". Two
  beds regenerate inside the same one month (~$8) as one did.
- It is the same exposure, not a second one. Anything that changes the position
  changes it for `audio/` as a whole — which is why this entry cross-references
  rather than copies.

Full findings: [`.wayfinder/research/004-suno-licence.md`](../.wayfinder/research/004-suno-licence.md)
