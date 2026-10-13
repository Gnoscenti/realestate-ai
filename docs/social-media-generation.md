# Actual-photo social media and reviewed distribution

Updated September 26, 2026 for the integrated flagship branch. See the
[integration ledger and current verification](INTEGRATION-2026-09-26.md).
Earlier September 8 foundation notes and September 20 preservation-branch reports
are dated evidence for their respective trees; their missing-feature statements
are not the current integrated capability list. This document describes code and
local verification, not live Orshot, Stripe, Postiz or hosted acceptance.

## Working image-to-handoff workflow

The authenticated **Social Desk** combines an actual-photo studio with durable,
revisioned drafts and independent facts/rights approval:

1. Save an agent-supplied marketing property and confirm permission to market it
   and use its photos. This does not verify ownership or an MLS listing role.
2. Upload a JPEG, PNG or WebP up to 2 MiB. The server checks signatures, decoded
   format, frame count and the 24-million-pixel limit, rotates/normalizes the photo
   to at most 2,400 pixels per side, removes embedded metadata, and records verified
   dimensions, byte size and original/normalized SHA-256 checksums.
3. Export a real 1080×1080 PNG using the full photo plus the supplied title/address.
   The free beta permits ten exports per workspace per UTC day and 100 MiB of
   retained media. Private PostgreSQL storage and authenticated image delivery
   work without Orshot, Stripe, Blob, model keys or public photo URLs.
4. Attach the new export or an earlier retained export to a Social Desk draft.
   Supply/review the factual caption, save the revision, and explicitly approve
   facts, rights and text. Optional xAI caption drafting is separate and requires
   its server key and entitlement. Edits invalidate approval.
5. Download the approved image and exact caption, or use file sharing where the
   browser supports it. Record a platform-validated URL after manual posting; the
   resulting status is **Posted (reported)**, not provider-confirmed publication.
   The copy/share/text-export endpoint rechecks current approval/revision, linked
   CiteLock source permissions and managed image availability.

Drafts accept at most four combined public image URLs and managed image IDs.
Managed attachments are resolved inside the authenticated workspace at save,
edit, approval, handoff and dispatch. Missing/deleted/foreign assets fail closed.
Text source links and attribution notes are review metadata; any required public
link/disclosure must appear in the exact caption before approval.

Retained images survive reload and use cursor pagination. Deleting a studio
property removes private photos and exports and releases storage usage. Optional
public copies have a durable cleanup journal and visible retry state; a private
record deletion is not proof that a pending public Blob copy has been erased.

## Server-owned photo boundaries

Built-in and paid render requests accept server-owned listing/media IDs, not a
client-selected URL, prompt or arbitrary template modification. The separate
upload endpoint accepts photo bytes with explicit rights confirmation and verifies
them before the photo becomes renderable. The rendering APIs ignore legacy browser
sample inventory as proof of listing/media ownership.

The **optional paid Orshot renderer** requires public HTTPS source URLs on
`SOCIAL_MEDIA_PHOTO_HOST_ALLOWLIST`; an empty allowlist disables that paid path.
Eligible media needs exact approved raster MIME (`image/jpeg`, `image/png`,
`image/webp`, `image/avif`) and positive verified dimensions no larger than 5,000
pixels. SVG/GIF, missing dimensions and unsupported records fail closed. The
studio can explicitly create a public Blob copy only when the user consents and
the configured hostname is allowlisted. It does not guess a public URL from a
private storage key. The private built-in path and private-byte Postiz upload do
not require this public source delivery.

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

## Optional Postiz distribution

The agent connects their own Postiz workspace; Postiz holds the underlying social
platform authorizations. The app stores its workspace-scoped API credential using
AES-256-GCM with `SOCIAL_CONNECTION_SECRET` or the stable `BETTER_AUTH_SECRET`,
checks available channels, and supports disconnect, schedule/dispatch and status
refresh. Keep that encryption secret stable; changing it without migration makes
existing stored connections unreadable. These are implemented controls, not proof
of actual account authorization or token/revocation behavior at a live provider.

Dispatch reserves/freezes the approved revision before contacting the provider.
Public URLs use bounded safe image fetching. Managed private photos/exports are
resolved within the workspace and uploaded as bytes directly to Postiz, without
creating a public Blob URL. Source permissions and managed image availability are
checked again after media transfer and before creating the post. Instagram
requires an image. A definite rejection restores reviewable approved content;
an uncertain request remains frozen and is not blindly replayed. Status refresh
cannot overwrite a confirmed terminal result with an older pending response.

No authorized live Postiz publication was performed in the September 26
integration. Before activation, use an explicitly authorized test account/channel
and verify connection, correct image/caption, schedule versus immediate dispatch,
independent live post read-back, key revocation, disconnect and status recovery.
An uncertain outcome without a provider post ID requires inspection in Postiz;
there is no automatic no-ID reconciliation. Manual image/caption handoff is the
working alternative.

## CutCLI hold point

The September 8 foundation review recorded that CutCLI's site said cloud rendering uses the `cut_cli` SDK/CLI and warns
agents not to hand-build cloud API calls. That review recorded that its shared backend/auth flow and
draft construction require local files before upload. See the official
[CutCLI site](https://cutcli.com/) and
[Node SDK overview](https://docs.cutcli.com/reference/api).

The integrated app still includes only a deterministic, no-network provider seam.
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

## Operations and paid activation

The free studio/manual handoff requires a deployed authenticated app, stable auth
secret and migrated persistent database. It makes no external renderer request.
Follow the current [integration rollout notes](INTEGRATION-2026-09-26.md) for
migration history reconciliation and environment-specific verification.

Required paid-image environment variables:

- `ORSHOT_API_KEY`
- `ORSHOT_TEMPLATE_MAPPINGS`
- `SOCIAL_MEDIA_PHOTO_HOST_ALLOWLIST`
- `ORSHOT_OUTPUT_HOST_ALLOWLIST`
- `BLOB_READ_WRITE_TOKEN` for explicitly consented public renderer sources

Paid billing uses `STRIPE_SECRET_KEY`, `STRIPE_SOCIAL_PRICE_ID`,
`STRIPE_SOCIAL_WEBHOOK_SECRET`, `SOCIAL_BILLING_RETURN_ORIGIN` and
`SOCIAL_MEDIA_INCLUDED_RENDERS`. The signed raw-body endpoint is
`/api/webhooks/social-stripe`. Customer/workspace binding, event deduplication,
current subscription lookup, price/quantity/mode checks and paid-entitlement
revocation rules are implemented. Checkout returns and beta access codes do not
grant paid render entitlement. Synthetic webhook/signature tests do not establish
live payment, cancellation, refund or billing-operation acceptance.

Optional renderer safeguards:

- `SOCIAL_MEDIA_MAX_RENDERS_PER_PERIOD` (default `50`, maximum `1000`)
- `ORSHOT_TIMEOUT_MS` (default `25000`, bounded to 5–50 seconds)

Keep all provider/billing/connection secrets server-only, without `VITE_` prefixes.
Do not log photo URLs or credentials. Complete paid activation using a dedicated
test environment, audited template layers and exact output hosts, a real retained
PNG smoke render, signed Stripe lifecycle delivery and explicit production
rollout approval. Neither the implementation nor a configured template ID proves
that those live checks happened. Video remains `setup_required` pending the
worker/SDK gates above; no generative property imagery is reintroduced.

## Legacy saved browser campaigns

Existing browser campaign data remains preserved in the browser store. When it
is present, Social Desk shows **Saved browser campaigns** with a Markdown download
for each campaign. The export includes the readable campaign plus the original
saved fields as JSON, including media references, for recovery. Downloading does
not mutate the original or create/publish a server draft.

Local approval, schedule and post statuses are explicitly unverified. There is no
automatic import or publication. Any future import must create a fresh unapproved
draft, retain source context and require explicit facts/rights review; historical
local statuses are not proof of external publication or authorization.
