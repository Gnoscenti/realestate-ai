# Flagship implementation and operations

September 8, 2026. Companion: [activation and blocker register](activation-and-blocker-register.md). This document describes implemented behavior and the evidence needed for external activation. It is not a claim that production accounts are configured.

## Product and evidence boundaries

CiteLock's intended goal is to help an agent or broker understand visibility inside LLM answers. Its deterministic CiteReadiness score measures supported website/profile/listing/evidence signals. Its controlled San Diego Recognition panel captures answers from OpenAI, xAI and Perplexity, with persisted provider, model, exact prompt, prompt hash, location, date, response, citation metadata and methodology version. CA DRE and other identity signals must bind to the specific person; brokerage contacts and market inventory are not the agent's evidence.

The Recognition report shows provider successes/attempts, observed name mentions and answers containing provider citations. Provider failures are shown separately and are not scored as absent recognition. Citation presence does not establish that the agent's own website was cited. Differences use only comparable subject/panel/provider/model/location/query/prompt-hash evidence; no comparable prior run is explicitly different from no improvement. Readiness gaps are suggested hypotheses, not a guarantee or a causal result. The current methodology is `san-diego-v2-2026-09-08`; changed prompts/models require versioning.

Atomic panel reservation occurs before paid calls, with a three-panel/workspace/UTC-day cap and idempotent duplicate handling. Captures for a panel persist in one SQL statement. A failed or uncertain persistence attempt cannot silently replay paid calls. Captures have a composite scan/workspace foreign key and cannot be updated in place. No full live provider panel was observed during this integration because two credentials were unavailable.

Social's built-in studio accepts an agent-supplied marketing property and explicit photo-use permission. It validates JPEG/PNG/WebP bytes, byte/pixel/frame limits, decodes and re-encodes the image to strip metadata, and derives checksums/dimensions on the server. It exports a real 1080×1080 PNG with the complete photo and supplied title/address. It does not generate rooms or verify listing status, ownership, brokerage or pricing claims. The free beta allows ten exports/day and 100 MiB retained media/workspace. Images are stored privately in PostgreSQL; authenticated membership is required to read them. Anonymous reads return 401; another tenant sees 404.

Public uploads reserve a deterministic object path and cleanup intent before the external call. The journal survives deletion; a five-minute settlement window prevents cleanup racing an in-flight upload. Retained photos/exports use cursor pagination, and interrupted built-in jobs fail safely so a fresh export can run.

The optional paid renderer uses explicit public Blob delivery consent, approved source/output hosts, real audited Orshot template mappings, durable jobs, entitlement/quota checks and retained output. The app only reports a paid render complete after validating and retaining the actual PNG. Stripe has a separate social subscription flow and signed lifecycle webhook; a Checkout return never grants entitlement. Video remains Setup required. Direct publishing remains Planned. Download and manual posting is the working path.

## Running locally with durable storage

Use Linux Node 22+ and the repository lockfile. The integration was tested with Node 22.23.2/npm 11.19.0; the existing CI uses npm 10.9.8 and the lockfile supports both npm 10.9.8 and 11.19.0 and Vercel is configured for Node 24, which was not independently exercised locally. Avoid accidentally invoking Windows npm from WSL.

For a new environment, provision a dedicated PostgreSQL database, copy `.env.example` into an ignored local env file, replace configuration examples, and keep all server credentials unprefixed by `VITE_`. At minimum use a real `DATABASE_URL`, a generated `BETTER_AUTH_SECRET`, `VITE_AUTH_ENABLED=true`, and a `BETTER_AUTH_URL` matching the local origin. Run:

```bash
npm ci
node --env-file=.env.local scripts/migrate.mjs
node --env-file=.env.local node_modules/vite/bin/vite.js --host 127.0.0.1 --port 8136
```

`npm run build` also runs the migration script when DATABASE_URL is available to that process. Real PostgreSQL migrations are not automatically applied on every request; explicitly run them against the intended environment. With no DATABASE_URL, local development/tests may use in-memory PGLite; its state is not durable through process restart. Production refuses that fallback and also refuses a missing auth secret. A successful build without DATABASE_URL is not a database rollout or working hosted-preview acceptance.

On this machine, the task-owned acceptance container and volume are both named `realestate-ai-acceptance-20260908`, PostgreSQL 16, bound to `127.0.0.1:55432`, limited to 256 MiB RAM and one CPU. Its generated connection/auth values are stored mode 0600 at `/home/ttroj/code/realestate-ai/.git/integration-private/preview-db.env`; never commit or publish that file. The integration checkout is `/home/ttroj/code/realestate-ai-social-2026-09-08`. To reuse the acceptance database:

```bash
export PATH=/home/ttroj/.nvm/versions/node/v22.23.2/bin:$PATH
cd /home/ttroj/code/realestate-ai-social-2026-09-08
docker start realestate-ai-acceptance-20260908
node --env-file=/home/ttroj/code/realestate-ai/.git/integration-private/preview-db.env scripts/migrate.mjs
VITE_AUTH_ENABLED=true BETTER_AUTH_URL=http://localhost:8136 \
  node --env-file=/home/ttroj/code/realestate-ai/.git/integration-private/preview-db.env \
  node_modules/vite/bin/vite.js --host 127.0.0.1 --port 8136
```

Check that port 8136 is free first. Existing listeners/worktrees belong to other work; do not terminate or reset them. The local database contains test users and clearly labeled acceptance assets, not licensed real listing evidence. Its generated browser session is private and is not included in delivery artifacts. Stop the named container when no longer needed; retain the volume until the evidence/data is intentionally retired.

## Manual acceptance sequence

1. Sign up/sign in, confirm the persisted user session, and enter the existing pre-launch access flow. A beta code is app access, not a paid social entitlement.
2. Open `/marketing`, create a property with truthful agent-supplied title/address, and confirm photo-use permission. Upload a rights-cleared actual image under 2 MiB.
3. Select the uploaded photo and export the square PNG. Inspect the output visually, download it, compare server byte count/hash and inspect private cache headers.
4. Reload and open Retained image exports. Confirm the same output. Verify an anonymous request gets 401 and another workspace user gets 404.
5. Delete a studio-created property and confirm its media/jobs/exports are unavailable and storage usage is released. If optional public Blob delivery was used, inspect pending deletion and retry it; do not claim public erasure until the provider confirms it.
6. Restart the app and database, then verify the same session, scan history and stored byte hash. Use dedicated fixtures to test quotas/concurrent duplicates without unnecessary paid provider calls.
7. Open `/aieo`, create/read a scan, inspect subject-specific history and evidence gaps. Complete the actual three-provider panel only after all credentials are configured, following the blocker register.

Observed authenticated acceptance used the repository aerial test asset. Its retained PNG was 1,769,323 bytes with SHA-256 `24cfdaecb59476aab94877c57f9e958686f8e5aaecd7117377c551e5f8171998`; the same user session, bytes/hash and retained-history UI survived database/app restart. This establishes the implemented local path, not hosted deployment, listing rights or live provider behavior.

## Test commands and interpretation

```bash
npm run typecheck
npm run test:unit -- --maxWorkers=1
npm run build
npx playwright install chromium
npm run test:e2e
npm audit
```

The integration's strongest completed flagship gate: 285 unit tests in 35 files, all 15 Playwright tests, typecheck and production build passed. Tests include actual image decoding/rendering, quota concurrency, atomic evidence persistence, tenant isolation and signed Stripe payload validation. Full browser tests use the repository's isolated auth-disabled test mode; separate manual browser acceptance used real Better Auth and PostgreSQL. Stripe objects/signing keys in tests are explicitly synthetic; no live payment/webhook is inferred. Unit tests against actual PostgreSQL separately passed 21 CiteLock/CSV and six social/billing cases.

Dependency audit reported zero known vulnerabilities after compatible updates and a narrow `xcode`→`uuid@11.1.1` override. Xcode's actual UUID generation API produced 1,000 valid unique values. This is not an iOS archive/signing/App Store check; that requires the existing macOS delivery path.

## Migrations and rollout

| Filename | Purpose | Evidence/status |
| --- | --- | --- |
| 0001_auth.sql–0004_voice_foundation.sql | Existing auth/workspace/inventory/base voice schema | Retained unchanged from integrated foundation; present in local acceptance DB |
| 0006_citelock_scans.sql | Persistent CiteLock scans | Original #31 number retained; local PostgreSQL verified |
| 0007_citelock_recognition_runs.sql | Captured Recognition evidence | Original #31 number retained; local PostgreSQL verified |
| 0009_social_media_renders.sql | Tenant jobs/assets/entitlements | #30 number retained; local PostgreSQL verified |
| 0013_citelock_panel_reservations.sql | Atomic panel budget and evidence integrity | Added and locally applied |
| 0014_managed_listing_media.sql | Private bytes, quotas and optional public deletion queue | Added and locally applied |
| 0015_social_stripe_lifecycle.sql | Customer/event/checkout binding | Added and locally applied; no live Stripe acceptance |
| 0016_public_media_operations.sql | Durable pre-upload object identity and deletion intent | New forward migration; local acceptance only |

Gaps in numeric prefixes are intentional; migration identity is the full filename. Preserved local alternate 0007–0010 migrations are not silently imported. #29's six voice files must remain unrenumbered until production nonapplication is proved. When that proof exists, the next free range after current main is 0017–0022, subject to a fresh main check. Never edit an applied migration to change semantics; add a forward migration. Do not deploy the deferred voice branch or run its migration directory against production while this gate remains open.

## Reconciliation of preserved local work

All original tracked and untracked nonignored work was committed on `local/2026-09-08-flagship-preservation` at `23dbf3f31bd8fc094a07e4170d7aed3f23810701`. Original staged/unstaged patches and the complete status/commit inventory are in the integration audit. Ignored credentials were not committed. The independent RapidAPI worktree was untouched.

| Local change group | Integration decision |
| --- | --- |
| Saved-client preservation / seed cleanup | Ported the corroborated defect fix: hydration no longer deletes real clients based on a 555 number or a name collision; explicit synthetic IDs only |
| Production auth/database safeguards | Ported fail-closed requirements; no ephemeral-production bypass |
| Alternate unbranded xAI discovery/visibility engine | Preserved, deferred; it measures a different discovery process and must not replace or contaminate the controlled three-provider panel |
| SocialDesk/Postiz captions/publishing | Preserved, deferred pending full OAuth/token/revocation/publish audit; does not justify changing Planned copy |
| RapidAPI observations, trust adapters and alternate migration prefixes | Preserved for a separate licensed provenance review; not imported as verified MLS/production-volume/RealTrends evidence |
| Broader UI/app-entitlement changes and historical delivery claims | Preserved; not wholesale applied over the explicitly approved stack. Current claims are reconstructed from merged code and fresh evidence |
| CRLF/format-only changes | Preserved in the snapshot; avoided as unrelated integration churn |

The original checkout can be changed by other local tasks. The named preservation commit remains the immutable recovery point; do not reset that checkout merely to match this report.

## Operations still required

Hosted database backup/restore, provider spend monitoring, production auth/provider callback verification, live Orshot layer audit, Blob public delivery/deletion, live Stripe checkout/webhooks, administrative cleanup after any future workspace deletion flow, a video worker and social OAuth publishing are not completed. See the blocker register for exact next actions and working alternatives. Voice remains a draft with external release gates and migration-history work; it is not part of the flagship runtime.
