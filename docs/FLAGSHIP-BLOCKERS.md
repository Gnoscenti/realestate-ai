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

## Superseding classifications (2026-09-08, D-012)
The complete user direction in CITELOCK-APPROVED-DIRECTION-2026-09-08.md overrides
conflicting historical rows. MLS/RealTrends are deferred integrations, RapidAPI is
an approved real-data workaround to expose and verify. Manual social handoff is an
accepted feature. Assessment-only is not a Citelock release: evidence-supported
opportunity plus usable improvement and follow-through are required.
Historical "e2e tested" entries above were overstated: prior Playwright could not
launch locally; distinguish manual browser checks from automated browser tests.
Current verification will be recorded in the ledger with exact results.

## Current decision register (2026-09-08, supersedes older conflicting decisions)

| Rank | Dependency | Scenarios considered | Selected working path and remaining gate |
| --- | --- | --- | --- |
| 1 | Trusted product output | Assessment-only; generic AI text; source-backed intervention loop | Implemented the source-backed loop. Exact permitted content plus comparable observations; no unsupported quality/lift claims. Real-customer follow-through remains operational validation. |
| 2 | Durable/authenticated deployment | Browser-only authority; ephemeral DB; local disk; hosted PostgreSQL | Server entitlement and tenant isolation; disk PGLite locally, mandatory PostgreSQL in production. Target migration/restore/deployed smoke remains required. |
| 3 | MLS access | No pull; licensed MLS/vendor route; partial website/CSV; RapidAPI; deferred activation | RapidAPI is approved and live-verified, exposed in the app. Website observations and authorized imports work. Licensed MLS remains deferred; RESO is not a universal data grant. Historical scenario 6 rejection of all gated reuse is superseded by the user's explicit future-activation direction. |
| 4 | Expertise rights/coverage | Treat declarations as verified; ignore negative reviews; require sold volume; permission-aware sources | Explicit rights/entity/date/excerpt fields, contradictions and withdrawal history. New Citelock/social use rechecks support. Sold volume is not a gate; unsupported sale-role/period statistics remain unknown. |
| 5 | Social authorization | Fake connection; manual handoff; existing authorized scheduler; direct platform OAuth | Manual handoff/receipts pass browser tests. Postiz is implemented with encrypted keys and revision reservation; actual account publishing remains unverified. Unknown remote outcome freezes rather than replaying. Inspect scheduler when no post ID is known. |
| 6 | Measurement coverage | Consumer-app scraping; supported API observations; assumed positive recommendations; copied retries | Live-verified xAI API; explicit unverified alternatives; separate recommendation/mention/citation/negative/ambiguous/failure. Fixed baskets and compatible dates/methods; no fabricated referral attribution. |
| 7 | Payment readiness | Browser unlock; demo in production; verified checkout; beta codes | Atomic server code/checkout grants; demo prohibited in production; signed session ownership checked. Beta codes are the working pilot path pending money-flow and refund/revocation validation. |
| 8 | Market valuations | Fabricated AVM/forecast; external observations; user scenarios | Removed invented valuation/comps. Exposed RapidAPI and explicit-assumption arithmetic. Closed-sale statistics require supported price/date/role fields; not inferred from asking prices. |
| 9 | Native/calendar breadth | Claim completion; build all external integrations; responsive/manual workflow | Responsive web and honest local calendar/manual tracking now. Xcode/signing and real calendar OAuth/device sync remain separate work. |

Published licensing prices/timelines above are dated research, not a current quote or a promise of approval.
The final delivery report distinguishes implementation, automated tests, live probes, visual inspection and unverified integrations.

## September19 release completion update
| Value rank | Item and scenarios | Decision / verified state |
|---|---|---|
| 1 | PostgreSQL unverified: retain PGLite-only assurance; use isolated native server; or test a deployed customer database | Selected isolated Docker PostgreSQL16.13 migrations,41 critical tests and complete49-table logical restore passed. Added native PostgreSQL and compiled-artifact browser CI. Deployed backups/secrets/domains still need environment-specific validation. |
| 2 | Citelock identity durability: browser storage; server-owned saved identities; broad CRM migration | Selected server-owned identities per entity kind, explicit saves and stale-edit rejection. Independent browser context restores saved brokerage; other account stays isolated. Broad CRM/calendar sync remains separately labeled local. |
| 3 | Shared-site citation inflation: domain allowlist; exact profile paths/query identities; claim domain ownership verification | Selected exact profiles plus declared root-site footprint; method expertise-v2.1 separates measurement changes from outcomes. Regression tests cover other brokerage agents, query IDs and path case. Ownership verification is not claimed. |
| 4 | Social media body size: allocate then reject; bound the incoming stream; prohibit all media | Selected bounded binary streaming with cancellation; preserved working media path. Postiz account validation remains deferred; manual handoff is verified. |
| 5 | Production preview HTTP500 despite successful build: waive smoke; replace adapter; use installed Nitro artifact preview | Selected Nitro preview; compiled-app real-session/entitlement/draft/identity/isolation browser workflow passed on PostgreSQL. Permanent production browser CI added. |
| 6 | Money movement and social authorization | Existing secrets check confirms no Stripe or Postiz credentials. Keep server-code beta access and approved manual social workflow. No claim of live Stripe refunds/chargebacks or Postiz posting. |


### September20: Perplexity coverage resolved for the Agent default
Selected the user-requested Agent API through the official SDK. Minimal live request HTTP200; verified default model openai/gpt-5.6-luna with web_search. Legacy Sonar adapter removed; Agent and historical surfaces separated. Source metadata is available, while only returned URL-citation annotations earn citation credit. The live probe returned15sources and0annotations, so sources are useful evidence but do not establish citation lift. Alternatives: inspect retrieved pages; use other independently verified grounded providers for citation observations; collect comparable Agent reruns. No invented citations or consumer-app coverage.
Default-model connectivity blocker is resolved. Other model configurations and Perplexity-specific competitor extraction remain unverified/unimplemented respectively. Cooldown and error behavior is covered with deterministic fixtures and native PostgreSQL, not by inducing a live quota incident.

## September20 renewed audit: ranked decisions and working alternatives

This section supersedes contrary older status text, but preserves the history. Value ranking weighs correctness and customer value before feature breadth. No account purchase, application submission, data agreement or production publication was performed.

| Rank | Remaining dependency and concrete scenarios | Judgment, usable path and release condition |
|---|---|---|
| 1 | Customer-visible Citelock outcome: promise ranking lift; sell a generic score; provide supported content and measured observations | Ship the implemented expertise/discovery/improvement loop. Run a consenting pilot with a dated baseline, published source-backed page, publication confirmation and comparable later basket. Measure workflow completion and recommendations/citations with denominators, not a made-up causal lift percentage. Actual customer outcome proof remains uncompleted. |
| 2 | Hosted durability/auth: ephemeral functions; managed PostgreSQL; broad CRM rewrite | Require persistent PostgreSQL, explicit auth origin and stable secret. Native PG/migrations/compiled auth are tested locally; target TLS/proxy headers, backups/restore, alerts and deployed smoke are operational gates. Browser-local CRM/calendar remains explicitly scoped; exported files provide a useful manual alternative. |
| 3 | MLS: universal RESO token; licensed single-broker feed; aggregator; no feed | Keep licensed MLS deferred. RapidAPI observations, authorized website/CSV records and manual listings are usable now. Do not market these as verified MLS listings or verified representation. Narrow broker/vendor approval is the first licensed route to pursue when a customer needs it. Steps below. |
| 4 | Expertise permissions/identity: infer rights; count all same-domain pages; exact evidence and subject footprint | Exact source/entity/permission review remains mandatory. Current report/publication boundaries enforce exact brokerage profiles and block withdrawn evidence before/after live fetch. Existing public/scheduled content requires correction through its authorized editor; no retroactive deletion is claimed. |
| 5 | Grounded provider breadth: scrape consumer apps; count retrieved results as citations; use supported APIs | xAI and default Perplexity Agent connectivity verified. Failures and missing annotations stay visible; retrieved sources are separate. Use xAI for the fully exercised competitor-extraction loop. Perplexity-only competitor extraction, OpenAI/Gemini live coverage and consumer-app measurement remain incomplete. No substitute results. |
| 6 | Social authorization/outcomes: fake connection; direct platform apps; authorized scheduler; manual publication | Manual review, export/handoff and user-reported receipt are the accepted release workflow. Postiz implementation has reservations and atomic monotonic refresh; an actual authorized account must still validate publication. Unknown dispatch with no ID stays frozen; inspect Postiz and publish manually only after confirming absence. No automated unknown-ID reconciliation yet. |
| 7 | Paid access: local unlock; verified checkout; beta | Server beta codes are the selected pilot path. Stripe checkout verification exists, but live payment/refund/chargeback/revocation and webhook reconciliation are not validated/completed. Do not enable paid launch solely because a Stripe key exists. Keep that key unset until money-flow acceptance passes. |
| 8 | Account recovery: weaken identity checks; automatic unverified linking; verified recovery delivery | Production trusted origin and popup source tightened; automatic linking disabled. Email/password works, but no verified-email/password-recovery delivery is configured. Pilot operators may assist with a new account without transferring protected data; recovered ownership/data transfer needs a designed verification process. Do not claim self-service recovery. |
| 9 | Calendar: fake OAuth success; multiple provider integrations; useful manual path | Removed demo connections and dead fabricated events. Manual create/complete/delete and .ics export are implemented, with browser persistence, date validation and timezone labels. OAuth/device sync/invites/background notifications deferred. |
| 10 | Listing search: fabricated packet; full branded PDF service; factual file | Local search is labeled accurately. Real text summary export includes supplied fields and missing-value limitations. Dedicated client PDF design and external sending deferred. |
| 11 | Native iOS: describe shell as shipped app; delay web for signing; ship responsive web | Responsive web remains the MVP. Capacitor shell exists; Xcode project/archive/signing/App Store review and native-only integrations unverified. |
| 12 | Closed-sale/quality analytics: rank by volume; infer sold metrics from asking prices; abstain | Preserve missing/unknown outcomes and source/date/entity attribution. Current data cannot establish representative sale periods, role or service quality. Gather permissioned transaction evidence only if needed; these metrics are not prerequisites for expertise discovery. |

### MLS developer route, refreshed September20

**Fastest working option now:** authorized agent-supplied records and the already integrated RapidAPI lookup; neither provides licensed MLS completeness. **Fastest licensed route is an inference:** begin with an existing customer's participating broker and approved vendor, request only the necessary use/territory, and confirm whether the existing agreement covers this product. No source promises an approval SLA.

1. Identify a participating broker, MLS territory, legal vendor entity, signing contact, product/staging URLs and exact requested use (broker-only, IDX, VOW or another approved purpose). RESO defines the protocol and does not provide data or universal authorization. The MLS/vendor issues credentials after licensing. [RESO Web API](https://www.reso.org/reso-web-api/)
2. For MLS Grid, register the technology organization, confirm its email, create the subscription and select use/MLS. Review the displayed fees and sign the vendor agreement. Add broker details and agent details if applicable, plus production/staging URLs. The agent signs first when included, then the broker; MLS review may require corrections. After approval, finalize payment and retrieve the endpoint/OAuth2 token from the subscription. [Official access guide](https://www.mlsgrid.com/s/MLS-Grid-Data-Consumer-Access-Guide.pdf)
3. Before any AI use, inspect the current AI Use Addendum linked by MLS Grid and obtain confirmation that the intended provider processing, outputs and redistribution are covered. The PDF could not be fetched by the browsing tool in this review, so its substantive permissions are **not verified**. [Official agreements/resources](https://www.mlsgrid.com/resources)
4. Implement replication and deletions, not arbitrary real-time search. Honor MlgCanView and retention restrictions. Media URLs are signed, single-use and expire after one hour; download authorized media promptly into controlled storage rather than hotlinking or saving the URL for later. This changed September8,2026. Store source timestamps and validate required display attribution before activating any connector. [Official API documentation](https://docs.mlsgrid.com/)
5. Validate one broker/MLS in staging, reconcile counts and deletions, test token failure/rate limits/media expiration, then enable only for approved workspaces. No MLS endpoints are currently activated in this MVP.
6. **Timelines:** registration is self-service; signatures, MLS review, corrections and commercial negotiation have no published committed turnaround in the reviewed sources. Ask the named MLS/vendor for written target dates and fees; retain the working manual/RapidAPI path meanwhile. **Costs:** Grid collects MLS-specific license fees, not an additional Grid license charge; current totals appear in subscription pricing. Earlier Heartland/Northstar examples in this document are historical, not reconfirmed current quotes. [MLS Grid FAQ](https://www.mlsgrid.com/faq)
7. **RealTrends is a separate path:** its 2026 agent/team and one-year brokerage downloads are $599 each; two/four-year brokerage files $1,399/$2,799. They contain production rankings, not a live listing feed. Published terms are personal/non-commercial; commercial SaaS use needs separately negotiated rights and an unpublished quote/timeline. Do not buy the retail file expecting MLS access or commercial GEO reuse. [Official downloads and terms](https://www.realtrends.com/data-downloads/)

Partial-feed scenario: only represent fields, geography, timestamps and rights actually supplied; never fill missing sale-role/history with assumptions. Aggregator scenario: request licensed territory/use/redistribution and AI rights in writing; a paid API subscription alone is not verification. Deferred connector scenario: retain documented contracts and acceptance criteria, add no speculative live endpoint until a testable approved feed exists.

### Product/exit judgment (inference and recommendation)
The defensible asset is a permissioned, entity-specific record connecting source evidence, content changes and reproducible discovery observations. A large feature menu or a proprietary-sounding score is weaker evidence of value than repeat use, authorized publications, retained customers and credible before/after observations. Prioritize those pilot outcomes over more integrations; keep account recovery and money-flow operations ahead of open paid acquisition. A 36-month exit is an objective, not an outcome this code can guarantee.

September20 final clarification: CMA now offers bounded local comparison notes with positive price/area and city/type matching. No inferred condition, suggested list price or MLS-pull claim remains in the page or command-pack export. Full professional valuation remains outside the beta.

## Session7 decision update — September20
- Citelock public-evidence guide: MLS removed as a prerequisite. Free3-step and paid9-step manual guides, source scope/conflict handling, persistence and export are implemented/tested. Licensed bulk data remains a separate deferred integration.
- Vercel write access: initially blocked by connector schema/no mutation tool and failed browser runtime; resolved by ordinary CLI device authorization. Five local provider keys applied to Production on cloud-realtor and marked Sensitive. Build settings verified.
- Existing hosted DB/auth/Stripe values are Sensitive and cannot be inspected. Preserve them; verify production migration compatibility through an authorized database workflow before promotion. Working alternative: fully tested local/nativePG artifact and a non-production preservation-branch push.
- Production main diverges by47 commits from this preservation base. Do not overwrite main. Preserve all local work on its named branch, then reconcile through review before any promotion.
