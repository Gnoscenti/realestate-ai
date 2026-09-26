# Flagship integration — September 26, 2026

## Current release decision

The existing main and preserved local product work are combined on `integration/2026-09-26-flagship`, starting from main `907214abc877aae3e0de46c0943eb58cf263bb07` and preserved local `34c784b7f9b44c50fce2d10cc5d8fde0e0bac705`. This is a release candidate, not a claim of hosted acceptance. Production merge/autodeployment remains held until the real target schema and backup/migration readiness can be verified. Existing CLI access returns403; deployment metadata alone does not prove the database is ready.

## Repo map and preservation

Authoritative original checkout: `/home/ttroj/code/realestate-ai`. Work is isolated in `/home/ttroj/code/realestate-ai-integration-2026-09-26`. TypeScript/React/TanStack Start/Vite/Nitro; PostgreSQL in production, persistent local PGlite, authenticated workspace APIs. Main's secured Gateway/OIDC assistant, authorized Closed/Sold import, reviewed outreach and actual-photo storage/rendering remain.

Initial branch `local/2026-09-08-flagship-preservation` at c21bca6 had four commits absent from main and14 changed paths, with no stashes. All14 were committed unchanged on named branch `local/2026-09-26-citelock-source-policy` as34c784b before the integration merge. Earlier branch/commits remain. The existing FLAGSHIP-LEDGER.md was consulted and is retained; its dated provider/test claims are not current verification.

## Product outcome

- CiteLock retains the source-backed free/paid guide, saved subject/evidence workflow, versioned grounded observations, page improvements, review and verified publication handoff. Main historical Recognition APIs remain tenant-scoped; paid calls now require entitlement. No measured lift or consumer-app ranking is inferred.
- Provider failures retain partial answers, reported citations/sources, usage, known cost, safe status/subtype and incomplete reason. Exhausted quota is not retried as ordinary throttling. Perplexity uses a bounded6000-token output policy with a separately versioned persisted surface; old observations cannot silently become comparable.
- The older numeric RealTrends scan adapter was not person-bound. It remains disabled for attestation with an explicit source-subject-unverified result. The separate identity-and-locale-bound instructional guide remains available. No pricing, MLS or unsupported numeric claim gate was weakened.
- Social Desk joins durable actual-photo uploads/PNG exports to persisted drafts, exact-revision fact/rights review, manual handoff/receipts and optional guarded Postiz dispatch. Private image bytes can be handed to an authorized scheduler without making the image public. Tenant ownership/deletion/source permission are rechecked; changing attachments invalidates approval.
- Existing browser campaigns remain preserved and can be downloaded for recovery. Historical local statuses are not treated as provider publication evidence.
- Main's sold-record library and #34 property/subject/disclaimer/FAQ fixes remain. Local factual comparisons and exports do not invent condition or list-price advice.

## Migration ledger

All historical SQL filenames and normalized contents are retained; main SQL bytes are unchanged and shared local CRLF differences are recorded; numeric-prefix collisions between the two previously used lineages are documented rather than concealed by unsafe renumbering.

`0005_integrated_lineage_compatibility.sql` is intentionally a compatibility prelude before imported0007. It recognizes the old local recognition schema, renames that table to `citelock_legacy_recognition_runs`, preserving its rows and freeing the primary-key name. Main's historical0007 then creates its different, scan-bound schema. Unknown schemas or an existing archive collision fail closed. No scan/panel identity or historical measurement is fabricated for archived evidence. Fresh/main databases are no-ops at the prelude.

`0017_managed_media_overlay_review.sql` is the new integration security migration: persist exact rendered overlay labels for review. It does not rewrite prior migrations. Historical generated assets without this record require regeneration before new Social Desk approval/publication; studio download remains available. This is a known-text check, not OCR of a supplied photo.

Three-lineage in-memory checks passed before the overlay addition: fresh, main upgrade and local upgrade; legacy evidence retained; original migration timestamps preserved; repeated migration pass no-op. Final rerun/native checks are recorded below when complete. No production migration was attempted.

Voice #29 remains deferred draft. Its six historical migrations were not renamed because production nonapplication was not proven. Do not assume a next-free range until its future integration is actually ready.

## Integration log and exact decisions

The merge initially conflicted in36 paths. CRLF normalization before a three-way comparison removed many false conflicts. Main bytes were retained for99 files whose only difference was line endings. Remaining decisions and evidence are appended from each reviewer below. No blanket branch replacement or force push is used.

## Verification results

- Initial integrated full run:399 pass/9 fail; seven startup timeouts during concurrent PGlite/Vite/TypeScript work plus two provider-test expectation corrections. No failing assertion was waived.
- Serial full unit rerun:53 files /408 tests PASS.
- TypeScript and ESLint with zero warnings PASS; inherited control-character regex findings replaced with equivalent checks.
- Production build PASS before final overlay security and historical-campaign recovery additions; final rebuilt artifact required.
- Actual-photo connected browser flow PASS, including saved draft approval/handoff/receipt, retained PNG download, reload and deletion404.
- Remaining full browser/native/restore/security acceptance results are appended after completion.

## Open release items

1. Real production migration history/schema and backup/restore readiness. Current production is cloud-realtor main@907214a, READY; anonymous auth/session200 does not prove authenticated/database workflows.
2. Normal Vercel CLI authorization refresh and isolated hosted Preview DB/configuration. Do not copy a production database into Preview or disable the production database guard.
3. Funded OpenAI project, separately identified bounded provider acceptance run, authorized Postiz posting, audited Orshot setup and Stripe money-flow acceptance. No purchase, live provider run or social post occurred in this integration.
4. Real customer authorized publication plus later comparable observations remains the product-outcome pilot. No ranking lift/exit guarantee is made.



---

# GitHub pull request audit

Observed 2026-09-26T12:42:00.731344+00:00 using read-only GitHub REST/GraphQL via the authenticated WSL CLI. No GitHub state changed.

**Only one PR is currently open: [#29](https://github.com/Gnoscenti/realestate-ai/pull/29), already marked draft and explicitly deferred.** The other seven requested dispositions were completed on September 8, 2026. The prompt's eight-open-PR inventory is historical.

Remote `main`: `907214abc877aae3e0de46c0943eb58cf263bb07` — fix(assistant): allow GPT-5 nano to answer within the token limit (#38). GitHub comparison shows 63 commits ahead of the prompt's `f571fa4d93fd24108bfaa8bec26e9668203909ea`, with zero commits behind.

| PR | Current state | Head SHA | Base | Files | Review threads (unresolved / total) | Decision |
|---|---|---|---|---:|---:|---|
| [#21](https://github.com/Gnoscenti/realestate-ai/pull/21) | CLOSED / draft | `065b93017317867ae56f758f828b6d0e624a0d51` | `main` | 4 | 0 / 0 | Keep closed: superseded by authenticated truth-gated #26. |
| [#26](https://github.com/Gnoscenti/realestate-ai/pull/26) | MERGED | `3cb47256d6a4fd417c8e1d4c678107c4a8f72ad5` | `main` | 26 | 0 / 3 | Already merged as requested; preserve Gateway authentication, quotas and valuation gates. |
| [#28](https://github.com/Gnoscenti/realestate-ai/pull/28) | MERGED | `a239eeb67e7e236742a515ec244dcb843c1374d2` | `main` | 20 | 0 / 6 | Already retargeted and merged, including subsequent CiteLock review hardening. |
| [#29](https://github.com/Gnoscenti/realestate-ai/pull/29) | OPEN / draft | `9fdf79c7a1bba1554ccc4e4212bbe3eafd8b5ac2` | `main` | 49 | 0 / 0 | Keep deferred draft: its body already documents provider/billing/worker and production migration-history gates. |
| [#30](https://github.com/Gnoscenti/realestate-ai/pull/30) | MERGED | `0a28bc50acbfd40d27d23ce62488ac297ce18e6c` | `main` | 14 | 0 / 2 | Already retargeted and merged as the actual-photo social foundation. |
| [#31](https://github.com/Gnoscenti/realestate-ai/pull/31) | MERGED | `db2db3892b9ca0d9084e2faf7beaa6a918c07c5e` | `main` | 60 | 0 / 14 | Already merged as flagship CiteLock foundation; retain its 0006/0007 migrations. |
| [#34](https://github.com/Gnoscenti/realestate-ai/pull/34) | MERGED | `f5817eae5db2abaebaa1bb56dbae84a2846bd474` | `main` | 67 | 0 / 6 | Already fixed and merged; property selection, full email copy, FAQ disclaimer and empty-question fixes are present in history. |
| [#35](https://github.com/Gnoscenti/realestate-ai/pull/35) | CLOSED / draft | `4cdc5edc65124db1e3d8fc2c65f6c53537c71260` | `main` | 3 | 0 / 0 | Keep closed: dependent on removed Imagine API and incompatible with actual-photo product boundary. |

All 31 captured review threads are resolved. Every inspected PR head currently has successful returned `test` and `Vercel Preview Comments` checks and a successful Vercel commit status. These checks belong to the recorded historic heads; they are not fresh verification of today's local integration. Current main has a successful `test` check. A stale Vercel comment on #35 still says canceled, but its current commit status is successful; closure was for product/API incompatibility, not merely CI.

## Completed integration and closure evidence

| PR | Completed at (UTC) | Merge commit / evidence |
|---|---|---|
| #21 closed unmerged | 2026-09-08T20:44:37Z | [Closure rationale](https://github.com/Gnoscenti/realestate-ai/pull/21#issuecomment-5591616751) |
| #35 closed unmerged | 2026-09-08T20:44:46Z | [Closure rationale](https://github.com/Gnoscenti/realestate-ai/pull/35#issuecomment-5591618508) |
| #26 merged | 2026-09-08T20:59:17Z | `79e3f0d1cc0ba3fe0d3ac6ac68ea4e615b62b0d5`; verified ancestor of current main |
| #31 merged | 2026-09-08T21:25:19Z | `7f4ef965c4b4059ddee490fa1149882f9fa23f5d`; verified ancestor of current main |
| #34 merged | 2026-09-08T21:26:14Z | `92337db9fd0c71ca6da477eaba6473ff87607020`; verified ancestor of current main |
| #28 merged | 2026-09-08T21:37:31Z | `7b0c13312d9c71c39c6b8af082547b6d482fc575`; verified ancestor of current main |
| #30 merged | 2026-09-08T21:49:36Z | `d330d0f0825bc0ef2082f894d7443482d29e2937`; verified ancestor of current main |

The realized landing order was #26 → #31 → #34 → #28 → #30. Additional flagship completion #36 landed afterward at `b083b38b95a326572efcd90a88afd4a4a3ab55ff`, followed by assistant fixes #37 and #38. Their commit history is captured in the JSON. This audit does not assert that every marketed runtime dependency is configured.

## Moved heads were re-read

The heads for #28, #29, #30, #31 and #34 differ from the prompt. Their current bodies, complete PR commit lists, changed files/patches, reviews, resolved thread comments, issue comments, timelines and checks were fetched anew. The JSON also contains comparisons from every prompted head to the current head.

- #28 includes authenticated Closed/Sold imports, CiteLock durable panel reservation and atomic evidence persistence, CSV byte validation, and recorded merged ancestry. Six threads are resolved.
- #30 includes unioned Recognition/social environment configuration, rejection of empty media selections, correct requested job-kind handling, and merged ancestry. Two threads are resolved.
- #31 includes #26 ancestry and the CiteLock landing commit. Fourteen threads are resolved, including person-bound evidence, navigation, atomic panel persistence, and listing-role handling.
- #34 includes the four requested UX/scoring corrections plus hydration and saved-client/listing protection. Six threads are resolved.
- #29 was force-pushed at 2026-09-08T23:05:42Z and retargeted at 23:05:58Z. Its current body explicitly defers voice; this is already a documented disposition, not an untriaged PR.

## Remaining voice gates and migration evidence

Current main migration filenames:

- `0001_auth.sql`
- `0002_workspaces.sql`
- `0003_inventory_comps_assistant.sql`
- `0004_voice_foundation.sql`
- `0006_citelock_scans.sql`
- `0007_citelock_recognition_runs.sql`
- `0009_social_media_renders.sql`
- `0013_citelock_panel_reservations.sql`
- `0014_managed_listing_media.sql`
- `0015_social_stripe_lifecycle.sql`
- `0016_public_media_operations.sql`

The #29 changed-file inventory still contains the six original voice filenames: `0005_voice_runtime.sql`, `0006_voice_beta_hardening.sql`, `0007_voice_console.sql`, `0008_voice_billing.sql`, `0010_voice_policy_convergence.sql`, and `0011_voice_provider_fencing.sql`. The duplicate `0006`/`0007` prefixes remain a pre-merge hold.

The current #29 description states that production migration history could not be accessed, so it deliberately retained byte-identical migration files instead of assuming safe renumbering. This audit did not access a production database and cannot prove nonapplication. If later proven unapplied, the next consecutive free range on today's main is `0017`–`0022`; determine the range again at merge time. If any file was applied, an explicit migration-history transition is required.

Keep #29 draft/deferred until production migration history, separate Stripe voice lifecycle, Retell/Twilio provisioning, broker/counsel sign-off, protected worker cadence, fencing/recovery, and observed live end-to-end call/billing behavior are evidenced. Its head has reported historical code checks (346 unit tests and 15 browser tests in the PR body), but those do not establish live provider readiness.

## Evidence completeness

`github-pr-audit.json` is the detailed register. Per PR it contains full head/base SHAs, full file and patch inventory, commits, review records, all review-thread resolution flags/comments, issue comments, timeline events, exact-head CI/status metadata, merge/close metadata, and the decision recorded here. Supplemental evidence includes current main commit/checks/migration listing, its history since the prompt, changed-head comparisons, and ancestry proofs.

Validation: all requested PRs plus all currently open PRs were collected; all file counts match GitHub changed-file counts; no API collection errors or truncated thread comments remain. No remote mutations, purchases, messages, migrations, deployment changes, repository edits, or ledger edits were performed by this audit.



---

# Infrastructure integration choices

- `src/lib/db.ts`: Keep local transaction API, durable local PGlite directory creation and production PostgreSQL requirement; preserve main compatibility.
- `package.json`: Union dependencies (Perplexity plus Blob/OIDC/sharp/Stripe), exact uuid override, local npm12 tooling and explicit migrations outside build.
- `package-lock.json`: Start from main lockfile; regenerate with declared npm12 against merged manifest before clean installation.
- `.env.example`: Union Gateway/OIDC, Orshot/storage/Stripe, CiteLock providers, Postiz and local feedback examples; no secret values copied.
- `src/components/dashboard/module-grid.tsx`: Describe integrated actual-photo/Social Desk workflow and retain main valuation-source limits.
- `src/lib/import-data.ts`: Keep main precise seed-property identifiers; do not classify arbitrary mls_* records as removable fixtures.
- `src/lib/store.ts`: Preserve main campaign state/actions in browser persistence while retaining local removal of fake integrations; never erase saved records during hydration.
- `src/lib/auth/server.ts`: Union local explicit production origin, disabled unverified account linking and main guards; remove duplicate secret check.
- `src/routeTree.gen.ts`: Retain main media/webhook route registration; Vite generator will refresh after route integration.
- `README.md`: Retain modern guide/visibility workflow, add retained main features and link exact integration evidence; no new hosted-success claim.



---

# Supporting feature integration audit

Resolved and staged only the five assigned supporting modules plus two focused test files in `/home/ttroj/code/realestate-ai-integration-2026-09-26`. No commit was created. The original files were copied byte-for-byte to the task workspace `work/supporting-integration-backup/` before editing. The normalized source comparison between main `907214abc877aae3e0de46c0943eb58cf263bb07` and preserved local `34c784b` is retained there as `main-vs-preserved.diff`.

## Exact resolutions

| File | Resolution and reason |
|---|---|
| `src/lib/ai.ts` | Retained main's protected-class/steering term filtering, objective saved-field search description, and safe outreach wording. For comparison notes, retained the local same-city and same-property-type filter, positive finite price/area checks, at most five references, supplied statuses, and explicit unknown condition/concessions/transaction terms. Preserved main's `suggestedList: null` abstention contract and broker/authorized Closed/Sold requirements. Added protection against nonfinite price-per-area results and avoids asserting size proximity when the subject has no valid area. |
| `src/routes/cma.tsx` | Kept the authenticated `SoldDataLibraryPanel` from #28 and main's server-source/price-recommendation boundary. Retained local listing comparison notes, record count, supplied status, and the ability to export useful subject notes even when no reference qualifies. Labels say recorded price rather than assuming every saved value is an asking price. Every exported package states that price is not calculated and references are unverified; source status and unknown condition/terms travel with it. Clipboard activity is logged only after the copy succeeds. No RESO feed was enabled or offered as an existing source. |
| `src/routes/search.tsx` | Kept main's synchronous factual search, objective suggestions, local tour-follow-up wording, and copy action. Retained the local real download action. Both copy and download use `propertySummary`, which includes supplied-source labels, missing-value text, and the requirement to confirm availability and price before sharing. No simulated search spinner, sent-tour claim, or fabricated client report was restored. |
| `src/routes/market.tsx` | Kept main's valuation pause, source requirements, broker review, and explanation that server Closed/Sold rows are unranked source records. Retained local RapidAPI observations and the calculator driven entirely by six explicitly entered assumptions. The calculator does not populate values from estimates, save a valuation, or predict returns; missing/invalid/nonfinite calculations do not render results. The authorized-import link points to the existing CMA source library. |
| `src/lib/command-pack.ts` | Retained local Social Desk factual inputs instead of the removed campaign-generator dependency. Kept comparison notes useful while exporting an explicit 'Price recommendation: not calculated' statement, unverified reference labeling, supplied status, and broker/transaction-term limitations. |

The local test expected the `suggestedList` property to be absent while main's safety test expected null. The integrated contract uses explicit null: both represent abstention, but null preserves existing consumers and main's verified safety contract. The local test now verifies null rather than requiring a removed property.

## Verification

- `npm run test:unit -- tests/unit/listing-comparison.test.ts tests/unit/truthful-market.test.ts tests/unit/truthful-search.test.ts`: **10 tests passed in 3 files**.
- Added five behavior regressions covering factual export provenance and missing values, unchanged objective ranking under steering terms, size-based comparison ordering with supplied status and a five-record bound, invalid numeric values/missing subject area, and command-pack export limitations.
- ESLint on all five changed modules and the two changed tests with `--max-warnings=0`: **passed**.
- Prettier applied only to assigned modules/tests.
- `git diff --check` and `git diff --cached --check` for the assigned paths: **passed**.
- All five assigned merge conflicts are resolved and staged. No files outside the five modules and two test files were staged by this work.

Full repository typecheck, build, unit, browser and authenticated checks are owned by the integration lead and were not duplicated here. No consumer/store changes were required. `RapidDataPanel` itself retains the local third-party Zestimate/rent-estimate observations and unverified-representation labels; its API, entitlement, source-license, and server persistence boundaries were not modified by this supporting merge. No remote writes, provider calls, purchases, database migrations, deployments, or external messages were made.



---

# CiteLock integration handoff — 2026-09-26

The assigned CiteLock merge is resolved and staged in `/home/ttroj/code/realestate-ai-integration-2026-09-26`. No commit, provider request, customer publication, deployment, migration, or change to the original checkout was performed by this subtask.

## Preserved functionality and compatibility

- The preserved local `/aieo` guide-first interface, source-backed basic/full instructional guides, saved subject aliases and exact source settings, evidence/readiness views, resumable visibility batches, opportunities, revision-controlled interventions, manual publication verification, and Social Desk linkage remain present.
- Three-way merges normalized CRLF to LF before semantic resolution. Main's `agentName` scan metadata and tenant-scoped `getCiteLockScanById` were retained with local dispute governance. Main's historical Recognition repository and APIs remain available. The paid legacy Recognition write endpoint now calls `requireEntitlement` before reserving/calling providers (`src/lib/aieo/api.ts:96`). Historical reads remain tenant-scoped.
- Main's public-only Julie fixture and all its trust assertions were preserved after confirming that its sole consumer is the main scoring suite. The initial synthetic fixture choice caused two fixture-dependent failures and was corrected; no scoring assertion was relaxed.
- Recognition source rules and explicit aliases remain unchanged. Unclassified or property-listing grounding remains rejected and retained as failed evidence; aliases never enter unbranded discovery prompts.

## Confirmed defect and conservative integration choice

The older numeric RealTrends adapter accepts only a profile URL and observation time. It does not bind the fetched profile's identity to the scanned subject before marking production figures verified. Its cache is also keyed by the source URL, without subject identity. Attaching another agent's URL could therefore attach their production figures to the current subject.

The integrated scan preserves main's suppression of website-derived quantified production claims and does not invoke that unbound numeric adapter. A linked profile produces the explicit `production_source_subject_unverified` outcome (`src/lib/aieo/scan.server.ts:334`). A wrong-person regression confirms that the submitted URL is retained for review while no numeric attestation is produced. This is an intentionally excluded local behavior, not a hosted configuration gate.

The separate instructional guide parser remains functional. It checks official hostname, agent-profile path, exact profile heading, supplied locale, agent entity kind, production year, category and city ranking (`src/lib/aieo/guide.server.ts:20`). It produces attributed public-source instructions and unresolved conflicts, not independently verified production or licensure. Its existing tests were retained.

## Provider follow-ups implemented

- `ProviderFailureDetails` retains safe short provider codes/types, response status and incomplete reason, together with partial answer evidence (`src/lib/aieo/visibility/providers.server.ts:60`). Arbitrary upstream error messages are not surfaced.
- `credit_balance_exhausted` / `insufficient_quota` become `provider_quota_exhausted`, with no futile throttling retry. OpenAI and xAI now preserve HTTP status and respect Retry-After for genuinely retryable 429 responses (`providers.server.ts:175`).
- OpenAI/xAI Responses API answers require completed status. Partial responses remain failures, even when they contain text and citations (`providers.server.ts:193`).
- Incomplete Perplexity responses preserve text, citation annotations, distinct retrieved sources, requested/returned model context, usage and provider-reported cost instead of throwing those details away (`providers.server.ts:368`).
- The durable engine persists partial evidence and safe diagnostics in existing columns/usage JSON and explicitly sets mentioned/cited/recommended false (`engine.server.ts:371`). No new schema was needed for diagnostics. Failed evidence continues contributing only known billed cost, never positive recognition.
- Perplexity remains bounded to two steps, six thousand search tokens and twelve hundred tokens per page. The output cap is now six thousand tokens under the separate persisted surface `perplexity_agent_web_v2_output6000` (`providers.server.ts:32`). Baseline comparison rejects the old surface. This change has mock coverage, not a claim of fresh live provider acceptance.
- The UI exposes subtype/status/incomplete reason and labels monetary totals as provider-reported lower bounds (`src/routes/aieo.tsx:558,762,810`).

## Verification and exact remaining checks

Completed:

1. `vitest run tests/unit/perplexity-agent.test.ts tests/unit/recognition-source-policy.test.ts tests/unit/visibility-report.test.ts`: **37/37 passed**.
2. Changed-file ESLint covering assigned source, route, provider and test changes: **passed, zero warnings**.
3. Verified-scan suite including new wrong-person guard: **13/13 passed** during the wider run.
4. `git -c core.whitespace=cr-at-eol diff --check --cached -- src/lib/aieo src/routes/aieo.tsx tests/unit/citelock-scan.test.ts tests/unit/visibility-engine.test.ts`: **passed**. CRLF-aware checking is needed for preexisting auto-merged files.

The first wider run returned **64/72 passed** before final fixture/test corrections. Four failures were initial database startup timeouts during concurrent PGlite processes in the shared WSL resource limit. The other four were two mismatched pilot-fixture assertions, one expected object containing an omitted JSON `undefined` title, and one stale Perplexity surface assertion; all four were corrected without relaxing behavior. The root integrator requested no additional broad concurrent run and will perform the final full suite with `--maxWorkers=1`, plus typecheck/build/browser/native-PostgreSQL checks. These final checks are not asserted complete here.

The final full run must include `visibility-engine.test.ts` (14 tests), `visibility-subjects.test.ts`, `citelock-guide.test.ts`, `citelock-repository.test.ts`, `citelock-disputes.test.ts`, and `aieo-score.test.ts`. The new engine regression checks partial answer/citations/cost persistence, false success metrics, typed quota failure and no extraction call.

## Integration dependencies owned by root

- Preserve main's `citelock_scans.agent_name` and backfill/compatibility for local databases whose already-applied scan migration lacked it.
- Preserve all local visibility/guide/dispute tables together with main's differently shaped historical recognition tables. No modern local code consumes the older local `citelock_recognition_runs` schema; only main's Recognition repository requires the main shape. Archiving the older local table under an explicit legacy name preserves evidence without making it satisfy the modern schema.
- Validate both historical database lineages and a fresh database before hosted application.

## External gates, separate from code

The September 24 rollout remains historical evidence: one 21-observation baseline, 2 accepted xAI named checks and 19 failed observations, with no defensible unbranded rate or measured lift. The failed baseline must not be rewritten.

OpenAI funding, authorized Vercel access, isolated hosted PostgreSQL, preview-scoped auth/provider settings and actual HTTPS session checks remain external requirements. Provider acceptance requires a separately identified, authorized bounded rerun after configuration is valid. No MLS access is needed for the instructional guide or non-listing recognition scope. Customer publication rights, actual publication and comparable later observations remain customer/action gates; code cannot establish them in advance.

## Approval review and preservation

An initial bulk checkout and a later combined policy/provider script were rejected by automatic approval review. Neither executed. The safe alternative backed up every conflicted worktree file and all merge-stage blobs, checked that no concurrent edits would be overwritten, and applied reviewed union edits. The policy alternative retained the stricter main attestation boundary after identifying the subject-binding defect. No approval block remains for the changes reported here.

Exact conflict/stage backups remain in this task's `work/citelock-merge-backup`; original repository work was preserved in root's `34c784b` commit. Only the assigned CiteLock source/test paths were staged.



---

# Social integration: September 26, 2026

## Scope and sources

Original checkout remains preserved at local/2026-09-08-flagship-preservation (34c784b; preceding committed delivery c21bca6). Work is in /home/ttroj/code/realestate-ai-integration-2026-09-26, integration/2026-09-26-flagship, merging current origin/main 907214a with preservation. No provider, Stripe, scheduler, external publication, deployment, or customer database was contacted for this work.

Read repository conventions in /home/ttroj/code/AGENTS.md, relevant FLAGSHIP-LEDGER sections, full FLAGSHIP-DELIVERY-REPORT, main actual-photo documentation, source and regression tests. The original prompt's September 8 assessment that authenticated durable media upload did not exist is superseded by current main.

## Exact conflict resolutions

- src/routes/marketing.tsx: take preserved local route as the base to keep server-owned drafts, approval/fair-housing review, version history, manual handoff, reported receipts, and optional encrypted Postiz connection. Restore main ActualPhotoStudio, SocialBillingControls and SocialMediaGenerator components in that route. The free actual-photo studio remains primary; optional paid template controls are in a disclosure.
- src/lib/imagine-media.ts, src/lib/social-accounts.ts, src/lib/social-agent.ts: retain origin/main files. They preserve truthful legacy campaign helpers/types and support existing persisted campaign state and tests. No deleted generative Imagine endpoint is restored.
- All origin/main src/lib/social-media code, managed media components, authenticated listing-media route, billing webhook and safeguards remain. The image renderer still resolves server listing/media IDs, validates bytes/MIME/dimensions, strips EXIF/location metadata, retains originals/exports, enforces workspace storage/render quotas, and supports explicit deletion with public-object cleanup journal.

## Completed integration work

- Draft JSON gains optional managedMediaIds; no table migration or existing-row rewrite is needed. Mixed public/private image attachments share a maximum of four; duplicate managed IDs are rejected.
- New managed-attachments.server.ts resolves every selected ID against the authenticated workspace and listing relationship. A browser URL is not ownership evidence. Save, edit, approval, manual handoff, and dispatch reject missing/deleted/foreign managed images. Receipts remain historical and are not invalidated by later image deletion.
- ActualPhotoStudio can attach the new PNG export or any retained export to the composer. The composer displays the exact authenticated image and supports removal; changing attachments requires a saved revision and new rights approval.
- Approved drafts expose private image downloads and caption/text exports. A new getSocialHandoff server function rechecks the current revision, approval state, continuing CiteLock source permissions and asset existence for caption copy/share/export.
- Native share attempts to include the actual private image bytes as File objects; when file sharing is unavailable it copies the caption and directs the user to download the approved images.
- Postiz can receive tenant-authorized bytes directly via its existing upload endpoint. A private image does not require public Blob storage. Dispatch rechecks image/source availability immediately before creating the provider post, after uploads. All existing revision reservation, duplicate-request freeze, unknown-result handling and status reconciliation remain.
- Instagram dispatch rejects drafts without any image before contacting a scheduler. Manual draft/handoff remains available for composing content.
- Source URL and attribution labels now explain that these are review notes; required links/disclosures must be present in the exact caption the user approves.

## Verification and corrections

- Initial focused run: new managed-handoff suite 3/3 PASS; managed photos 7/7 PASS; dispatch 4/4 PASS. One preexisting social-desk failure used a text-only Instagram fixture to simulate a provider rate limit. Corrected it to include an explicitly mocked image upload, preserving the original assertion.
- Extended the managed-handoff suite to four tests: real upload/render/approve/handoff/direct byte dispatch; cross-tenant/deleted/stale/revoked checks; photo-less Instagram rejection before provider; mixed media limits/duplicates.
- Expanded seven-suite run: 57 assertions/tests passed, 3 initial tests timed out at 15 seconds during concurrent PGLite/Vite/root-test startup. No remaining assertion failure was reported; root will rerun the full suite serially after this worker stops its browser server.
- TypeScript at the first pass reported only unrelated outreach.tsx missing profile references (lines477/490), sent to root. No social TypeScript errors.
- Browser regression expanded from upload/export/reload/delete to upload -> 1080x1080 retained PNG -> attach to draft -> save -> fact/rights approve -> authenticated exact-image download -> manual handoff -> reported receipt -> reload -> delete and confirm404. Final browser result pending below.

## External gates and product boundary

Free built-in actual-photo exports/manual handoff require a functioning authenticated deployment and migrated durable database. They require neither Orshot nor a public Blob URL. The built-in template is a real image overlay; it does not generate property rooms, surroundings or verification of the agent's facts.

Optional paid Orshot requires a valid key, audited template mappings, approved photo/output hosts, verified Stripe entitlement and quota, plus configured Blob delivery only for public renderer source photos. CutCLI/video is still visibly setup_required; no live video or autonomous social publication is claimed.

Postiz dispatch is covered using dependency-injected provider responses and real local database/image bytes. An actual authorized account connection, network contract and publication remain external acceptance gates. No external post was made.

## Shared requirements for root

Preserve main sharp and @vercel/blob dependencies; preserve both main managed-media/render/Stripe migrations and local social-draft/dispatch migrations through the migration reconciliation. This worker makes no package/env/DB/migration edits.

## Final worker verification update

- Chromium actual-photo upload/export/draft/approval/download/handoff/receipt/reload/delete test PASS, 1/1 in25.5seconds on the warmed isolated server at127.0.0.1:8164. First attempt stopped on Loading workspace during Vite dependency optimization/reload, before any studio action. Repeated unchanged test passed after optimization.
- Focused ESLint for route, actual-photo component, social-desk implementation, and modified/new tests PASS with maxwarnings0. Root identified three inherited main lint findings: removed an unused pickListingMedia call (third compatibility argument retained), and replaced two control-character regexes with equivalent codepoint checks in social-media/types.ts and orshot.server.ts. The accepted/rejected character sets are unchanged.
- Staged the15 exact owned source/test paths; cached whitespace check PASS. No commit/push performed by this worker. Root owns the final serial full-suite run.
- Stopped the task-owned Vite server after browser acceptance. No external provider post, paid request or publish happened.

## Final documentation and legacy-campaign follow-up

Updated docs/social-media-generation.md plus relevant social sections in docs/flagship-operations.md and docs/activation-and-blocker-register.md. The documents link INTEGRATION-2026-09-26.md, distinguish old dated checkout/test/environment notes from current integrated social capabilities, and retain provider setup, audited template/allowlist, billing and quota boundaries. No live Postiz/Orshot/Stripe acceptance is claimed.

Inspection found that browser campaigns were still preserved in store persistence but had no current UI/export caller. Root authorized a bounded recovery affordance: Saved browser campaigns appears only when saved campaigns exist, lists them and downloads Markdown containing the readable legacy export and all original JSON fields/media references. Local approval/schedule/post states are labeled unverified. The action does not mutate data, import a server draft or publish anything. The docs now describe this completed affordance rather than an unresolved access gap.

Final affected-route ESLint maxwarnings0 PASS; full TypeScript noEmit PASS; whitespace check PASS. Staged exactly the route and three docs for this follow-up. Root was notified that its build must be repeated after the route changed. No commit was created by this worker.


## Final local acceptance — September26

- Final TypeScript, zero-warning ESLint and production build PASS after overlay security and legacy campaign recovery UI.
- Full unit53files/408tests PASS; final overlay/migration/handoff13/13 PASS (includes6 new overlay tests beyond the408). Tests retain original assertions; worker contention corrected by bounded concurrency.
- Browser20 scenarios covered: initial18/20 PASS; the two failures passed unchanged on a fresh final server. Earlier failures occurred across a live HMR/schema change; no weaker assertions or longer timeouts were used.
- Native PostgreSQL16.15:57 preserved-workflow tests plus47 main/overlay/handoff/real-assistant checks,104 total PASS.23 migrations, repeated no-op; actualmain11-file and local15-file upgrade snapshots both PASS preserving original applied timestamps and evidence.
- Logical restore PASS:65public tables/723rows/23migration records, content digests identical in a separate empty disposable target. This proves local restore, not hosted Production backup policy.
- Repository safety scan:335tracked files, six known private secret values checked, zero matches.26 historical migration references preserve normalized SQL contents; main historical files retain their exact bytes, shared local CRLF differences explicitly recorded.
- Non-SQL integrated text files normalized fromCRLF toLF only for readable review; original bytes remain in the preservation commit. No historical SQL content rewritten.
- Code whitespace passed; Markdown's intentional hard-line-break spaces are retained.
- Compiled production auth/session checks and remote PR/CI outcomes are recorded in the subsequent handoff.


## Compiled runtime acceptance and review handoff

Final compiled production artifact with native PostgreSQL:3/3 browser tests PASS (31.4seconds), using real Better Auth sessions. Covered server access grants/tampering/fail-closed requests, persisted Social Desk, cross-device subjects, account isolation/logout, unrelated-Origin403, free-guide save/reload/rollback/export and server-gated upgrade. All provider/payment/scheduler keys disabled in this isolated runtime. Production still requires its own trusted proxy-IP configuration and live operational acceptance.

All task-owned browser servers stopped. Only the newly created native-test container was stopped after verification; its data remains available. Existing containers/checkouts were not restarted or altered. Final source secret scan338tracked files/sixknownsecretvalues/zeromatches; main Gateway/OIDC assistant files have no integration diff.

The code is prepared as a draft PR because actual Production schema, backup and migration readiness could not be verified with the current CLI403. The operator was asked to refresh normal Vercel login while implementation continued. No production database write, main merge, promotion, purchase, provider baseline or social publication occurred.


## September 26 release gates — actual Production and hosted Preview

Normal Vercel authorization was restored and the operator supplied the direct connection from the existing cloud-realtor-prod Neon resource. Read-only target validation found PostgreSQL 17.11, the expected 11 main migration names, no foreign migration names, and modern recognition schema. Production credentials and data remain in ignored private operator files.

Production backup and restore: a PostgreSQL 17.11 custom-format logical dump used the same exported read-only snapshot as its data fingerprints. All 42 tables and 48 rows (including 11 ledger rows) restored into an empty isolated local target with matching schema and complete content fingerprints. The 12 pending migrations then passed on the restore, preserving 41 original application tables on their original columns and all historical migration timestamps; repeat execution was a no-op. Dump SHA256: cc8051a60363c459cc4227c0b959391d4f79749dcf4da6fc4f7c92af76bbf902. This proves logical restoration; provider PITR/retention, cluster role/ACL restoration and independent sequence-state consistency were not attested.

Hosted Preview uses a new empty database and a restricted SQL-created role within the existing Neon resource. It contains synthetic acceptance fixtures only and shares production compute; it is not a separate Neon branch. The role has no elevated flags, memberships, production relation/column grants, schema creation, foreign-server access or executable application security-definer functions. Explicit production table reads are denied. The preview migration ledger is read-only to the application role. Production database/auth/provider credentials were not copied to Preview; branch-only credentials and beta access were generated separately, with inherited Stripe/GitHub credentials blanked only for this branch.

The initial Preview direct connection and 10-connection role limit caused signup HTTP 500 / SQLSTATE 53300. Vercel logs identified exhausted preview connections. Preview now uses the verified Neon pooled endpoint and a bounded 20-connection role; production configuration and application source were unchanged by this correction. Hosted acceptance passed on deployment dpl_6W3fH2ta6sPg5EobCXtNpELPHFUK, implementation SHA 5486e835f1a5f843824ce8da25b7747cc5fd73df. Coverage includes real signup and secure sessions, free-guide persistence, beta access, saved subjects, retained actual-photo PNG, durable draft approval/manual handoff, and the account-isolation/security checks enumerated in the private acceptance receipt. No external post, purchase, payment or paid-provider baseline was made.

Production migration completed at 2026-09-26T14:06:51.104Z: 12 files applied, 23 total migrations, 65 public tables, all original 11 migration timestamps preserved, modern recognition retained, no legacy archive created, and nullable overlay review metadata present. The runner used a 5-second lock timeout and 120-second statement timeout; a second run reported up to date. The reviewed implementation remains 5486e835f1a5f843824ce8da25b7747cc5fd73df. This documentation update records verified release evidence; fresh CI and main merge/production deployment verification follow it.

Application rollback is redeployment of the former main 907214abc877aae3e0de46c0943eb58cf263bb07 while retaining the expanded schema and ledger. Do not drop new tables or restore over customer writes merely to roll back application code. Voice PR #29 remains deferred, with its historical migration names unchanged. Live paid-provider coverage, Stripe webhook/payment acceptance, external social publication and measured GEO/AIEO uplift remain separate operational acceptance items; no successful lift is claimed.
