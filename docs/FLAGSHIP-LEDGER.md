# Flagship MVP engineering ledger

Started: 2026-09-04. Owner: Codex / principal-engineer audit.
Authoritative tree: /home/ttroj/code/realestate-ai.
This is the persistent audit trail, not a claim of completion. Append evidence,
decisions and verification as work progresses; do not replace earlier findings
with an optimistic summary. Read/search this ledger and its linked inventories
after context transitions before re-deriving earlier work.

## Request and acceptance criteria

Audit all first-party source, tests, configuration, CI, native packaging and docs.
Reconstruct Citelock's GEO/AIEO goal. Register every identified blocker with ranked
scenarios and practical alternatives, including researched MLS/data access.
Implement a defensible real assessment and end-to-end social MVP. No fake data
or fake success in critical paths. Preserve auth, tenant isolation, persistence,
truthful states, and meaningful tests. Optimize correctness, value, reliability,
simplicity, maintainability, security, then useful delivery speed. No questions:
make bounded product decisions and record reasons. Do not deploy, buy access,
publish externally, or claim unavailable approvals.

## Repo map and conventions

- Local HEAD c6ded14 at audit start; changes exist beyond HEAD. No remote used.
- Separate /home/ttroj/code/realestate-ai-rapidapi exists, but is not the source
  of truth for this task. No wholesale copying or branch reset.
- Parent AGENTS.md: Vercel stateless-function guidance applies; inherited Python
  project commands do not match this TypeScript app and cannot replace its scripts.
- Baseline tracked dirty files are largely CRLF conversion. Seven tracked files
  have substantive ignore-EOL differences; untracked RapidAPI files also exist.
- Source map, complete reading coverage and detailed architecture: pending audit.
- Secrets: never include values in this ledger, patches, logs or browser bundles.
- Skill guidance: architecture ADR tradeoffs and code-review security/correctness
  dimensions guide decisions. Skills fully read before repository edits.

## Audit findings

### A-001 — Working-copy divergence (verified)
The local original has social/trust code absent from the separate prior branch.
Risk: remote/prior assumptions would erase relevant work. Decision: inspect local
content, preserve uncommitted changes, and use this tree throughout.

## Citelock/GEO intent inferred from code and docs

Pending full source/doc reading. Distinguish site readiness, factual verification,
model recognition observations, causal visibility lift, and tamper evidence.
These are different claims and require different evidence.

### Current reconstruction (source read; assessment not implementation)
Citelock intends to build a person/brokerage identity-and-claim evidence graph,
check public site retrievability, gate professional claims, produce sourced FAQ/
JSON-LD drafts, and measure mentions/citations across model providers over time.
score.ts separates 100-point readiness from recognition and has explicit credential,
conflict, source-freshness and listing-representation gates. Six readiness pillars:
identity 25, evidence 20, local 18, answers 15, technical 12, freshness 10.
However, its readiness blends regulatory authorization with technical readiness,
so unavailable MLS/state coverage can block unrelated useful site improvements.
It does not measure causal lift. Exported schema is a proposed artifact, not deployed
content or proof a model indexed it. The valuable MVP promise is an evidence-backed
assessment and action loop, not guaranteed placement inside an LLM answer.

GEO platform README/core (read) emphasizes independent readiness vs observation,
evidence-linked recommendations and claim approval. Core opportunity code has
unreachable dominance/competitive branches after early citation/recommendation
returns; unvalidated score inputs can exceed 100. Do not copy blindly.

### A-004 — Deployment durability/auth configuration (verified source)
db.ts always falls back to in-memory PGLite without DATABASE_URL, including deployed
runtime. Auth server generates a process-local secret when BETTER_AUTH_SECRET is
absent. This can lose accounts/history or invalidate sessions across instances.
Production trustedOrigins includes localhost unnecessarily. requireUserId dev
fallback is guarded against a real DB; email/password is enabled. No email recovery/
verification delivery is configured. Auth popup checks origin but not event.source.
Workspace SQL membership checks and composite tenant foreign keys are present.
Browser workspace isolation is device-local, not cross-device synchronization.

### A-005 — Recognition is not yet a defensible GEO monitor (verified source)
recognition.server.ts uses plain chat completions (no search grounding), extracts
any URL from generated prose as a citation, uses substring token name matching,
stores requested rather than returned model, skips all failed calls, and executes
up to 24 sequential 30-second calls in one request. No global spend limit.
response_text exists via 0008 but is not retrievable by the normal read API;
no durable failure record, method version, prompt/response hashes or batch identity.
Provider API success is not consumer ChatGPT/Gemini visibility. Named prompts and
unprompted discovery are aggregated together. Repeated identical prompts under
new UUIDs count toward the 18/3/3 threshold. ProofGuard best-effort arbitrary webhook
returns recorded on any 2xx without a receipt/proof, no durable outbox; doc calls it
tamper-evident incorrectly. Existing nine mocked tests do not prove live behavior.

### A-006 — Untrusted data can become authoritative (verified source)
MLS adapter accepts a user-selected public base URL and promotes its mapped payload
to server_attested solely because server fetched it. Server execution does not prove
MLS provenance. Tokens are plaintext in citelock_mls_connections; partial/empty
batches can leave stale attestations current. Current env flag disables this adapter
by default, but legacy MLS sync endpoint paths still need audit/removal.
RealTrends public parser carries a year across unrelated HTML elements and never
binds result to the requested person/team. Every parsed number is labeled verified.
Enterprise contract is invented normalized JSON, not vendor-approved API evidence.
Cache is shared by URL, with no tenant/license boundary for an enterprise feed.
Decision direction: no authoritative production claim until identity, rights and
provider contract are established; keep RapidAPI as observations.

### A-007 — Dispute governance incomplete (verified source)
Repository can record/list/resolve disputes, but API has no resolution operation.
Changing a dispute status does not change the scoring evidence, despite comments
claiming it unpauses attestation. Scope handling differs from score.ts (H1/H2).
No durable audit trail on resolutions, subject verification of attached production
figures, or immutable DB enforcement for allegedly append-only tables.

## Blocker register

Each entry must include evidence, concrete scenarios, value/risk ranking, decision,
implementation state and residual external dependencies. Pending source audit.

## Decisions made and why

### D-001 — Local authoritative tree (accepted)
Use /home/ttroj/code/realestate-ai because it contains the requested uncommitted
product work. Do not use GitHub or the earlier summary as implementation truth.

### D-002 — Persistent ledger and coverage (accepted)
Keep this file plus a per-file coverage manifest and research/verification notes
on disk. Record actual reads and checks, not inferred coverage. Generated build
output, third-party dependencies, secrets and binary assets are inventoried but
not misrepresented as first-party source reviewed.

## Verification results

- 2026-09-04: inspected local git status and ignore-EOL diff; no remote fetch.
- Standard Windows sandbox execution fails before process creation; explicitly
  scoped escalated local commands are available. No production system touched.
- All prior-turn test outcomes are historical, not evidence for this tree.

## Open items

1. Inventory and read all first-party files; record omissions explicitly.
2. Establish current build/type/lint/unit/browser baseline.
3. Research primary-source MLS/RESO/RealTrends and social approval constraints.
4. Complete blocker scenario register and product decisions.
5. Implement flagship workflows and fix regressions.
6. Verify in isolated databases/browser; audit secrets and diff.
7. Deliver honest implemented/tested/manual/inferred/recommended status.

## Running work log

- Start: instruction files read, local working-copy ownership resolved; ledger opened.
- User clarified authoritative folders: Z:/home/ttroj/code/realestate-ai and
  Z:/home/ttroj/code/geo-aeo-platform. Z: maps to \\wsl.localhost\Ubuntu.
  GEO platform is also in scope for audit/reuse. It has no separate .git:
  Git resolves to the dirty parent /home/ttroj/code. Never stage/reset that parent.
- Full reads completed: package.json, README.md, USER_GUIDE.md,
  docs/citelock-trust-adapters.md, docs/voice-assistant-architecture.md, IOS.md,
  IPHONE.md, Beta comments/README.md, .env.example, both .github workflows,
  .gitignore, .prettierrc, tsconfig, Vite/Vitest/Playwright/ESLint configs,
  vercel.json, capacitor.config.ts and startup.sh.
- Initial baseline in authoritative tree: typecheck passes; 203 tests pass in
  26 files. Lint fails (5 errors, 21 warnings). No fixes yet, no suppression.
- DB/migrations/workspaces combined read was truncated; reread required before
  marking coverage. Research output also truncated; retain only sources reread.

### A-002 — Contradictory capability claims (verified docs)
README says simulated onboarding, while USER_GUIDE promises real MLS/calendar
sync and recurring Pro after $9.99. iPhone guide promises demo checkout without
keys and deploy-default readiness. IOS.md correctly calls bundled mobile assets
and purchase policy blockers; capacitor config calls remote loading recommended.
Trust-adapter doc claims all four production trust paths replace fixtures, but
that is an implementation assertion requiring code/runtime evidence, not proof.

### A-003 — Baseline checks (verified)
Lint errors: agent-memory regex escape, website-scrape regex escape and let/const,
  workspace control-character regex, calendar useContractor action misclassified
as a Hook. Warnings include missing effect dependencies, dead seed imports.
CI currently omits lint, so these failures are not gated.
- Completed full reads: db.ts; every SQL migration; workspaces/{types,api,
  repository.server}; all auth files; aieo/{types,provenance,scan-types,api,
  recognition.server,score (all 1207 lines),scan.server,repository.server,
  attestation.server,realtrends.server}.
- User explicitly approved reuse of the local RapidAPI branch as the no-MLS
  workaround. Compare and selectively integrate; do not overwrite authoritative
  social/trust code. Earlier successful tests still are not this tree's evidence.
- GEO docs combined read truncated: unified design and consolidation document
  require chunked rereads. GEO README, package manifests, core scoring/opportunity
  implementations and tests were visible, but coverage must be rechecked by file.

### A-008 — Social publishing is simulated (verified full source)
Read all social-agent.ts, social-accounts.ts, imagine-api.ts, imagine-media.ts,
marketing.tsx, social-generate-buttons.tsx. Captions are deterministic templates,
not model calls; defaults invent bedrooms, market conditions, open-house times,
client closings and offered services. X length truncation does not change stored
caption parts. Fake timer pipeline includes QA without executing QA. Handle-only
connect and browser-only queued/published states are not OAuth or publication.
Photo source infers MLS from an ID/role and ignores media-use rights. Image/video
API is authenticated but lacks durable jobs, bounded spend and approval checks.
Direction: approval-first, sourced editable publishing desk with durable tenant
storage, manual export/native-share handoff and explicitly user-reported receipts.
Direct publishing must remain unavailable unless real provider authorization exists.

### A-009 — Broader simulated and destructive local workflows (verified store)
Full store.ts read: all CRM/calendar/social state is browser-local. Email empty or
failed live reads inject fabricated inbox messages. Calendar connect is an email
string and sync updates timestamps without importing. Document review invents
findings and random 90–97 confidence without reading a document. Hydration purges
records using broad name/id heuristics (can delete real records); clearOnboarding
and practice loading replace whole inventories. Rescan async completion can apply
to a changed profile/session. Paid entitlement is mirrored client-side; server billing
paths still need audit. These must not be marketed as automated/live capabilities.

### A-010 — Crawler/assessment limitations (verified source)
Read aieo route, ca-dre.server, safe-outbound-url.server, scrape-site/server and
website-scrape.ts fully. Site scan only audits homepage; robots/sitemap/bot access
are explicitly unmeasured. No response hash or content excerpt preserved. URL DNS
checks occur before a separate fetch resolution: rebinding not pinned. Cross-origin
scrape redirects allowed; safeFetch can forward supplied headers if a future caller
combines credentials and that option. IPv6 2000::/3 check accepts special transition
ranges. Static HTML regexes have parse limitations and recursive JSON-LD walk lacks
depth budget. Page status unknown is normalized to pending, dimensions unknown to0.
CA registry requires exact name token set, safely rejects mismatches but can miss
middle-name variations. Registry outcome 'active' ignores expiry until later score.
UI swallows history-load failures as no history; late scan/probe state can attach to
changed profile. Legacy MLS attestation UI is visible despite backend-disabled flag.

- Skills added: testing-strategy and deploy-checklist fully read; use risk-based
  tests and an explicit release/rollback gate. Memory-management inspected only:
  its glossary workflow is not needed; user-requested ledger remains authoritative.

### A-011 — Billing is not durable entitlement (verified full source)
Read billing.ts, stripe-checkout.ts, checkout.ts, checkout-origin.server.ts,
Paywall and billing/login routes. Stripe ownership/product/amount checks exist.
But confirmation only grants browser state for 30 days from confirmation, not
payment: replay can extend access. No durable entitlement/webhook/revocation.
Free codes are shipped in client JavaScript despite masked UI; code access ignores
its stated expiry. Paid model APIs check authentication, not entitlement. Promo
codes are allowed by Checkout but exact amount equality rejects discounted payment.
Demo signature split on '_' breaks when base64url nonce/signature contains '_'.
Login correctly hides unconfigured broker OAuth; no visible OAuth false-connect.
Password recovery/email verification missing. Never sell the unsafe entitlement path.

### A-012 — Assistant, inbox and integration boundaries (verified source)
Read assistant-api.ts and ai.ts fully (truncated middle reread410–460 and290–410).
Live assistant has no quotas/timeouts/output cap and usedSearch(...) || true lies.
Fallback retries another paid model request without search. User facts are inserted
in system prompt; citations not validated. Legacy AVM fabricates comps, confidence,
and 'recent sales' support. CMA guesses condition from relative price, includes
unsold/rental rows without comparability gates, can divide by0. Not a real valuation.
Read email-scan/email-alerts/calendar/voice all. Gmail metadata is real when token
provided but unbounded fetch times/no quota; browser token shared across sessions.
Calendar provider scaffolds and template reminders are not actual imports or AI.
Voice correctly has no permissive provider implementation; setup GET creates draft.
Read MLS fetch/sync/platforms and MLS route fully: token vault is plaintext in
localStorage and unscoped. Arbitrary user-selected URL legacy fetch still callable;
role mapping exact name/id is better than prior loose-match assumption, but server
fetch cannot establish provider authority. No pagination/removal sync/contract proof.
Read all RapidAPI current files/panel: mostly sound fixed-host/cache/quota foundation;
normalize misses current agent cardTitle and property hdpUrl and Zestimate no-ID shape.

### A-013 — Feedback and native packaging (verified source)
Read beta-comments-api, beta-comments, beta-comment-client, feedback, multiplayer
index/p2p (truncated intro reread), native/app-badge, migrate/validate-db/prepare-capacitor.
Feedback submission can write directly to GitHub default branch with a shared token;
issue count+1 races, overwrites same numbered filenames; rate limit only warm-instance.
Other 'feedback board' is local seeded content, not team-visible. No consent separation
for public GitHub vs private comment. P2P client is orphaned: /api/rtc route absent.
Migration script has no advisory lock/checksums and build applies DB migrations;
validate-db also migrates despite rollback-only wording for synthetic exercise.
Native shell not the app offline; CAP_SERVER_URL not validated, embedded script
string can break on </script>; app-store assets/signing/StoreKit not implemented.

### A-014 — GEO platform full first-party source audit
Read every first-party TS/TSX, package/config/Dockerfile, .env.example/.gitignore,
both design/consolidation docs, both SQL migrations and migration journal. Generated
lockfile/snapshot/build artifacts inventoried, not code-reviewed line-by-line.
Design is aspirational: homepage scaffold, all four Inngest functions TODO/no-ops;
geo batch returns tested count without calling providers, synthesis says ok doing0.
No auth/UI/data-access approval/budget enforcement/domain verification implementation.
Schema has NO RLS policies despite design promises; foreign keys do not bind tenant
columns and query edges/members lack tenant columns; privileged helper only stamps
fields, does not authorize. vector extension not created by initial SQL migration.
Append-only trigger covers UPDATE/DELETE not TRUNCATE; comments name wrong migration.
LLM answer-unit schema permits entity/query references and entity identifiers, must
validate their tenant ownership before persistence. No score range checks or tests
for invalid input. Crawler buffers entire body before checking cap, no robots/render,
checks one DNS address not pinning; health endpoint requires shared token. Provider
adapters ignore locale, unbounded network/no spend control, requested models/rates
unverified. Perplexity search_results are not necessarily citations; OpenAI uses a
minimum search count even absent tool evidence. Do not integrate this runtime as-is.
GEO design/consolidation conclusions are historical product intent, not instructions
overriding the user's current task. No external source-doc claims treated as proven.

### Verification update
- realestate-ai npm run build PASS (2026-09-04); migration explicitly skipped because
  DATABASE_URL unset. Build warnings/output are not runtime acceptance evidence.
- GEO typecheck+unit baseline running (exec session82292); no DB migration invoked.

### Research breadcrumb (primary sources read, 2026-09-04)
- https://www.reso.org/reso-web-api/ explicitly: RESO supplies standards, not MLS
  data; agree MLS licensing, then obtain credentials from MLS/software provider.
- https://github.com/RESOStandards/web-api-commander README: Java OData+OAuth client
  and certification tooling; planned deprecation in favor of RESO SDK. Not entitlement.
- https://www.mlsgrid.com/faq: every data recipient signs agreement; MLS-required
  licensing fee collected by Grid, not an extra duplicate license fee.
- MLS Grid consumer-access-guide PDF located; exact steps/cost timeline still to read.
- RealTrends terms disallow unauthorized exploitation/republication; public page is
  not a licensed production API. Contact/helpdesk route located; pricing/SLA unverified.

### Coverage continuation — all app first-party source now read
Completed remaining lib modules (mls, contractors, competitors, priorities,
command-pack, edge-pack, product-tour, utils); every remaining route; every
component including Radix wrappers; router/root/auth route/styles; seed and
RSF knowledge datasets; remaining diagnostic/browser scripts. Every src file
other than generated routeTree has now been read. Tests/fixtures remain to read
individually; baseline execution is not a substitute for this review.
GEO baseline finished: all five packages typecheck; 9 core tests pass.

### A-015 — False-success surfaces and unsafe derived numbers (verified source)
Transactions: signature request immediately changes status to signed without a
provider or signature; upload has no file input. Search: tour success doesn't
create an appointment/send a request, client packet doesn't exist, price alert
and ADU appreciation text hardcoded. Leads: nurture/SMS/email successes do not
send/draft; priority heuristic is called conversion probability. Rentals: empty
occupancy divides by zero; mark-leased invents tenant/date/rent, price changes
ignore lease constraints. Market: synthetic AVM/comps/forecasts called live.
Dashboard exposes all these as core modules, not just hidden scaffolding.
MLS.ts contains seeded inventory generator, contractor directory has invented
contacts; RSF knowledge asserts Aug-2026 market conditions with no sources.
Priorities' response-time statistic actually measures elapsed time since last
touch, not lead response latency. Marketing comparisons and 40% uplift unverified.
Onboarding requires an MLS board despite optional-setup language and has stale
scan-result races; dropdown portaled below full-screen wizard (z50 vs z100).
Root disables browser zoom. Mobile navigation lacks accessible button name /
dialog title. AppShell and assistant background calls lack cancellation/session
binding at completion. No visible sign-out control in shell. Help tour component
is orphaned despite 'replay from help' instructions. Local comments are not team
delivery; beta drawer does describe GitHub destination but not public exposure.

### D-003 — MVP boundary (accepted, implementation pending)
Focus flagship navigation on Citelock evidence assessment, RapidAPI observations,
and approval-first social drafts/manual handoff. Do not label API observations
as MLS verified or causal LLM lift. Hide unsupported valuation/e-sign/inbox/
autopublish surfaces; reject unsafe server entrypoints, not just hide buttons.
Preserve existing user records and historical modules in source. Deferring a
capability is preferable to inventing its result. Broader CRM is a local notebook,
not a substitute for an established system of record; don't compete on breadth.
The exit-oriented asset is a trustworthy evidence/action history and repeat use.

### A-016 — Test coverage versus product confidence (verified)
Read all 26 unit files, 8 e2e/helper files, 2 fixtures, manifest and SVG. Source
audit complete excluding generated artifacts/locks, binaries and secrets.
Tests exercise meaningful conflict/tenant/parser cases, but also codify unsafe
assumptions: scraped RealTrends numbers become verified and ranking year is used
as production year; arbitrary injected MLS payload becomes server-attested; plain
prose URLs count as recognition citations. E2E injects browser billing state and
disables auth; that is not real sign-in/payment verification. No social end-to-end
tests. No SQL immutability test, no failed-provider history assertion. Scrape
integration mutates environment without restoring its original auth setting.

Research decisions/scenario analysis now in FLAGSHIP-BLOCKERS.md. New evidence:
RealTrends public downloads are explicitly non-commercial and ranking-year !=
production-year. Official RESO TypeScript client SDK now documented; use only
after licensing. No published universal approval cost/SLA found. MRED sequence
verified; broken Grid PDF not counted as evidence. No product edits yet.

### Implementation started — social persistence (unverified, 2026-09-04)
Added 0009_social_desk.sql and social-desk types/repository/API. Includes server
workspace authorization, validated captions/platform limits, conditional revision
updates, atomic audit events, fact/rights approval, manual handoff and explicitly
user-reported post receipts. UI wiring and tests NOT YET DONE. No platform publish
or production migration executed. These source additions are not a working-feature
completion claim. Resume implementation from these files, preserving prior work.

### D-004 — User correction: discovery improvement is the flagship
User rejected assessment-only value: agents already know their work; Citelock must
scan agent/brokerage visibility and produce real insights that get them seen.
Supersedes the Citelock portion of D003 and the assessment-only scenario in the
blocker register. Do not ship a readiness report as the completed differentiator.
Social approval/manual handoff and no-MLS constraints still stand.

Designed expertise-to-discovery gap algorithm in CITELOCK-VISIBILITY-DESIGN.md:
identity-bound client-experience evidence, fixed unbranded client-intent baskets,
grounded provider observations, source-supported competitor gaps, ranked concrete
interventions, website/social artifacts and repeat experiments. Quality is not sold
volume. Price distribution is market context, not agent quality or assumed expertise.
Reviews are client-reported evidence with sample/selection limits, not verified
service outcomes. User intent is client fit and exposure, not a production ranking.

System-design skill read and used to document contracts, data model, worker/cost
limits, tradeoffs and acceptance gates. Competitive primary-source check found
Profound/Scrunch already market tracking/citation/content recommendations. Proposed
vertical differentiation is a testable product thesis, not proven uniqueness.
Research did not run a live agent scan or establish review API availability.
Algorithm design is complete as a specification; runtime implementation, empirical
calibration, live lift and full flagship acceptance remain open.

- Post-design/source-addition check: npm run typecheck PASS (exit 0). This only
  verifies TypeScript compatibility, not social SQL/runtime correctness or the
  proposed visibility algorithm. No new live provider or browser verification.

---

## Session 2 — 2026-09-07 (Claude, principal engineer). Continues the ledger above.

### Re-verification of prior findings (this tree, HEAD c6ded14 + uncommitted work)
- Re-read in full: all aieo/* modules, score.ts (1207 lines), aieo route, social-desk/*,
  social-agent.ts, marketing route, imagine-*, app-shell, dashboard, store.ts, website-scrape,
  scrape-site*, safe-outbound-url, auth (server/middleware/verify/isolation/client/
  workspace-scope/gates/use-current-user), workspaces/*, rapidapi/*, mls-fetch/mls-sync/
  mls-platforms/mls route, billing/stripe-checkout/checkout/paywall/login, db.ts, all
  migrations 0001–0009, migrate.mjs, CI, tests for aieo/citelock/rapidapi, fixtures.
  Secondary modules and remaining tests delegated to two read-only audit agents (results
  appended below when received). Findings A-004 … A-016 CONFIRMED against source.
- Baseline (WSL, node 22.23.2): `npm run typecheck` PASS; `vitest run` 26 files /
  203 tests PASS; `eslint .` FAIL 5 errors + 21 warnings (see A-003); Playwright chromium
  present in WSL cache. Windows-side node cannot run this repo's node_modules (Linux
  binaries) — run every check through WSL.
- Working tree: 7 tracked files differ from HEAD ignoring whitespace (rapidapi/no-MLS
  work); untracked: docs/FLAGSHIP-*, migrations 0008/0009, rapidapi/*, social-desk/*,
  rapid-data-panel, scripts (check/probe/verify providers), tests rapidapi.
- Live provider probe (2026-09-07, keys from .env.local, no key values recorded):
  - xAI `POST /v1/responses` with `tools:[{type:"web_search"}]` on grok-4.6 → HTTP 200,
    output contains `web_search_call` items and a `message` whose `output_text` carries
    `annotations[]` of `type:"url_citation"` with `url` + `title` (18 on the probe prompt),
    plus `usage.server_side_tool_usage_details.web_search_calls` and
    `usage.cost_in_usd_ticks`. This is provider-returned citation metadata — the
    defensible basis for a "cited" measurement (replaces the prose-URL regex in A-005).
  - Gemini: `gemini-2.5-flash` returns 404 "no longer available to new users";
    `gemini-3.5-flash` returns 429 RESOURCE_EXHAUSTED (billing/quota not enabled on
    this key). Adapter can be implemented from the documented shape but is NOT live
    verifiable in this environment.
  - RapidAPI (prior session's tmp/live-provider-checks.json): search/coordinates/polygon
    OK (41 rows), agent-search returned 0 agents for san-diego-ca; details/address failed.
- A-017 (new, verified): social-desk API (src/lib/social-desk/api.ts) is imported by no
  route or component — persistence exists with zero UI. Marketing route still runs the
  simulated pipeline and browser-only publish states.
- A-018 (new, verified): recognition runner stores `model` as the *requested* model and
  runs sequential 30s calls inside one server function (up to 24) — incompatible with
  serverless execution limits; no per-run failure record (failed calls are skipped).
- A-019 (new, verified): `.env.local` contains RAPIDAPI_KEY, XAI_API_KEY, GEMINI_API_KEY
  and CITELOCK_MLS_ENABLED (values not recorded). No OPENAI/ANTHROPIC/PERPLEXITY/
  STRIPE/DATABASE_URL/BETTER_AUTH_SECRET locally — local runs use PGLite + preview secret.

### Decisions (Session 2)
- D-005 — Citelock flagship = "Visibility": grounded, unbranded client-intent probes across
  answer engines with provider-returned citations, competitor/source extraction, ranked
  source-gap opportunities, drafted interventions with live-page verification, and
  repeat batches for trend. Supersedes the branded-only recognition runner (kept for
  historical rows only). Rationale: this is what an agent can act on and what the market
  (Profound/Scrunch) has validated as the category; real-estate specificity is the wedge.
- D-006 — No MLS in the MVP. Remove MLS credential entry, attestation endpoints and
  sync code paths; keep 0007 tables (never drop applied migrations); RapidAPI stays a
  labeled market-observation source; website listings are "observed, representation
  not asserted". Readiness no longer blocks on provider role proof — it never publishes
  representation claims instead.
- D-007 — Social = approval-first desk with three real exits: (1) AI draft from declared
  facts only (grok, fact list echoed back, fair-housing check), (2) publish/schedule via
  the agent's own Postiz workspace (agent-supplied API key, server-encrypted) which holds
  the platform OAuth, (3) manual handoff (copy/share/download) + user-reported receipt.
  No direct platform OAuth in this release (app-review timelines, see blocker register).
- D-008 — Entitlement becomes server-side (workspace_entitlements from 0002) before any
  paid provider call; browser billing state is a cache, never the authority.
- D-009 — Production fails closed without DATABASE_URL and BETTER_AUTH_SECRET.

### Audit agent results (Session 2, two read-only passes over secondary modules, tests, docs, native)
- A-020 (P0, security): Gmail OAuth access token written to BOTH sessionStorage and localStorage
  (routes/alerts.tsx:73-76), read back every 3 minutes by an unattended scan (store.ts:355-443,
  app-shell.tsx:285-306), never cleared on disconnect. Fix: never persist; clear on disconnect.
- A-021 (P0, truthfulness/safety): buildDemoInboxScan (email-alerts.ts:353-410) fabricates a
  "wire instructions & CD timeline" escrow email, a DocuSign envelope, an inspection report for a
  real-looking address, and replies attributed to the user's real leads; store falls back to it
  whenever a live scan returns zero messages and pushes the count to the OS badge. Remove.
- A-022 (P0, liability): transactions.tsx fakes upload ("AI review queued" with no file input),
  fakes review ("No material issues detected", confidence 90+random), and flips documents to
  "Signed" on "Request sign". Disable these paths; show honest not-connected states.
- A-023 (P0, data loss): looksLikeSeedLead/looksLikeSeedProperty (import-data.ts:389-412) purge
  on name match ("Mike Chen", "David Park"), "@email.com" domains, "(555)" phones, or the
  substring "Seed" in a description, automatically on rehydration (store.ts:1634-1639). Remove
  automatic purge; match only synthetic ids.
- A-024 (P1, security): scripts/prepare-capacitor.mjs interpolates CAP_SERVER_URL into an inline
  script via JSON.stringify without escaping "</script>" and without a scheme check;
  capacitor.config.ts allows navigation to *.vercel.app and disables app-bound domains.
- A-025 (P1): false-success toasts that also falsify SLA clocks — leads.tsx ("Call logged",
  "Email drafted", "SMS queued", "Nurture sequence sent", "AI analysis"), search.tsx ("Tour
  request sent"), properties.tsx ("Lease started", "Maintenance items cleared"), feedback.tsx
  local board claims logging; recent-activity makes each permanent.
- A-026 (P1): hardcoded market statistics presented as live (market.tsx snapshot, search.tsx
  recommendations, leads.tsx "ADU interest up ~40%", priorities.ts Inman/NAR figures with no
  source, mls.ts synthesized MLS numbers + comps derived from the subject's own value).
- A-027 (P2, dead code): src/lib/multiplayer/* (~570 lines, posts to a non-existent /api/rtc),
  product tour (never rendered), calendar.ts buildImportedAppointments (fake clients),
  assorted dead exports. Delete.
- A-028 (tests): no test exercises real sign-in, real payment verification, authMiddleware
  reject paths, the social desk, or the CiteLock scan through the server function; e2e writes a
  forged billing object to localStorage and asserts it (paywall-beta.spec.ts) — the exploit is
  the fixture. realtrends.test.ts canonizes "scraped page = verified independent evidence".
- Positive patterns to extend: voice/providers.server.ts (no permissive mock), beta-comments
  drawer per-destination truth, checkout server verification.

### Implementation log (Session 2)

Built (all in this tree; see FLAGSHIP-DELIVERY-REPORT.md for status per item):
- `migrations/0010_citelock_visibility.sql` — visibility batches/runs, quota buckets, interventions,
  social publishing states + Postiz connection + publications, access-code redemptions, checkout grants.
- `src/lib/aieo/visibility/` — `basket.ts` (v1: 5 unbranded intents + 2 branded checks, name never in
  unbranded prompts), `providers.server.ts` (xAI Responses+web_search live-verified; OpenAI/Gemini/
  Perplexity from docs), `evaluate.ts` (deterministic mention/citation/identity; provider citations
  only), `report.ts` (rates with n/N, per-intent, competitors, source gaps, ranked opportunities with
  explicit factors, limits list), `engine.server.ts` (resumable leased slices, retry-once for transient
  codes, daily quotas, cost in USD ticks, trend), `interventions.server.ts` (checklist without a model;
  page/FAQ drafts from facts via grok with facts-used echo; approve → deployed → verified by fetching
  the live page), `api.ts`.
- `src/lib/ai-text.server.ts` — structured JSON completion (xAI), fails closed without a key.
- `src/lib/billing/entitlement.server.ts` + `api.ts` — server-side entitlement (codes from env, checkout
  grants recorded once, replay-safe); `checkout.ts` records grants; paywall redeems via server;
  app-shell asks the server and corrects the browser mirror.
- `src/lib/social-desk/` — `types.ts` (media, origin, publish states), `fair-housing.ts` (deterministic
  review), `drafting.server.ts` (facts-only captions with quota + entitlement), `postiz.server.ts`
  (AES-GCM encrypted key, channels, upload, create, status), `repository.server.ts` (revision-safe
  edit/approve/handoff/receipt + publish/refresh with failed-publication records), `api.ts`, `suggest.ts`.
- `src/routes/aieo.tsx` (CiteLock: run batch, where you show up, what to fix, readiness, evidence) and
  `src/routes/marketing.tsx` (Social Desk) rewritten; `src/routes/mls.tsx` → Listings & Data (no
  credentials); app-shell nav reordered (CiteLock, Social Desk first); module grid copy made truthful.
- Removed: MLS sync/attestation/platform vault, recognition probe runner, simulated inventory
  generator, practice samples, demo inbox, fake doc review/e-sign, campaign templates, Grok Imagine
  buttons, multiplayer, product tour, seed purge heuristics, published beta codes in docs/placeholders.
- Fail-closed production checks in `db.ts` and `auth/server.ts`; Capacitor shell escaping and
  navigation allowlist fixed; Gmail token no longer persisted.
- Tests: +4 unit files (visibility report/engine, entitlement, social desk: 32 tests); aieo-score
  expectations updated for warn-not-block listing role; rapidapi test trimmed; e2e helpers now redeem a
  code through the server; citelock/social e2e rewritten. CI gains a lint gate (max-warnings 0).

### Verification log (Session 2)
- WSL node 22.23.2: `tsc --noEmit` PASS; `eslint .` 0 errors / 0 warnings; `vitest run` 27 files /
  197 tests PASS; `vite build` (nitro/vercel preset) PASS.
- Playwright: cannot launch Chromium in this WSL (missing libnss3/libnspr4, sudo requires a
  password). Only the API-level smoke test ran (PASS). Browser flows were verified by hand in the
  desktop browser pane against the auth-on dev server (port 8123, BETTER_AUTH_URL set to that port
  because the machine already has unrelated services on 8080/8090):
  - Sign-up with email/password works; signed-out visitors are redirected to /login.
  - Paywall: wrong code → server error "Invalid code…"; RSF-BETA-01 → server grant, app opens;
    entitlement persists on reload (server-side row).
  - Profile wizard: website scan of a reserved `.example` host is refused by the SSRF guard with a
    visible message; "Continue without website scan" path works; workspace launches.
  - CiteLock: 2 engines detected (Grok verified, Gemini labeled unverified adapter), 14 runs planned;
    live batch executed against xAI (see below for the outcome).

### Session 2 — verification incident (2026-09-07 08:04 local)

- **What happened:** while the resumed live batch was at 8/14 runs, the whole WSL VM restarted (`uptime` = 0 min afterwards). All three background processes (dev server 8123, e2e server 8091, and a concurrent `tsc`+`eslint`+`vitest` run) died at the same instant. The VM has 8 GB; two Vite dev servers plus a full vitest worker pool is the likely trigger. No product code was involved.
- **Consequence:** the dev servers use the PGLite in-memory fallback (no `DATABASE_URL` locally), so the test account, workspace, entitlement, and the partially completed batch were lost. The manual verification below is repeated from sign-up on a fresh server.
- **Rule going forward (recorded, not a code change):** run `tsc`/`eslint`/`vitest` sequentially and never alongside two dev servers in this WSL; use `vitest run --pool=forks --maxWorkers=2`.
- **Observed before the crash (counts as manual verification of the resume path):** the "Resume batch" banner appeared after the earlier HMR interruption, clicking it drove the batch from 4/14 → 8/14 through `continueMyVisibilityBatch` slices, and the report header updated its cost from $0.12 to $0.28 as xAI runs landed.

### Session 2 — A-029 model latency made two flagship paths fail (found by manual verification, fixed)

- **Symptom:** in the completed live batch every unbranded run showed `entities via failed:provider_timeout`, so "Who gets recommended instead" was empty, and "Draft web page" failed with a raw `text_generation_timeout` toast.
- **Root cause:** entity extraction and drafting defaulted to `grok-4.6`, a reasoning model. A probe (`tmp/checks/probe-xai-models.mjs`, log in `tmp/checks/xai-model-probe.log`) measured a small JSON-schema extraction at 27.1 s with 1,548 reasoning tokens on grok-4.6, versus 1.3 s on the `grok-4-1-fast-non-reasoning` alias (served as grok-4.3) and 7.8 s on `grok-4-1-fast-reasoning`. The 55 s provider timeout and 50 s draft timeout were therefore hit on longer answers. `grok-4.6-fast*` ids do not exist for this team (404/400). The `/v1/language-models` endpoint returns 401 for this key (endpoint ACL), so model discovery must be by probe.
- **Fix (D-010):** defaults changed to `grok-4-1-fast-non-reasoning` for extraction (`providers.server.ts`) and `grok-4-1-fast-reasoning` for drafts (`ai-text.server.ts`); env overrides `XAI_EXTRACTION_MODEL` / `XAI_DRAFT_MODEL` unchanged and documented in `.env.example`. The grounded answering model stays `grok-4.6` because that is the surface being measured. Per-run extraction cost drops from ≈$0.011 to ≈$0.0006.
- **Also fixed:** raw error codes were shown to users. New `src/lib/ai-errors.ts` (`describeAiError`) maps `text_generation_*`, `provider_*` and `extraction_*` codes to actionable sentences; both `/aieo` and `/marketing` route it through their `errorMessage` helper.
- **Verification:** tsc and eslint clean; live re-test of "Draft web page" and a second batch recorded below.

### Session 2 — manual verification log, second pass (fresh server after the WSL restart, 2026-09-07 08:05–08:40 local)

Environment: auth-on dev server on port 8123 (`tmp/checks/dev.sh`), PGLite in-memory database, real `XAI_API_KEY` and `GEMINI_API_KEY` from `.env.local`, browser = the desktop app's in-app Chromium (1280×800). Where a click is marked "DOM click" the button's click handler was fired from the page's own JavaScript because the coordinate mapping of the automation tool drifted after scroll; the server round-trip and rendered result were then read back from the page.

| # | Step | Result |
| --- | --- | --- |
| 1 | Sign-in page copy | Stale "MLS setup" wording found and removed from `login.tsx`, `index.tsx`, `app-shell.tsx`, `onboarding-wizard.tsx` (see copy fixes below). |
| 2 | Create account (email + password) | Account created; paywall shown immediately (server-side entitlement absent). |
| 3 | Redeem pilot code `RSF-BETA-01` | Access granted server-side; Command Center opened. Built-in codes are dev-only. |
| 4 | Profile wizard with website `https://jordanrivera.example` | Website scan refused by the SSRF guard ("Local or reserved hostnames are not allowed"); "Continue without website scan" then "Launch workspace" saved the profile. Note: the skip button only sets a flag, the user must press Launch again; the inline status text says so. |
| 5 | CiteLock batch #1 (08:11:22) | 14 planned runs, 7 ok (all xAI grok-4.6, real `url_citation` results), 7 failed (all Gemini `provider_rate_limited`), cost $0.98, ~9 min wall clock in 45 s slices. Report rendered discovery 0/5, citation 0/5, identity 0/2, source gaps, 6 opportunities. **Defect found:** every run showed `entities via failed:provider_timeout`, so no competitors were listed → A-029. |
| 6 | Opportunity "Build claim checklist" (U.S. News) | Deterministic checklist draft created instantly, state proposed. |
| 7 | Opportunity "Draft web page" before the fix | Failed with raw `text_generation_timeout` toast (50 s cap) → A-029. |
| 8 | Fix A-029, retry "Draft web page" | Two site-page drafts returned in <20 s each ("drafted with grok-4.3"), both containing only the supplied facts plus an explicit "Claims deliberately NOT made" list. |
| 9 | Approve draft → "I published it — verify" with `https://jordanrivera.example/rancho-santa-fe` | State moved to **deployed** (not verified) with the note "Could not fetch the page: Local or reserved hostnames are not allowed"; the verify button stays available. Success path not exercised (needs a real public page). |
| 10 | CiteLock batch #2 (08:31:48) after the fix | 7 ok / 7 failed (same Gemini quota failure), cost $0.92. Extraction worked on all five unbranded runs: per-intent "Who engines named" lists and the "Who gets recommended instead" table (Bree Bornstein · Compass 4/5, Linda Sansone · Willis Allen 4/5, Laura Barry · Barry Estates 4/4, …) populated; trend table shows two batches. |
| 11 | Social Desk: facts → "Draft with AI" | Caption returned by grok-4.3 in ~10 s with "Facts the model says it used" and "Claims it deliberately did not make"; two alternative hooks offered. |
| 12 | Save draft | Stored server-side as rev 1, appears in the drafts list with revision history. |
| 13 | Fair-housing review | Adding "Perfect for families … #1 agent" produced two *review* findings; adding "No kids" produced a *block* finding and the Approve button was disabled; the saved revision (rev 2) kept the findings. **Gap found:** "no Section 8" was not flagged → new block rule for source-of-income refusals + unit test (11/11 social-desk tests pass). |
| 14 | Restore clean caption → Approve | Approved as rev 4; manual handoff controls appeared (Copy caption, Share sheet, Download .txt, "I'll post this myself"). |
| 15 | "I'll post this myself" → record receipt URL | State **Posted (reported)**, rev 6, receipt stored. No fake "published" badge anywhere. |
| 16 | Postiz connect with an invalid key | Toast "Postiz rejected the API key"; nothing stored. Live Postiz publish remains unverified (no key). |
| 17 | Error surfacing | Raw codes replaced by `describeAiError` sentences in both routes (verified in code; the fixed drafting path no longer errors, so the new text was not observed live). |

Copy fixes made during this pass (truthfulness, no behaviour change): "No profile or MLS setup is required" → profile only; "Add your profile, MLS, or website later" → profile and website; "Set up profile / MLS" buttons → "Set up profile"/"Edit profile"; dashboard "Profile, market, and MLS details" → website details; wizard subtitle now says "MLS label".

Automated checks after all edits: see `tmp/checks/final-checks.log` (tsc, eslint with `tmp/**` ignored, vitest) — results copied into `docs/FLAGSHIP-DELIVERY-REPORT.md` §6.

Open items added this pass:
- O-010 Gemini adapter: `gemini-3.5-flash` returns 429 on this key in every run; adapter stays "unverified". Needs a key with quota or a different model id.
- O-011 The profile wizard's "Continue without website scan" should probably submit immediately instead of requiring a second Launch click (UX, not correctness).
- O-012 Drafted site pages include mild generic filler sentences ("All activity complies with California real estate regulations"); the prompt could forbid compliance boilerplate. Facts-only guarantee held in both observed drafts.
- O-013 Consider persisting the "facts you can support" textarea per workspace; it is currently page state and resets on reload.

### Session 2 — closing state (2026-09-07 08:42 local)

- Final automated checks after every edit in this session: tsc PASS, eslint PASS (0/0), vitest 27 files / 198 tests PASS, vite build PASS (`tmp/checks/final-checks.log`, `tmp/checks/final-build.log`).
- Delivery report written: `docs/FLAGSHIP-DELIVERY-REPORT.md`.
- Dev server on 8123 stopped at the end of the session; the in-memory database (test account, two batches, one social draft) is gone with it by design.
- The repo directory is untracked in the parent git repository at `~/code`; nothing was staged or committed (standing constraint).

- Correction (08:50): `realestate-ai` has its own `.git` with remote `origin = github.com/Gnoscenti/realestate-ai`, branch `feat/ship-citelock-social-live` (local ahead 1, behind 7 as of 2026-09-07). The parent `~/code` repo simply lists the nested repo as untracked. All Session 2 work is uncommitted and unpushed; committing/pushing is the owner's call.


## 2026-09-08 - User-designated authoritative Citelock design

### Source and decision D-011
The user explicitly stated that the Citelock design in this shared conversation is
correct and must be added as context:
https://chatgpt.com/s/cx_6aa073de7eb88191bbc73d94906c4da9

Treat the design in that user-designated source as authoritative product intent.
The local working tree remains authoritative for what is actually implemented.
Earlier assistant inferences and implementation shortcuts do not supersede this
reference. The original repository audit, flagship social requirements, and
verification requirements remain in scope. Do not infer that the user approved
all current code or that the current code fully implements the linked design.

### Retrieval and verification status
- Web reader: cache-miss failure for the supplied URL.
- Direct HTTP retrieval: ChatGPT/Cloudflare JavaScript-and-cookies verification
  page, not conversation content.
- Browser automation: initialization failed repeatedly (timeout/process exit).
- Available task listing did not identify the shared conversation by its URL.
The linked conversation has NOT been read. No paraphrase or requirements below
are attributed to it. Reference authority is recorded from the user's instruction;
content-level reconciliation remains open until the source is accessible.

### Existing local intent, independently re-read
`docs/CITELOCK-VISIBILITY-DESIGN.md` already describes client-fit discovery:
source-supported expertise and client-experience evidence -> fixed unbranded
questions -> grounded recommendation/citation observations -> justified exact
content improvements -> approval/publish or handoff -> live verification ->
comparable re-observation. Readiness diagnostics support this outcome. This is
local-document evidence, not confirmation that the shared thread is identical.

### A-030 - Verified implementation differences from the local design
Source inspected: `src/lib/aieo/visibility/report.ts`.
- `discovery` uses unbranded `run.mentioned`; the local design specifies a primary
  recommendation rate and a separate mention rate. A mention is not necessarily
  a favorable recommendation.
- Opportunity factors are gap/reach/actionability/fit, with fit fixed at 1 in the
  inspected branches. The local design specifies supported fit/evidence_strength/
  observed_gap/actionability and abstention when evidence is insufficient.
These are implementation gaps, not reasons to redefine the intended product.
Other acceptance gates (evidence extraction, intervention grounding, social
linkage, comparable experiments) still require a source-to-code compliance review;
this context update does not claim to have completed that review.

### Repository continuity and open items
At inspection the project was clean on `local/2026-09-08-flagship-preservation`,
HEAD `23dbf3f` (preserve local flagship MVP work before PR integration). The earlier
uncommitted status in this ledger is historical, not current. No remote push was
verified, and no commit, push, merge, or application-code edit was performed for
this context update. Another active task, 'Integrate PRs and finish MVP', exists;
keep this shared ledger as the handoff record and avoid competing code edits.

O-014: Retrieve the shared conversation and record its exact design requirements
and provenance; reconcile against the local design and code before claiming full
Citelock conformance. Do not silently fill inaccessible source content from memory.
O-015: Correct the measured-discovery semantics and evidence-backed opportunity
ranking against the authoritative requirements; retain evidence of failing cases
and verify the final behavior. No new product tests were run for this notes-only
update. Documentation diff/read-back is the verification for this update.

## Session 3 - Superseding direction and implementation (2026-09-08)

D-012: The user supplied the full corrected requirements in an attachment, retained
verbatim in CITELOCK-APPROVED-DIRECTION-2026-09-08.md. This supersedes conflicting
historical release criteria. O-014's inaccessible shared link no longer blocks
implementation: the supplied text gives explicit operational acceptance.
Promise: "Get discovered for the work you do best." Assessment alone is insufficient.
Implement the evidence -> discovery -> concrete intervention -> social distribution
-> approval/handoff -> live confirmation -> comparable follow-up loop.
RapidAPI is the approved live-data workaround; manual social handoff is accepted.
Neither substitutes for MLS rights, verified production or publication confirmation.
Preserve existing functionality and history; no branch replacement/remote merge.

Current-tree checks personally run: git status/log and affected source inspection.
Historical 198-test/build results are historical, not current verification.
Another active task works in separate PR integration checkouts; this task changes
only /home/ttroj/code/realestate-ai and references geo-aeo-platform selectively.

Implementation sequence:
1. Add durable source/permission/entity-bound expertise and public-page observations,
   review/contradiction handling, missing-evidence abstention, evidence-linked gaps.
2. Correct recommendation/negative/ambiguous semantics, stable configuration history,
   leased paid execution and current-source limits; retain old results explicitly.
3. Produce constrained exact content artifacts, revision-safe approval and live
   content verification; link approved interventions to social drafts with rights review.
4. Verify RapidAPI exposed paths and remaining critical auth/durability/false-success
   findings, then type/lint/unit/DB/build/browser and bounded authorized live checks.

Classifications: implement now = connected expertise workflow and critical defects;
accepted workaround = RapidAPI + manual social handoff; deferred external =
licensed MLS/RealTrends, unavailable social authorization, native signing;
release-critical = any false evidence/approval/publication, tenant escape or data loss.

### Session 3 implementation and current checks (14:28 local)
Added 0011 evidence/page observations/intervention revisions+events/tenant FKs;
0012 social dispatch states. Expertise source fields enforce exact excerpts,
entity scope, permission basis, publication permission, dates and duplicate handling.
Public-page inspection is DNS-pinned/bounded and fails without context matching.
v2 basket adds supported expertise questions and removes default luxury bias.
Reports now separate recommendations, mentions, citations, negative/ambiguous
identities and failures; opportunities need expertise+page+matching observations.
Interventions assemble permitted exact passages with attribution and placement/
interview/test instructions; no unsupported AI prose is inserted.
Revision-aware approval, all-substantive-passage verification and atomic social
draft linkage implemented. Repeat uses exact saved prompts/provider models; history
partitions returned model/prompt/area/surface/method/extraction configuration.
Source/expertise UI, explicit rights review and linked Social Desk navigation added.

A-031: previous verification treated empty signatures as success and accepted one
of three sentences. Fixed to require matched subject + every substantive passage.
A-032: social dispatch could duplicate or publish a stale revision. Reserve/freeze
before remote calls; retain unknown outcomes, block edit/replay until reconciled.
A-033: local PGLite restart loss fixed with ignored disk storage; tests remain in
memory. Build no longer applies production migrations; explicit migrator serialized
by Postgres advisory lock.

Personally run: affected type-check PASS before final dispatch edits; affected lint
PASS; 31 tests in 3 files PASS (visibility report, DB lifecycle, social desk).
Earlier intermediate run failed 9 legacy assertions: version, false name matching,
generic directory advice, timeout retries, empty checklist, and uncoded provider
failure. Replaced those behavior contracts with adversarial tests of corrected
requirements; no failures suppressed. Current full verification still pending.
The other local task installed missing Linux Chromium dependencies; browser checks
are now feasible and must be attempted, not declared blocked from old notes.

### Session 3 verification and fixes (14:50 local)
Current gates before the last transaction/withdrawal edits: typecheck PASS,
lint 0 warnings/errors, 28 unit/DB files / 203 tests PASS, production build PASS.
After transaction changes: typecheck PASS and 18 critical DB tests PASS.
Browser suite with current Chromium: 12/16 PASS; three mobile failures came from
the access helper requiring a desktop-only link, and one from a removed MLS label.
Fixes use the actual server-entitled app root and current label; all assertions
on mobile layout, source persistence and receipt flow remain.

Bounded live checks personally run: RapidAPI San Diego search 41 observations,
39 importable; agent lookup valid empty response; grounded xAI grok-4.6 returned
five provider citations, six searches, reported $0.118466. No Postiz/social
publication performed. Live results are not a demonstrated discovery lift.

Dependency audit initially found js-yaml/nanoid/postcss plus xcode's uuid; patched
within ranges and constrained xcode to uuid11 (v4 API compatibility to verify).
Full npm audit now 0 vulnerabilities. Chromium was reinstalled for the new
Playwright version. Local disk PGLite was verified across two separate processes.
Production PostgreSQL and signed native builds remain unverified.

A-034: beta redemption/checkout consumption preceded the grant in separate writes.
Fixed with atomic SQL CTEs; injected grant failure tests prove nothing consumed.
Production demo grants now disabled independently of flags; demo token parser
handles underscores in base64url. Discounts disabled because purchase verification
requires the exact configured price.
A-035: market route fabricated AVM confidence/comps/forecasts. Replaced with exposed
RapidAPI lookup and explicit user-assumption arithmetic; removed unused fake AVM.
A-036: batch creation used multiple commits and could race starts. Added dedicated
SQL transaction support, workspace row lock, atomic quota+batch+planned runs.
A-037: current contradictions/withdrawn permissions could be missed by old batch
snapshots. Reports now keep raw observations immutable while re-evaluating current
opportunities with current sources; approval/social linkage recheck source support.
Withdrawal retains history and excludes the source from current public drafts.
Migration 0013 initially guessed a truncated constraint name and failed correctly;
replaced with exact catalog identification. New full validation still pending.

### Session 3 final implementation decisions and audit (15:07 local)
D-013: Organizations require a separate exact name and HTTPS website. The
individual's name/license/website cannot silently become a team/brokerage identity.
History loads are abortable and keyed so old results cannot replace a newly
selected subject. Targeted organization/source browser regression passed.
D-014: Source withdrawal must reach linked social approval/handoff/dispatch.
The immutable creation event and database link retain source obligations even
when editable origin text is changed. Existing public/scheduled material still
requires action in the authorized publishing account.
D-015: Keep the MVP claim bounded: implemented improvement workflow, not proven
lift or a verified production deployment. CRM/profile/calendar remain browser-local;
organization identity fields currently need re-entry after leaving Citelock.

Final current-code gate run: TypeScript PASS; ESLint 0 warnings/errors; Vitest
4.1.11, 28 files/207 tests PASS; npm12 production build PASS. Production missing-DB
and missing-secret guard checks executed and PASS. Two-process app getSql restart
PASS with 12 migrations. Native xcode compatibility smoke PASS using the supplied
Capacitor template; no native project/archive/signing verification claimed.
Visual inspection completed for desktop 1440x1100 and mobile390x844; no horizontal
overflow. Dedicated image tool failed sandbox setup; the local screenshot was
loaded through an authorized read-only shell path for inspection.

Final audit surfaced Vitest GHSA-82fw-gwwq-j7x9 (GitHub advisory published/updated
Sep8; unlike the earlier audit response). Patched to 4.1.11. npm12 audit then
reported zero known vulnerabilities. Earlier zero-vulnerability result was a
point-in-time report, not evidence that the newly surfaced advisory was absent.
Authoritative source: https://github.com/advisories/GHSA-82fw-gwwq-j7x9

Full desktop/mobile browser run:17 PASS. Separate auth-enabled account isolation
suite:1 PASS. After final linked-source permission guard, both are being rerun;
outcomes must be appended before delivery. Tests use isolated in-memory databases
and synthetic material, with paid provider keys blank. Live xAI/RapidAPI probes
are separate evidence; none establishes a real agent's visibility lift.

Updated README, USER_GUIDE, env example, CI and delivery report. Preserved per-file
line endings (including the lockfile) to keep the patch reviewable. No commit,
push, merge, external publication or deployment performed.
Open: target PostgreSQL/restore/deployed smoke; actual customer publication and
follow-up measurements; Stripe money/refund operations; live Postiz/other-provider
authorization; native signing; real calendar/device sync; supported closed-sale
context and referral attribution. These do not block the implemented RapidAPI
and manual-social alternatives. See delivery report for classifications.

### Final verification correction — A-038 (2026-09-08)
The auth-enabled final rerun exposed a real shell defect inherited from Session2:
pending/error access checks could trust hasAppAccess(browserBilling). A forged
browser billing object unlocked the shell when its server check failed. Paid
provider endpoints still required entitlement, but the shell claim was incorrect.

Fixed: identity-bound server-only access state; no optimistic local grant;
explicit pending/error/retry UI; stable approval callback and complete effect
dependencies (removed the old exhaustive-deps suppression). Generated browser
trace HTML is ignored by development watchers to prevent spurious page reloads.

Regression now deliberately aborts all server-function requests after forging
billing, verifies the locked error state, restores requests and retries, verifies
the inactive paywall, rejects a bad code, grants a valid server code, persists
a social draft, isolates a second account and returns to login after clearing
cookies. Auth-enabled browser suite PASS (1 test,13.5s). Type/lint PASS.
Full17-browser rerun and final production rebuild are running after this fix.

Patch whitespace checked with cr-at-eol so existing CRLF conventions are recognized;
all ordinary trailing-space/blank-line and indentation checks remain active.
Persistent memory index already contains the correct forward-slash repo path;
no rewrite was needed for the earlier malformed-path concern.

### Delivery gate closure
Final full desktop/mobile Playwright:17/17 PASS (1.1m) after A-038 fix.
Final auth-enabled Playwright:1/1 PASS, including deliberate outage, retry and
forged-billing rejection. Final production rebuild exit0, Nitro/Vercel output.
Typecheck and lint remain PASS after A-038; full Vitest4.1.11 run207/207 PASS.
No failing check is waived. Native PostgreSQL/deployed environment and external
publishing/payment/signing validation remain explicitly unverified, as reported.

Git status at delivery: 40 modified tracked files; 12 untracked files; 0 staged.
HEAD23dbf3f on local/2026-09-08-flagship-preservation, no configured upstream.
None of this session's edits are committed or pushed. Other tasks' branches/
worktrees were not merged, staged, reset or overwritten.

Closure recorded at 2026-09-08 22:13:52 UTC (15:13:52 America/Los_Angeles). Task-owned test server stopped after verification; no user data or other task server was removed.

## Session 4 — 2026-09-19: release completion

### Current working tree and intent
Re-read the approved direction and unresolved delivery items rather than repeating the audit. HEAD23dbf3f, branch local/2026-09-08-flagship-preservation, 40 modified tracked and12 untracked files, zero staged; September8 results are historical. Preserve this work and other tasks' worktrees. Approved purpose remains supported expertise -> unbranded discovery -> source-linked improvement -> approval/publication confirmation -> comparable observations. RapidAPI and manual social remain accepted alternatives.

### Repo map / new environment evidence
Docker29.7.2 is now available in WSL; existing LaunchOps containers are unrelated and will not be touched. PostgreSQL16 client tools exist; server binaries do not. Use a new isolated loopback-only PostgreSQL container for migration/concurrency/restore validation and add reproducible CI coverage.

### Findings and decisions
A-039: Citelock entity settings are page-local; organization fields disappear after navigation, and a new device depends on browser profile setup even though evidence exists server-side.
D-016: Store explicitly saved subject identities per workspace and entity kind, with revision checks, role validation and cross-account isolation. Keep individual/team/brokerage evidence separate. Loading/error/conflict behavior must prevent a failed load or stale save from replacing a newer identity.
D-017: Verify native PostgreSQL as well as PGLite, including transaction races and backup/restore. Do not call a local container a production deployment.
Applying engineering:deploy-checklist skill as a release verification framework; it introduces no new permission requirement.

### Verification / open items
Fresh checks pending. Next: subject persistence, PostgreSQL integration/CI, fresh build/type/lint/unit/browser/audit; inspect any failures and remaining correctness gaps. Provider/account operations remain distinct from code verification; no fabricated publication, payment or lift.

### Session4 implementation and initial verification
Implemented migration0014 and authenticated subject APIs/editor: explicit per-entity saves, revisions, initial load/error/retry, validation, cross-device restoration without a browser CRM profile. Critical subject tests3/3 PASS on PGLite.
Native PostgreSQL16: all13 migrations applied, rerun idempotent; critical suites7 files/41 tests PASS, including real concurrent subject/batch writes, grant rollback, evidence-to-improvement-to-social lifecycle and dispatch reservations. Added independent PostgreSQL CI job and guarded test:postgres command.
A-040: Citation matching previously treated any unknown website host as wholly owned, including an agent's page on a small brokerage site. It also removed identity query parameters and lowercased case-sensitive profile paths. Fixed: preserve exact website URL/path/query and exact profiles, root-host ownership only for non-directory websites; new observation method expertise-v2.1, separate comparison series. Old baselines require a new baseline for this method.
A-041: Social image download checked actual size only after arrayBuffer allocation. Fixed using shared bounded binary streaming; chunked overflow cancels the stream. Added byte/UTF-8 and citation boundary regressions.
Initial lint caught a now-unused Label import after editor extraction; removed it. Fresh complete checks pending.

### Session4 completed fresh checks
Typecheck PASS; ESLint0warnings PASS; Vitest30files/214tests PASS.
Auth-enabled PGLite browser PASS, including new independent browser context with only session cookies (no profile/localStorage) restoring the saved brokerage, plus another account seeing no saved identity.
npm12 dependency audit:0 known vulnerabilities as of this session.
Native PostgreSQL logical backup/restore PASS:49 public tables,245 rows,13 migrations; every table count and sorted row-content digest identical after restoring into a fresh database. Added guarded reusable restore script. This does not verify deployed backup schedules, external roles or provider disaster recovery.

### Production runtime verification, not only compilation
Full desktop/mobile browser17/17 PASS. Auth browser against native PostgreSQL1/1 PASS. Fresh live probe:RapidAPI41 observations/38 importable, agent query valid empty; xAI grok4.6,6provider citations,7searches,$0.138556. No other configured provider was called.
A-042: npm preview used Vite/TanStack's default preview loader, which tried missing dist/server/server.js after Nitro relocated the entry. Actual browser test returned HTTP500 despite build PASS. Installed Nitro supports root-based nitro preview, which loads the recorded Vercel artifact and static files. Replaced preview script accordingly. The compiled app then PASSED the same real-session/entitlement/draft/subject/cross-account test against native PostgreSQL. CI now includes this production-artifact browser test.
Also completed provider-configuration error/retry UI, restored saved subject jurisdiction in readiness, guarded late batch selection, and throttled empty lease polls. Final browser regression additionally simulates saved-identity/provider-load outage and recovery.

### Session4 final gates and limits
Final native PostgreSQL suites41/41 PASS after citation-method changes on a fresh database.
Final desktop/mobile browser17/17 PASS after compact saved-subject UI.
Final production artifact + native PostgreSQL real-session browser1/1 PASS using the repository test configuration mode PLAYWRIGHT_PRODUCTION=1; deliberately failed identity/provider reads show errors and recover through retry. Cross-device restored identity and account isolation pass.
Final typecheck/lint0warnings/build PASS. Client asset check:70 text assets, no configured server-secret value found. Missing-production-DB and missing-auth-secret checks PASS.
Observed Better Auth warning in local Nitro preview: no forwarded client IP, so auth rate limiting uses one shared per-path bucket. Fail-closed behavior preserved; target deploy must validate its trusted proxy/IP headers without accepting spoofed arbitrary headers.
Current external access: xAI,Gemini,RapidAPI keys present; DATABASE_URL,Stripe,Stripe webhook andPostiz keys absent in existing local app env. A separate random-secret test env backed only task-owned PostgreSQL. No secret values were printed or copied into tracked files.
Remaining: target hosting/publicHTTPS/managedbackups verification; real customer publication and comparable observations; live Postiz/Stripe authorization/money/refund operations; other providers; native signing; browser-local CRM/calendar sync; closed-sale/traffic attribution where data unavailable. Approved RapidAPI and manual publishing alternatives are complete and exposed.

### Final Git handoff — September19
{"branch": "local/2026-09-08-flagship-preservation", "head": "23dbf3f", "modifiedTracked": 42, "untrackedFiles": 21, "stagedFiles": 0, "upstream": null}
No commit/push/merge/deployment or external publication was performed. All current work remains in this working tree. Prior content, other worktrees and the parent repository were preserved. Final populated Citelock/Social Desk desktop/mobile screenshots captured; no horizontal overflow. Task-owned development/preview servers and the labeled PostgreSQL container were stopped successfully; diagnostics/backup data remain ignored under tmp/session4 and tmp/postgres-restore-*.

## Session 5 — 2026-09-20: Perplexity Agent API integration

### Scope / repo map
User chose the web-grounded Agent API. Existing TypeScript/TanStack server pipeline lives in visibility/providers.server.ts; engine.server.ts owns entitlement, quotas, durable leases and paid-call retries. Keep current working-tree changes; no scaffold, commit, push or deployment. PERPLEXITY_API_KEY presence checked privately: present, value never output.

### Findings and decisions
A-043: Existing Perplexity adapter calls legacy Sonar chat completions and counts every search result as a citation. Existing rate-limit retry can run immediately without respecting Retry-After.
D-018: Replace that adapter with the official @perplexity-ai/perplexity_ai SDK. Agent API is the correct fit for independent grounded discovery; Router has no grounding, Search has no answer. Pin an explicit model/configuration, not a changing preset, for comparable observations. Keep retrieved source metadata distinct from URL-citation annotations. Persist Agent API surface separately from legacy observations. Disable SDK automatic retries; durable engine retry respects provider cooldown, and uncertain paid outcomes remain visible failures.
Read official docs index, quickstart, presets, tools overview/web-search, output-control, Agent OpenAPI, SDK overview/configuration/error-handling, pricing and rate limits before code. Documentation snapshots retained under ignored tmp/perplexity-docs. Presets change configuration without explicit versioning. Agent response text comes from output_text; search_results contains source metadata, content annotations contain URL citations. Model/tool charges are separate; costs must come from returned usage, not estimates.

### Verification / open items
Pending implementation, real minimal request, adapter/error tests, durable cooldown/persistence tests, full type/lint/unit/build checks. API consumer-app visibility and ranking lift remain unclaimed.

### Session5 implementation and live verification
Installed official SDK0.38.5 (one package, npm12 audit0). SDK uses documented Agent alias /v1/responses; no hand-built guessed endpoint. Default explicit model openai/gpt-5.6-luna, web_search (6000 context tokens/1200 per page), max_steps2, max_output_tokens2000, storefalse, no previous_response_id. Fixed official base URL, SDK logLeveloff, maxRetries0, 55-second timeout and bounded4MB response. Typed errors never retain reflected upstream text.
Migration0015 stores sources separately and adds deployment-wide provider cooldown. Both Retry-After seconds and HTTP-date forms supported; a missing/invalid header defaults to60seconds. New Agent surface perplexity_agent_web_v1 prevents old Sonar baseline replay/comparison. Existing entitlement, authorization and quota gates retained. Evidence UI shows retrieved sources separately and explains absent URL annotations.
LIVE minimal smoke PASS:HTTP200, answer string,15retrieved sources,1search,0URL-citation annotations,returned model string,usage object,reported cost present. No key or answer content output. This verifies one default-model Agent request, not every model/production quota or consumer-app visibility. Zero citation credit is deliberate when annotations are absent; no prose-link inference.
Focused tests22/22 PASS, typecheck PASS, ESLint0warnings PASS. Full suite/build/nativePG/browser pending.

### Session5 final verification and delivery
Full Vitest31files/227tests PASS; native PostgreSQL7files/43tests PASS, including persisted sources, baseline surface guard, cross-workspace Retry-After and two-attempt limit. Migration0015 applied; repeat migration no-op. Docker restart reassigned the test port32768->32769; fixed ignored test configuration, not application logic.
Final TypeScript PASS, ESLint0warnings PASS, production build PASS, whitespace check PASS. Existing desktop/mobile Playwright17/17 PASS. Auth browser against compiled artifact + native PostgreSQL1/1 PASS (real signups, server entitlement, persistence, cross-device identity, tenant isolation). Live API request count for this integration:1, HTTP200. 401/429/malformed/oversized/network paths tested with deterministic SDK transport fixtures, not live induced failures.
Browser asset secret scan70files, zero configured server-secret values; .env.local remains gitignored. Installation added only official SDK0.38.5; npm audit0 known vulnerabilities. Existing proxy/IP warning in local Nitro preview persists, as already documented.
Open items: deployment-specific configuration/migration and provider limits; optional other Agent models; Perplexity-specific competitor extractor; no consumer-app coverage/causal lift claim. No required integration work remains; README, blocker register and delivery addendum carry exact run instructions and boundaries.
Current Git status: {"branch": "local/2026-09-08-flagship-preservation", "head": "23dbf3f", "modifiedTracked": 43, "untrackedFiles": 24, "stagedFiles": 0}
No commit, push, merge or deployment performed. Existing unrelated changes preserved.
Cleanup complete: task-owned PostgreSQL container stopped; identified temporary browser-test server terminated. Production browser harness had already stopped its preview. No external/user services touched.

## Session 6 — 2026-09-20: renewed full-scope audit and release hardening

### Repo map and conventions
Opened existing ledger, approved direction, blocker register and delivery report first. Current authoritative tree remains HEAD23dbf3f on local/2026-09-08-flagship-preservation, with prior uncommitted work preserved. TypeScript/TanStack Start, npm12, PostgreSQL/PGLite, authenticated server functions, Vercel/Nitro and Capacitor web shell. Existing all-source reading evidence is in Session1/2; current audit verifies changed files and unresolved gaps rather than claiming every historical file was newly read. Generated/dependency/binary/secret material is inventoried separately. Engineering code-review skill read; scope is the user-named repository, so its generic clarification step does not apply.

### Citelock/GEO intent
Retain the approved, stronger discovery-and-improvement loop: supported expertise -> independent grounded discovery -> source-linked opportunity -> usable reviewed artifact -> authorized publication/handoff -> comparable observations. The repeated broad prompt permits a minimum assessment, but does not require discarding the implemented stronger loop. No causal lift or consumer-app coverage claim.

### Audit findings / blocker register
Existing A001-A043 and scenarios remain the starting audit trail. Current unresolved candidates: account recovery/verification; paid-launch reconciliation; Citelock evidence attribution and source relevance; model-assisted extraction gaps; social revision/publication state; local supporting-module claims; deployment migrations and hosted operational checks.

### Decisions made and why
D-019: Re-audit critical boundaries and complete affordable release-hardening work in the current tree. Preserve approved RapidAPI/manual social alternatives and independent measurement. Do not expand into unavailable MLS/native signing or deploy/publish as a side effect. The successful September20 Agent checks remain historical baseline evidence until relevant changed code is retested.

### Verification results / open items
Current Git status verified. Inventory includes all current first-party paths; original coverage claims and unresolved findings consulted. Next: inspect source boundaries, refresh MLS/RESO research, add concrete blocker scenarios, fix confirmed defects, rerun strongest relevant checks, then refresh delivery report.

### Session6 confirmed findings and changes
A-044: Calendar still exposed local demo provider connections, a fabricated dead event generator and an empty-state instruction to sync, but no appointment creation UI. Removed fake connect/sync actions and generator; added validated manual appointments, explicit local timezone/device-only storage, retained completed/far-future records, rule-based preparation notes and safe RFC5545 export. Vendor directory preserved. No OAuth, invitations or background notifications claimed.
A-045: Concurrent Postiz refreshes could overwrite terminal publication with a stale pending status, and publication/draft/history updates were separate transactions. Provider call now remains outside the DB transaction; row-locked reconciliation preserves the first terminal result and commits draft/history atomically. Untrusted provider release URLs pass the same platform validation as manual receipts.
A-046: Citelock report page evidence still used host-only attribution despite strict citation profiles. Applied exact profile/declared owned-root matching to inspected pages; report algorithm visibility-2.2. Publication packages retain exact website URL and reject other profiles on shared hosts. Publication verification rechecks source permissions before and after page fetch. Observation measurement remains expertise-v2.1 because recommendation/citation counts did not change.
A-047: Property search seeded fictitious query history, described local matching as AI/MLS syncing and toasted a nonexistent client packet. Removed fake history/delay/claims; added downloadable factual local-record summary with missing values and provenance limitations.
A-048: Production auth inherited loopback trusted origins and shared preview OAuth credentials, allowed implicit linking to unverified email accounts, and popup listener accepted same-origin messages from any window. Production now requires explicit BETTER_AUTH_URL, trusts only that configured origin, uses explicit OAuth credentials only, disables account linking and requires the exact popup window as message source.

D-020: Keep supporting calendar local and useful via explicit create/export rather than implementing multiple OAuth providers outside the flagship scope. Keep source ownership conservative and permission-aware. Fix concurrency at the durable state boundary rather than hiding stale statuses in UI. Auth origin/linking restrictions take precedence over dead preview convenience.

### Session6 intermediate verification
TypeScript PASS; ESLint0warnings PASS after calendar/social/Citelock/search edits (before final auth edits).
Focused calendar/export and concurrent social suites7/7 PASS. Citelock report/lifecycle26/26 PASS, including shared-site exclusion and revoked permission before verification. New browser calendar and production-origin tests pending.
Refreshed primary RESO, MLS Grid onboarding/API/resources and RealTrends download research. RESO grants no data; MLS/provider issues access after license approval. MLS Grid now lists an AI Use Addendum; linked PDF fetch failed in browsing, so its detailed terms are not asserted. API docs specify signed one-use one-hour media URLs effective September8; future connector must replicate permitted media rather than hotlink. RealTrends2026 agent/team download remains $599, non-commercial license. Current MLS fees/approval SLA require direct quote; historical examples must not be represented as current offers.

### Session6 verification, failures and root causes
Full unit suite233/233 PASS, nativePG45/45 PASS, production build PASS. Compiled production browser2/2 PASS: prior real-session/tenant workflow plus unrelated localhost-origin rejection403.
Full desktop/mobile browser initially17/18: new calendar test used getByLabel("Preparation notes"), which matched both the textarea and the tabpanel's accessible label. Replaced with the precise textbox role/name; no assertion removed. Rerun pending. Final audit also removed remaining dashboard/priority copy instructing users to sync an unconnected calendar.
Final edge cases: all-day exports reject same-day exclusive ends; generated contact links retain exact subject website paths; regression covers permission withdrawal during an in-flight public-page fetch. These final changes require focused/nativePG checks and rebuilt artifact.

Native PostgreSQL rerun exposed test isolation failure: the persistent test database retained global:runs quota consumption from earlier successful runs. Seven scenarios correctly hit the production budget guard; no application limit was raised. Added per-scenario reset of only that global quota fixture, guarded to reject non-_test/_tests database URLs. Existing quota assertions remain intact. Fresh and repeated native runs pending.
Calendar browser rerun PASS, including invalid interval, save/reload, real .ics contents, completed retention, delete and mobile no-overflow. Visual screenshots captured; inspection pending. Final build PASS;71 emitted text assets contain none of the configured server-secret values. npm12 audit:0 known vulnerabilities.

A-049: Revisited the original CMA finding (ledger line243) after locating a surviving MLS-synced UI claim. generateCmaReport still guessed condition from relative price and produced a suggested list value from unsourced local records. Replaced it with bounded same-city/type reference notes, explicit positive price/area checks, no inferred condition/list-price output, supplied-status labels and empty states. Fixed copy failure falsely recording an export. Regression covers other markets/types, zero values and abstention. This is usable comparison preparation, not a completed professional valuation product.

CMA dependency check: TypeScript correctly found two command-pack consumers still using suggestedList. Updated both to reference counts and the same evidence limitations; no compatibility field or dummy valuation was retained. Focused/type checks rerunning.

### Session6 final results (before cleanup)
Final typecheck/lint0warnings PASS. Complete Vitest33files/236tests PASS; CMA2/2 focused regression and dependent consumer typecheck PASS. Final build PASS. Full desktop/mobile browser18/18 PASS on fresh isolated workspace, including real calendar download/persistence, source rights, onboarding failures and manual social workflow.
Native PostgreSQL46/46 PASS twice consecutively after fixture isolation. No production quota changes. Logical backup/restore50tables/1,676rows/14migrations PASS with complete content digests; this includes migration0015. Hosted backup policy/roles/ACLs are not validated by this local restore.
Manual visual: desktop1280px/mobile390px calendar screenshots inspected. Native view_image failed due Windows sandbox setup; escalated read-only screenshot access displayed the same files successfully. No unresolved approval rejection.
Delivery report rewritten from current ledger to replace obsolete totals. Final compiled-artifact auth rerun and cleanup pending.

Final rebuilt production artifact + native PostgreSQL authentication2/2 PASS (real sessions, grant enforcement, cross-device identity, account isolation, unrelated-origin403). Existing missing trusted-client-IP warning remains an explicit hosting configuration gate. No broker OAuth login or password recovery delivery was claimed tested.
Current Git snapshot:52 modified tracked files,29 untracked files,0 staged; preservation branch local/2026-09-08-flagship-preservation, HEAD23dbf3f, no configured upstream. No commit/push/deploy or external publication. Delivery report contains exact commands and release gates.

### Session6 cleanup and open items
Stopped the identified temporary browser-server processes22627/22848 and task-owned PostgreSQL container realestate-ai-release-20260919. Production auth harness stopped its own preview. Other projects/services/worktrees untouched. Ignored test evidence and backups remain available.
Open gates are accurately classified in the delivery report/blocker register: actual hosted configuration and smoke/backup operations; customer publication and comparable later observations; optional real Postiz authorization and reconciliation; recovery/email and paid money-flow operations; unverified provider configurations/extraction; licensed MLS, native signing, calendar sync and unsupported transaction analytics. Working alternatives are implemented and documented. No required source fix from this bounded release-hardening pass remains unverified.

## Session 7 — 2026-09-20: source-backed instructional guide and authorized release
### Repo map and conventions
Reopened the existing ledger and current Git status. Same preservation branch and working tree; existing changes remain uncommitted. New work reuses authenticated server functions, safe outbound fetch, durable workspace data and server entitlement.
### Citelock/GEO intent
Latest user direction explicitly prioritizes a formatted, manual, step-by-step visibility guide: useful basic free output and thorough paid output. MLS is not a prerequisite or exclusive authority. Existing optional measurement and publication workflows remain available; no automatic client publication is requested.
### Audit findings / blocker register
RealTrends public Julie Pierce Casey profile currently reports city sides rank1,20sides,$33.61M volume based on2025sales data. Personal site claims over$44M in2025: these figures conflict or have different scope and must not be merged. Brokerage corroboration still being checked. Public source analysis is distinct from purchasing/licensing bulk ranking data.
### Decisions made and why
D-021: Derive conservative, attributable claims and practical instructions from public personal, broker and independent sources, keeping publisher/category/year/scope explicit. A transaction-side ranking does not establish trust or every agent's performance. Free analysis must work without a paid provider run; paid content must be gated on the server.
D-022: User now expressly authorizes adding required local secrets to the correct Vercel project, correcting production settings, then committing all intended repository changes and pushing after verification. This supersedes prior no-push instructions. Secret values must never appear in output or Git; unrelated projects and parent repository remain out of scope.
### Verification results / open items
Current status read:52 modified tracked paths,29 untracked file entries in prior precise count,0 staged,HEAD23dbf3f; no upstream. Vercel team resolved; two candidate projects require Git linkage verification. No release mutation performed yet. Next: guide implementation/tests, exact Vercel linkage and secure configuration, checks, commit/push and delivery evidence.

### Session7 implementation and findings
A-050: The global paywall prevented any useful free Citelock output. Added an authenticated free /aieo entry and guide-first navigation; advanced measurement remains entitlement-gated. The new server guide API returns three steps for basic accounts, nine for entitled accounts, and rechecks access on every read/update. Upgrade and expiration tests verify response/export boundaries.
A-051: MLS authority was being conflated with all public-source evidence. Guide now inspects up to four safe public URLs, binds textual identity/locale, extracts only a tightly scoped official RealTrends agent city-sides ranking, preserves year/category/population and flags conflicting annual volume. No listings authority, license verification, or causal visibility lift is inferred.
D-023: Keep this instructional assessment deterministic and available without model spend. Persist source hashes, observation dates, claims, unresolved conflicts and manual progress under workspace ownership. Nine prioritized steps include owners, effort, concrete instructions, success criteria and source links. Paid content is constructed server-side only.
Verification: live safe-fetch of Julie's actual personal biography and RealTrends profile matched both sources, extracted2025/citySidesRank1/20sides/$33.61M, and flagged personal$44M. No model requests or MLS calls. Official brokerage profile not independently located; no fabricated corroboration.
Initial tests exposed URL refinement throwing on empty optional URLs; fixed with URL.canParse before URL construction. All6 guide tests now pass; full34files/242tests pass; nativePG8files/52tests pass with migration0016. Typecheck and lint0warnings pass. Build/browser checks in progress.
Release discovery: cloud-realtor(project prj_iTHheNQygwNcQGy20gfWS5uAKOUj) is linked to Gnoscenti/realestate-ai; realestate-ai-workspace is a different repo. Latest observed production is main@2cd3cb1, not this preservation working tree. Never overwrite production/main to bypass divergence.
Release blocker: Vercel get_project connector schema mismatch persists; environment writes are not exposed. CUA browser startup fails at Windows sandbox/kernel initialization, including one reset/retry. Known official CLI auth locations and VERCEL_TOKEN have no credentials. Deployment metadata is readable, but settings/secrets cannot yet be changed. No auto-review rejection occurred.
Prepared a production-only allowlist configuration script against documented Vercel REST endpoints. It refuses wrong Git linkage, missing required configuration, local/test DBs and test Stripe keys; preserves existing DB/auth secrets and prints only key names/settings. It requires an authenticated Vercel CLI session or privately supplied VERCEL_TOKEN. Production keys currently present locally: XAI_API_KEY,OPENAI_API_KEY,PERPLEXITY_API_KEY,GEMINI_API_KEY,RAPIDAPI_KEY. Legacy CITELOCK_MLS_ENABLED must not be copied.

Production browser check found a real interaction defect: the controlled completion checkbox did not visually change until the server replied. Added optimistic checked state, explicit Saving progress status, disabled concurrent edits and rollback on failure. Browser regression now also aborts a save and asserts restoration of prior state. Prior242unit/52PG/18browser checks passed; rebuilt auth check pending this change.
Broker research: Pacific Sotheby's domain redirects to sothebysrealty.com/pacificsir and presents a JavaScript/anti-bot challenge. No bypass attempted; broker profile corroboration remains unverified. Personal and RealTrends evidence remain sufficient for the qualified ranking guide.

### Session7 final local verification and authorized configuration
Final typecheck/lint0warnings PASS; full34files/242tests PASS; focused6guide tests PASS after server-export read was added. NativePG8files/52tests PASS; migration0016 included (15 files total). Full existing desktop/mobile18/18 PASS; final rebuilt production artifact + PostgreSQL auth3/3 PASS, covering real free guide, upgrade, durable checklist, failed-save rollback, server-gated download, tenant isolation and forbidden origin.
Fresh logical restore PASS:51tables/2,065rows/15migration records with full data digests. Live Julie flow verified via actual public fetch and real browser; desktop1440px/mobile390px JPEG screenshots visually inspected. Initial PNG rendering exceeded tool constraints; smaller original browser captures displayed successfully. No390px horizontal overflow. Browser asset scan71files clean; intended Git scan256files clean; only.env.example is tracked. Production dependency audit0 vulnerabilities.
Export now fetches a fresh server view before preparing Markdown, so access expiry while a page is open cannot obtain a newly generated full export from a stale client view.
Vercel blocker RESOLVED: CLI59.23.2 normal device login completed. Read-only preflight confirmed exact Git linkage. Applied five local provider keys to Production, compared values privately (all equal), then marked them Sensitive. VITE_AUTH_ENABLED=true. Read-back:Node22.x;framework/rootDirectory/outputDirectory null;npm12ci and npm12build. Existing DATABASE_URL,BETTER_AUTH_SECRET,BETTER_AUTH_URL,STRIPE_SECRET_KEY are Sensitive and cannot be read through the API; no attempt to bypass that protection. Database/auth/Stripe runtime validity and migration state remain unverified. Existing secrets preserved, legacyMLS flag excluded. Region sfo1 remains explicit in vercel.json; project default iad1 is overridden by that repository deployment config.
GitHub authentication verified; remote main2cd3cb1. Preservation branch is not on remote yet. Local HEAD has2 commits unique vs47 on main; no force push, main replacement or production promotion will be performed. Commit/push of all intended project changes is next, after successful configuration as instructed.
