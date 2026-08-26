---
ticket: 001
title: What does Facebook actually require to publish a Reel via the Graph API?
retrieved: 2026-08-24
api_version_of_record: Graph API v25.0
---

# Facebook Reels via Graph API — requirements that bind the render

All facts below were retrieved **2026-08-24**. Meta's video requirements drift; anything
here should be re-checked before an implementation session actually wires up publishing.
Primary sources are Meta for Developers and Meta Business Help Center. Where a claim
could only be sourced to third parties, or not at all, it is marked **UNCONFIRMED**.

---

## 1. TL;DR — the render spec these findings imply

| Parameter | Value to render at | Confidence |
|---|---|---|
| Container | `.mp4` (MPEG-4 Part 14) | High — Meta lists `.mp4` as recommended |
| Video codec | H.264 (High profile), progressive scan, closed GOP 2–5s, 4:2:0 | High |
| Resolution | 1080 x 1920 | High (recommended value; 540x960 is the floor) |
| Aspect ratio | exactly 9:16 | High |
| Frame rate | fixed 30 fps (24–60 permitted) | High |
| Duration | 15–30s target sits safely inside the 3–90s window | High |
| Audio codec | AAC-LC, 48 kHz, stereo, >=128 kbps | High |
| Video bitrate | ~8–12 Mbps VBR for 1080x1920 @30fps | **Low — Meta publishes no FB Reels video bitrate.** See §4 |
| `moov` atom | at front of file (faststart), no edit lists | Medium — documented for IG Reels, not FB Reels. See §4 |
| Music | **must be baked into the audio track**; no FB API to attach in-app music. See §6 | High |

Practical ffmpeg shape (derived, not quoted from Meta):

```
-c:v libx264 -profile:v high -pix_fmt yuv420p -r 30 -g 60 -keyint_min 60 -sc_threshold 0
-c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart
```

---

## 2. The publishing flow (context only — publishing is out of scope for this effort)

Source: [Publish a Reel — Video API](https://developers.facebook.com/docs/video-api/guides/reels-publishing/) (retrieved 2026-08-24)

Three phases against **v25.0**:

1. **Start** — `POST https://graph.facebook.com/v25.0/{page_id}/video_reels` with
   `upload_phase=start`. Returns `video_id` and an `upload_url`.
2. **Upload** — `POST https://rupload.facebook.com/video-upload/v25.0/{video_id}`
   with the file bytes (local file, or a hosted file by URL).
3. **Finish** — `POST https://graph.facebook.com/v25.0/{page_id}/video_reels` with
   `upload_phase=finish`.

**Resumable**: if the upload is interrupted, read `bytes_transfered` from the status
endpoint and resend with that value as `offset`.

**Status polling**: `GET /v25.0/{video_id}?fields=status` returns `video_status`
(`error`, `expired`, `processing`, `ready`, `uploading`, `upload_failed`,
`upload_complete`) plus `uploading_phase`, `processing_phase`, and `publishing_phase`,
each with its own `status` (`not_started` / `in_progress` / `completed` / `error`) and
an `error` message on failure. `publishing_phase.publish_status` is one of
`draft`, `error`, `published`, `scheduled`.

Documented upload errors: `OffsetInvalidError` ("Request starting offset is invalid"),
`PartialRequestError` ("Partial request (did not match length of file)"),
`ProcessingFailedError` ("Request processing failed").

**Finish-phase parameters** (from
[Graph API Reference: Page Video Reels](https://developers.facebook.com/docs/graph-api/reference/page/video_reels/)):
`video_id`, `upload_phase`, `video_state` (`DRAFT` | `PUBLISHED` | `SCHEDULED`),
`description`, `title`, `scheduled_publish_time`, `is_ai_generated`, plus feed-targeting
fields. **No music/audio parameter exists in this list** — see §6.

**Limits**: "You can only publish Reels to Facebook Pages", and the API is capped at
**30 API-published posts in a rolling 24 hours**.

---

## 3. Permissions and review

Sources: [Publish a Reel](https://developers.facebook.com/docs/video-api/guides/reels-publishing/),
[Access Levels](https://developers.facebook.com/docs/graph-api/overview/access-levels/) (retrieved 2026-08-24)

Permissions required: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`.
Uses a **Page access token**.

On App Review: Meta's access-levels doc says permissions with **Standard Access** "can
only be requested from app users who have a role on the requesting app," while
**Advanced Access** permissions "can be requested from any app user," and
"Business Verification is required to get Advanced Access."

**Interpretation (not a verbatim Meta statement):** for a self-serve tool where Wyatt is
an admin/developer/tester on his own app and an admin of his own Pages, Standard Access
should suffice — i.e. **no App Review and no Business Verification** for a personal /
agency-internal tool acting only on Pages the app's own role-holders administer. Review
and Business Verification become necessary the moment the tool acts on *clients'* Pages
where those clients are not role-holders on the app. I could not find a Meta page that
states this exemption in exactly those words for `pages_manage_posts`; the developer
docs site renders permission-reference pages dynamically and repeated fetches returned
the wrong permission's content. **Treat the exemption as UNCONFIRMED-but-likely** and
verify against the live app dashboard before relying on it.

---

## 4. Hard video specs (the part that binds the render)

Source: [Publish a Reel — Video API](https://developers.facebook.com/docs/video-api/guides/reels-publishing/),
"Video Specifications" table (retrieved 2026-08-24, Graph API v25.0)

| Requirement | Meta's stated specification |
|---|---|
| Container | `.mp4` (recommended) |
| Aspect ratio | `9 x 16` |
| Resolution | `1080 x 1920` recommended; **minimum `540 x 960`** |
| Frame rate | `24 to 60 frames per second` |
| Duration | `3 to 90 seconds` |
| Video codec | `H.264`, `H.265` (VP9 and AV1 also supported) |
| Chroma subsampling | `4:2:0` |
| GOP | `Closed GOP (2-5 seconds)` |
| Scan type | Progressive scan |
| Frame-rate type | **Fixed** frame rate (i.e. CFR, not VFR) |
| Audio codec | `AAC Low Complexity` |
| Audio bitrate | `128 kbps+` |
| Audio channels | Stereo |
| Audio sample rate | `48 kHz` |

The same page notes aspect ratios are accepted "between 16x9 and 9x16" — so 9:16 is the
tall extreme of the accepted band, not a tolerance range around it. Renders should hit
9:16 exactly; there is no documented numeric tolerance (Meta publishes no "±1%"
allowance), so whether 1080x1919 would pass is **UNCONFIRMED**. Render exact 1080x1920.

Documented resolution rejection error: **`#1363127` "The video you tried to upload has
resolution that isn't supported"** — fired for sub-minimum resolutions.

### Not stated by Meta for Facebook Reels

Genuinely absent from the Facebook Reels Publishing doc as of 2026-08-24:

- **Maximum file size.** Not published on the FB Reels API page. Third-party spec sheets
  variously claim 1 GB and 4 GB; they disagree and none cite a Meta page.
  **UNCONFIRMED.** For a 15–30s 1080x1920 render this is moot — any sane encode lands
  well under 100 MB.
- **Video bitrate.** No figure given for FB Reels. The bitrate row in Meta's table is the
  *audio* bitrate. **UNCONFIRMED.** The nearest primary anchor is Instagram's spec
  (below), which caps video at 25 Mbps VBR.
- **`moov` atom placement / edit lists.** Not stated on the FB Reels page.
- **Max horizontal pixel count, or whether >1080-wide is downscaled.** Not stated.

### Nearest primary cross-reference: Instagram Reels

Meta *does* publish these details for Instagram Reels, on the
[IG User Media reference](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/)
(retrieved 2026-08-24):

- Container: "MOV or MP4 (MPEG-4 Part 14), **no edit lists, moov atom at the front of the file**."
- Video codec: "HEVC or H264, progressive scan, closed GOP, 4:2:0 chroma subsampling."
- Audio codec: "AAC, 48khz sample rate maximum, 1 or 2 channels (mono or stereo)."
- Frame rate: "23-60 FPS."
- Video bitrate: "VBR, 25Mbps maximum." Audio bitrate: "128kbps."
- Duration: "15 mins maximum, 3 seconds minimum." File size: "300MB maximum."
- Max horizontal pixels 1920; aspect ratio 0.01:1–10:1, 9:16 recommended.

**These are Instagram numbers, not Facebook numbers.** They are included because they
come from Meta, because the two products share a transcoding pipeline, and because
`+faststart` / no-edit-lists costs nothing to satisfy. Do not quote IG's 300 MB or
15-minute figures as Facebook limits.

### The June 2025 "all videos are reels" change

Meta announced (2025-06) that "In the coming months, all videos on Facebook will be
shared as reels" and that "Reels on Facebook will also not have any length or format
restrictions" —
[about.fb.com](https://about.fb.com/news/2025/06/making-it-easier-create-videos-facebook/).

As of 2026-08-24 the **developer docs still state 3–90 seconds and 9:16**. The consumer
announcement and the API docs disagree, and the API docs govern an API upload.
**Assume the API's 3–90s / 9:16 constraints still hold.** For a 15–30s 9:16 reel the
conflict is irrelevant either way.

---

## 5. What makes an otherwise-fine mp4 get rejected or badly transcoded

Documented / directly sourced:

- **Resolution below 540x960** → error `#1363127`. (FB Reels API doc)
- **Duration outside 3–90s** → rejected. (FB Reels API doc)
- **Frame rate outside 24–60 fps** → rejected. (FB Reels API doc)
- **Aspect ratio outside the 16:9–9:16 band** → rejected. (FB Reels API doc)
- **Upload integrity failures** → `PartialRequestError` (byte count mismatch),
  `OffsetInvalidError` (bad resume offset), `ProcessingFailedError` (server-side
  transcode failure, surfaced in `processing_phase.error`). (FB Reels API doc)
- **Copyright**: Meta runs copyright checks on reels at publish. The Business Help Center
  page "Check for Copyrights Before Reels are Published on Facebook"
  ([help/173034088905071](https://www.facebook.com/business/help/173034088905071)) exists,
  but its body did not render to a fetcher — the *outcomes* (muted vs blocked vs removed)
  are **UNCONFIRMED** from primary source here. The operative risk is clear regardless:
  licensed music baked into the render can get the reel muted or blocked. See §6.

Strongly implied by the spec but **not stated by Meta as a rejection cause**:

- **Variable frame rate.** The spec says "Frame rate type: Fixed frame rate." Browser
  screen-capture output (Playwright / CDP screencast, or WebM from MediaRecorder) is
  characteristically VFR. Anything captured that way must be re-encoded to CFR.
  Outright rejection is unconfirmed; **bad transcode, stutter, and audio drift are the
  realistic failure modes** — and this is the single most likely way a headless-capture
  pipeline produces a technically-valid-but-wrong file.
- **Open GOP / long GOP.** Spec asks for closed GOP, 2–5s.
- **Non-4:2:0 pixel format.** `yuv444p` or 10-bit output will at best be re-transcoded.
  Force `yuv420p`.
- **`moov` atom at the end of the file.** Documented for IG, not FB. Free to satisfy
  with `-movflags +faststart`.
- **Letterboxing/pillarboxing baked into the frame.** Not a Meta-documented rejection,
  but a 16:9 render padded to 9:16 is a *quality* failure — the Reels UI overlays text
  and controls over roughly the bottom fifth and top of frame. Safe-area design belongs
  in the compositing spec; I could not confirm exact safe-area pixel values for organic
  (non-ad) Page reels from a Meta page. **UNCONFIRMED.**
- **Re-encoding loss.** Meta transcodes every upload regardless; there is no way to
  bypass it. Uploading a high-bitrate 1080x1920 master gives the transcoder headroom.

---

## 6. Music — the decisive finding for the audio strategy

**Audio must be baked into the uploaded file. There is no Facebook API for attaching
Meta's in-app licensed music to an API-uploaded reel.**

Evidence:

1. The Facebook Reels Publishing API's `upload_phase=finish` parameter list and the
   `POST /{page_id}/video_reels` reference contain **no music, audio, `audio_id`,
   `audio_name`, or sound-attachment parameter** of any kind.
   ([Reels Publishing](https://developers.facebook.com/docs/video-api/guides/reels-publishing/),
   [Page Video Reels reference](https://developers.facebook.com/docs/graph-api/reference/page/video_reels/))
2. Meta's consumer help for adding music to a reel states the feature "isn't available on
   computers" and lists only mobile devices — i.e. it is a **Facebook-app composer
   feature**, applied at creation time in-app.
   ([facebook.com/help/1221002915080894](https://facebook.com/help/1221002915080894/))
3. Meta *does* ship an audio-attachment API — but **for Instagram only**. The
   [Instagram Audio API](https://developers.facebook.com/docs/instagram-platform/content-publishing/audio-api/)
   "allows you to retrieve and search for audio — both original sounds from Instagram
   Reels and music — and attach them to Reels at creation time," via `audio_id`,
   `audio_volume`, `video_volume`. It is scoped to "the Instagram API with Facebook
   Login" and makes no mention of Facebook Pages.

The existence of an Instagram-only equivalent is strong evidence the Facebook side has
no counterpart. Meta does not state anywhere I found that "Facebook Reels API cannot
attach music," so this is an **inference from absence — high confidence, but an
inference**.

**Consequence for this effort's spec:** the renderer owns the soundtrack. It must mix
its own audio into the mp4 (AAC-LC / 48 kHz / stereo / >=128 kbps). That in turn means
the music must be **licensed independently of Meta** — royalty-free or owned tracks —
because baked-in commercial music forfeits the licensing the in-app library provides and
exposes the reel to the copyright check at publish. A silent render is a legitimate
option but performs poorly; that is a product decision, not a technical one.

Also: a reel already published cannot have music added afterwards; the consumer guidance
is to delete and re-upload. (Third-party sources; **UNCONFIRMED** against a Meta page,
though consistent with music being composer-time-only.)

---

## 7. Open items / things I could not confirm

- Maximum file size for a Facebook Reels API upload. Not published by Meta.
- Video bitrate ceiling or recommendation for Facebook Reels. Not published by Meta.
- Whether App Review / Business Verification are genuinely waived for a Standard-Access
  app acting on the developer's own Pages (§3). Inferred from the access-levels doc, not
  stated for `pages_manage_posts`; Meta's permission-reference pages did not render
  reliably to a fetcher on 2026-08-24.
- Exact aspect-ratio tolerance. No numeric tolerance published.
- Reels safe-area pixel dimensions for organic Page reels (UI overlay zones).
- Copyright-check outcomes (mute vs block vs takedown). Help Center page body did not
  render.
- Whether the June-2025 "no length or format restrictions" change has reached the API
  surface. The docs say no as of retrieval.

## Sources

- https://developers.facebook.com/docs/video-api/guides/reels-publishing/
- https://developers.facebook.com/docs/graph-api/reference/page/video_reels/
- https://developers.facebook.com/docs/graph-api/overview/access-levels/
- https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/
- https://developers.facebook.com/docs/instagram-platform/content-publishing/audio-api/
- https://about.fb.com/news/2025/06/making-it-easier-create-videos-facebook/
- https://facebook.com/help/1221002915080894/
- https://www.facebook.com/business/help/173034088905071 (title only; body did not render)
- https://www.facebook.com/business/m/one-sheeters/video-requirements
