# RealEstate AI — Agent OS

An authenticated workspace for real estate professionals, focused on CiteLock visibility evidence and actual-photo social images. The current controlled Recognition panel covers San Diego. Web and Capacitor/iOS share the product foundation.

**Release status:** the integrated code and local durable PostgreSQL workflows are tested. Hosted production activation and live external-provider acceptance remain incomplete. [Implementation and operations](docs/flagship-operations.md) explains the evidence; [activation and blocker decisions](docs/activation-and-blocker-register.md) records the remaining steps, costs and working alternatives.

## Product surface

| Module | Implemented behavior and limits |
| --- | --- |
| **CiteLock Readiness** | Deterministic evidence-based readiness, CA DRE/person-binding checks and explicit gaps. It is not an LLM ranking or verified sales-volume claim. |
| **CiteLock Recognition** | Controlled OpenAI/xAI/Perplexity API panel with persisted prompt hashes, responses, provider citations, per-provider results and comparable history differences. All three credentials are required. No live three-provider acceptance has yet been observed for this release. |
| **Actual-photo image studio** | Authenticated upload, server image validation/checksum, private durable retention, actual 1080×1080 PNG export and deletion. Free beta: ten exports/day and 100 MiB/workspace. Agent confirms permission; this does not verify MLS role or listing status. |
| **Paid social rendering** | Orshot job/entitlement/host/template boundary, optional public Blob delivery, retained output, Stripe Checkout/portal/signed lifecycle webhook. Setup required until the real accounts, template layers and billing flow pass acceptance. |
| **Video / direct publishing** | Video: Setup required. Publishing: Planned. Download images and post manually. |
| **Authorized comps** | Role-gated, tenant-scoped Closed/Sold CSV import with permission/provenance requirements. No live RESO feed is enabled. Valuation/pricing advice stays gated where an authorized matcher is unavailable. |
| **Assistant** | Authenticated Vercel AI Gateway assistant with server quotas and truthful data limitations. No fictional MLS/AVM claims or generative property-image endpoint. |
| **Outreach** | FAQ answers with copied disclaimer; showing follow-up with explicit property selection and complete email subject/body. Users review and send messages themselves. |
| **Calendar / knowledge / inventory** | Local calendar without OAuth and static curated knowledge. Supplied or discovered records do not establish independently verified listing representation. |
| **Billing** | Existing one-time app-access flow is distinct from the new paid social subscription. Beta codes do not grant paid rendering. Live account activation is environment-dependent. |
| **Voice** | Deferred draft #29, outside the flagship runtime, pending provider, billing, broker/counsel, worker and migration-history gates. |
| **iOS / Capacitor** | Shared UI and native bridges. A signed production archive still needs the macOS delivery path in [IOS.md](IOS.md). |

## Run and verify

Use Linux/macOS Node 22+ and the checked-in lockfile. Package metadata requests npm 12; this integration's local gate used Node 22.23.2/npm 11.19.0. Vercel currently selects Node 24.

```bash
npm ci
# Configure an ignored .env.local from .env.example, including a dedicated DB.
node --env-file=.env.local scripts/migrate.mjs
node --env-file=.env.local node_modules/vite/bin/vite.js --host 127.0.0.1 --port 8080
```

Keep `VITE_AUTH_ENABLED=true`, set `BETTER_AUTH_URL` to the actual origin, and supply a generated `BETTER_AUTH_SECRET` plus durable `DATABASE_URL`. Provider keys are server-only and must never use the `VITE_` prefix. Development/tests without a database may use ephemeral PGLite; production refuses that fallback. `npm run build` also runs migrations when DATABASE_URL is in its environment. A green build without a database is not a completed deployment.

```bash
npm run typecheck
npm run test:unit -- --maxWorkers=1
npm run build
npx playwright install chromium
npm run test:e2e
npm audit
```

The flagship acceptance gate passed 273 unit tests, all 15 browser tests, typecheck and build. Separate authenticated PostgreSQL acceptance verified private image upload/export, tenant isolation and identical retained bytes/session after database/app restart. Stripe test objects are synthetic; external provider acceptance is not implied. See the operations document for the verification matrix and reproduction details.

## Configuration and layout

`.env.example` documents auth, Gateway, the three Recognition providers, Orshot template/host mapping, optional Blob delivery and the separate social Stripe lifecycle. No template example is a live audited template. Missing external configuration must keep the corresponding capability unavailable.

```text
src/components/   Product UI and truthful loading/empty/success/error states
src/lib/aieo/     CiteReadiness, provider capture, evidence and persistence
src/lib/social-media/ Uploads, renderer, durable jobs, quotas and billing
src/routes/       TanStack pages and authenticated/webhook HTTP endpoints
migrations/       Filename-tracked PostgreSQL schema; do not rename applied files
tests/            Unit/integration and Playwright browser verification
docs/             Operations, activation decisions and architecture
```

Private/proprietary unless otherwise stated by Gnoscenti.
