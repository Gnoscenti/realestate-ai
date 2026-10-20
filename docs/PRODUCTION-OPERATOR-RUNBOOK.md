# Production operator runbook

This runbook governs releases of **Gnoscenti/realestate-ai** to the canonical Vercel project **cloud-realtor**. It is deliberately forward-only for data. It does not authorize billing, phone-number purchases, provider activation, customer communication, or an external action.

## Release authority and baseline

Only a release operator with approved GitHub, Vercel, database, and provider access may perform a release. `main` is protected: the `test` and `postgres` CI jobs must pass on an up-to-date branch, one pull-request approval is required, stale approval is dismissed on a new push, conversations must be resolved, and force-push/deletion are disabled including for administrators.

Vercel Git integration currently treats `main` as the production source. Before any release, verify in Vercel that the selected project is `cloud-realtor`, linked to `Gnoscenti/realestate-ai`; never use the similarly named `realestate-ai-workspace` project. Record the resulting deployment ID, commit SHA, timestamp, and operator in the release record.

## Pre-release gate

1. Confirm the intended pull request has passed `test` and `postgres`. The PostgreSQL job is the migration compatibility gate; it applies every migration twice against a disposable database and checks the compiled artifact with native PostgreSQL.
2. Review the exact merge commit, `vercel.json`, `.env.example` variable names, migration files, and any webhook or provider changes. No secret value belongs in a pull request, issue, log, or runbook.
3. Confirm production backups/PITR are healthy and record the backup or restore-point identifier. Test restores only into an empty isolated database ending in `_test` or `_tests`; never point test or restore scripts at production.
4. In the production runtime, confirm only the **presence** (not values) of the required database/auth variables and any release-specific server-only variables. Production must retain a real `DATABASE_URL`, `BETTER_AUTH_SECRET`, and canonical `BETTER_AUTH_URL`; the application must not fall back to PGlite.
5. If the release includes a schema change, inspect the production `_migrations` ledger. Migration filenames—not numeric prefixes—are the immutable ledger keys. Never rename or reorder historical migration files.

## Database migration

Run the committed migrator only in an approved operator session that has the intended production `DATABASE_URL` injected privately:

```sh
npm run db:migrate
```

The migrator takes a PostgreSQL advisory lock, applies each pending file in a transaction, and records the exact filename in `_migrations`. Capture the command result without credentials. On failure, stop the release, retain the error context privately, and restore service by rolling application code forward or back as appropriate. Do not delete migration rows, run a downgrade against customer data, or restore a historical database over newer customer writes.

After a successful migration, confirm the ledger contains the expected new filenames and perform the targeted application smoke checks below.

## Deploy and post-deploy smoke

Merge only after the protection rule is satisfied, then verify Vercel deployed the merged `main` SHA to the canonical alias. A successful Vercel build is not acceptance evidence.

Run safe HTTP checks first:

- `/` returns a successful application response.
- `/api/voice/calls` rejects anonymous access with `401`.
- `/api/internal/voice/process-webhooks` rejects an unauthenticated request with `401`.
- Webhook routes are checked with provider-safe invalid requests only until a separately approved test event is scheduled. They must never be exercised with a copied production signature.

Then use an approved synthetic account to verify authentication, tenant isolation, applicable entitlement gates, and only the specific feature changed by the release. Record HTTP status, commit SHA, deployment ID, and result. Do not use a real customer account for release validation.

## Voice-assistant pilot gate

Voice remains release-blocked until all of the following are recorded by the accountable operator:

1. The voice migration ledger is compatible with production and the current deployment.
2. Server-only Retell, Twilio, Stripe, `VOICE_WEBHOOK_BASE_URL`, and `CRON_SECRET` variables are present in Production and reference the canonical HTTPS origin. Values are never displayed or copied.
3. Stripe has an approved $79/month Voice Assistant price, a signed endpoint at `/api/webhooks/stripe`, and only the subscription lifecycle events supported by the application. No test or live checkout is considered an entitlement until its signed webhook is stored.
4. Twilio account authority, Elastic SIP trunk configuration, number pricing, number ownership, and Retell inbound routing are verified. Do not purchase or provision a number without explicit approval for that exact action.
5. The Retell agent is set to the approved data-storage and retention policy. Retell currently defaults retention to indefinite unless an explicit agent retention value is configured; application-side expiry does not change Retell's provider policy.
6. A monitored scheduler reaches `/api/internal/voice/process-webhooks` with the configured cron secret. The checked-in Vercel cron declaration runs daily at `04:17 UTC` after PR #49 is merged; confirm the active Vercel plan supports the configured frequency and inspect its scheduled-invocation logs.
7. A narrow consent-first test uses only approved test numbers. It must cover accepted and declined recording consent, inbound missed call, conditional-forwarding rollback, signed Retell webhook ingestion, Stripe entitlement gating, dead-letter visibility, and retention deletion. The application must not originate calls, send SMS, transfer calls, or auto-merge code.

A dead letter is visible to workspace operators through the persisted voice provisioning/webhook state and in-app notification records. This is not a substitute for an external on-call alert. Before a live pilot, name an owner, configure an external uptime/error alert destination, verify Vercel log access, and perform one deliberate failure/recovery drill.

## Rollback and recovery

For an application regression, roll Vercel back to the previously recorded healthy deployment after confirming its code is compatible with the **current** schema. Do not reverse additive data migrations automatically. Create a forward-fix pull request, run the protected CI checks, and redeploy through the normal process.

For data loss or corruption, stop write-producing integrations, preserve logs and deployment identifiers, and open the provider's approved incident path. Restore only into an isolated environment first, validate row counts and application access, then obtain explicit incident authorization before any production database restoration. Record RTO/RPO, backup reference, restoration owner, verification result, and follow-up migration plan.

## Release record template

Record the following outside the repository's source tree:

- Release operator, approver, UTC start/end time, merge SHA, PR URL, Vercel deployment ID and canonical-alias verification.
- CI run URLs, database backup/PITR reference, migration filenames applied, and smoke-test results using a synthetic account.
- Provider changes, if any, as variable **names and status only**. Never record credential values.
- Open risks, monitoring status, rollback deployment ID, and the accountable owner for follow-up.
