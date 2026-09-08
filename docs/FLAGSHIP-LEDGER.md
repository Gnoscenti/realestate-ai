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
