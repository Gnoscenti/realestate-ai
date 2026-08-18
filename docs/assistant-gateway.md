# Authenticated assistant and comp boundaries

This patch replaces the browser-supplied xAI context with an authenticated
server function. The server resolves the signed-in user, creates or loads that
user's personal workspace, and reads profile, listing, and verified Closed/Sold
records from Postgres. The client sends only the question.

## Data foundation

This change uses the server-owned data foundation merged in PR #25:

- `migrations/0002_workspaces.sql`
- `migrations/0003_inventory_comps_assistant.sql`
- `src/lib/workspaces/repository.server.ts`

The patch must stay based on that foundation so typecheck, PGLite preview, and
production migrations see the workspace, listing, sold-record, quota, and
generation tables.

The existing Zustand/browser inventory is intentionally not uploaded or trusted
by this endpoint. Until listing import/onboarding is wired to persist rows in
`listings`, the assistant will truthfully report that the server workspace has no
listings. Closed/Sold source-data browsing additionally requires the separate
CSV or licensed RESO ingestion flow to populate `sold_comps`; those rows are
rendered deterministically and are never sent to the model.

## Vercel AI Gateway

The server calls the Gateway's OpenAI-compatible chat completions endpoint with
native `fetch`. This avoids an unreviewed lockfile update while retaining one
central route for budget controls and observability.

The product objective calls for Vercel AI SDK. Once a networked build environment
can add `ai@^6` and regenerate `package-lock.json`, replace only
`gateway.server.ts` with `generateText({ model: "provider/model" })`; keep the
authentication, server-owned context, policy, quota, and audit layers unchanged.

Authentication is resolved in this order:

1. `AI_GATEWAY_API_KEY`
2. `VERCEL_OIDC_TOKEN` (automatically available on configured Vercel projects)

Optional settings:

- `AI_GATEWAY_ASSISTANT_MODEL` (default `openai/gpt-5.6-luna`)
- `ASSISTANT_REQUESTS_PER_MINUTE` (default 10, maximum 60)
- `ASSISTANT_REQUESTS_PER_DAY` (default 100, maximum 2,000)
- `ASSISTANT_INPUT_CHARS_PER_DAY` (default 250,000)
- `AI_GATEWAY_INPUT_USD_PER_MILLION`
- `AI_GATEWAY_OUTPUT_USD_PER_MILLION`

Every accepted provider attempt reserves durable minute/day buckets and records
an idempotent `assistant_generations` row keyed by the client request UUID.
Policy-blocked and unconfigured requests do not create audit rows. Ordinary
requests first claim their client UUID, before quota reservation, so retries
cannot consume allowance twice. Quota-rejected claims are retained as bounded
`blocked` audit rows. Provider token usage is stored after completion. A
best-effort per-instance burst guard runs before Postgres; configure Vercel
Firewall as the deployment-wide outer limit.

The request is capped at 800 output tokens and 25 seconds. Gateway
`disallowPromptTraining` is always required. Per-request zero-data-retention is
enabled only when `AI_GATEWAY_ZERO_DATA_RETENTION=true`, because that routing
control requires a supported Pro/Enterprise Gateway plan. Confirm the exact
project entitlement before enabling it. Per-user/tags usage metadata is sent to
Gateway, and the Gateway project budget remains the hard dollar backstop.

## Data and claim boundaries

- No client-supplied user, profile, listing, lead, or comp data is trusted.
- No public web-search tool is enabled in this patch.
- Ordinary model context omits listing prices and all Closed/Sold rows. Any
  currency-bearing model output fails closed.
- The assistant never ranks records as comps or produces a property-specific
  numeric value in this patch. A global workspace record count is insufficient.
  That remains blocked until an explicit server-owned subject listing is matched
  by hard geography, property-type, size, and recency rules.
- Authorized `mls_csv` or `reso_api` Closed/Sold rows may be displayed only as
  unranked source records with close date and provenance.
- Public websites and active listings are never labeled as verified sold comps.
- The Market page no longer produces address-specific formulas, forecasts, or
  synthetic market statistics; it routes users to authorized data setup.
- The CMA planning screen's browser-saved comparison set is explicitly not a
  client-ready Closed/Sold analysis.
