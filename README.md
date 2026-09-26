# RealEstate AI — Citelock and Social Desk

**Get discovered for the work you do best.**

Citelock finds where sampled AI searches overlook supported real-estate expertise, produces concrete public-content improvements, and tracks follow-through and comparable observations. No ranking guarantee or demonstrated lift is claimed.

The connected workflow:
1. Inspect public pages and accurately match the person, team or brokerage. Add exact permitted website passages, client-reported experiences or authorized case material, with dates, attribution, contrary evidence and permission.
2. Run a versioned unbranded question basket. Supported expertise adds relevant questions; named reputation checks stay separate. Store actual prompts, models, API surfaces, answers, provider citations, costs and failures.
3. Compare supported expertise, observed public-page coverage and relevant competitor recommendations. Abstain when evidence is insufficient.
4. Assemble usable page/FAQ text from exact permitted passages, with attribution, placement/internal-link instructions and case interview questions. Review facts and rights, approve the revision, publish through your authorized editor and confirm the live text.
5. Create a linked Social Desk draft and review it independently. Use manual handoff or a configured scheduler. Repeat the exact saved basket; compare compatible observations across dates.

Readiness and schema exports support this loop. Sales price and transaction volume do not measure service quality.

The integrated branch also retains the authenticated Gateway assistant, authorized Closed/Sold imports, reviewed outreach, and actual-photo studio with durable private uploads and PNG export. Social Desk connects retained media to independent fact/rights approval. Paid Orshot rendering and scheduler publication require separately verified provider configuration.

See `docs/INTEGRATION-2026-09-26.md` for current integration/migration evidence. Earlier release reports retain their original dates and are not fresh deployment acceptance.

## Run locally

Use Node 22+ and the declared npm 12. On Windows use WSL; this working tree has Linux dependencies.

```bash
npm ci
npm run dev                # http://localhost:8080, auth enabled
npm run typecheck
npm run lint -- --max-warnings=0
npm run test:unit
npx playwright install --with-deps chromium
npm run test:e2e           # development identity, desktop/mobile workflows
npm run test:auth          # separate real-session/account-isolation browser suite
npm run build             # compile only; no deployment database writes
npm run preview           # Nitro preview of the built Vercel artifact; configure DB/auth first
```

Without `DATABASE_URL`, accounts and server data persist in ignored `.local-data/pglite`. Use one local server per data directory; `PGLITE_DATA_DIR` isolates another instance. `PGLITE_IN_MEMORY=1` is for disposable tests. Set a stable `BETTER_AUTH_SECRET` locally if sessions should survive server restarts.

See `.env.example`. xAI and the default Perplexity Agent configuration have been verified live; other adapters retain explicit verification limitations. Failed observations are stored and excluded from successful-answer denominators.

## Native PostgreSQL verification

Use a dedicated disposable database whose name ends in `_test` or `_tests`.
Set `TEST_DATABASE_URL` through your environment or an ignored env file, then run:

```bash
npm run test:postgres      # apply all migrations twice, then critical SQL/race suites
PLAYWRIGHT_PRODUCTION=1 npm run test:auth  # after build; actual artifact + PostgreSQL
```

For restore validation, create a **different empty** test database and set
`TEST_RESTORE_DATABASE_URL`. With PostgreSQL client tools installed, run
`npm run test:restore`. It compares row counts and complete row-content digests for
every public table. It refuses a populated target and never drops tables. This
checks logical data restoration, not external roles, ACLs or hosted backup policy.

GitHub CI has independent PGLite and PostgreSQL jobs; the PostgreSQL job also
runs the authenticated browser suite against the compiled production artifact.
`npm run preview` uses Nitro because Vite's default loader targets a server file
that the Vercel preset relocates. Preview loads `.env.preview`, `.env.production`
or `.env`, not `.env.local`; inject the intended runtime variables explicitly.

## Release procedure

1. Provision PostgreSQL, a strong stable `BETTER_AUTH_SECRET` and the public HTTPS `BETTER_AUTH_URL`. Production refuses missing database/auth secrets or explicit auth origin and never accepts the development auth bypass or demo checkout.
2. Configure provider keys, bounded daily budgets and server-held `BETA_ACCESS_CODES`. RapidAPI is the approved live-data workaround. Configure Stripe only when the deployment can validate a real checkout.
3. Back up the target database. Run `npm run db:migrate` with `DATABASE_URL` injected by the release environment. The migrator serializes concurrent runners. It does not load `.env.local` automatically; local diagnostics can use `node --env-file=.env.local scripts/migrate.mjs`.
4. Run `npm run build` and deploy the Nitro/Vercel artifact through the team's release process.
5. Verify sign-in, access, a grounded batch, source permissions, exact content approval/live confirmation and social handoff against the deployment. Check backup restoration and budgets.
6. Roll back application code if needed; do not automatically reverse data migrations or delete source/observation history.

No production deploy or remote push was performed for this implementation. Consult the delivery report for current verification.

## Product boundaries

| Area | Current behavior |
| --- | --- |
| Citelock | Saved agent/team/brokerage identities across devices, with revision-safe edits; source-supported opportunities and exact content packages; immutable observations, revision audit and current-permission checks. API measurement, not consumer-app rankings. |
| Social Desk | Server-persisted drafts, explicit fact/rights approval, manual handoff and **user-reported** receipts. |
| Postiz | Encrypted connection, channel lookup and dispatch implementation. Unknown outcomes freeze a revision to prevent duplicates. Live publication not verified here. |
| RapidAPI | Exposed third-party observations with bounded, cached server calls. Identity, representation and media rights unverified. |
| MLS / RealTrends | Deferred licensed integrations; missing access does not block the rest of the workflow. |
| CRM / calendar / CMA | Browser-local working notes/calculations. Calendar has validated manual entry, preparation notes and calendar-file export; provider OAuth/sync and background notifications are not connected. |
| Market | RapidAPI lookup and arithmetic from explicit assumptions; no invented AVM, comps, confidence or forecast. |
| Email / transactions | Session-token Gmail scan; manual transaction tracking. Document review/e-signature not connected. |
| Native | Capacitor configuration and hosted-app shell; project generation, Xcode archive, signing and App Store review remain separate. |

Reviews are selected client reports, not audited outcomes. Source withdrawal keeps history and blocks new use.

## Architecture and audit trail

React 19, TypeScript, TanStack Start/Router, Vite 8, Tailwind/Radix, Better Auth, Postgres via `pg`, local PGLite, Vitest/Playwright, Nitro Vercel.

- `src/lib/aieo/visibility/`: expertise, observations, basket, providers, evaluation, reports, interventions, authenticated API.
- `src/lib/social-desk/`: validation, claims review, drafting, encrypted scheduler and revision repository.
- `src/lib/billing/`: atomic server entitlement.
- `migrations/`: schema, automatic locally and explicit in production.
- `docs/FLAGSHIP-LEDGER.md`: decisions, findings and verification history.
- `docs/CITELOCK-APPROVED-DIRECTION-2026-09-08.md`: supplied acceptance criteria.
- `docs/FLAGSHIP-BLOCKERS.md` and `docs/FLAGSHIP-DELIVERY-REPORT.md`: alternatives and release limits.

Private / proprietary unless otherwise stated by Gnoscenti.

## Perplexity Agent API

CiteLock now uses the official TypeScript SDK (`@perplexity-ai/perplexity_ai`) for independent web-grounded Agent answers. Configure server-only `PERPLEXITY_API_KEY` in your deployment or ignored `.env.local`; optional `PERPLEXITY_VISIBILITY_MODEL` defaults to `openai/gpt-5.6-luna`. Use an Agent `provider/model` ID; legacy `sonar-pro` is unsupported. Create keys in the [Perplexity API Console](https://console.perplexity.ai); never put them in `VITE_` variables or commit them.

Start locally with the server environment loaded (Node 22+):

```bash
node --env-file=.env.local node_modules/vite/bin/vite.js dev --host 127.0.0.1 --port 8131
```

In CiteLock, save the subject identity and run a visibility batch. Existing authentication, workspace permissions, entitlement and daily quotas apply. Each answer stores returned model, answer text, citations, retrieved source metadata, usage and provider-reported cost. Open its evidence row to inspect the answer and sources. The Agent surface is separate from historical Sonar results; create a new baseline after upgrading.

Explicit live smoke command (one real paid Agent request; no database writes):

```bash
node --env-file=.env.local scripts/smoke-perplexity-agent.mjs
```

It prints only HTTP status and response shape. A 401/403 indicates key/access failure; a 429 reports the cooldown in milliseconds and is not immediately retried. Application batches store the cooldown across requests and workspaces, retry at most once after it expires, and preserve uncertain outcomes as failures.

SDK 0.38.5 calls `/v1/responses`, the officially documented alias of `POST /v1/agent`. Configuration is fixed to web search, two research steps, 2,000 output tokens and bounded search context. Dynamic presets and previous-response context are deliberately omitted so subject discovery probes remain independent and comparable. Responses use the SDK's `output_text`; only `url_citation` annotations count as citation evidence. Retrieved sources and prose markers alone do not earn citation credit. This is an API observation, not a measurement of the consumer Perplexity app. Provider costs are reported from usage, not estimated from a price table.

Apply migration `0015_perplexity_agent.sql` through the normal `npm run db:migrate` deployment step. Production requires the project's existing persistent database and auth configuration.

Contracts: [Agent quickstart](https://docs.perplexity.ai/docs/agent-api/quickstart), [SDK](https://docs.perplexity.ai/docs/sdk/overview), [request/response reference](https://docs.perplexity.ai/api-reference/agent-post), [presets and reproducibility](https://docs.perplexity.ai/docs/agent-api/presets), [web-search sources](https://docs.perplexity.ai/docs/agent-api/tools/web-search), [rate limits](https://docs.perplexity.ai/docs/admin/rate-limits-usage-tiers), [pricing](https://docs.perplexity.ai/docs/getting-started/pricing).


## Citelock source-backed visibility guide

Signed-in users can open **CiteLock → Visibility guide** without a paid plan. Enter a name, target locale, public website and optional exact broker/ranking/evidence URLs. The server reads up to four public pages, records source observations and produces three concrete free actions. Full access expands the same saved guide to nine steps, including technical inspection, source placement, profile correction, Social Desk handoff advice, measurement and a four-week plan.

MLS access and a model API key are **not prerequisites** for this guide. Name/locale matches are textual observations, not license or ownership verification. Scoped RealTrends agent rankings retain publisher, production year, city and transaction-side category; conflicting annual volume claims remain explicit. Other ranking formats require manual confirmation. No automatic publication, invented GEO score or guaranteed LLM lift is claimed.

Progress is durable and workspace-owned. Every read and export is limited by current server entitlement; upgrading unlocks the saved plan and expiration hides the extra instructions. Three source inspections per workspace per day; the latest ten guides are shown. Apply migration `0016_citelock_guides.sql` before releasing.

Production configuration: see [VERCEL-PRODUCTION-RELEASE.md](docs/VERCEL-PRODUCTION-RELEASE.md). The verified project is **cloud-realtor**, linked to Gnoscenti/realestate-ai; do not configure the similarly named realestate-ai-workspace.
