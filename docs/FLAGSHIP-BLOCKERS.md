# Flagship blocker register and decisions

2026-09-04. Local audit, not a production certification. Rank 1 = selected/highest
value; subsequent scenarios are alternatives, not promises. Implementation and
verification are tracked in FLAGSHIP-LEDGER.md. All entries initially open.

Update D004: the user rejected an assessment-only Citelock release. Its selected
scenario is now the discovery-to-intervention loop specified in
CITELOCK-VISIBILITY-DESIGN.md. Grounded observation, source-supported opportunities
and publishable improvements are required; readiness alone does not meet the
flagship bar. The old scenario rows below remain the original audit trail and
must not be interpreted as overriding this correction.

## P0: reliability, security and truthful outcomes

| Blocker / evidence | Ranked concrete scenarios | Decision / release gate |
|---|---|---|
| Ephemeral deployed DB / random auth secret (A004) | 1: require Postgres + stable secret in deployed runtime; local disk PGlite. 2: managed Supabase with same SQL. 3: memory only for isolated tests. | Fail closed on deployment misconfiguration; no production migrations during build. Verify restart durability/auth. |
| MLS authorization absent / arbitrary URL trusted (A006) | 1: RapidAPI private observations. 2: agent-supplied facts with explicit declaration, never MLS verification. 3: public website observations. 4: broker-sponsored licensed feed. 5: future provider flag after approved host/contract. | No active MLS fetch or attestation endpoint in MVP; retain historical data. Not even a supplied token proves license/display/AI rights. |
| RealTrends contract and identity binding absent (A006) | 1: do not assert verified production. 2: user attaches source as unverified claim. 3: negotiated feed + licensed cache + person/team/year matching. 4: paid download ONLY if commercial rights separately granted. | Disable live production verification until documented contract. Never aggregate Zillow sold pages as annual verified personal volume. |
| Citelock mixed readiness/credential gates (A005/A010) | 1: standalone public-page technical/content assessment with evidence and prioritized actions. 2: regulator verification as separate claim panel. 3: later outcome experiment after customer deploys changes. | Useful without MLS. Expose limitations, observed checks, method version, comparable history; don't relax professional claim gates. |
| Recognition unsupported citations / failed-run loss (A005) | 1: disable misleading aggregate; provide honest not-measured plus real assessment. 2: bounded grounded provider probes retaining raw results/failures/method/model/prompt. 3: licensed consumer-surface monitoring with separate methodology. | API probe is not consumer app rank. Grounded citation metadata only; no prose URL treated as source verification. Keys/quota failure must remain visible. |
| Claimed ProofGuard tamper evidence (A005) | 1: local versioned evidence with SHA-256 integrity digest, no external attestation claim. 2: durable outbox + validated signed receipt. 3: Merkle proof after real service contract. | A hash alone is not immutable storage or third-party proof. External integration deferred. |
| Disputes lack valid resolution path (A007) | 1: evidence-linked conflicts block claim export until a new observation resolves them. 2: audited reviewer annotation that never changes truth automatically. 3: provider arbitration later. | Status toggle cannot waive contradicting evidence. Person/team/scope/year matching mandatory. |
| Social fake publish/OAuth/QA (A008) | 1: durable approval/export/manual receipt desk. 2: authorized third-party scheduler connection. 3: direct per-platform OAuth + review + idempotent jobs. | Ship manual handoff explicitly, not auto-publish; edit invalidates approval; receipt is user-reported, not platform confirmation. |
| Social invented facts / media rights (A008) | 1: editable content composed from explicitly reviewed facts; text-first export. 2: user-owned uploaded media with rights affirmation. 3: paid AI rewrite with source constraints/review. | No invented open-house dates, closings, beds, testimonials or legal guarantees. Aggregator photo access does not establish reuse rights. Disable unbounded image/video paths. |
| Client-only paid entitlement / public codes (A011) | 1: invitation-limited evaluation with bounded server quotas, checkout disabled. 2: DB-backed entitlements, signed webhook and refund handling before paid launch. 3: external billing portal after same authorization. | Do not charge for access that is merely localStorage. Paid launch remains gated until entitlement tests. |
| Unbounded paid APIs (A008/A012) | 1: disable unsupported paid paths; bounded fixed-host allowed providers. 2: durable per-user/global budgets before enabling. 3: asynchronous jobs for long generation. | Authentication is not a spend control. No automatic paid retry on ambiguous failures. |
| Fake document/sign/tour/nurture/valuation results (A009/A015) | 1: exclude unready modules from MVP and block invocations. 2: explicit manual notebooks/exports. 3: real provider integration separately. | No success without an artifact/receipt. Preserve existing records. |
| Local CRM loss / auto seed purge / session races (A009/A015) | 1: stop automatic deletion; persist flagship data server-side; guard stale callbacks. 2: export/import local CRM backup. 3: full CRM sync later. | Account change cannot attach prior result. Do not purge by real names or email domains. |
| Crawler SSRF/rebinding / unbounded parsers (A010) | 1: pinned public DNS transport, per-hop validation, size/time/depth/page caps. 2: separate hardened crawl service. 3: user-provided HTML explicitly unauthenticated. | No private network access in deployed runtime; no secret headers across redirects. |

## P1: narrowed MVP and operational acceptance

| Blocker / evidence | Ranked concrete scenarios | Decision / release gate |
|---|---|---|
| Inbox/calendar approvals missing (A009/A012) | 1: defer connection buttons and automated scanning. 2: manual appointment + ICS export. 3: OAuth vault + refresh/revocation + provider review. | No token in browser storage; no synthetic inbox on empty/error. |
| Feedback external exposure/races (A013) | 1: private durable feedback. 2: opt-in public GitHub handoff with UUID/idempotency. 3: local-only export clearly labeled. | No automatic default-branch writes or public PII disclosure. |
| iOS incomplete (A013) | 1: responsive web MVP. 2: tested web-install experience. 3: signed Capacitor app after Mac/Xcode/assets/store policy. | Do not market App Store readiness. Never claim Windows verifies native signing. |
| GEO platform TODO runtime and no RLS (A014) | 1: reference design only, implement small audited parts in app. 2: repair standalone product later. 3: merge now (rejected high complexity/security risk). | No unfinished workflow fanout in release; tenant checks always server-side. |
| UI/loading/empty/accessibility failures (A015) | 1: fully finish flagship states and keyboard/mobile flows. 2: hide unfinished screens with clear explanation. 3: broad visual redesign later. | Preserve zoom, labels, focus, failure messages and retry without losing drafts. |
| Tests encode false trust and miss workflows (A003/A016) | 1: add adversarial and persistence tests; update behavior assertions to truthful contracts. 2: provider contract smoke tests as explicit opt-in. 3: live-every-CI rejected cost/nondeterminism. | Lint/type/unit/build/e2e plus local auth/tenant tests; no skipped failing assertions. |
| Deployment DB/secret/domain/backup not verified | 1: deployment preflight + isolated migration/restart test. 2: stage with owner-managed secrets. 3: direct production launch rejected. | No external deployment until actual environment approval/configuration. Document rollback and migration order. |
| Marketing broad unproven claims | 1: assessment + reviewed social workflow story. 2: measured case study after repeat observations. 3: promised ranking lift rejected. | Distinguish readiness, recommendation, provider observation, causal outcome and attestation. |

## Approval route: MLS/RESO (researched, not executed)

RESO creates standards; it does not issue a universal MLS token. Start with the
pilot brokerage's existing MLS membership and contracted technology provider.
This is the likely fastest licensed route (engineering judgment), not a published
approval SLA. Do not choose a distant MLS just because its sample endpoint works.
[RESO access FAQ](https://www.reso.org/reso-web-api/)

1. Write the use case: private workspace, listing lookup, caching, social copy,
   image reuse, AI-provider processing, public display, retention/deletion.
2. Ask the pilot's broker/MLS data licensing team which feed and vendor program
   covers those uses (IDX, VOW, back-office are not interchangeable permissions).
3. Supply company/contact, product URLs, privacy/security description, sponsoring
   broker, chosen markets and expected volume. Request current price sheet and
   written approval SLA; neither a universal cost nor timeline is published.
4. For MLS Grid specifically: request access; onboarding call; review technical
   docs; obtain signup link; authorized company signer creates vendor account.
5. Sign master license; select MLSs; invite broker partner; broker signs; MLS
   approves/executes; pay required fee; generate API token.
   [MRED's 12-step guide](https://www.mredllc.com/comms/resources/WebAPISetupSteps.pdf)
6. For Bridge/Trestle/another MLS provider: follow that provider's approved
   credential issuance; get exact service root/dataset/token URL/scope/grant and
   permitted resources. Never invent endpoints from the standard.
7. Put credentials only in server secrets; inspect metadata; test one authorized
   record, agent matching, paging, modifications/deletions, display suppression.
8. Validate provider-specific attribution/refresh requirements before any public
   display. CRMLS, for example, requires clear adjacent listing attribution and
   clarity about the responding agent.
   [CRMLS standards](https://go.crmls.org/wp-content/uploads/2026/02/2026_IDX_Standards_of_Practice-1.pdf)
9. Gate activation on signed rights plus integration/security tests, not token
   existence. Log contract/version and revocation/retention procedures.

Costs: MLS-specific licensing, collected by MLS Grid for participating MLSs;
broker only gets MLSs where it holds rights. Exact vendor/feed costs and approval
times UNKNOWN until quoted. Team action estimate: prepare request in 1 business
day; approval has no defensible promised deadline.
[MLS Grid FAQ](https://www.mlsgrid.com/faq)

For future TypeScript implementation, evaluate the official
[@reso-standards/reso-client SDK](https://tools.reso.org/guides/reso-client/).
It supports bearer and client credentials, metadata and OData queries on Node22+.
Commander is useful reference/testing tooling, not an entitlement workaround.
Reference-server fixtures test contracts, never supply production listings.
ULI identity matching cannot confer licensing or prove transaction ownership.

## RealTrends route (researched, not executed)

1. Contact the [RealTrends help desk](https://www.realtrends.com/contact-us/)
   requesting a commercial data license/feed for this named product.
2. Specify agent vs team vs brokerage, license identifiers, ranking vs production
   year, methodology, matching, refresh, permitted customer display and AI use.
3. Request schema/sample, authentication, allowed cache/retention, redistribution
   terms, support/SLA, rate limits and total price. Public enterprise API contract
   and delivery timeline remain UNCONFIRMED.
4. Review and sign before implementation. Obtain sandbox/credentials, validate
   identity+period, then bounded licensed fetching/cache and conflicts.
5. If no feed offered, negotiate a licensed periodic file, otherwise leave
   verification unavailable. Agent-supplied claims remain declarations.

Current published download: 2026 agent/team Excel = $599, based on **2025**
production; brokerage one/two/four-year files = $599/$1,399/$2,799. These are NOT
API fees or commercial-product permission. Download terms require a separate
commercial agreement and disallow mirroring. Buying this file is not the fix.
[Data downloads and restrictions](https://www.realtrends.com/data-downloads/)

## Social and visibility alternatives

Manual export is immediately usable without provider API approval. Direct
LinkedIn member publishing needs a developer app, Share on LinkedIn product,
OAuth consent and w_member_social; organization posting is a separate scope/
access problem. Add only after encrypted credentials, revocation, durable jobs,
idempotency and receipt handling. No published approval timeline established here.
[LinkedIn's guide](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin)

Instagram publishing additionally depends on professional-account permissions
and media handling; the Meta docs page was not fetchable during research. Do not
claim permission eligibility or review timelines verified. Native manual posting
and an existing user-owned scheduler are working alternatives.

Google says normal SEO fundamentals still apply to its AI features; special AI
schema/files are not required, and crawl/index/serving is not guaranteed.
Therefore assess visible content/crawlability and offer evidence-linked fixes;
measure changes after deployment without claiming causation from two snapshots.
[Google AI features documentation](https://developers.google.com/search/docs/appearance/ai-features)

---

## Session 2 update (2026-09-07) — decisions taken and implementation state

Rank 1 = implemented in this tree unless marked otherwise. Evidence and verification are
in FLAGSHIP-LEDGER.md (Session 2) and FLAGSHIP-DELIVERY-REPORT.md.

### MLS access (worked example, all scenarios)

| # | Scenario | Decision | State |
|---|---|---|---|
| 1 | No MLS pull. Rewrite "verified agent listings" language; remove MLS endpoints and dependent code paths. | **Selected.** Marketing copy now says listings are observed from the agent's website, imported by the agent, or labeled aggregator observations; representation is never asserted. Removed: `mls-fetch.ts`, `mls-sync.ts`, `mls-platforms.ts`, `attestation.server.ts`, MLS server functions in `aieo/api.ts`, credential forms on the MLS page, browser token vault, simulated inventory generator (`pullActiveListingsFromMls`), practice samples. Readiness gate `listing-role` now warns (excludes claims from answers) instead of blocking the whole score. 0007 tables are kept (never drop applied migrations). | Implemented, tested (unit), manually verified |
| 2 | Obtain RESO Web API access through the pilot brokerage's MLS / MLS Grid / Bridge / Trestle. | Documented route above; costs confirmed by public sources this session: MLS Grid-participating boards charge the vendor a licensing fee (example: Heartland MLS $100 setup + $175/month; NorthstarMLS $1,000 development + $500 startup for new vendors). Approval timelines are not published; expect weeks and a broker signature per MLS. Start the request in parallel with the beta; do not gate the launch on it. | Researched, not executed (no license, no credentials) |
| 3 | Partial data sources: agent website (observed), CSV import (declared), RapidAPI/Zillow (aggregator, unverified). | Kept as labeled sources; each row carries provenance and the UI says what it establishes. | Implemented |
| 4 | Agent-supplied listings as declarations. | CSV/manual imports stay "user declared" and feed content drafting as facts on record. | Implemented |
| 5 | Third-party aggregator as authority. | Rejected: reuse rights and representation cannot be established from an aggregator. | Rejected |
| 6 | Deferred provider integration behind a feature flag. | Rejected for this release: a flag plus stored credentials invites premature use; re-add only with a signed license and an adapter test suite. The historical code is in git history (commit c6ded14). | Deferred |

### Answer-engine measurement (Citelock GEO)

| # | Scenario | Decision | State |
|---|---|---|---|
| 1 | Grounded API probes with provider-returned citations, unbranded client-intent basket, competitor/source extraction, ranked opportunities, drafted interventions verified on the live page, repeat batches for trend. | **Selected.** `src/lib/aieo/visibility/*`, migration 0010, `routes/aieo.tsx`. xAI adapter live-verified; OpenAI/Gemini/Perplexity implemented from current docs and labeled unverified in the UI. | Implemented, unit-tested with mocked providers, xAI probe live-verified |
| 2 | Consumer-surface monitoring (ChatGPT/Gemini apps). | No licensed access; UI states the limitation on every report. | Not available |
| 3 | Guaranteed ranking lift. | Rejected; the product reports numerators/denominators and a directional trend only. | Rejected |

### Social publishing

| # | Scenario | Decision | State |
|---|---|---|---|
| 1 | Approval-first desk, AI drafts from declared facts, deterministic fair-housing review, manual handoff + receipt. | **Selected.** `src/lib/social-desk/*`, `routes/marketing.tsx`. | Implemented, unit + e2e tested |
| 2 | Publish through the agent's own scheduler (Postiz public API, agent-supplied key encrypted server-side). | **Selected** as the real publishing path. Client implemented from Postiz docs; not live-verified (no Postiz account in this environment). | Implemented, unit-tested with mocked API; live verification pending |
| 3 | Direct platform OAuth (Meta, LinkedIn, X). | Deferred: Meta app review is 2–4 weeks per permission (instagram_business_content_publish), LinkedIn needs a reviewed app with w_member_social; each requires an app owner and review video. Revisit after the beta. | Deferred |

### Entitlement, secrets, and truthful surfaces

- Server-side entitlement (`workspace_entitlements`, `access_code_redemptions`, `checkout_grants`) is the authority;
  codes moved to `BETA_ACCESS_CODES`; browser billing is a mirror. Implemented + tested.
- Production fails closed without `DATABASE_URL` / `BETTER_AUTH_SECRET`. Implemented.
- Gmail token no longer persisted; demo inbox removed; fake document review / e-sign removed; automatic seed purge
  removed; false-success toasts rewritten; Capacitor shell script injection fixed; orphaned modules deleted. Implemented.
- Grok Imagine image/video generation removed from the MVP (no spend control, no rights check); in git history.
