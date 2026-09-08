# Flagship activation and blocker decisions

As of September 8, 2026. This register separates working product paths from external activation. Timelines below are engineering planning estimates after the prerequisite owner has access; they are not provider approval promises. Prices are published USD examples, exclude tax and additional services, and require confirmation at purchase. No service was purchased and no vendor/broker was contacted during this integration.

## Ranked scenario framework

The ordering optimizes useful delivery and reliable claims before integration breadth.

| Rank | Scenario | Decision rule |
| --- | --- | --- |
| 1 | Working product with agent-supplied data and explicit limits | Ship when ownership/permission is recorded and server validation protects the data. Never promote agent assertions into independent verification. |
| 2 | Fastest direct approved integration | Activate where it closes a measured acceptance gap with clear rights, bounded cost, durable evidence and an accountable operator. |
| 3 | Third-party aggregator | Use only when it provides the required rights, identifiers, provenance and deletion terms; an API response alone is insufficient. |
| 4 | No integration with honest copy | Keep the measured subset usable. Missing data must mean unavailable, not zero, a negative finding, a ranking or fabricated inventory. |
| 5 | Feature-flagged deferral | Use for expensive or noncritical features whose operational/legal prerequisites are not met. Preserve the implementation and acceptance checklist. |

Ranks apply to value for the development team, not to a requirement to enable every feature. For voice/video, deliberate deferral ranks first within that feature because the flagship does not depend on them.

## Durable hosted database and application environment

**Status:** A task-owned durable local PostgreSQL database is working, migrated and verified through database/app restart. The correct Vercel project was identified, but available tooling provided read access only; the browser authentication path did not establish project-owner access. No hosted preview DATABASE_URL was provisioned or verified. An unrelated inactive Supabase project was not repurposed.

**Decision/ranking:** direct approved preview database (1), working local PostgreSQL acceptance (2), another approved hosted Postgres provider (3), honest unavailable state (4), production rollout deferred (5). Production refuses missing DATABASE_URL and BETTER_AUTH_SECRET; it cannot silently run in an ephemeral database.

**Fastest path, estimated 1–2 hours after owner access:** (1) Open Vercel project `cloud-realtor` in team `blaines-projects-a6ff7e30`; (2) attach a dedicated Neon preview database through Marketplace, separate from production; (3) grant only the preview deployment its database connection and a generated auth secret; (4) set the correct BETTER_AUTH_URL and auth-provider configuration; (5) deploy the integrated branch, run `npm run db:migrate` against that preview only, and inspect `_migrations`; (6) repeat authenticated scan/history/quota/tenant/media/restart acceptance on its public HTTPS URL; (7) verify backups, retention and the intended production database before production activation. Vercel now directs Postgres provisioning through Marketplace integrations; Neon advertises a free plan, whose current limits must be checked against media storage and workload. [Vercel Postgres](https://vercel.com/docs/postgres), [Neon integration](https://vercel.com/integrations/neon), [Neon pricing](https://neon.com/pricing).

**Cost/alternative:** the existing local container requires no new service purchase. A free hosted tier may suffice for a bounded preview; do not assume it is sufficient for production or photo growth. Agent-supplied credentials are configuration, not a replacement for backup/tenant verification. Using another database aggregator does not remove environment-owner access. Keep paid/external operations gated until hosted acceptance succeeds.

## Three-provider CiteLock Recognition

**Status:** Implemented controlled San Diego prompts, exact prompt hashes, provider/model/location/date/response evidence, per-provider reports, comparable history differences, immutable captures, tenant checks, and atomic pre-dispatch quota. Real PostgreSQL repository acceptance passed. OPENAI_API_KEY and PERPLEXITY_API_KEY were unavailable; XAI_API_KEY exists locally. No live three-provider panel was executed in this session.

**Decision/ranking:** provision all three direct APIs (1), use implemented deterministic CiteReadiness and explain missing Recognition configuration (2), agent-supplied profile/evidence with unverified labeling (3), aggregator only as a separately versioned experiment (4), broader-market/consumer-UI ranking claims deferred (5). Do not replace a missing provider with a mock, scrape of consumer chat, or a different model under the same panel label.

**Fastest path, estimated half a day after account access:** (1) create restricted server-side project keys for OpenAI, xAI and Perplexity with spend caps; (2) put them in the preview environment only; (3) confirm account access to the configured model IDs in `.env.example`; (4) if a model must change, increment the panel/methodology version rather than silently comparing unlike runs; (5) run one controlled panel on an authorized real agent profile; (6) inspect all successful and failed attempts and persist exact provider/model/prompt/hash/location/date/response/citation evidence; (7) repeat a comparable run, inspect the diff, then test quota and other-tenant access without incurring extra paid requests. Provider charges depend on selected model, token volume and search tools; obtain account-specific current pricing and cap the acceptance budget before enabling unattended runs. No fabricated fixed budget is stated.

**Working alternative:** `/aieo` exposes deterministic readiness and its evidence gaps, with Recognition blocked until all three credentials exist. Readiness suggestions are hypotheses; no causal claim that they increase LLM recognition. The panel measures API answers for controlled prompts, not a universal ranking, consumer ChatGPT visibility, endorsement, or guaranteed own-site citation. Failed responses are not negative mentions. An agent-uploaded answer transcript cannot substitute for a provider-captured panel.

## MLS/RESO listing access and agent listing-role attestation

**Status:** No licensed MLS/RESO feed or verified listing-role provider was activated. Authorized Closed/Sold CSV import is tenant-scoped and role-gated. Active-book scoring requires current person-bound server attestation, an active/coming-soon listing, the agent's listing role and matching license/profile evidence; office/market/website records do not count.

**Decision/ranking:** authorized agent-supplied CSV/manual marketing records (1), direct broker-approved MLS back-office data and role attestation (2), licensed aggregator with equivalent identifiers/rights (3), no integration with unavailable copy (4), live-feed feature flag off (5). CSV permission is not MLS membership or independent production verification.

**Fastest approval path, estimated engineering 2–5 days after approval; commercial approval often weeks and not guaranteed:** (1) obtain the participating broker's sponsorship and exact MLS membership/agent identifiers; (2) document use case (back office/analytics rather than assuming IDX permission covers it), stored fields, downstream processors, retention/deletion and audit; (3) apply to the MLS or its licensed distributor; (4) execute broker/vendor/data agreements and pay quoted MLS-specific fees; (5) receive sandbox credentials and an explicit permitted-fields/use policy; (6) map listing/co-listing identities, statuses, permissions and timestamps to the server attestation record; (7) test revoked/private/suppressed/stale listings and cross-tenant access; (8) activate for that licensed workspace only. MLS Grid describes participant licensing and MLS-specific fees, rather than a universal price or approval SLA. [MLS Grid FAQ](https://www.mlsgrid.com/faq).

**Aggregators:** require written commercial rights for the actual use case and person-bound listing-side identifiers. RapidAPI or a portal inventory response is useful for discovery only unless the provider supplies these rights and attestations. Never infer agent inventory from brokerage membership, office inventory, address proximity, or a public website. The preserved RapidAPI branch remains available for a separate licensed evaluation.

**Working alternative/cost:** manual marketing properties and authorized Closed/Sold CSV work without a new feed subscription. Agent confirms permission; UI explicitly does not verify ownership/status/MLS role. Licensing fees remain quote-dependent. Valuation advice stays blocked where an authorized comp matcher is unavailable.

## Independent production-volume source

**Status:** No independent licensed, person-bound transaction-volume source was configured. Website biography, agent self-report, team totals and inventory counts cannot establish an individual's independently verified volume.

**Decision/ranking:** retain an unavailable independent-volume result with readiness guidance (1), direct licensed MLS closed-side records or independently audited person-level report (2), agent-supplied documents labeled asserted until verified (3), licensed aggregator meeting the same criteria (4), volume-derived badges/rankings deferred (5).

**Fastest path, estimated 2–5 engineering days after data rights:** (1) select a source that identifies the person/license, measurement window, transaction sides and units/volume definition; (2) obtain written analytics/display permission and representative lawful fixtures; (3) reconcile team/office versus individual attribution and double-counting rules; (4) retain provenance/observation timestamp/period; (5) test mismatches, missing IDs, stale periods and revocation; (6) enable only after an independent record matches the target agent. Cost and vendor review time are quote-dependent; do not treat portal scraping as the fastest compliant substitute.

**Working alternative:** report insufficient independent evidence and explain the specific missing source/identity/period. Accept supplied documents for review without turning them into a verified production claim. Social image export does not require volume data.

## RealTrends lawful fixtures and commercial use

**Status:** No commercial license or lawful representative adapter fixtures were obtained. Public availability or buying a personal-use spreadsheet does not establish product reuse rights.

**Decision/ranking:** disable unsupported RealTrends-derived claims and use other verified signals (1), obtain a specific commercial agreement plus fixtures (2), customer-provided licensed export with verified redistribution rights (3), authorized reseller with equivalent rights (4), adapter activation deferred (5).

**Fastest path, estimated 1–2 engineering days after commercial authorization; contracting timeline unknown:** (1) request commercial analytics/display/retention rights and test-fixture permission from the rights holder; (2) define individual versus team ranking, year and geographic scope; (3) receive licensed fixtures covering real match, name collision, team-only and no-match cases; (4) pin parser expectations/provenance, preserve year and person-binding; (5) run positive/negative fixtures before enabling the adapter. Published download examples include a $599 agent/team Excel product; the page specifies personal/noncommercial use, so that purchase alone is not the activation path. [RealTrends data downloads](https://www.realtrends.com/data-downloads/).

**Working alternative:** readiness can identify the evidence gap without inventing a RealTrends match or ranking. No paid data purchase was made.

## Actual-photo social images, Blob and Orshot

**Status:** Built-in square image export works now using real uploaded photo bytes retained privately in PostgreSQL: authenticated rights-confirmed upload, decoded/re-encoded images, metadata removal, server checksum/dimensions, workspace storage/usage quotas, retained output, deletion and private delivery. Optional Blob and Orshot code is implemented but not verified against live accounts or a real audited template.

**Decision/ranking:** built-in actual-photo export (1), direct audited Orshot+Blob activation (2), another deterministic renderer behind the same boundary (3), agent-supplied template/photos subject to server audit (4), external rendering flag off until acceptance (5). A supplied template ID or `allImageLayersUseListingPhotos` configuration assertion is not evidence that its layers were actually audited.

**Fastest paid path, estimated 1 working day after account access:** (1) attach a dedicated Blob store and server token; (2) confirm its exact public hostname in the photo allowlist; (3) create a real Orshot Studio template and inspect every image/background layer; (4) map every image layer to a server-owned actual photo, remove generative/prompt layers and audit all text substitutions; (5) record the actual template ID, version, layer names and auditor in an operations record; (6) populate ORSHOT_TEMPLATE_MAPPINGS and exact output host allowlist; (7) configure Stripe test-mode social subscription; (8) upload a rights-cleared photo with explicit public-delivery consent; (9) render once, verify the full photo/content and mirror the PNG into private retention; (10) exercise timeout, wrong-host, oversized/non-PNG output, duplicate request, entitlement/quota and deletion retry; (11) enable paid production only after a separately observed live-mode checkout/webhook and operator sign-off. [Orshot Studio API](https://orshot.com/docs/api-reference/render-from-studio-template), [Vercel Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk).

**Cost:** Orshot lists 30 one-time free render credits without a card and Launch39 at $39/month for 1,500 credits, with additional credits charged separately; image export consumes one credit. Blob storage/operations are separate and workload-dependent. The built-in beta requires no Orshot/Stripe purchase and is capped at 10 exports/day and 100 MiB stored per workspace. [Orshot pricing](https://orshot.com/pricing).

**Remaining limits:** public Blob URLs are explicitly optional and may remain accessible while deletion retry is pending. The studio can retry per-workspace deletion; a separate administrative worker is still needed to guarantee cleanup for any future whole-workspace deletion flow. Private DB media is the default. Original actual photo content is retained through deterministic rendering, not synthesized.

## Paid social Stripe lifecycle

**Status:** Implemented server-owned customer/workspace binding, one pending Checkout reservation per workspace, configured return origin, customer portal, signed raw-body webhook, event deduplication, current subscription retrieval, price/quantity/mode binding and fail-closed paid entitlement. Synthetic typed objects and real SDK signatures were tested against PostgreSQL. No live/test-account Checkout session, delivery, payment or refund was observed.

**Decision/ranking:** keep the free built-in export usable (1), activate direct Stripe test mode then live mode (2), manual operator reconciliation of independently verified billing events only (3), alternate merchant/provider as a separate integration (4), paid UI remains setup-required (5). Neither a client success URL, beta access code nor an agent assertion can grant paid renders.

**Fastest path, estimated half a day after account access:** (1) create a dedicated recurring social price and define included renders; (2) configure business tax settings, Checkout address collection and customer portal; (3) issue a restricted server key with the required customer/Checkout/subscription/portal permissions; (4) configure STRIPE_SOCIAL_PRICE_ID, STRIPE_SOCIAL_WEBHOOK_SECRET, SOCIAL_BILLING_RETURN_ORIGIN and included renders; (5) register created/updated/deleted/paused/resumed subscription events at `/api/webhooks/social-stripe`; (6) exercise test-mode checkout, paid/trial activation, failed payment, pause, cancellation, retry, replay, stale delivery and cross-workspace mismatch; (7) inspect receipt/entitlement rows and render denial; (8) perform the separately approved live activation and monitor webhook failures. Stripe recommends signature verification and subscription lifecycle handling. [Stripe webhooks](https://docs.stripe.com/webhooks), [Subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks).

**Cost:** Stripe's published US standard domestic-card baseline is 2.9% + $0.30 per successful transaction; Billing, Tax, international cards and other services may add charges. Account/product pricing must be confirmed before publishing a margin model. No payment was initiated during this work. [Stripe pricing](https://stripe.com/pricing).

## Video / CutCLI and durable worker

**Status:** Video remains Setup required. No verified CutCLI package/account/worker flow or rendered video exists in this session. No hand-invented cloud endpoint was used.

**Decision/ranking:** defer video and offer image download (1), verify a supported worker/SDK with durable jobs (2), rights-cleared agent-uploaded finished video as a later separate path (3), audited deterministic third-party renderer (4), honest no-integration copy (5). Directly generating fictional rooms/listings is outside the accepted product scope.

**Fastest path, estimated 2–5 engineering days after vendor access:** (1) obtain current official account/SDK documentation and verified package; (2) run it in an isolated worker with bounded temporary disk/runtime; (3) use only server-owned rights-cleared input photos and approved templates; (4) persist job lease/idempotency/attempts before dispatch; (5) verify timeout/crash/retry/cancel and no duplicate billing; (6) mirror and validate actual MP4 output; (7) test scheduled protected worker cadence and observability; (8) enable video only after the complete flow passes. Vendor/package pricing and production support were not verified, so no invented dollar amount or integration guarantee is given.

**Working alternative:** downloadable 1080×1080 PNG with the full actual photo and agent-supplied title/address; post it manually.

## Direct social publishing / OAuth

**Status:** Planned. The preserved local SocialDesk/Postiz work is not proof of token storage, account authorization, revocation or actual publishing on integrated main. No post was sent.

**Decision/ranking:** download and manual posting (1), direct or approved aggregator OAuth in a separate audited delivery (2), customer-supplied captions/media without account claims (3), no-integration copy (4), publishing feature flag off (5).

**Fastest path, estimated 3–10 engineering days after app/platform approvals; platform review may take longer:** (1) select channels and permitted scopes; (2) register the app and redirect URLs; (3) obtain any required business/app review; (4) encrypt tenant-bound tokens in durable storage with refresh/revocation; (5) validate media/account ownership before enqueue; (6) retain provider request/result/post ID with idempotent retry; (7) exercise token expiry, revoked consent, failed/partial post, deletion and account switching; (8) make one explicitly authorized test post and independently read it back. An aggregator may reduce platform work but does not remove OAuth/rights/audit requirements. Cost depends on provider and connected accounts; choose only after the target channels and account terms are known.

## Deferred #29 voice: Stripe, Retell, Twilio, counsel, broker and worker

**Status:** Voice is outside the flagship MVP critical path. External accounts, number/control, approved scripts/disclosures, broker/counsel sign-off and protected worker cadence are not verified. Production migration application history is also unavailable; renaming applied filenames would risk reapplication, so the six voice filenames must not be renumbered on assumption.

**Decision/ranking:** draft deferral with green integrated code (1), existing human follow-up/FAQ/showing workflow (2), limited approved inbound pilot after all gates (3), third-party answering service evaluated independently (4), broader voice rollout deferred (5). An agent-supplied phone number is not proof of authority to forward calls or record them. A different telephony aggregator does not remove consent, number control or broker requirements.

**Fastest pilot path, estimated 3–7 engineering days after all account/approval prerequisites; legal review and number provisioning can extend this:** (1) inspect every relevant production `_migrations` table and deployment history for the six voice filenames; (2) if none were ever applied, rename those files byte-for-byte to the next free consecutive main numbers in a single commit and rerun the full gate; if any were applied, design an explicit migration-history transition rather than renaming; (3) obtain counsel/broker-approved scripts, disclosure/recording policy, escalation, emergency handling, retention and forbidden-advice rules; (4) configure Stripe's distinct voice product and webhook settings; (5) establish Retell/Twilio accounts, number authority, inbound forwarding and credential scopes; (6) configure a protected durable worker and provider webhook verification; (7) run controlled test calls covering consent, interruption, voicemail, timeout, escalation and billing failure; (8) verify transcript/record retention, tenant isolation, cancellation, quotas and charges; (9) sign off the narrow pilot, then consider merge/activation last. This is an operational release checklist, not legal advice or a statement of consent requirements for every jurisdiction.

**Cost examples:** Retell advertises roughly $0.07–$0.31/minute depending on selected components; telephony and optional services can add costs. Twilio's US local voice page lists $0.0085/minute inbound plus $1.15/month for a local number, with other call/features priced separately. Do not add these blindly if a provider bundle already includes telephony. Counsel, carrier verification, Stripe and worker hosting are additional or quote-dependent. [Retell pricing](https://www.retellai.com/pricing), [Twilio US voice pricing](https://www.twilio.com/en-us/voice/pricing/us).

**Working alternative:** the integrated outreach FAQ and showing follow-up workflow prepares useful, editable human messages with explicit property selection and complete subject/disclaimer copy. It does not place calls, send emails or claim autonomous follow-up.
