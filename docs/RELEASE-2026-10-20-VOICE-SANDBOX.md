# Voice schema and fractionalization release — October 20, 2026

**Status: implementation committed and pushed; tests pass; production release awaits the repository's required approving review.** This report distinguishes the tested candidate from the currently live application. The audit trail is [FLAGSHIP-LEDGER.md](FLAGSHIP-LEDGER.md), Sessions11–12.

## What changed and why

The voice runtime had advanced beyond the checked-in database schema. Seven suites failed because tables/columns for provider provisioning, prompt versions, trusted billing, webhook retries and workspace mutation leases were absent. The six intended migrations already existed on the unmerged voice branch; they were reviewed against current SQL and integrated intact, together with the missing Stripe webhook route, generated router registrations, navigation and worker schedule.

A new upgrade regression starts with the older schema and existing workspace, assistant, prompt, call and billing rows. It proves preservation, stable provisioning identity backfill, no invented billing verification, lease uniqueness and repeat-migration no-op. Native PostgreSQL coverage now includes the voice suites. The portal return-URL helper retains the existing HTTPS/same-origin validation, and lint corrections preserve behavior.

The release also preserves the incoming onboarding, CiteLock and fractionalization work. The sandbox is authenticated, workspace/listing-scoped and persistent, with exact six-decimal arithmetic, revision/idempotency protection, mock identity expiry/revocation, deposits, allocation, refund and history export. Its independent Foundry harness exercises upstream ERC-3643 identity/registry behavior on a local chain. It does not verify real identities, establish property ownership, move money or deploy a token. See [FRACTIONALIZATION-ARCHITECTURE.md](FRACTIONALIZATION-ARCHITECTURE.md).

## Preservation and Git

- Initial main: `a8a344afe6d067bfa716281785adcd6fe0607e24`.
- `4e4079e`: preserved 85 incoming CRLF-only file changes separately.
- `96ee7cb`: verified implementation, schema, tests, configuration and sandbox.
- `3d9d9d348ed2dacb935c7b7a40089293aed64c36`: integrated existing voice branch `2de4041`; exactly the same tree as tested `96ee7cb`.
- Release branch: `fix/voice-schema-sandbox-release-20261020`.
- [PR52](https://github.com/Gnoscenti/realestate-ai/pull/52) includes current main and existing voice history. No reset or force push occurred.
- This closeout changes documentation only. Resolve its current commit and checks from the PR; application acceptance corresponds to the unchanged application tree above.

## Verified candidate

| Gate | Actual result |
|---|---|
| Targeted formerly failing voice suites | 52/52 passed |
| Full unit/integration | 593/593 in 72 files passed |
| TypeScript and AIEO fixture types | Passed |
| Whole-repository ESLint | Passed, zero warnings |
| Vite production build | Passed |
| Native PostgreSQL suite | 155/155 in 21 files passed; fresh migrations and repeat no-op |
| Compiled production artifact + PostgreSQL auth | 4/4 passed, including isolation, origin rejection and free/paid guide access |
| Full browser workflows | 27/27 passed with zero retries |
| Development auth | 3/3 applicable cases passed; production-only origin case covered above |
| Independent cold-start calendar runs | Three separate starts passed with zero retries |
| Local Foundry harness | 5/5 passed |
| Secret scan | No configured private values in 425 intended Git files |
| Exact application-head remote checks | [CI39488409081](https://github.com/Gnoscenti/realestate-ai/actions/runs/39488409081), [contracts39488408999](https://github.com/Gnoscenti/realestate-ai/actions/runs/39488408999), Vercel preview all passed |

The full suite includes persistent database startup/restart and historical migration-lineage tests. Earlier concurrent diagnostic runs hit host contention/cold-start deadlines; they are recorded in the ledger. All final local gates ran serially with unchanged assertions/timeouts and no retries. These are overlapping suites, not additive unique-test totals.

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

## Required next action and release sequence

GitHub rejected the normal expected-head merge because `main` requires **one approving review**, including for administrators. No review has been submitted. Auto-merge is disabled. The owner selected Copilot as approver on October20. The repository now enables GitHub's public-preview Copilot approvals feature; a fresh, actual approving review is required. The one-review requirement, required checks and administrator enforcement remain enabled. The earlier human-only route is superseded by this explicitly selected reviewer.

After approval:

1. Fetch main, preserve any newer changes, and confirm all checks and approval apply to the final PR head. Merge normally; verify ancestry and a clean local checkout.
2. Recheck the target and backup freshness. Run the guarded production migration from that exact reviewed SHA; verify all32 migration names, original timestamps and repeat no-op.
3. Stage a production Vercel deployment with domain assignment skipped, confirm project/team/SHA/environment and readiness, then promote that same build.
4. Run the prepared ordinary-login production acceptance: prior saved data; a fresh source-backed CiteLock guide; a real AI Social Desk draft through approval/manual handoff; sandbox creation, identity gating, precise deposit/allocation, reload, revocation, refund/export/mobile; voice setup and unsigned-worker rejection; logout and private-media denial.
5. Inspect deployment-scoped runtime logs and record the deployment, final SHA and actual results in the ledger.

**Not completed:** merge, production migration/deployment of this candidate, fresh production CiteLock/Social Desk output, and production voice/sandbox acceptance. Local and compiled-production tests do not substitute for these remaining checks. No actual social publication, phone provisioning, payment or blockchain transaction is claimed.
## Final review corrections

Automated review identified two additional edge cases after the initial complete gates above. Both are fixed with regressions:

- Amount validation now completes string-format validation before numeric BigInt refinement. Invalid values such as `NaN`, `1,000`, and `1.2a` return normal validation issues from `safeParse` instead of throwing a JavaScript syntax error.
- The1,000-action limit now closes new claims, deposits and allocations while retaining a bounded cleanup path: each of25investors can revoke a still-approved claim and refund their full remaining escrow, for at most50 additional audited events. Repeated revocations and partial refunds cannot consume the cleanup reserve. Idempotent retries remain valid at the final cap.

The updated sandbox suite passes19/19, including a database-backed1,050-event boundary with all investors revoked/refunded, full history, reload persistence, and rejected ordinary/partial/no-op operations. The full-suite counts above describe the earlier baseline; final exact-head CI must include these four additional cases. See the PR checks and private final receipts for the last commit's result. No human approval, production migration or deployment is implied by an automated code review.