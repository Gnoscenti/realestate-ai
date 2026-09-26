# CiteLock preview rollout — September 24, 2026

**Local authenticated execution completed. Hosted rollout remains blocked; provider acceptance is not green.**

## Workspace and database

Authoritative checkout: `Z:\home\ttroj\code\realestate-ai` / WSL `/home/ttroj/code/realestate-ai`.
Branch: `local/2026-09-08-flagship-preservation`; starting HEAD `c21bca6fbec87ba45f9a8279861701f64794c740`.
The source-backed guide work in `d825b75` is included. This run used the original product tree, not the older social/recognition integration lineage.

Task-owned PostgreSQL container: `realestate-ai-release-20260919`.
Verified target: **127.0.0.1:32770/realestate_final_test**. Port32770 is this container's current dynamic mapping; verify `docker port realestate-ai-release-20260919` before a later restart/reuse.
Private current connection file: `Z:\home\ttroj\code\realestate-ai\tmp\citelock-preview-20260924\database.env`.
Existing provider keys: `Z:\home\ttroj\code\realestate-ai\.env.local`.

The read-only preflight found all15 current migrations through `0016_citelock_guides.sql`, zero foreign names, zero pending migrations and51 public tables. **No migrations were applied.** The final check confirms migration names and applied timestamps are unchanged. The existing ledger stores filenames, not checksums; this run records current source hashes without asserting historical applied-byte identity.

The older `.git/integration-private/preview-db.env` points to a different, incompatible recognition/media lineage and was not used. A private250,293-byte pg_dump snapshot was saved before acceptance, SHA256 `7db48f5b486217497286e3a972d57c1a48c2fe4930833b98127695584c5f377a`. The backup contains local account data and is excluded from the shareable evidence package.

## Product changes and verification

Local changes implement explicitly declared aliases, persistent non-listing source settings, versioned prompts/evaluation, and conservative rejection of excluded or absent reported grounding. Julie's canonical name remains **Julie Pierce Casey**, with declared alias **Julie Pierce**. An alias match still needs an identity anchor; approved source URLs do not establish ownership.

The selected policy excludes MLS/IDX feeds, property listings/search pages, sold and rental pages. It permits recognized professional/regulator/ranking/biography/editorial URL forms plus explicitly approved exact non-property pages. Unclassified URLs fail closed. The policy constrains prompts and provider-reported source metadata; it cannot prove what undisclosed material a provider consulted.

Rejected returned answers/citations/sources remain available as evidence and do not count as positive recognition. Partial provider responses remain failures. Aliases and source URLs are not injected into unbranded discovery questions. Persisted restricted basket: `v2-expertise-nonlisting-v1`; evaluation method: `expertise-v2.2`; report algorithm: `visibility-2.3`.

Also fixed the other task's PGlite startup ENOENT by creating missing disk-directory parents. Production still refuses startup without PostgreSQL.

Verification:43 focused unit tests passed (40 visibility/policy/subject tests +3 real PGlite startup/persistence tests); TypeScript passed; changed-file ESLint passed; production build passed; whitespace check passed with the existing CRLF convention.70 browser assets passed a scan for configured secret values. Build provenance contains230 built-file hashes and the dependency-lock hash.

Changes remain local and uncommitted. No push, Vercel setting change, production migration, promotion, or publication occurred this turn.

## Actual authenticated acceptance

Production-mode local preview: `http://localhost:8136`, actual Better Auth sessions and native PostgreSQL, `VITE_AUTH_ENABLED=true`. Exactly OpenAI, xAI and Perplexity active. Gemini/RapidAPI/MLS/Stripe/OAuth-provider test integrations were disabled for this runtime.

Prepare completed with18 recorded checks. It created a synthetic local test account, redeemed a server-validated local beta code, proved entitlement-read failure hides the workspace, persisted/reloaded Julie's alias/source policy, built/exported a nine-step guide, and recorded a public biography observation. It also proved successful same-owner guide export followed by denial to another authenticated account and to an anonymous caller. Distinct actual session user IDs were checked. TanStack returns these application errors inside HTTP200; denial was established from the actual error payload with owner-positive controls.

The first preparation failure was a test-generated beta code exceeding the existing40-character validator. The fixture was corrected without weakening the application check. Two live-driver setup attempts ended before the exclusive live sentinel and before any baseline existed; their manifests are retained. The final driver verifies the saved subject instead of opening an unchanged editor.

Exactly **one** baseline was created:

`283a600d-ac93-4344-978b-311ed20b6577`

It contains21 observations: five unbranded questions plus two named checks per provider. It ended with **2 accepted /19 failed**, zero pending. There were28 grounded attempts: OpenAI14, xAI7, Perplexity7; no run exceeded two attempts. The live driver additionally proved that the batch owner can read the exact result request while a different authenticated account is denied.

| Provider / requested model | Accepted | Failed | Evidence |
| --- | ---: | ---: | --- |
| xAI / grok-4.6 | 2/7 | 5/7 | Both named checks mentioned and cited Julie with matching identity. All five unbranded runs rejected because some cited URLs were outside the conservative source rules. |
| OpenAI / gpt-5.5 | 0/7 | 7/7 | HTTP429 throughout bounded retries. Separate diagnostic confirmed `credit_balance_exhausted`, type `insufficient_quota`. |
| Perplexity Agent / openai/gpt-5.6-luna | 0/7 | 7/7 | Four incomplete responses and three excluded-grounding failures. Separate unchanged-setting diagnostic returned HTTP200, status `incomplete`, reason `max_output_tokens`. |

The accepted xAI identity response cited Julie's About page and the established RealTrends profile; the named license/brokerage response cited her About page. This establishes observed named recognition and citations, not independent current license verification or validation of every statement in the generated answer. **No defensible unbranded visibility rate or measured lift follows from this run.**

Some rejected xAI URLs are plausible non-property editorials/biographies outside the allow rules; do not describe every policy rejection as actual MLS use. Perplexity's returned retrieval metadata did include recognizable property-listing URLs. Raw returned sources are kept separate from inline citations.

Provider-reported baseline cost retained in successful adapter returns totals **$1.104394**. This is a lower bound, not a complete bill: incomplete Perplexity responses currently lose cost metadata when the adapter throws. Two additional explicit one-request diagnostics were recorded separately and did not change the baseline. No exact total cost is claimed.

## Julie guide and source scope

The guide freshly fetched the established About page and RealTrends public profile. It preserves the scoped wording: Julie Pierce Casey ranked No.1 by transaction sides among RealTrends-ranked agents in Rancho Santa Fe, based on2025 sales data. It flags her biography's **over $44M** against RealTrends' **$33.61M** as an unresolved scope/attribution/cutoff discrepancy. The numeric guide parser renders the first value as$44M; keep the original qualifier when presenting the claim.

The exact official brokerage profile remains unverified and was left blank. Historical DRE identifier01224815 is in the fixture, not a fresh regulator attestation. No guide step was marked complete, no publishing rights were asserted, and no social publication was recorded. The guide was exported for review.

## Hosted target and exact account inputs

Intended Vercel project: **cloud-realtor**, `prj_iTHheNQygwNcQGy20gfWS5uAKOUj`, repository `Gnoscenti/realestate-ai`.

September20 evidence records a READY build whose authenticated session failed because Preview lacked DATABASE_URL. September24 read-only project metadata access with the stored normal CLI credentials returned403. Current hosted state could not be reverified. Production provider setup from the other task is historical context; this run did not overwrite or retrieve Production secrets.

Required user actions before any external configuration change:

1. **OpenAI API account:** add credits to the organization behind the current OPENAI_API_KEY, or supply a funded project key privately. The actual error is `credit_balance_exhausted`; this is not merely a guessed rate-limit diagnosis. Billing page: https://platform.openai.com/settings/organization/billing/ . Do not purchase/change limits automatically.
2. **Vercel access:** complete normal `npx vercel login` in the Ubuntu repository shell with the account that can access cloud-realtor. The stored CLI access returned403. Once access works, confirm the actual stable Preview HTTPS origin and branch scope from Vercel metadata.
3. **Isolated hosted PostgreSQL:** provide its DATABASE_URL through a private file, separate from Production and the local Docker database. Prepared template: `Z:\home\ttroj\code\realestate-ai\.env.citelock-preview` (Git-ignored, mode600). No password belongs in chat.
4. **Preview provider scope:** decide whether to reuse the existing locally configured provider keys for Preview or supply separate preview-scoped OPENAI_API_KEY, XAI_API_KEY and PERPLEXITY_API_KEY in that template. Existing xAI and Perplexity credentials reached their APIs successfully. No MLS key or account is needed for this scope.

A unique stable Preview BETTER_AUTH_SECRET and local/server-held beta code can be generated by Codex; the user need not invent them. BETTER_AUTH_URL will use the verified Preview origin and VITE_AUTH_ENABLED remains true. The future write plan must show project/branch, exact key names and settings before application; it must not copy Production DB/auth/Stripe secrets.

Engineering follow-up owned by Codex: preserve provider error subtype/incomplete details/usage on failures, tune a separately versioned bounded Perplexity output budget (current2000 proved insufficient for the diagnostic), inspect excluded non-property sources individually before any rule expansion, and perform a separately identified rerun. Do not silently convert the failed baseline to success.

## Evidence and reproduction

Primary evidence folder: `C:\temp\citelock-preview-20260924`.
- `migration-preflight.json`, `final-invariants.json`, `backup-sha256.txt`.
- `authenticated-receipt.json`: exact stored prompts, subjects, models, surfaces, statuses, attempts, raw answers, citations, retrieved sources, evaluations, usage, timings and guide.
- `build-provenance.json`, `client-secret-scan.json`, source patch/new-file hashes.
- `acceptance-artifacts/evidence/2026-09-24T09-28-45-456Z-prepare/manifest.json`: completed prepare, guide export and screenshots.
- `acceptance-artifacts/evidence/2026-09-24T09-32-30-271Z-live/manifest.json`: completed live run and tenant replay evidence.
- `acceptance-artifacts/diagnostic-openai-2026-09-24T09-42-48-899Z.json` and `diagnostic-perplexity-2026-09-24T09-38-28-269Z.json`.
- `evidence-package-manifest.json`:232 copied files, SHA256 and a successful scan for known secret values. Private auth/runtime/session files and database dumps are excluded.

Reproduction scripts remain under ignored `tmp/citelock-preview-20260924/`; run from the original repository using Node22.23.2. `launch.mjs` explicitly loads existing keys and task-private DB/auth, then supports build, serve, prepare, live and capture. The live sentinel intentionally refuses another baseline; inspect durable state before an explicit future rerun. Do not delete it to force a duplicate.

The preview server and task-owned database are currently running on8136 and32770 respectively. No further provider calls are scheduled. Screenshot artifacts were captured, but independent image rendering was unavailable due a local tool ACL error; this report does not assert a visual/mobile review.