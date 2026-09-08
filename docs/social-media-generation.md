# Actual-photo social media generation (Issue #19)

## Objective

Give a signed-in premium user two one-click actions in **Social Media**:

- **Generate Social Image** applies broker-approved text and graphics to actual
  photos already attached to a server-saved listing.
- **Generate Social Video** is the reserved workflow for a CapCut-style property
  slideshow. It remains visibly `setup_required`; the app does not claim or link
  to a video until a real CutCLI cloud render succeeds.

Direct social publishing is planned, not connected. Users review and download an
image before posting it themselves.

## Non-negotiable media rule

The API accepts `listingId` plus `listing_media.id` values only. It never accepts
a photo URL, upload body, prompt, or arbitrary Orshot modification from a client.
The server resolves the records inside the signed-in user's workspace and the
database enforces the job -> media -> listing -> workspace relationship.

Only public HTTPS photos on `SOCIAL_MEDIA_PHOTO_HOST_ALLOWLIST` can render. An
empty allowlist disables rendering. Each `listing_media` row must also contain an
exact approved raster MIME (`image/jpeg`, `image/png`, `image/webp`, or
`image/avif`) and verified positive width/height no larger than 5,000 pixels.
Unknown types, SVG, GIF, missing dimensions, and oversized images fail closed.
The 5,000-pixel cap is a conservative pipeline boundary aligned with Orshot
Studio's documented maximum render dimension; production import must normalize
larger camera originals before making them eligible. Private storage keys remain
unavailable until the app has a real short-lived signed-URL adapter. This is safer
than guessing a bucket URL or silently making a private object public.

Server-owned `listings` and `listing_media` records are a prerequisite. The
renderer intentionally ignores the browser's legacy Zustand/sample inventory.
The `/properties` and `/mls` screens can help users start listing setup, but those
records must be persisted through an authorized server import before the social
media card will show them.

## Orshot production contract

The adapter uses Orshot's documented Studio endpoint only:

`POST https://api.orshot.com/v1/studio/render`

Authentication is `Authorization: Bearer <ORSHOT_API_KEY>`. The request asks for
one PNG URL (`includePages: [1]`) and reads only `data.content`. See the official
[Studio render API](https://orshot.com/docs/api-reference/render-from-studio-template)
and [modifications reference](https://orshot.com/docs/definitions/modifications).

`ORSHOT_TEMPLATE_MAPPINGS` is a server-side JSON allowlist. The browser receives
only a friendly key/label and never a template ID or parameter mapping. Example:

```json
{
  "defaults": [
    {
      "key": "modern",
      "label": "Modern",
      "templateId": 12345,
      "photoKeys": ["hero_photo", "detail_photo"],
      "allImageLayersUseListingPhotos": true,
      "fields": {
        "address": "address",
        "price": "price",
        "bedrooms": "beds",
        "bathrooms": "baths",
        "sqft": "sqft"
      },
      "outputSize": "instagram-post"
    }
  ],
  "workspaces": {
    "personal:USER_ID": []
  }
}
```

An exact `workspaces[workspaceId]` entry overrides `defaults`. All photo slots are
filled with selected property photos (the lead photo repeats if necessary), so a
template cannot leak a stock property image. The required
`allImageLayersUseListingPhotos: true` flag is an administrator attestation made
only after visually auditing that the exact Orshot template has no unmapped
stock, generated, or other property-image layer. Parameter names containing
prompt, AI, or generation tokens are rejected. `ORSHOT_OUTPUT_HOST_ALLOWLIST` must also
name the confirmed host used by this Orshot account's returned render URLs.

No provider request runs unless all of the following are true:

1. The Better Auth session is valid.
2. The listing and every selected media ID belong to the same server workspace.
3. A verified `workspace_entitlements` row exists for product `social_media`,
   with active/trialing status, Stripe IDs, a current period, and a hard limit.
4. The atomic period quota reservation succeeds.
5. The workspace template and photo/output hosts are explicitly allowlisted.

Client UUIDs are idempotency keys. The browser preserves one UUID in session
storage for an unchanged listing/template/photo-order intent across a lost
response, transport retry, or page refresh. A retry with an identical payload
returns the existing job and never repeats a provider call. Setup also
quarantines stale processing jobs and restores the user's most recent image job.
The UI polls that durable job status without submitting another render.
The database has a unique active image-intent lock, so two tabs cannot create two
processing/uncertain jobs for the same user intent. Job claim and all ordered
media attachments are one SQL statement; an attachment failure rolls back the
claim. The UUID resets when that intent changes or the user explicitly starts a
new completed/definitively failed/blocked render. A rate-limited or other
terminal `failed` job can therefore be restarted explicitly, as can a blocked
job after its entitlement or quota is resolved; an `attention_required` job
cannot, because its provider outcome is uncertain. Network timeouts, provider 5xx,
or invalid successful responses become `attention_required` because Orshot may
already have consumed a credit. These jobs are not automatically retried.
Quota reservation rechecks the current entitlement status, Stripe identifiers,
billing period, limits, and current time while locking both the entitlement and
uncharged job rows. The counter and job's charged marker are written in that same
SQL statement. Completion similarly locks the charged processing job before it
creates an asset and changes status; quarantine winning that lock creates no
asset, while completion winning it atomically records both asset and completion.
A `processing` job still present after two minutes is also quarantined as
`attention_required`, covering a function termination between claim and result.

## CutCLI hold point

CutCLI's current site says cloud rendering uses the `cut_cli` SDK/CLI and warns
agents not to hand-build cloud API calls. Its current shared backend/auth flow and
draft construction require local files before upload. See the official
[CutCLI site](https://cutcli.com/) and
[Node SDK overview](https://docs.cutcli.com/reference/api).

This change therefore includes only a deterministic, no-network provider seam.
The disabled UI and authenticated endpoint return `setup_required` without
persisting a placeholder job or consuming quota, and never call the
guessed/retired `https://cutcli.com/api/render` URL.
Before enabling live video, complete all of these:

1. Install and pin the current `cut_cli` package from the verified publisher.
2. Use a dedicated CutCLI test account and `sk-...` key.
3. Build a slideshow using only server-resolved, allowlisted listing photos.
4. Prove draft filesystem creation, upload, polling, timeout, and cleanup inside
   the selected Vercel runtime (or move the worker to a durable compute service).
5. Validate returned CDN hosts, add an output allowlist, and record usage costs.
6. Add a durable queue/worker and idempotent provider-job reconciliation.

## Operations

Required image environment variables:

- `ORSHOT_API_KEY`
- `ORSHOT_TEMPLATE_MAPPINGS`
- `SOCIAL_MEDIA_PHOTO_HOST_ALLOWLIST`
- `ORSHOT_OUTPUT_HOST_ALLOWLIST`

Optional safeguards:

- `SOCIAL_MEDIA_MAX_RENDERS_PER_PERIOD` (default `50`, maximum `1000`)
- `ORSHOT_TIMEOUT_MS` (default `25000`, bounded to 5–50 seconds)

Do not put any of these behind `VITE_`. Redact provider credentials and photo
URLs from logs. A future Stripe webhook must be the only production path that
activates/renews the `social_media` entitlement row.

## Remaining prerequisites — keep Issue #19 open

This is a safe draft foundation, not a claim that Phase 0 or the full objective is
live. Keep Issue #19 open until server listing/photo import (or Blob upload) can
inspect and normalize the actual bytes, persist verified MIME and dimensions,
and add missing byte-size and checksum metadata. The current `listing_media`
schema has neither byte size nor checksum, so URL strings and import claims alone
are not sufficient provenance. Also required: verified Stripe activation, real
Orshot template IDs/output hosts, a documented all-image-layer template audit,
and a successful production smoke render. Keep
the video portion open until the CutCLI/Vercel checks above pass and a durable
worker is deployed.
