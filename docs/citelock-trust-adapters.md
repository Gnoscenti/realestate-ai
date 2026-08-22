# CiteLock trust adapters (P0 foundation)

This document covers the four production trust paths added for the San Diego
beta, replacing the curated fixtures called out in PR #31's P0 list.

## 1. Server-owned MLS/provider attestation

- Tables: `citelock_mls_connections` (one server-held connection per
  workspace; credentials never leave the server) and
  `citelock_listing_attestations` (append-only, server-minted).
- Module: `src/lib/aieo/attestation.server.ts`.
- Flow: save credentials on the MLS page ("Save for CiteLock server
  attestation"), then run "Run server attestation" on the CiteLock page. The
  server queries the RESO Web API `Property` resource itself (OData filters on
  `ListAgentMlsId` / `CoListAgentMlsId`, OAuth2 bearer or Trestle
  client-credentials — the same access model RESO's `web-api-commander`
  reference client exercises) and mints `server_attested` rows with durable
  attestation ids.
- Trust boundary: the aieo route strips any client-supplied attestation; only
  listings returned by `getMyAttestedListings` carry `trust:
  "server_attested"`, so the `listing-role` gate can only pass through the
  server path.

## 2. Independent production source (RealTrends)

- Module: `src/lib/aieo/realtrends.server.ts`; cache table
  `citelock_production_observations` (TTL, default 24h,
  `REALTRENDS_CACHE_HOURS` to tune).
- Modes:
  - Enterprise feed: set `REALTRENDS_API_URL` + `REALTRENDS_API_KEY`
    (normalized JSON: `{ year, salesVolumeUsd, transactionSides }`).
  - Public profile fallback: `safeFetch` of the RealTrends Verified profile
    page, parsed deterministically; anything ambiguous yields nothing.
- Discovery: the scan uses an explicitly submitted `realTrendsUrl` or a
  Person-bound `sameAs` link on the agent's site. No link → explicit
  `production_source_unlinked` outcome.
- Governance: same-period conflicts (e.g. site $44M vs RealTrends $33.61M for
  2025) block publishing via the existing `production-claims` gate AND are
  routed to `citelock_disputes` (`recordProductionDisputes` /
  `listOpenCiteLockDisputes` / `resolveCiteLockDispute`).

## 3. Persistent controlled Recognition runner

- Table: `citelock_recognition_runs` (append-only: prompt, provider, model,
  location, date, deterministic evaluation, citations); hourly batch quota in
  `citelock_recognition_quota_buckets`.
- Module: `src/lib/aieo/recognition.server.ts`.
- Providers are env-gated and fail closed — no key, no probe:
  - `XAI_API_KEY` (+ `XAI_RECOGNITION_MODEL`)
  - `OPENAI_API_KEY` (+ `OPENAI_RECOGNITION_MODEL`)
  - `ANTHROPIC_API_KEY` (+ `ANTHROPIC_RECOGNITION_MODEL`)
  - `GEMINI_API_KEY` (+ `GEMINI_RECOGNITION_MODEL`)
- Prompts come from the deterministic query plan of the subject's latest
  verified scan (probes refuse to run without one). Evaluation is string
  containment only; no model judges another model.
- `aggregateRecognition` keeps Recognition "insufficient" until ≥18 runs, ≥3
  providers, and ≥3 query families exist inside the 30-day window.
- ProofGuard dual-write (optional): set `PROOFGUARD_INGEST_URL` (+
  `PROOFGUARD_INGEST_TOKEN`) to mirror each stored batch as a normalized
  attestation event envelope. Failures never block the batch.

## 4. Durable database validation

```bash
DATABASE_URL='postgres://…' node scripts/validate-db.mjs
```

Applies pending migrations with the production migrator, verifies every
CiteLock table exists, and exercises insert/select/upsert paths inside a
rolled-back transaction (no synthetic rows persist). Validated against
Postgres 16, including the 0006 quarantine path for preview databases that
already held the first-draft `citelock_scans` table (legacy rows receive the
all-zeros subject fingerprint and are excluded from subject lookups).
