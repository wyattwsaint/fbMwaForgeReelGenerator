---
ticket: 002
title: Real constraints on music for a client-branded Reel
retrieved: 2026-08-24/25
status: complete
---

# 002 — Audio rights and reach

All URLs retrieved **2026-08-24 / 2026-08-25** unless a snapshot date is noted.

Every claim below is tagged:

- **[LICENSE]** — binding license/terms text from the vendor or Meta.
- **[FAQ]** — vendor's own help center / marketing copy. Not binding, but it is
  the vendor telling you how they read their own license.
- **[3P]** — third-party summary, blog, or analysis.
- **[ANECDOTE]** — uncited community claim.

The decision this feeds: **bake a licensed track into the rendered `.mp4`**, or
**render without music and attach Facebook's in-app audio at upload**.

---

## 0. The finding that reframes the question

There is a **third path** the ticket didn't name, and it is the cheapest one.

Meta lets you **download Sound Collection audio on desktop and mux it in
yourself**:

> "Use Sound Collection on desktop to find free music and sounds and then
> download the audio to add them to the reels you create and share on Facebook.
> You'll need to use your own video creation software to add the music and
> sounds to your reels."
> — **[FAQ, Meta primary]** Meta Business Help Center, "Use Sound Collection for
> reels on Facebook", <https://www.facebook.com/business/help/880459498798521>
> (retrieved via Wayback snapshot 2026-05-03; the live page is JS-rendered and
> does not fetch)

And the Sound Collection licence covers exactly that:

> "non-exclusive, royalty-free license to use the SC Audio Content for
> **commercial or non-commercial purposes** in content you create, upload, and
> distribute on the Meta Company Products."
> — **[LICENSE]** Meta, Sound Collection Terms,
> <https://www.facebook.com/sound/collection/terms>

So "baked-in" and "cleared for a client's commercial Page" are **not** in
tension. You can bake in a Sound Collection track from the CLI, get a
deterministic render, and still be inside Meta's own commercial licence — with
no music-library subscription at all.

Constraints on that path:

- **Meta-only.** "You may not perform, distribute, make available or otherwise
  use the SC Audio Content separately from the Meta Company Products."
  **[LICENSE]** — same URL. The same `.mp4` cannot be reposted to YouTube,
  TikTok or the client's own website under this licence.
- **Catalogue is generic.** ~16,000 tracks; Meta's own description:
  "Sound Collection is Meta's public-facing resource of nearly 16,000 original,
  high-quality songs or sound effects that are rights-cleared and free for
  people to download to use on Facebook." **[FAQ, Meta primary]**,
  <https://www.facebook.com/business/help/880459498798521>
- **No trending-track cachet.** Sound Collection is production music, not the
  chart tracks people mean by "trending audio".
- **Ads/boosting is a live ambiguity.** Meta's own Instagram help page says the
  content "can be used for commercial purposes like ads"
  (**[FAQ, Meta primary]** <https://www.facebook.com/business/help/402084904469945>,
  Wayback 2024-06-16), and the Sound Collection Terms say nothing about
  advertising either way (**[LICENSE]**). Several **[3P]** analyses claim not
  every Sound Collection track is cleared for paid distribution, e.g.
  <https://usethirdchair.com/blog/meta-sound-collection-explained-for-brands-and-rights-holders>
  and <https://tiermusic.com/using-music-in-meta-ads-what-you-need-to-know/>.
  **No primary source contradicts Meta's "like ads" line, and no primary source
  confirms the per-track carve-out.** If any of these reels will be boosted,
  this needs a direct answer from Meta or the client's ad rep before it is
  relied on.

---

## 1. Meta's baseline rule for commercial music

Meta's Music Guidelines are the governing document and they are blunt:

> "Use of music for commercial or non-personal purposes in particular is
> prohibited unless you have obtained appropriate licenses."

> "If you post content that contains music owned by someone else, your content
> may be reviewed by the applicable rights owner and your content may be
> blocked, muted or removed if your use of that music is not properly
> authorized."

> "The greater the density of music in a video, the more likely it may be
> limited (e.g., blocked, muted or ineligible for Music Revenue Share)."

> "Any music in your video, if it is allowed at all, may not be available in all
> countries of the world."

— **[LICENSE]** Meta, Music Guidelines (Jan 2024),
<https://www.facebook.com/legal/music_guidelines_Jan2024>

Note the density clause. A 15–30s reel that is **wall-to-wall music with no
other audio** is precisely the shape Meta flags as more likely to be limited.
That cuts against baked-in commercial music and *for* a mix that includes
voiceover, SFX, or UI/ambient audio under the bed.

### The full popular-music library is deliberately withheld from business accounts

> "The music available in our library is intended for personal, non-commercial
> use. **Restricted access to the music library** — To make sure that the music
> in our licensed library is not used for commercial purposes, **certain
> business accounts and certain types of posts do not have access to the
> library.** Licensed music may also not be available in certain countries or
> regions. If your account does not have access to the licensed music library,
> then you may be able to use Meta's Sound Collection."
> — **[FAQ, Meta primary]** "Access to the licensed music library on Instagram",
> <https://www.facebook.com/business/help/402084904469945>
> (Wayback snapshot 2024-06-16; live page is JS-rendered)

That page is Instagram-titled, but it states the policy that governs the whole
question: **"trending audio" in the popular-music sense is largely not on the
table for a client's commercial Page.** What a Page actually gets offered in the
Reels audio picker is Sound Collection plus whatever the account is eligible
for.

> "When you upload a reel on Facebook mobile or in Meta Business Suite desktop,
> you will be presented with audio options you can add to your content. Our
> Sound Collection audio is included in these options."
> — **[FAQ, Meta primary]** <https://www.facebook.com/business/help/880459498798521>

**So the "attach trending audio at upload" path largely collapses into
"attach Sound Collection audio at upload" for a commercial Page** — which is the
same catalogue you could have baked in from the CLI.

---

## 2. The workflow constraint: the Graph API has no audio parameter

Publishing is out of scope for v1, but this decides what "attach at upload"
actually costs.

Meta's Reels publishing endpoint documents these fields: `video_id`,
`upload_phase`, `video_state`, `description`, `title`, `scheduled_publish_time`.
**There is no audio, music, or Sound Collection parameter.**
— **[LICENSE/primary docs]** Meta for Developers, "Publish a Reel",
<https://developers.facebook.com/docs/video-api/guides/reels-publishing/>

Video spec from the same page (useful for the render target regardless):
`.mp4` recommended, **9:16**, 1080×1920 recommended / 540×960 minimum,
**3–90 seconds**, 24–60 fps, H.264/H.265 (VP9, AV1 also supported), audio AAC-LC
128kbps+ 48kHz stereo.

**Consequence:** attaching in-app audio requires a **human in the Facebook
mobile app or Meta Business Suite desktop** for every reel. It is not
automatable, not reproducible, and not something the CLI can own. Baking audio
in is the only path that keeps the artifact self-contained and the pipeline
deterministic.

---

## 3. Subscription libraries: the agency-for-client question

The short version: **all three libraries do permit agency-for-client work, but
only on their higher tier, and none of them transfers a licence to the client.**
The licence stays with the agency; the client receives the finished video only.

### Artlist — clearest text of the three

Binding licence, effective 2026-02-15,
<https://artlist.io/help-center/privacy-terms/artlist-license/>
(retrieved by direct `curl` with a browser UA; WebFetch gets 403):

> "**Your clients are covered** — You can create Projects for your clients, but
> **only you can download the Assets** and use them to create a Project. If you
> create a Project incorporating an Asset, you can transfer this Project to your
> clients and to anyone else, so they can use the Project **(but the License is
> only yours)**. Keep in mind that if you collaborate with any third party in a
> Project or if you create a Project for your clients, **you must make sure your
> collaborator and/or client complies with this License.**"
> — **[LICENSE]**

Social tier explicitly excludes it:

> "This License is meant to cover only your use in your Channels. Therefore, it
> does not allow you to create Projects that are intended to be uploaded or
> embedded on **third party channels** or websites for the purpose of promotion
> or advertisement. This also means that you can't publish your Projects in paid
> media. If you want to create a Project for your client or any other third
> party, you can upgrade to a Pro License."
> — **[LICENSE]**, same URL

Seat and size rules:

> "The name you register for our services is the only person or entity who can
> use the Assets under this License, **one seat at a time**."
> "If you work for an **agency**, broadcaster or for a company (or any other
> legal entity) that has **more than 50 employees**, you must have a Max
> Business plan to be covered by this License (or a customized Enterprise
> license)."
> — **[LICENSE]**, same URL

Channel registration ("Clearlist"):

> "You can monetize up to **3 channels/accounts per platform** and, with Teams
> plan, up to 5 channels/accounts per platform… under the Max Business plan, you
> may monetize an unlimited number of channels/accounts."
> "**The Clearlist must be updated while your subscription is active**… Once a
> plan expires, you will no longer have the ability to add new channels or
> content to the Clearlist."
> — **[LICENSE]**, same URL

Vendor FAQ confirming the non-transfer, in plainer words:

> "**Can I share music, SFX, footage, and templates with a client?** No, you
> can't share these assets with a client. Artlist's licenses are
> non-transferable. While a Pro license allows you to create and deliver
> completed projects to clients, you aren't allowed to share assets themselves.
> Clients are not permitted to modify or use the assets independently."
> "The **Social** license is exclusively for personal content creators… who
> **don't create projects for clients or brands**."
> "The **Pro** license is designed for professional creators who need to
> Clearlist more than one channel per platform, or **who create projects for
> clients and brands**… and covers both personal and client use for the specific
> projects created."
> — **[FAQ]** <https://help.artlist.io/hc/en-us/articles/29490991524253-Understanding-Artlist-s-license>

There is also a client-facing Clearlist mechanism that avoids burning channel
slots:

> "If you need to clear and monetize other specific videos for your clients, you
> can create an **invite link** through the Clearlist section in your Account.
> Then share the link with your clients so they can add their videos. You can
> monetize unlimited Projects as long as you keep it reasonable."
> — **[LICENSE]**, same URL

**Artlist verdict for this use case:** Pro tier (or Max Business at >50
employees / >7 seats), agency holds the licence, agency does the downloading,
the client gets the `.mp4` and nothing else. Register client reels either by
spending one of the 3 monetizable channels-per-platform (5 on Teams, unlimited
on Max Business) or — better for a multi-client roster — via the **Clearlist
invite link**, which the client uses to add their own video URLs.

⚠️ The Artlist help article `artlist.zendesk.com/hc/en-us/articles/6094395287581`
("Client projects and coverage"), widely cited in secondary write-ups, **no
longer exists** — it now redirects to the Help Center home page. Do not cite it.

### Epidemic Sound — binding text obtained; the caps are the story

The `epidemicsound.com/policy/*` pages are a client-rendered React SPA (Wayback
snapshots are the same empty shell). **The clause text below is nonetheless the
binding licence text**, recovered by reading the page's data source directly:
the app fetches its policy bodies from Contentful (space `ojtnytzl1djm`, content
type `termsAndConditions`, queried by `fields.id=<slug>`), and the Delivery API
returns the exact markdown the page renders. Retrieved 2026-08-25.

Also note: **`/policy/commercial-subscription-music-license/` now 301-redirects
to `/policy/pro-subscription/`.** "Commercial Subscription" is today's **Pro**.

#### Pro — for a *solo* operator, one seat

> "**Who is this for?** This License is intended for individual creators,
> influencers, and freelancers, including those who operate through a business
> entity."
> "**Limitations for freelancers.** You may not use the Pro Plan to create
> Productions on behalf of any company that has, or that forms part of a group of
> companies that collectively has, an annual turnover of more than **USD fifty
> (50) million**."
> "**One single user**. This License only covers use by one individual."
> — **[LICENSE]** Pro Subscription Music License,
> <https://www.epidemicsound.com/policy/pro-subscription/>

The clause that actually authorises publishing on a client's Page:

> "**Distribution license.** …Epidemic Sound hereby grants to you the perpetual
> right to make available any Productions containing any Licensed Works that you
> have completed during the Subscription Period … worldwide (i) on any and all
> online channels and platforms and (ii) during events. **You may sub-license or
> transfer the rights to make available such Productions to any third party.**"
> — **[LICENSE]**, same URL

And the clause that authorises registering the *client's* Page:

> "**Clearing**. You are responsible for clearing the Productions and/or relevant
> channels with Epidemic Sound… You may clear a limited number of **owned and
> operated** channels… per platform… **In addition to clearing these channels,
> you may clear a reasonable amount of video URLs outside of your own channels
> (e.g. Productions posted on your end clients' channels).**"
> — **[LICENSE]**, same URL

Note the asymmetry: under Pro, the *channel* slots must be **owned and
operated** by the licensee — a client's Page does not qualify — so client
publication is cleared **per video URL**, not per channel.

#### Business — for an actual agency, and it caps client count

> "**Limitations for freelancers, agencies, production companies and
> publishers.** You cannot use the Business Plan subscription: (i) if you are a
> freelancer, **agency**, production company or publisher, that has… an annual
> turnover of more than **USD five (5) million**, (ii) you cannot create
> Productions on behalf of any company that has… an annual turnover of more than
> **USD fifty (50) million**; and **(iii) you may only create Productions for up
> to five (5) end clients per month.**"
> "**Two individual users**. This License only covers use by up to two individual
> users."
> — **[LICENSE]** Business Subscription Music License,
> <https://www.epidemicsound.com/policy/business-subscription/>
> (header: "Last update: 13-04-26"; pre-13-04-26 subscribers are on Legacy terms)

Business grants sublicensing twice — once for production, once for distribution:

> "**Synchronization license**… **You may sub-license this right to independent
> production companies for the purpose of making Productions on your behalf.**"
> "**Distribution license.** …**You may sub-license or transfer the rights to
> make available such Productions to any third party**, except that you may not
> create Productions on behalf of any company that has… an annual turnover of
> more than USD fifty (50) million."
> — **[LICENSE]**, same URL

Business's **Clearing** clause is identical to Pro's **except that "owned and
operated" is dropped** — so under Business the client's Page itself can occupy a
channel slot, not just individual video URLs.

#### Creator — flatly excluded

> "**Personal use.** …If you want to use the Licensed Works for any other purpose
> not expressly permitted under this License, **e.g. if you are creating content
> for a corporate channel (meaning a channel owned and/or operated by a business)
> or creating content on behalf of a third party**, you can find other
> appropriate licenses…"
> "**No paid media ads or third party exploitation.** …You further have no right
> to use the Licensed Works in any production that is produced for the purpose of
> being used, licensed, sold or in any other way exploited by any third party…
> **when such productions are intended to be uploaded or embedded on third party
> channels or websites.**"
> "**Clearing.** …You may clear **one** channel… per platform."
> — **[LICENSE]** Creator Subscription Music License,
> <https://www.epidemicsound.com/policy/personal-subscription-music-license/>

Creator's sync grant also says productions "produced **by yourself**" — Pro and
Business both say "produced by **or on behalf of** yourself."

#### The FAQ and the licence do not agree on the caps

Epidemic's help center says of **Pro**: "Publishers making over **$5M/year** and
companies over **$10M/year** are not eligible for the Pro Plan."
— **[FAQ]** <https://help.epidemicsound.com/hc/en-us/articles/26247236323858-Pro-Plan>

The **licence** attaches no such caps to Pro; the $5M/$10M figures appear in the
**Business** licence instead, and Pro's only cap is the $50M client-turnover
limit. **[LICENSE]**, URLs above. The FAQ appears to be conflating tiers. Where
they conflict the licence governs — but confirm with Epidemic before relying on
either.

Other FAQ points consistent with the licence and worth having:

> **Pro Plan** — "Does it cover client work? **Yes, it covers content created for
> third parties.**" · monetize "up to **3 channels per platform**" · "doesn't
> cover Video on Demand (VOD), Streaming VOD, Pay-per-View, virtual fitness
> classes, or local radio, TV shows, TV ads and cinema."
> — **[FAQ]** <https://help.epidemicsound.com/hc/en-us/articles/26247236323858-Pro-Plan>

> **Creator Plan** — "No, the Creator Plan does **not** cover client work. A Pro
> Plan is needed for that."
> — **[FAQ]** <https://help.epidemicsound.com/hc/en-us/articles/26247405706386-Creator-Plan>

Safelisting supports **YouTube, TikTok, Podcast RSS, Facebook, Twitch, website
URLs, and Instagram**, and the per-video client flow is documented:

> Two methods: "Clear the video link directly in your account" or "Send an
> invitation to your client to clear the video themselves." Sharing clearing
> invitations with clients "**is available with a Pro Subscription**", and "**An
> active subscription is required for your client to clear content using the
> invitation link.**" Invitation links last 30 days.
> — **[FAQ]** <https://help.epidemicsound.com/hc/en-us/articles/26255832660370-How-to-clear-clients-videos>
> and <https://help.epidemicsound.com/hc/en-us/articles/25890103714706-Safelist-channels>

Two collision modes:

> "this channel has already been safelisted under another Epidemic Sound
> account" — i.e. **if the client already runs their own Epidemic subscription
> with their Page safelisted, the agency cannot also safelist it.**
> Also: "you may only change your channel up to **10 times**."
> — **[FAQ]** <https://help.epidemicsound.com/hc/en-us/articles/25890294242194-Common-questions-about-safelisting>

Claim handling when something slips through:

> "If your video using Epidemic Sound music is blocked on Facebook or Instagram
> due to a copyright claim from another rights holder… Appeal the copyright
> claim. Contact us with… Email address linked to your Epidemic Sound account,
> URL of the affected page/profile, URL or name of the claimed track, Screenshots
> of the claim and error notification."
> — **[FAQ]** <https://help.epidemicsound.com/hc/en-us/articles/26255841507090-Facebook-and-Instagram-Copyright-information>

That is a **manual, reactive, days-long ticket loop on the client's Page**, and
it is the single largest operational risk of the baked-in-licensed-track path.

**Epidemic verdict:** **Pro** works only if the agency is genuinely a one-person
operation. A real agency needs **Business** — capped at **two seats and five end
clients per month**. For a tool whose premise is generating reels across a client
roster, that monthly cap is a first-order design constraint, not fine print.

### Musicbed — structurally incompatible with an agency subscription

Musicbed's site is a Remix SPA, but the License Terms body is hardcoded in a JS
chunk (`/assets/LicenseTerms-*.js`) and was extracted from there — so the
following **is** the binding text, retrieved 2026-08-25 from
<https://www.musicbed.com/license-terms>:

> "Subject to all terms, conditions, and limitations hereof… Licensee will have
> the right to reproduce, display, distribute, perform, transmit, and otherwise
> exhibit the Licensed Content **as embodied in a single audiovisual Project**…
> the Licensed Rights are expressly limited by and restricted to the Term,
> Territory, and Usage set forth on the License Details."
> — **[LICENSE]**

The agency/client clause, and it is the harshest of the three vendors:

> "(v) the Licensed Rights are granted to Licensee on a **non-transferable**
> basis, and any attempt to transfer, assign, or sub-license the Licensed Rights
> (or the obligations set forth herein) is **void ab initio**; (vi) to the extent
> that a purchasing agent ('**Purchaser**') is identified on the License Details,
> **the Licensed Rights are for the direct benefit of the named Licensee only**"

> "…**apart from internal portfolio materials related to the Project, Purchaser
> has no right to make any use of the Licensed Content.**"

> "(B) any third-party logo, trademark, or other brand or company identifier
> (i.e., other than Licensee's) [is restricted]"

> "Perpetual rights granted under this license apply only to the specific
> project, product, and usage details outlined in this agreement. Any use,
> adaptation, or repurposing beyond the original scope—regardless of when it
> occurs—will require a separate license. **Paid media rights are not granted in
> perpetuity unless explicitly stated in the license terms.**"
> — **[LICENSE]**, all from <https://www.musicbed.com/license-terms>

Teeth: liquidated damages of the greater of **$10,000 per unauthorized use** or
**10× the standard licence fee**; venue Tarrant County, Texas. **[LICENSE]**

The "End Client" language lives in the per-order Subscription License Agreement,
generated per order and not published at a public URL. A complete executed copy
was obtained as a third-party-hosted PDF —
<https://irca.com.au/wp-content/uploads/bsk-pdf-manager/2020/04/MB-subscription-license-agreement-1.pdf>
— but it is **2019/2020-vintage Personal-tier language**, so treat as
**[3P copy of historical LICENSE]**, not current terms:

> "This license is for **a single film project intended to promote a single
> organization, entity, company, product, or the like (collectively referred to
> as 'End Client')**. Placement of the brand, logo, name, or other identifier of
> more than one End Client on the project is a violation… Co-branded projects…
> require a custom written license from Musicbed."

That document's "License Details" section carries **separate `LICENSEE:` and
`END CLIENT:` name/address fields**, confirming Musicbed binds one named End
Client per licence instrument.

The tier structure (Small Business ≤50 employees / Business 51–250 / Enterprise
250+) circulates widely but **could not be verified against Musicbed primary
text** — `musicbed.com/knowledge-base/what-subscription-do-i-need` 301s to
`support.musicbed.com`, which serves only a nav shell. **[3P, unverified]**

**Musicbed verdict: architecturally the opposite of the other two.** There is no
agency subscription that blanket-covers client work. The **client must be the
Licensee**; the agency is at most a named **Purchaser** (purchasing agent) with
no usage rights beyond its own portfolio reel. One project, one End Client, one
Term/Territory/Usage — a licence event per reel. Rule it out for this pipeline
unless a specific client demands a specific Musicbed track.

### Cross-cutting rules that apply to all three

| | Epidemic Sound | Artlist | Musicbed |
|---|---|---|---|
| Tier needed | **Business** (Pro only if truly solo) | **Pro/Business**; **Max Business** if agency >50 employees | **Per-project licence naming the client** |
| Who subscribes | Agency | Agency | **Client** is Licensee; agency = "Purchaser" |
| Sublicence to client? | **Yes, express** | No — the Project transfers, the licence does not | **No — "void ab initio"** |
| Client Page registration | Clear channels + client video URLs | Clearlist invite link for client's URLs | n/a — scoped in License Details |
| Caps | Agency ≤$5M, client ≤$50M, **≤5 end clients/month**, 2 seats | >50 employees ⇒ Max Business; 7 seats; 3 channels/platform | Tier by client size *(unverified)* |
| Per-client licence event? | No | No | **Yes — one project, one End Client** |

- **Perpetuity is tied to publication during the term.** Every vendor states that
  a project completed and published while the subscription is active stays
  cleared forever, but assets cannot be used in *new* projects after expiry.
  Artlist **[LICENSE]**: "If a project is completed and published while your
  subscription is active, you maintain the right to use the assets in that
  published project even if you later cancel… Once your subscription expires,
  these assets cannot be used in new projects."
  <https://help.artlist.io/hc/en-us/articles/29490991524253-Understanding-Artlist-s-license>
  **Implication for a re-render pipeline:** re-rendering a reel after the
  subscription lapses creates a *new* project with an *unlicensed* track. The
  "re-render and drift" question in the map inherits this constraint.
- **The client never gets the licence.** In all three the client receives a
  finished video, not rights. Epidemic is the only one that expressly sublicenses
  *distribution* to the client; Artlist transfers the Project while keeping the
  licence with the agency; Musicbed voids any transfer outright. If the agency
  relationship ends or the subscription lapses, an already-published reel stays
  cleared, but the client cannot re-cut it and a lapsed Clearlist/Safelist entry
  is a live claim risk.
- **Registration is per-destination.** Both Artlist and Epidemic require the
  **client's Facebook Page or the individual reel URLs** to be registered on the
  agency's account — an ongoing per-client administrative obligation the CLI
  cannot perform, because it needs a *published* URL.

---

## 4. Rights-management risk when a baked-in track trips content matching

Meta's Rights Manager fingerprints uploaded audio and video against reference
files supplied by rights holders. Consequences for the poster, per Meta:

> content "may be blocked, muted or removed if your use of that music is not
> properly authorized"
> — **[LICENSE]** <https://www.facebook.com/legal/music_guidelines_Jan2024>

A rights holder's options on a match are to **monitor, block, or claim**, and a
poster's counter is a **dispute**, after which the rights holder may "uphold the
block", "release your claim", or "submit a takedown request."
— **[FAQ, Meta primary]** Meta Business Help Center, "Matches in Rights Manager"
<https://www.facebook.com/business/help/750602946305183> and "Resolve usage
disputes in Rights Manager"
<https://www.facebook.com/business/help/2523148971045474>. *(Both are
JS-rendered and have no usable Wayback snapshot; body text did not fetch. The
action vocabulary above is from Meta's own page titles/summaries plus **[3P]**
<https://help.toolost.com/hc/en-us/articles/4412265577108-Meta-Rights-Manager-Explained>.
Re-verify the exact remedies in a browser if this becomes load-bearing.)*

**Why this matters more than it looks.** A false-positive match on a *properly
licensed* production-music track is a real and documented scenario — it is why
Epidemic and Artlist built safelisting/Clearlist at all. When it happens:

1. It happens on **the client's Page**, not yours.
2. The reel is **muted or pulled** at exactly the point where it is getting
   distribution.
3. Recovery is a **manual appeal on the client's account** plus a support ticket
   to the library, not something you can fix from the CLI.
4. **Instagram demotes muted reels** — Meta lists "reels that are muted" among
   content it makes less visible
   (**[FAQ, Meta primary]** <https://about.instagram.com/blog/announcements/instagram-ranking-explained>).
   So a mute is not just a mute; it is a mute plus a distribution penalty. This
   is very likely the true mechanism behind the folk claim that "baked-in audio
   kills your reach."

Sound Collection is the only route with an explicit no-claim guarantee:

> "When you use audio from Sound Collection, your reel **will not be demonetized
> or muted due to a copyright violation**."
> — **[FAQ, Meta primary]** <https://www.facebook.com/business/help/880459498798521>

That sentence is the strongest single argument in this whole document.

---

## 5. Reach: does trending in-app audio actually help?

**Short answer: there is no primary evidence, and the commonly cited numbers are
fabricated. Do not build a spec around this.**

### What Meta actually says

- **Audio is a named content signal — on Instagram.** Instagram's ranking
  explainer lists among Reels signals "signals about the content within the
  video such as the audio track or visuals in the video, as well as popularity",
  and names "go to the audio page" as one of the top predictions, described as
  "a proxy for whether or not you might be inspired to make your own reel."
  **[Meta primary]** <https://about.instagram.com/blog/announcements/instagram-ranking-explained>
- **The Facebook Reels ranking system card does not mention audio at all.** Its
  ten predictions are watch time, continuing after opening full screen, clicking
  to full screen, liking, watching vs. skipping, watching to completion,
  requesting less similar content, hiding, starting a viewing session, and moving
  to the next reel; its inputs are recent interactions, author identity, topic
  relevance, others' completion rates, and viewing duration. **No audio, no
  music, no audio page, no originality.** Verified independently.
  **[Meta primary]** <https://transparency.meta.com/features/explaining-ranking/fb-reels/>
- **The Instagram Reels Chaining card does model audio reuse — but only from
  viewer-side signals** ("How many times you've clicked the audio link in reels
  you've seen", "How many times you've clicked 'Use audio'"). Nothing says "this
  reel uses a trending track" is an input. **[Meta primary]**
  <https://transparency.meta.com/features/explaining-ranking/ig-reels-chaining/>
- **Meta's own trending-audio launch makes no reach claim** — it is framed purely
  as a discovery/inspiration destination. **[Meta primary]**
  <https://about.fb.com/news/2023/04/instagram-reels-trending-audio-and-gifts-updates/>
- **Meta's business guidance treats imported audio as an equal option:** "Set the
  mood with music, voiceover or sound effects. **Import your own audio** or
  browse trending, saved and royalty-free options." **[FAQ, Meta primary]**
  <https://www.facebook.com/business/learn/lessons/create-fb-ig-reels>
- **Muted is penalised.** Instagram makes reels less visible for "low-resolution
  or watermarked reels, **reels that are muted** or contain borders, reels that
  are majority text, or reels that have already been posted on Instagram."
  **[Meta primary]** <https://about.instagram.com/blog/announcements/instagram-ranking-explained>
  This is the only Meta statement connecting audio to distribution, and it is
  *sound vs. silence*, **not** *trending vs. baked-in*.

### The audio-page discovery surface is an Instagram argument, not a Facebook one

Instagram documents it explicitly — when licensed audio is detected, "Your reel
will be added to the audio page for that song, where more people on Instagram
may find it", with a "Remove From Audio Page" opt-out.
**[FAQ, Meta primary]** <https://help.instagram.com/329208821595430>

**No equivalent Meta documentation exists for Facebook.** There is no Meta page
describing a Facebook audio page, a tap-through to other reels using a track, or
a Facebook trending-audio tab. Facebook's October 2025 Reels discovery
announcement lists an upgraded recommendations engine, friend bubbles, Not
Interested, saves, and AI suggested search — **no audio surface**.
**[Meta primary]** <https://about.fb.com/news/2025/10/finding-sharing-reels-facebook-just-got-easier-more-fun/>

Note also: the Instagram audio page attaches to *licensed audio detected in your
reel* — which can include audio you baked in. It is not exclusive to the in-app
picker.

### Originality bonuses are real, documented, and unrelated to audio

Facebook (March 2026): original = "Content filmed or produced directly by a
creator or owner of a Profile or Page"; creators adding substantial creative
value see "increased distribution", others are "deprioritized".
**[Meta primary]** <https://about.fb.com/news/2026/03/rewarding-original-creators-on-facebook/>
Instagram (2024): "those who create it should get credit and distribution";
duplicates detected using "audio and visual signals" — audio as *fingerprint*,
not as *bonus*. **[Meta primary]** <https://creators.instagram.com/blog/recommendations-and-originality>

**This is the lever that actually exists for a generated-reel pipeline**, and it
argues for distinctive, self-produced-looking output — not for a particular
audio source.

### Studies

Every large-N benchmark study cited in this space **does not analyse audio at
all**. Citing them for an audio claim is a miscitation.

| Study | N | Audio variable? |
|---|---|---|
| Metricool 2026 Instagram Study <https://metricool.com/press-release-instagram-study-2026/> | 24.4M posts / 375k accounts | **None** |
| Socialinsider 2026 Instagram Benchmarks <https://www.socialinsider.io/social-media-benchmarks/instagram> | 35M posts / 448k pages | **None** |
| Buffer reach analysis <https://buffer.com/resources/instagram-reach-engagement-analysis/> | 5M+ posts | **None** |
| Later / Dash Social / Emplifi / Rival IQ benchmarks | various | **None** |

The **one** significance-tested comparison found is **null**: "Original Audio"
vs. "Overlaid/Named Music" — engagement 8.00 vs. 10.08, **p = 0.1449**; reach
142.87 vs. 149.67, **p = 0.8681**. No significant difference at 95%. **N is never
stated**, so treat as weak. **[3P study]**
<https://thatrandomagency.com/2025/03/12/do-trending-sounds-impact-instagram-reel-performance/>

Nearest academic work is TikTok, not Meta, and confounds the variable: Dang et
al. (2025), *Marketing Management Journal*, N = 750 TikTok ads, OLS, trending
elements B = .61, p = .03 — but "Trendy Audio & Visual Effects" was coded as
**one combined category**, with no calculable interrater reliability. **[3P
study]**
<https://marketingmanagementjournal.scholasticahq.com/article/144766-should-brands-utilize-trending-content-elements-for-their-short-form-advertisements>

**Nobody has tested in-app audio vs. baked-in audio, on any platform.**

### The circulating numbers are fabricated

- **"27% more reach with trending audio (Hootsuite)"** — **this study does not
  exist.** Hootsuite's only Reels experiment is from **2021, N = 6 reels, one
  account**, and tested whether posting Reels lifts account engagement at all.
  The "27%" appears to be a garbled reading of its "27.8K views" top-reel figure.
  **Do not cite.** **[ANECDOTE]** <https://blog.hootsuite.com/instagram-reels-experiment/>
- **"42% higher engagement with trending audio"** — traces to an SEO affiliate
  stats page with no study, no N, no methodology, no comparison group.
  **[ANECDOTE]** <https://www.loopexdigital.com/blog/instagram-reels-statistics>
- **"Buffer A/B test: 24% more views"** — not findable on Buffer; the pages
  carrying it cite nothing. **[ANECDOTE]**
- Creator/agency blog assertions that trending audio "gives your Reels wings" are
  uncited personal assertion. **[ANECDOTE]**

### Stated plainly, what is *not* evidenced

1. Meta has **never** claimed trending audio boosts reach, on either platform.
2. Meta has **never** distinguished in-app audio from baked-in audio as a ranking
   input. Facebook's own Reels ranking card doesn't mention audio at all.
3. **No study with a real N has isolated the variable.**
4. **Facebook has no documented audio-page discovery surface.** The Instagram
   argument does not transfer.
5. The true facts people substitute — audio is a ranking signal, most reels are
   watched sound-on, muted reels are demoted, reels with music beat silent reels
   — are all real and all answer a **different question**.

---

## 6. What this means for the spec

**Recommended default: bake in a Sound Collection track.** It is the only option
that is simultaneously (a) explicitly licensed by Meta for commercial use on a
client's Page, (b) covered by Meta's own "will not be demonetized or muted"
guarantee, (c) free, (d) free of per-client registration, per-client caps, and
seat limits, and (e) able to keep the CLI's output a **complete, deterministic,
reproducible `.mp4`** with no manual upload-time step. Config schema needs a
per-site `audio:` key pointing at a local track file plus a provenance/licence
field.

**Reserve a licensed-library track for when the client's brand demands it**, and
size the plan against the roster before committing:

- **Epidemic Sound** — Pro is one seat and reads as a solo-freelancer licence;
  an agency needs **Business**, which is capped at **two seats and five end
  clients per month**. That monthly cap is a hard architectural limit on a
  multi-client reel pipeline.
- **Artlist** — Pro/Business; **Max Business if the agency exceeds 50
  employees**. 3 monetizable channels per platform (5 on Teams, unlimited on Max
  Business), but client videos can go through a **Clearlist invite link** instead
  of burning channel slots.
- **Musicbed** — rule out. It is one licence per project per End Client, the
  client must be the named Licensee, and unauthorized use carries **$10,000
  liquidated damages** per instance.

Either way, budget for a manual clearing step per published reel and a reactive
claims process that lands on the client's Page.

**Do not build "ship silent, attach in-app audio at upload" as the primary
path.** It cannot be automated (no Graph API audio parameter), the commercial
catalogue available to a business Page is largely Sound Collection anyway, and
the reach premise that motivates it is unevidenced on Facebook specifically.

**Never ship silent.** That is the one audio decision Meta has actually
documented a penalty for.

**Design implication from the density clause:** mix music *under* voiceover, UI
sounds, or ambient capture audio rather than as the sole audio track. Meta:
"The greater the density of music in a video, the more likely it may be limited."

---

## 7. Open items / verify before relying on

- **Sound Collection and paid boosting.** Meta's Instagram help says "can be used
  for commercial purposes like ads"; multiple **[3P]** sources claim per-track ad
  carve-outs. No primary source resolves it. If reels will be boosted, get an
  answer in writing.
- **Epidemic Sound's Pro eligibility caps.** The licence and the help-center FAQ
  state different revenue thresholds (see §3). Confirm with Epidemic which
  governs before choosing a tier.
- **Epidemic Sound "five end clients per month."** The licence does not define
  whether the count is *new* clients, *active* clients, or clients with a
  Production delivered that month. Material to the pipeline's shape — ask.
- **Musicbed's current tier structure.** The License Terms body was recovered,
  but `what-subscription-do-i-need` 301s to a JS-only support site, so the
  Small Business / Business / Enterprise thresholds remain unverified. The
  "End Client" text quoted is from a 2019/2020 executed agreement, not current
  terms.
- **Meta Rights Manager remedy vocabulary.** Meta's help pages are JS-rendered;
  the block/mute/monitor/claim/dispute vocabulary above is partly reconstructed.
- **Whether a Facebook Page in the Reels picker sees anything beyond Sound
  Collection.** Meta says "certain business accounts" lose library access but
  does not enumerate which. Worth an empirical check on one real client Page.
