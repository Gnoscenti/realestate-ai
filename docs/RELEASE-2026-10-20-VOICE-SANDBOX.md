# Voice schema and fractionalization release — October 20, 2026

**Status at this commit: ordered integration of PRs #49–#52 is in progress; PR49 is merged.** The owner authorized zero required outside approvals for the solo-maintainer workflow. All other branch protections remain unchanged. This report distinguishes verified candidate evidence from production acceptance. See [FLAGSHIP-LEDGER.md](FLAGSHIP-LEDGER.md), Sessions11–15, and the final deployment receipt posted on [PR52](https://github.com/Gnoscenti/realestate-ai/pull/52) after actual production verification.

## What changed and why

The voice runtime had advanced beyond the checked-in database schema. Seven suites failed because tables/columns for provider provisioning, prompt versions, trusted billing, webhook retries and workspace mutation leases were absent. The six intended migrations already existed on the unmerged voice branch; they were reviewed against current SQL and integrated with their original filenames, together with the missing Stripe webhook route, generated router registrations, navigation and worker schedule.

PR49 also contains a cumulative reconciliation migration. A reproduced collision when reconciliation ran first was fixed by guarding 19 constraint additions in three of the six original migrations. Both upgrade orders pass without removing migration history or fabricating billing verification. A populated upgrade regression starts with the older schema and existing workspace, assistant, prompt, call and billing rows. It proves preservation, stable provisioning identity backfill, no invented billing verification, lease uniqueness and repeat-migration no-op. Native PostgreSQL coverage now includes the voice suites. The portal return-URL helper retains the existing HTTPS/same-origin validation, and lint corrections preserve behavior.

The release also preserves the incoming onboarding, CiteLock and fractionalization work. The sandbox is authenticated, workspace/listing-scoped and persistent, with exact six-decimal arithmetic, revision/idempotency protection, mock identity expiry/revocation, deposits, allocation, refund and history export. Its independent Foundry harness exercises upstream ERC-3643 identity/registry behavior on a local chain. It does not verify real identities, establish property ownership, move money or deploy a token. See [FRACTIONALIZATION-ARCHITECTURE.md](FRACTIONALIZATION-ARCHITECTURE.md).

## Preservation and Git

- Initial main: `a8a344afe6d067bfa716281785adcd6fe0607e24`.
- `4e4079e`: preserved 85 incoming CRLF-only file changes separately.
- `96ee7cb`: verified implementation, schema, tests, configuration and sandbox.
- `3d9d9d348ed2dacb935c7b7a40089293aed64c36`: integrated existing voice branch `2de4041`; exactly the same tree as tested `96ee7cb`.
- `ae5260d`: safe amount validation and bounded cleanup after the event cap.
- `3f54a94c4b781d85ddec6a0789848abebee642db`: paginated older simulation access and regressions; earlier verified application source before PR49–51 integration.
- Release branch: `fix/voice-schema-sandbox-release-20261020`.
- [PR52](https://github.com/Gnoscenti/realestate-ai/pull/52) includes current main and existing voice history. No reset or force push occurred.
- `43a656b`: integrates newer PR49 onboarding, private feedback, fact-bound listing launch, Social Desk handoff fixes and both voice-schema lineages while retaining the sandbox changes. Resolve final exact-head CI and merge SHA from PR52.
- PR49 merged as `8e0af808b32d7f14eb72f35330f855e037f9fa94`; PR50/51/52 follow in order. Duplicate PR53 was closed because its checkout/routes fixes and regression coverage are already included in merged PR49.

## Verification snapshots

Integrated source `43a656b` passes **606 unit/integration tests in 74 files**, both TypeScript checks, zero-warning lint and production build. Its complete browser/native PostgreSQL and final remote gates are recorded on the PR as they finish; do not substitute the earlier snapshot below for those checks. PR49 exact-head [CI39537453462](https://github.com/Gnoscenti/realestate-ai/actions/runs/39537453462) passed before merge, including 29 browser workflows, three independent cold calendar starts, three development-auth and four compiled-production-auth cases with zero retries.

The following table records the earlier PR52 application snapshot `3f54a94`:

| Gate | Actual result |
|---|---|
| Targeted formerly failing voice suites | 52/52 passed |
| Full unit/integration | 598/598 in 72 files passed |
| TypeScript and AIEO fixture types | Passed |
| Whole-repository ESLint | Passed, zero warnings |
| Vite production build | Passed |
| Native PostgreSQL suite | 160/160 in 21 files passed; fresh migrations and repeat no-op |
| Compiled production artifact + PostgreSQL auth | 4/4 passed, including isolation, origin rejection and free/paid guide access |
| Full browser workflows | 28/28 passed with zero retries |
| Development auth | 3/3 applicable cases passed; production-only origin case covered above |
| Independent cold-start calendar runs | Three separate starts passed with zero retries |
| Local Foundry harness | 5/5 passed |
| Secret scan | No configured private values in 425 intended Git files |
| Exact application-head remote checks | [CI39512081285](https://github.com/Gnoscenti/realestate-ai/actions/runs/39512081285), [contracts39512081253](https://github.com/Gnoscenti/realestate-ai/actions/runs/39512081253), Vercel preview all passed |

The full suite includes persistent database startup/restart and historical migration-lineage tests. Earlier concurrent diagnostic runs hit host contention/cold-start deadlines; they are recorded in the ledger. Final application-head CI passed with unchanged existing assertions/timeouts and no retries. Targeted local sandbox checks passed20/20 on both PGLite and native PostgreSQL, and both sandbox browser workflows passed without retries. A local operator harness initially checked a temporary PostgreSQL initialization socket too early; waiting for the actual TCP server fixed that setup race before the native tests ran. These are overlapping suites, not additive unique-test totals.

Use the existing Node24/npm12.2 toolchain. The equivalent repository commands are:

```sh
npm run typecheck
npm run typecheck:aieo
npm run lint -- --max-warnings=0
npm run test:unit -- --maxWorkers=1
npm run build
npm run test:e2e -- --retries=0
npm run test:auth -- --retries=0
npm run test:calendar:cold
```

Run `test:calendar:cold` three independent times. Native PostgreSQL requires the existing disposable-database test configuration/guard; never point `test:postgres` at production. Contract setup/test instructions are in `contracts/README.md`. Actual local commands used the verified Node24 binary with isolated caches and private logs; receipts are under ignored `tmp/session12/`.

## Production facts and readiness

Current live URL: [cloud-realtor.vercel.app](https://cloud-realtor.vercel.app). It still serves source `a8a344a`, deployment `dpl_CXPtxfsYfahBvkAq1oF8mZMtT4AQ`.

A real-login baseline on that existing release passed four workflow groups: startup/login, retained full CiteLock guide/progress/subject, retained Social Desk revision/caption/private-image hash, and logout/private-media authorization. There were zero browser exceptions and zero same-origin HTTP5xx. No new AI request or external publication was performed in this baseline. Four runtime stderr entries were existing pg SSL future-major-version warnings, not request failures.

Production backup and upgrade rehearsal passed: a consistent 65-table snapshot restored with identical schema/content; nine pending migrations preserved all64 original application tables on their original columns and existing migration timestamps. The restored database reached32 migrations/74 tables, and the second pass was a no-op. The private backup and exact target/manifest are retained locally. This is a logical restore proof, not an attestation of hosted PITR or cluster-role recovery.

Production configuration now includes the sandbox enable flag and a generated Sensitive worker CRON_SECRET. Existing provider/auth/database secrets were retained. No production migration, new deployment or promotion has occurred. Live voice provider and billing configuration is still absent, so live calls/checkout are not verified.

## Controlled release sequence

The owner explicitly requested #49, #50, #51, then #52, and authorized removing outside approval as a blocker for the solo-maintainer repository. Required approvals changed from one to zero; strict `test`/`postgres` checks, administrator enforcement, resolved-conversation requirements and force-push/deletion restrictions are unchanged. Full policy snapshots were compared. No self-approval or admin merge override was used.

1. Fetch main and preserve newer work. Require green exact-head CI before each normal expected-head merge in the requested order; keep local and remote refs synchronized.
2. Recheck backup freshness and the pinned production target. The integrated source has **33 migration filenames**, with **10 pending** on the existing production database. Rehearse both migration orders and a fresh production backup/restore before applying the guarded production upgrade; verify preserved records/timestamps and repeat no-op.
3. Keep main Git auto-deployment held. Stage the exact merged source as a production-environment Vercel deployment without domain assignment; verify project/team/SHA/readiness, then promote the same artifact.
4. Use ordinary login for production acceptance: retained data, fresh CiteLock public-source guide and saved progress, real AI Social Desk draft through approval/manual handoff, persisted fractionalization simulation/revocation/refund/export/mobile, voice setup, unsigned-worker rejection, logout/private-media denial.
5. Record deployment-scoped runtime checks and the actual source/deployment IDs in the operator ledger and a PR52 receipt. These are post-deploy facts and are not claimed by this pre-release commit.

Live voice provider activation and real fractional issuance remain outside this release. No actual social publication, phone provisioning, payment or blockchain transaction is claimed.

## Final review corrections

Automated review identified two additional edge cases after the initial complete gates above. Both are fixed with regressions:

- Amount validation now completes string-format validation before numeric BigInt refinement. Invalid values such as `NaN`, `1,000`, and `1.2a` return normal validation issues from `safeParse` instead of throwing a JavaScript syntax error.
- The1,000-action limit now closes new claims, deposits and allocations while retaining a bounded cleanup path: each of25investors can revoke a still-approved claim and refund their full remaining escrow, for at most50 additional audited events. Repeated revocations and partial refunds cannot consume the cleanup reserve. Idempotent retries remain valid at the final cap.

The final sandbox suite passes20/20 on PGLite and native PostgreSQL, including the1,050-event boundary with all investors revoked/refunded, full history, reload persistence, and rejected ordinary/partial/no-op operations. Full final CI counts are in the table above.

### Older simulation access correction

Copilot's follow-up found that saved simulations beyond the first100 properties could not be reopened. The sandbox now pages through older references using a workspace-scoped creation-time/ID cursor and keeps the selected older simulation available during refresh. This preserves access to refunds, revocation and audit export without unbounded initial reads or a creation cap.

Local checks for this correction: sandbox20/20 on PGLite and native PostgreSQL, real browser2/2 with no retries, full TypeScript, zero-warning lint and production build. The browser regression creates101 real persisted cases, reopens the older one, refreshes it, refunds its test escrow, reloads and exports its history. No migration changes. Exact-head full CI passed598 unit/integration,160 native PostgreSQL and28 browser scenarios, plus the additional gates in the table above.

The earlier sandbox fixes remain in the integrated candidate. The production baseline above verifies the existing deployment only; consult the final PR52 release receipt for the actual completed deployment and workflow checks.
