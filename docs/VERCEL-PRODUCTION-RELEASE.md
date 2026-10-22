# Vercel production release

## Target and runtime

Release only **Gnoscenti/realestate-ai** to **cloud-realtor** in team **blaines-projects-a6ff7e30**.

- Project: `prj_iTHheNQygwNcQGy20gfWS5uAKOUj`
- Team: `team_5dxP6z6Zgv8qgjjSzKByZ9w1`
- Canonical origin: https://cloud-realtor.vercel.app
- Production branch: `main`
- Node: `24.x`; package manager: `npm@12.2.0`
- Framework preset: Other/null; root and output overrides: null
- Install/build commands are declared in `vercel.json`.

The similarly named `realestate-ai-workspace` project belongs to a different repository.

The hosted Neon production database, isolated preview database, stable production `BETTER_AUTH_SECRET`, and canonical `BETTER_AUTH_URL` already exist. Preserve them. Rotating the auth secret also affects encrypted scheduler credentials. Never copy production secrets or the production database into Preview.

The October 20 release merged PRs 49–52 and verified 33 migration filenames. The earlier 32-file snapshot predates the cumulative voice reconciliation migration. Filenames, not numeric prefixes, are ledger keys. Never delete or rename one to match an old count. See the [completed release receipt](https://github.com/Gnoscenti/realestate-ai/pull/52#issuecomment-6307628993).

## Automatic main releases

`vercel.json` enables Git deployments from `main`. Vercel's **Settings → Build and Deployment → Deployment Checks** must require the GitHub `test` and `postgres` jobs as **blocking checks for Production**. Keep production domain auto-assignment enabled during normal operation.

A merge starts a production build. It can receive a deployment URL before CI finishes, but production domains must stay on the prior release until both required checks pass for that exact deployed commit. GitHub's merge checks protect the PR head; Vercel's deployment checks additionally protect the resulting main commit. A green check on an earlier SHA is not sufficient. Do not use Force Promote to bypass a failed or pending gate.

GitHub main protection remains strict: pull requests, up-to-date `test`/`postgres`, resolved conversations, administrator enforcement, and no force push/deletion. The owner explicitly authorized zero required outside approvals for solo maintenance.

The official workflow is documented in [Vercel Deployment Checks](https://vercel.com/docs/deployment-checks).

## Schema-changing releases and the first restored pipeline test

Production database changes remain an explicit operator step; build does not run migrations.

1. Fetch main, preserve newer work, and inspect the final PR head, checks, review threads, and current protection policy. Do not merge yet.
2. Recheck the exact Neon target privately. Take a fresh consistent backup and prove a restore in an empty isolated database. Preserve existing rows, migration names, and timestamps; never restore old data over newer customer writes.
3. For any schema change or controlled pipeline test, pause production domain auto-assignment **before merging**. Leave Git builds and required deployment checks enabled. Record the previous setting. This holds the new production artifact while the database gate is completed.
4. After the hold is confirmed and all current requirements are met, merge normally. Verify main's ancestry, clean checkout, equality with origin/main, and record the exact merged SHA.
5. Inject the approved production `DATABASE_URL` privately and run `npm run db:migrate` from the exact clean reviewed merge SHA. The operator wrapper must match the pinned target and migration manifest, require a successful fresh restore receipt, and reject unrecognized ledger entries. Verify every current filename, original applied timestamps, and a second no-op pass.
6. Stage the exact production-environment build without domain assignment. With the temporary assignment hold, the native Git production artifact is staged. A manual equivalent is `vercel deploy --prod --skip-domain`. Do not promote a Preview artifact: that rebuilds under production configuration.
7. Verify project, team, SHA, target=production, READY state, successful required checks, and safe HTTP/authentication checks on that deployment URL.
8. Promote that same production deployment, verify the canonical alias and SHA, and restore normal domain auto-assignment. Do not force promotion around a failing check.
9. Verify ordinary login and retained data plus the changed workflows. Record deployment ID, source SHA, CI run, migration/backup receipts, and observed limitations.

Stop the release if a guard, check, migration, or smoke fails. Automatic deployment is not authorization to run destructive data changes.

## Environment configuration

Use the existing linked project and normal authenticated Vercel CLI. The local configuration helper is an explicit operator command:

```sh
node scripts/configure-vercel-production.mjs
node scripts/configure-vercel-production.mjs --apply
```

The first call is read-only. Apply uses Node 24/npm 12.2 settings, copies only supported nonempty local provider keys into Production, and preserves existing database/auth configuration. It never deploys or migrates. Do not run it with an unreviewed local Stripe key, and never print its values.

Standalone scripts do not automatically load `.env.local`; load a dedicated private environment explicitly. Do not overwrite `.env.local` with a production env pull: Secret/Sensitive values are omitted and custom local values may be lost.

## Voice checkout activation

Voice checkout requires all three server-only Production variables:

- `STRIPE_SECRET_KEY`: a valid key for the intended merchant and mode; prefer a restricted key with only the customer/price/Checkout/subscription/invoice/portal permissions this integration needs.
- `STRIPE_VOICE_PRICE_ID`: an active **USD 7,900 cents, monthly, interval_count=1, per_unit, licensed recurring** price in that same account and mode.
- `STRIPE_WEBHOOK_SECRET`: the actual signing secret for the registered **https://cloud-realtor.vercel.app/api/webhooks/stripe** endpoint. It is not interchangeable with a Stripe CLI forwarding secret or the social webhook's secret.

The code validates the $79/month price and includes 200 completed inbound AI minutes, with no overage authorization. Supported voice events are:

```text
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
```

Reuse a matching existing price and endpoint when possible. Register only supported events, retain the endpoint's API version, and copy its actual signing secret directly to Vercel as a Production Secret. Never invent a `whsec_` value, weaken raw-body verification, or treat a checkout return URL as paid access. Social billing has its own `STRIPE_SOCIAL_PRICE_ID` and `STRIPE_SOCIAL_WEBHOOK_SECRET`; they are separate products/endpoints.

After configuration, redeploy, verify price/account/mode, create and inspect an uncompleted checkout session, and confirm invalid webhook signatures are rejected. A separately authorized test-mode payment and signed delivery are needed to demonstrate subscription activation, replay, failure, and cancellation against Stripe. Do not charge a live card as a release smoke.

If Stripe authentication is unavailable, leave checkout honestly locked and record that blocker. Adding billing variables alone does not activate Retell/Twilio or establish the broker/consent/worker prerequisites in [the production runbook](PRODUCTION-OPERATOR-RUNBOOK.md).
