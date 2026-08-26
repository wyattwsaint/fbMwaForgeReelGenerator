---
ticket: 004
title: What Suno's licence actually grants for MWA Forge's own boosted marketing
retrieved: 2026-08-26
status: complete
---

# 004 — Suno licence

Answers #15. All URLs retrieved **2026-08-26** unless a snapshot date is noted.

Tags, same convention as `002-audio-rights-and-reach.md`:

- **[LICENSE]** — binding licence/terms text from the vendor or Meta.
- **[FAQ]** — vendor's own help center / marketing copy. Not binding, but it is
  the vendor telling you how they read their own licence.
- **[3P]** — third-party summary, blog, or analysis.
- **[ANECDOTE]** — uncited community claim.

#2's Artlist/Epidemic/Musicbed tier comparison is **superseded** and is not
re-tread here.

## ⚠️ Two documents are in force, eight days apart

There are **two** binding Suno ToS in play, and #15 must be answered against
both:

| | URL | Effective |
|---|---|---|
| **Current** | <https://suno.com/terms-of-service> | **26 March 2026** |
| **Incoming** | <https://suno.com/terms-september-2026> | **3 September 2026** |

The September document is already published and dated. Anything this repo builds
lands after it takes effect, so **the September text governs the design.**

---

## 0. The finding that reframes the question

**On 3 September 2026 the free tier stops being a music source at all.**

> "Up to 7 (lifetime) trial downloads"
> — **[FAQ, Suno primary]** Suno, "An update to our downloads policy and Terms
> of Service", <https://suno.com/blog/suno-updates-tos>, posted **10 Aug 2026**

> "Up to 7 total (lifetime) trial downloads for **personal, non-commercial use
> only**"
> — **[FAQ, Suno primary]** Suno Knowledge Base, "Upcoming Changes FAQ:
> Downloads, Models, and Terms of Service",
> <https://help.suno.com/en/articles/13614785>

The pricing page states the same thing in its plan table:

> Free — "**No monthly song downloads (starting 9/3/26)**" · "**No commercial
> use**"
> Pro ($8/mo) — "20 song downloads per month (starting 9/3/26)" · "Commercial use
> rights for new songs made"
> Premier ($24/mo) — "60 song downloads per month (starting 9/3/26)" ·
> "Commercial use rights for new songs made"
> — **[FAQ, Suno primary]** <https://suno.com/pricing>

Confirmations that matter for a render pipeline:

- **Limits are retroactive.** "Download limits apply retroactively to songs
  created before September 3." **[FAQ]** <https://suno.com/blog/suno-updates-tos>
- **Trial downloads never reset.** "Trial downloads are one-time only and don't
  reset monthly." **[FAQ]** same URL.
- **Re-downloading the same song is free.** "Downloading the same song multiple
  times counts only once against your quota." **[FAQ]**
  <https://help.suno.com/en/articles/13614785>
- **Stems don't multiply the cost.** "All stems from a song are part of that
  song's single download." **[FAQ]** same URL.
- **No rollover.** "Unused monthly downloads do not carry over." **[FAQ]** same URL.
- **Extra downloads are purchasable.** **[FAQ]** same URL.
- **Streaming/sharing on Suno is unaffected.** "All songs remain playable and
  shareable on Suno regardless of plan, even after cancellation." **[FAQ]** same URL.
- **Suno Studio (Premier) is uncapped.** "Suno Studio will continue to be our
  most powerful creation tool and will remain untouched, **including unlimited
  download functionality**." **[FAQ]** Suno, "A new chapter in music creation",
  <https://suno.com/blog/wmg-partnership>, **25 Nov 2025**

**Why this reframes #15:** a signature bed for MWA Forge is a *one-file* problem,
not a throughput problem. Re-downloading the same track costs nothing against
quota. So even the cheapest paid tier is oversized for the actual need — but the
free tier is nonetheless disqualified twice over: no commercial rights, and
seven lifetime downloads that are explicitly personal-use.

---

## 1. Free-tier commercial-use rights, and who owns the output

**The historical position recorded in #8 is CONFIRMED, and it is binding licence
text, not folklore.**

Current ToS (eff. 26 Mar 2026):

> "If you are a user of the **free or Basic tier** of the Service then, you
> covenant and agree that you will only use Outputs generated from Submissions
> made by you through the Service solely for your lawful, **internal, personal
> and non-commercial purposes**, provided that you give **attribution credit to
> Suno** in each case."
> — **[LICENSE]** Suno Terms of Service, "Content",
> <https://suno.com/terms-of-service>

September ToS (eff. 3 Sep 2026) keeps the restriction and, notably, **drops the
attribution clause**:

> "you covenant and agree that you will only use such Outputs for your lawful,
> personal and non-commercial purposes."
> — **[LICENSE]** <https://suno.com/terms-september-2026>

Ownership is assigned **only to paid tiers**, and only for the subscription
period:

> "Subject to your compliance with these Terms of Service, if you are a user who
> has subscribed to the **Pro or Premier paid tier** of the Service, Suno hereby
> **assigns to you all of its right, title and interest in and to any Output
> owned by Suno** and generated from Submissions made by you through the Service
> **during the term of your paid-tier subscription**."
> — **[LICENSE]** <https://suno.com/terms-of-service> (materially identical in
> the September text at <https://suno.com/terms-september-2026>)

There is **no corresponding assignment sentence for the free tier**, and Suno
says so plainly in its own words:

> "Under the free version, **we retain ownership of the songs you generate**, but
> you are allowed to use those songs for non-commercial purposes, subject to your
> compliance with Suno's Terms of Service."
> — **[FAQ]** "Does Suno own the music I make?",
> <https://help.suno.com/en/articles/2416769>

> "Songs made on the free plan are only intended for **personal, non-commercial
> use**."
> — **[FAQ]** "What rights do I have with the free plan?",
> <https://help.suno.com/en/articles/9601601>

Suno's definition of what "non-commercial" forecloses:

> non-commercial use means "songs that you are **not allowed to monetize**" —
> you cannot sell the material, distribute to earning platforms like Spotify, or
> upload to monetizing YouTube channels. It is a "personal use experience."
> — **[FAQ]** "What is non-commercial use?",
> <https://help.suno.com/en/articles/9602241>

Note that the general prohibition in the ToS is broad and is only relaxed by the
Content section:

> "Subject to the Content Section below, unless otherwise expressly authorized
> herein or in the Service, you agree not to **display, distribute, license,
> perform, publish**, reproduce, duplicate, copy, create derivative works from,
> modify, sell, resell, grant access to, transfer, or otherwise use or exploit
> any portion of the Service, and **any Output** or Voice Model, **for any
> commercial purposes**."
> — **[LICENSE]** "Commercial Use", <https://suno.com/terms-of-service>

**Verdict:** free-tier output is Suno's property, licensed to the user for
personal non-commercial use only. Using it as the bed under a reel that markets
MWA Forge is a commercial purpose on its face — it is *the marketing of a
business* — and is outside the grant, boosted or not.

**One important caveat on the paid side.** The assignment transfers only what
Suno itself owns. Suno is explicit that this is not a copyright warranty:

> "granting commercial use rights **does not guarantee copyright protection!**"
> — **[FAQ]** "What rights do I have with a paid subscription?",
> <https://help.suno.com/en/articles/9601665>

So a paid Suno bed is *cleared to use*, not *protected against copying*. For a
signature bed intended to be recognisably MWA Forge's, that is a real gap —
nothing stops a competitor generating a near-identical track, and there is no
registrable exclusivity to lean on. This is the opposite trade from a
subscription library, which gives you a licence but never exclusivity either.

---

## 2. Is paid media / boosting covered?

**Free tier: no. Paid tiers: yes — and by assignment, which is stronger than a
licence.**

Suno's licence contains **no advertising or paid-media carve-out on either
side**. This is the material difference from #2's subscription libraries, which
all fence paid media off into a higher tier (Artlist: "you can't publish your
Projects in paid media" on Social; Epidemic Creator: "**No paid media ads** or
third party exploitation"; Musicbed: "**Paid media rights are not granted in
perpetuity** unless explicitly stated"). Searched the full ToS text at both URLs
for advertising/paid-media restrictions: **there are none.** **[LICENSE]**

The reason is structural. Suno does not *licence* paid-tier output, it
**assigns** it — "all of its right, title and interest". Once assigned, there is
no scope clause left to breach. Paid media, branded content, boosting and
sponsorship are all inside it because nothing carves them out.

Suno's own marketing says the quiet part directly:

> Commercial use "describes your ability to **earn money from the music you made
> while subscribed**"; songs on any paid plan are granted commercial use rights,
> allowing you to "monetize via distribution, traditional sales, and more", and
> you "collect 100% of the royalties" without Suno claiming a share.
> — **[FAQ]** "What is commercial use?",
> <https://help.suno.com/en/articles/9601985>

> Pro is "the go-to plan for content creators, songwriters, and anyone looking
> for royalty free music for YouTube, podcasts, **ads**, or any commercial
> project."
> — **[FAQ, marketing copy]** <https://suno.com/l/music-for-commercial-use>

The September ToS restates the commercial grant as attaching to the **download**,
not the generation:

> "Songs downloaded from Suno on paid plans remain yours to use commercially or
> personally."
> — **[FAQ]** <https://suno.com/blog/suno-updates-tos>

> "Trial downloads are **for personal use only**: commercial rights apply to
> songs downloaded on paid plans."
> — **[FAQ]** same URL

**This is the single most important mechanical change for the pipeline.** Post-3
September, commercial rights are a property of *the download event on a paid
plan*, not of the account or the generation. A track generated free and later
downloaded on Pro is a different question from a track generated on Pro — see §4.

**Meta-side interaction:** Meta's Music Guidelines still govern independently.
"Use of music for commercial or non-personal purposes in particular is prohibited
**unless you have obtained appropriate licenses**" — **[LICENSE]**
<https://www.facebook.com/legal/music_guidelines_Jan2024> (via #2). A paid Suno
assignment *is* an appropriate licence, so this is satisfied. The density clause
from #2 still applies to the mix, and is unchanged by the audio's source.

---

## 3. Are free-tier generations public by default?

**REFUTED as of 2026-08-26 — but with a caveat, and there is a live conflict
between Suno's help text and its own binding terms.**

Help center, unambiguous, and it does **not** gate this on a paid plan:

> "**Songs are private by default**, but there's just one quick step to change
> that!" — "Link Only" is the initial visibility preference; to appear on your
> public profile, in search, or in featured playlists you must change Visibility
> to Public.
> — **[FAQ]** "Will my song appear on the Suno home page?",
> <https://help.suno.com/en/articles/2481537>

The free-plan rights article describes the same choice as available to free
users — tracks may be kept "link-only" or published to a personal Suno page.
**[FAQ]** <https://help.suno.com/en/articles/9601601>

Two caveats worth carrying:

1. **"Private by default" means link-only, not unlisted-and-unreachable.**
   Anyone with the URL can play it. That is weaker than it sounds for a
   *signature* bed, but it is not a public feed listing.
2. **The binding text still speaks of public-sharing defaults.** Both ToS
   versions retain:

   > "Output **may be publicly available** in a third party application such as
   > Discord, where it may be viewable, downloadable, and modified by other users
   > of that third party application. If the Output becomes publicly available in
   > such third-party application, you agree that other users have a right to
   > access, display, view, store, modify, and copy such Output; provided,
   > however, that **you may change your settings to bypass these public sharing
   > default settings so that Output generated will remain private**."
   > — **[LICENSE]** <https://suno.com/terms-of-service> and
   > <https://suno.com/terms-september-2026>

   That clause is a Discord-era artefact and reads against the current product
   UI. Where they conflict, **the licence text is the one that binds** — and it
   confirms the escape hatch ("you may change your settings … remain private")
   without conditioning it on a paid tier.

Also note Suno's reserved publicity right in the September text:

> Suno retains the right "to identify to the public (both on and off the Service)
> that Output (or any of it) was generated via the Service."
> — **[LICENSE]** <https://suno.com/terms-september-2026>

**Branding verdict:** the "publicly reusable signature bed" fear in #15 is not
borne out by current defaults — default visibility is Link Only on every tier,
including free, and it is changeable without upgrading. But §1's caveat stands
and is the real branding exposure: **no exclusivity in the output on any tier.**
Suno's assignment gives you the right to use the track, not the right to stop
anyone else generating one just like it. If the bed is meant to be a recognisable
MWA Forge asset, that has to be accepted or engineered around (distinctive
post-processing, a bespoke arrangement, or a real composer).

---

## 4. Do rights survive subscription lapse?

**Yes — expressly, and the September text is stronger than #2's libraries.**

Help center, current:

> Subscribers "**retain the rights to commercial use for the song, even if you
> end your subscription**."
> — **[FAQ]** <https://help.suno.com/en/articles/2416769>

> "You retain the rights to the songs you made while subscribed, **even after the
> subscription is canceled**."
> — **[FAQ]** "If I subscribe, do I get rights for the songs I made before
> subscribing?", <https://help.suno.com/en/articles/2425729>

The September ToS makes it binding rather than merely FAQ-level:

> rights granted through downloads are "**perpetual and are not affected by your
> exhaustion of your Download allotment, by any later change to allotments or
> pricing, or by the expiry, cancellation, downgrade or suspension of your
> subscription**."
> — **[LICENSE]** <https://suno.com/terms-september-2026>

And library access survives too: "All songs remain playable and shareable on
Suno regardless of plan, **even after cancellation**." **[FAQ]**
<https://help.suno.com/en/articles/13614785>

**Rights do NOT flow backwards, though:**

> "Subscribing to a Pro or Premier plan does **not** give you retroactive
> commercial use licensing for the songs made with a free plan by default." Suno
> "may offer retroactive rights in certain cases, but this is not guaranteed."
> — **[FAQ]** <https://help.suno.com/en/articles/2425729>

⚠️ **This is in genuine tension with the September download-centric framing**
("Songs downloaded from Suno on paid plans remain yours to use commercially"
**[FAQ]** <https://suno.com/blog/suno-updates-tos>), which reads as if the
*download* on a paid plan is the operative act, versus the older article and the
current ToS assignment clause ("generated from Submissions made by you … during
the term of your paid-tier subscription" **[LICENSE]**), which make the
*generation date* operative. **Do not rely on either reading for a
free-generated track.** The safe construction — and the one both readings agree
on — is: **generate the bed while subscribed, and download it while subscribed.**

### What this means for #14's re-render question

This is where Suno beats the #2 libraries outright. In #2, "re-rendering a reel
after the subscription lapses creates a *new* project with an *unlicensed*
track", because the libraries grant per-project rights tied to publication during
the term. Suno grants an **assignment of the track itself**, expressly perpetual
and expressly unaffected by cancellation.

**So: download the bed once on a paid plan, keep the audio file in the repo
alongside its provenance record, and re-render freely forever.** Subscription
lapse does not touch it. There is no clearing step, no per-video URL
registration, no safelist, no client-Page administration, and no monthly
end-client cap. Every operational burden catalogued in #2 §3 disappears.

That also means the **recurring cost is one month of Pro ($8), not a
subscription**. Generate the bed, download it, cancel. The rights are perpetual.
Keep the subscription only if the bed will be re-generated or a per-site variant
library is wanted.

---

## 5. Litigation status

**Partially settled. Warner is done; UMG and Sony are still suing. None of it
changes what a paid user may do with an output.**

### Warner — settled, November 2025

Suno's own announcement:

> "A new chapter in music creation" — announced **25 Nov 2025**. The partnership
> lets Suno "build a new generation of Suno models using **high-quality licensed
> music**". WMG artists may **opt in** for "names, images, likenesses, voices,
> and compositions to be used in new AI-generated music." And: "Moving forward, a
> **paid Suno account will be required to download songs** from the product, with
> each paid tier enabling a specific number of downloads each month."
> — **[FAQ, Suno primary]** <https://suno.com/blog/wmg-partnership>

Note the causal chain: **the download caps in §0 are a settlement artefact.** The
downloads policy is not a pricing experiment, it is a rights-holder concession,
which makes it much less likely to be walked back.

Suno also retired the models trained on unlicensed music. **[3P]**
<https://www.musicbusinessworldwide.com/warner-music-group-settles-with-suno-strikes-first-of-its-kind-deal-with-ai-song-generator/>
Suno's own confirmation of the consequence for users is narrower and worth
having:

> "Retiring models prevents *new* generation with them but doesn't affect
> existing songs. Users may still extend, remix, or edit previously created
> songs, though results may differ since operations run on new models."
> — **[FAQ]** <https://help.suno.com/en/articles/13614785>

### UMG and Sony — still litigating

- Both remain in active litigation in **D. Mass.** before **Judge Denise
  Casper**; a summary-judgment hearing was set for **July 2026** and no ruling
  had issued as of these searches. **[3P]**
  <https://ailawsuittracker.com/cases/umg-v-suno/>
- In **May 2026** the plaintiffs moved to expand the case from **560 to 61,026
  recordings** after discovery, pushing theoretical statutory damages past **$9
  billion**. **[3P]** same URL, and
  <https://www.techtimes.com/articles/318471/20260616/ai-music-copyright-lawsuit-suno-discovery-shows-millions-songs-july-ruling-nears.htm>
- Settlement talks reportedly stalled; UMG sought the Warner deal terms in
  discovery and a judge denied the request. **[3P]**
  <https://www.chartlex.com/blog/business/music-industry-ai-lawsuits-tracker-2026>

⚠️ Everything in this subsection is **[3P]**. Suno has published nothing about
the UMG/Sony cases, and the D. Mass. docket was not read directly. Treat the
$9bn figure and the July hearing date as **reported, not verified**. Re-check
before anything depends on them.

### Does any of it change what a user may do with an output?

**No — not by the terms of the licence.** Nothing in either ToS conditions the
user's grant on litigation outcome, and nothing in Suno's downloads/ToS
announcement narrows the commercial grant. The September text goes the other way
and hardens it into an express perpetual right unaffected by "any later change to
allotments or pricing". **[LICENSE]** <https://suno.com/terms-september-2026>

**But the residual risk is real and is not a licence risk.** Suno's assignment
carries no indemnity that was found in either ToS. If a court later holds that
outputs of a model trained on infringing material are themselves infringing, a
Suno assignment does not stand between MWA Forge and a rights holder — the
assignment can only convey what Suno had. The two mitigations that actually
reduce this:

1. **Generate on a post-settlement, licensed model.** The unlicensed models are
   retired; anything generated now runs on the licensed generation. **[3P/FAQ]**
2. **Keep provenance.** Record model version, generation date, download date, and
   plan tier next to the audio file. If the position ever needs defending, that
   record is the defence.

Against #2's alternatives, note the asymmetry: **Meta's Sound Collection carries
an express no-claim guarantee** ("your reel **will not be demonetized or muted
due to a copyright violation**", **[FAQ, Meta primary]**
<https://www.facebook.com/business/help/880459498798521>). **Suno carries no such
guarantee, and no indemnity.** That is the honest trade: Suno buys a distinctive,
perpetual, admin-free bed; Sound Collection buys generic audio with a warranty.

---

## 6. Meta-side obligation for generated audio on a boosted post

**No. Meta does not treat AI-generated audio as its own category for a boosted
commercial post, and no disclosure obligation is triggered by an instrumental
music bed.**

### The organic-content rule, and why it doesn't bite

> "We require people to disclose, using our **AI-disclosure tool**, whenever they
> post **organic** content with photorealistic video or **realistic-sounding
> audio** that was digitally created or altered, and **we may apply penalties if
> they fail to do so**."
> — **[LICENSE]** Meta Community Standards, Misinformation,
> <https://transparency.meta.com/policies/community-standards/misinformation>

Two reasons this does not reach a generated music bed:

1. It is a **Misinformation** standard. The labelling trigger in the same policy
   is content "that was digitally created or altered and creates a particularly
   **high risk of materially deceiving the public on a matter of public
   importance**." **[LICENSE]** same URL. An instrumental bed under a website
   walkthrough deceives no one about anything.
2. "Realistic-sounding audio" in Meta's usage means audio that plausibly depicts
   a **real event or a real person speaking** — see the SIEP list below, which is
   Meta's own gloss on the phrase. Generated *music* is not a depiction of
   anything.

### The ads rule is narrower still — political/social-issue only

> "Advertisers must also disclose when a **social issue, elections, or political
> ad** contains a photorealistic image or video, or **realistic sounding audio**,
> that was created or edited using third-party generative AI tools to:
> — Depict a real person as saying or doing something they did not say or do;
> — Depict a realistic-looking person that does not exist or a realistic-looking
> event that did not happen, or alter footage of a real event that happened;
> — Depict a realistic event that allegedly occurred, but that is not a true
> image, video, or audio recording of the event."
> — **[LICENSE]** Meta, Ads about Social Issues, Elections or Politics,
> <https://transparency.meta.com/policies/ad-standards/SIEP-advertising/SIEP/>

A boosted MWA Forge reel is **not** a SIEP ad, and even if it were, a music bed
matches none of the three depiction triggers. **No advertiser disclosure
obligation attaches.**

### What does happen automatically, and it is cosmetic

> "We will also begin **automatically detecting ads created or edited using
> third-party AI tools** through industry-standard signals. When detected, we'll
> apply an **'AI info' label**."
> — **[FAQ, Meta primary]** "Expanding GenAI Transparency for Meta's Ads
> Products", <https://about.fb.com/news/2025/02/gen-ai-transparency-metas-ads-products/>

This one **is** ads-wide, not SIEP-only, and automated detection went live
**1 June 2026**. **[FAQ, Meta primary]** same URL and
<https://about.fb.com/news/2026/02/meta-prepares-for-2026-us-midterms/>

Three things to note:

- The February 2025 announcement discusses **images and video**. **Audio is not
  mentioned in it at all.** **[FAQ, Meta primary]**
- The broader labelling policy does say Meta applies labels to "a wider range of
  video, **audio** and image content" based on "industry-shared signals or people
  self-disclosing that they're uploading AI-generated content" —
  **[FAQ, Meta primary]** "Our Approach to Labeling AI-Generated Content and
  Manipulated Media",
  <https://about.fb.com/news/2024/04/metas-approach-to-labeling-ai-generated-content-and-manipulated-media/>
  — but that page gives **no audio-specific mechanism, threshold, or
  requirement**, and is silent on penalties for audio.
- An "AI info" label is **informational**, appearing in "About this Ad". It is
  **not** a rejection, a restriction, or a distribution penalty. No Meta source
  states or implies otherwise.

### What actually governs the audio, and it isn't an AI rule

Meta's Music Guidelines are the live obligation, and they are source-agnostic:
music must be licensed, density matters, and Rights Manager can block or mute a
match regardless of how the audio was produced. **[LICENSE]**
<https://www.facebook.com/legal/music_guidelines_Jan2024> — see #2 §1 and §4.

The practical exposure for a generated bed is therefore **not** an AI-labelling
question at all; it is the same **Rights Manager false-positive** risk documented
in #2 §4, minus a safelist to fix it with. Suno provides no clearing mechanism,
no safelist, and no claims-support channel comparable to Epidemic's or Artlist's.
On a boosted post, a mute during flight is a paid-delivery problem, not just a
reach problem.

⚠️ **Not verified.** No Meta policy page was found that addresses AI-generated
*music* as distinct from AI-generated *speech or depiction*. That is a
well-supported absence rather than a confirmed permission. `transparency.meta.com`
pages are JS-rendered; the AI Disclosures page
(<https://transparency.meta.com/policies/other-policies/meta-AI-disclosures>)
returned only a navigation shell and **could not be read**, and Wayback is not
fetchable from this environment. If a boosted campaign gets material spend behind
it, read that page in a browser before relying on §6.

---

## Bottom line for #15

1. **Free-tier commercial rights and ownership** — No rights, and Suno owns it.
   Binding text: free/Basic users "will only use such Outputs for your lawful,
   personal and non-commercial purposes"; the ownership assignment sentence
   applies to "Pro or Premier" only. **[LICENSE]**
2. **Paid media / boosting** — Free: no. Paid: yes, with **no advertising or
   paid-media carve-out anywhere in the ToS** — Suno *assigns* the output rather
   than licensing it, so there is no scope clause left to breach. **[LICENSE]**
3. **Public by default** — **Refuted.** "Songs are private by default"; Link Only
   is the initial visibility, changeable to Public on any tier including free, at
   no cost. **[FAQ]** The real branding exposure is different: **no exclusivity
   in the output on any tier.**
4. **Survives lapse** — **Yes, expressly and perpetually**: rights are "not
   affected by … the expiry, cancellation, downgrade or suspension of your
   subscription." **[LICENSE]** Rights do **not** apply retroactively to
   free-tier songs. Download the bed while subscribed and re-render forever —
   strictly better than #2's libraries for #14.
5. **Litigation** — Warner **settled** (Nov 2025) into a licensing partnership;
   **UMG and Sony are still suing** in D. Mass. **[3P]** Nothing in it changes
   what a paid user may do with an output — but Suno offers **no indemnity and no
   no-claim guarantee**, unlike Meta's Sound Collection.
6. **Meta-side** — **No.** Generated audio is not its own ad-review category. The
   disclosure duty is organic-only or SIEP-only and targets depictions of real
   people/events, not music. An ads-wide automatic **"AI info" label** may attach
   (auto-detection live 1 Jun 2026) but it is informational, not a restriction —
   and Meta's own ads-GenAI announcement never mentions audio.

### On #8's recorded risk

**CONFIRMED, and worse than recorded.** #8's flagged objection to running on the
free tier is correct on the licence — free output is Suno's property, licensed
for personal non-commercial use only, and a marketing reel for MWA Forge's own
business is a commercial purpose. #8 did not know the second half: **from 3
September 2026 the free tier gets seven lifetime downloads, explicitly
personal-use.** The free tier is not a viable source for this pipeline under
either constraint.

**Recommendation: one month of Suno Pro ($8).** Generate the bed, download it,
commit the file plus a provenance record (model version, generation date,
download date, plan tier), then cancel. Rights are perpetual and unaffected by
cancellation, re-downloads don't consume quota, and there is no clearing,
safelisting, or per-video registration to maintain. Re-subscribe for a month
whenever a new bed is needed.

---

## Open items / verify before relying on

- **Free-generated, paid-downloaded.** The September framing makes the *download*
  the operative act; the ToS assignment clause and article 2425729 make the
  *generation* operative. They disagree. Don't rely on either — generate **and**
  download while subscribed.
- **Meta's AI Disclosures policy page** could not be read (JS shell; Wayback not
  fetchable here). §6 is built from the Misinformation standard, the SIEP ad
  standard, and two about.fb.com announcements. Read the AI Disclosures page in a
  browser before putting material spend behind a boosted reel.
- **UMG/Sony docket** is **[3P]** only. The 61,026-recording expansion, the $9bn
  figure and the July 2026 hearing date are reported, not verified against the
  D. Mass. docket.
- **Indemnity.** No indemnity clause was found in either ToS, but the full
  documents were read via extraction prompts rather than end-to-end. Confirm
  directly before treating "no indemnity" as settled.
- **Rights Manager and generated audio.** Unknown whether Suno output has ever
  tripped Meta's fingerprinting. No primary source either way. Suno offers no
  safelist or claims channel if it does — an untested failure mode on a boosted
  post.
- **Post-3-September ToS drift.** The September text was read on 2026-08-26,
  eight days before it takes effect. Re-read it on or after 3 September.
