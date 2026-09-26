# Citelock: client-fit discovery and visibility improvement

> Superseding requirements (2026-09-08): see
> [the user's complete approved direction](CITELOCK-APPROVED-DIRECTION-2026-09-08.md).
> It resolves the earlier shared-link retrieval dependency and governs conflicts.
> A connected discovery-and-improvement workflow is required; assessment alone
> is not acceptance. See FLAGSHIP-LEDGER.md D-012 for current implementation status.

Status: product/algorithm design, 2026-09-04. NOT a claim that the current app
implements this loop or has demonstrated visibility lift. D004 supersedes D003's
assessment-only Citelock release boundary. The social durability work remains useful.

## Outcome and distinctive value

Help an agent or brokerage become discoverable for the client needs it can
credibly serve. Identify expertise present in real client experiences but absent
from the sources answer engines use, create the missing public evidence, and
test whether discovery improves. A profile recap/readiness score is supporting
diagnostics, not the paid flagship deliverable.

The product answers:
1. Which non-branded client questions are relevant to this agent/brokerage?
2. Who appears in sampled answers, and which sources actually get cited?
3. Which supported differentiators are missing or poorly expressed in those sources?
4. What exact publishable change addresses each gap, and where does it belong?
5. Was the change published, did subsequent sampled answers change, and did
   attributable qualified inquiries follow where tracking is available?

Market differentiation is a hypothesis to validate, not a uniqueness claim.
Profound already markets prompt/competitor/citation analysis and content workflows;
Scrunch documents citation-led optimization. The proposed advantage is real-estate
entity/market/client-experience specificity and execution with the agent's social
workflow. Avoid generic 100-point dashboards and a broad fake CRM feature list.

## A concrete example (illustrative, not a scanned finding)

An agent's source-linked client comments repeatedly describe coordinating rural
property inspections and explaining well/septic due diligence. Their public bio
says only 'full-service real estate.' Competitors, not this agent, appear in the
selected rural-property discovery prompts; cited pages cover that due diligence.

The useful output is a proposed expertise page grounded in those client accounts,
a brokerage bio correction, a non-confidential case-study interview outline, and
three factual social drafts linking to the page. Each has source references and
a target query cluster. The app must not invent a case study, claim a review proves
a transaction, or assert that content differences caused a competitor's inclusion.

## Evidence and quality model: no production-volume leaderboard

Maintain separate dimensions, with source, date, scope, matching status and limits:

- Client experience: communication, responsiveness, negotiation process,
  explanation of tradeoffs, handling complications, aftercare. Extract themes
  from permitted reviews/comments; support each by short source-linked excerpts.
- Problem-specific experience: property type, locality and actual described
  process, supported by relevant case evidence rather than marketing adjectives.
- Market context: median and mean observed closed-sale price, count, period,
  range/IQR and distribution; individual vs team, buyer vs seller representation.
- Public authority: relevant independently sourced mentions, accurate directory
  identities and discoverable expertise content; not raw link count.
- Identity confidence and evidence sufficiency: keep distinct from service quality.

Do NOT reward transaction volume as service quality. Higher average prices can
describe price-segment exposure, not competence, affluent-client superiority,
neighborhood desirability or transaction complexity. Compare price context within
a defined geography/type/period only if comparable coverage exists. A low-price
specialist can be the strongest match for a client's difficult situation.

Reviews are client reports, not audited performance. Display sample size, dates,
source coverage, selection bias, positive/negative themes and uncertainty. Dedupe
syndicated reviews; do not infer independent corroboration from several copies.
Missing reviews means insufficient evidence, not poor service. No cherry-picking,
fabricated testimonials, incentive scripts or demographic steering. Never republish
private case facts or review text beyond permitted scope; require rights/consent.

RapidAPI is a context source, not MLS entitlement or personal-volume verification.
The currently provided endpoint list does not establish review text availability
or reuse rights. Use authorized review imports/public sources where permitted;
otherwise mark that dimension unavailable. No fabricated substitute.

## Algorithm v1: expertise-to-discovery gaps

### 1. Resolve the subject and collect bounded evidence

Input: agent/brokerage name, canonical site, geography, verified profile links,
optional license and authorized reviews/case materials. Resolve exact person vs
team/brokerage and known aliases; quarantine ambiguous same-name records.
Agent evidence cannot automatically be attributed to the entire brokerage or vice
versa. Crawl bounded same-site pages plus actual cited public pages using safe
DNS-pinned transport. Retain URL, observed time, content hash and small excerpts.
Treat all remote content as untrusted data, never model/tool instructions.

### 2. Create a fixed client-intent basket

Build clusters from locality x property/process needs x transaction stage:
agent selection, buyer due diligence, selling complications, relocation logistics,
property-specific questions. Do not use protected demographic descriptors.
Seed from real inbound questions/consented CRM or search-console data when present;
otherwise label prompts 'designed research questions', not measured demand.

Keep named reputation questions separate from unbranded discovery. The agent's
name/bio is NOT inserted into discovery prompts or a hidden model system context.
Version the basket before observing results; hold out some relevant clusters.
No retroactively choosing only prompts on which the agent wins.

### 3. Observe grounded answers and their sources

Use provider-supported web-grounded API adapters, bounded jobs and explicit run
cost ceilings. Record provider, returned model, prompt, tool configuration,
requested locale, actual surface, timestamp, answer, citations, errors and usage.
API observations are NOT measurements of the consumer ChatGPT/Gemini interface.
Locale in a prompt is not verified geolocation. Different surfaces stay separate.

Each observation records mention / recommendation / linked citation separately.
Resolve entities contextually; negated mentions and namesakes are not favorable
recommendations. Only provider-returned citation metadata counts as grounded links;
a URL invented in prose does not. Save failures, ambiguous classifications and
explicit abstentions; never silently convert failures to absence or zero quality.

### 4. Diagnose source-supported opportunities

For each cluster, compare subject evidence and the pages actually cited for peers.
Eligible gap classes:
- Identity: relevant public profiles describe inconsistent people/businesses.
- Retrieval: important public page is blocked, broken or not text-accessible.
- Coverage: supported expertise is missing from useful public answers/pages.
- Corroboration: own-site claim has no independent support where available sources
  or client evidence could legitimately corroborate it.
- Answer mismatch: retrieved source is stale, generic or describes wrong scope.

Never say 'we know the engine's ranking reason.' Distinguish directly observed
facts from intervention hypotheses. Competitor citations are clues, not proof of
causality or an instruction to copy competitors. If the basket does not produce
recommendations or usable citations, report insufficient opportunity evidence.

### 5. Rank actionable opportunities, not agent worth

Initial transparent heuristic (versioned; not calibrated lift prediction):

priority = 100 * fit * evidence_strength * observed_gap * actionability

Each factor in [0,1], with a human-readable rubric and supporting evidence IDs:
- fit: how directly the cluster relates to supported services/market experience;
- evidence_strength: identity-bound relevance, independence, freshness and coverage;
- observed_gap: repeatable discovery absence relative to relevant cited peers;
- actionability: a concrete fix on an owned page/profile or a legitimate workflow.

These are heuristic judgments, not probabilities. Missing inputs produce 'needs
research', not a confident score. Display effort separately; tie-break equal
priorities by lower effort. Demand weights are optional ONLY when real comparable
demand data exists; otherwise equally weight clusters and say so.

No sold-volume, raw review-count or high-price multiplier. Sample size changes
uncertainty, not service-quality worth. Calibration and inter-rater review are
required before describing the prioritization as predictive.

### 6. Produce a ready-to-review improvement package

Each opportunity contains: target client question, current answer evidence,
supported differentiator, diagnosed gap, proposed exact page/profile edits,
factual FAQ/case-study draft, source-linked social posts, owner, approval state,
and success metric. Unsupported claims remain explicit interview questions.

The public website page is the durable destination; social distributes useful
content and can drive people to it. A social post alone is not guaranteed to be
crawled or improve AI visibility. Publish only to connected/authorized destinations
after approval; otherwise downloadable patch/content plus manual URL confirmation.
Verify the live page matches the approved content before marking deployed.

### 7. Re-observe and learn

Primary discovery metric: fraction of completed, eligible unbranded observations
recommending the resolved subject, reported per cluster/provider/surface and
alongside the successful/attempted coverage. Report mention and citation rates
separately. Show numerators/denominators, not a percent without sample size.

Compare fixed basket/model/tool configuration across multiple dates. Model or
basket changes start a separate series. Duplicate retries share a run key and
cannot inflate the denominator; correlated repetitions are not independent users.
Use uncertainty intervals clustered by prompt/date when enough observations
exist; otherwise label descriptive and underpowered. No pretend 'AI search volume'.

Record intervention/content version and deployment date. Compare changed clusters
to held-out comparable clusters, noting spillover/model drift/seasonality. This
supports a directional experiment, not an automatic causal claim. Strong lift
claims need enough data and a valid experimental design.

Business outcome: qualified inquiries attributable to tracked pages/referrals
where available; consented analytics and self-reported source separately. Do not
infer that unobservable zero-click exposure produced a lead or sale.

## Implementation architecture and contracts

Reuse app auth, workspace membership, Postgres and source adapters. Keep the GEO
platform as design reference until its unfinished tenant/workflow paths are fixed.

subject + evidence -> versioned query basket -> bounded observation jobs
  -> entity/citation analysis -> opportunity + proposed content
  -> approval -> publish/handoff -> live-page verification -> repeat experiment

New persisted entities: subjects, evidence_items, query_baskets/query_variants,
observation_batches, observation_jobs/results, opportunity_records,
content_interventions, experiment_comparisons. Every relation binds workspace_id;
prompt/answer/content snapshots are versioned, not silently overwritten.
Existing social_drafts can hold approved distribution content; link to source
opportunity and intervention, and retain revision-safe approval.

API commands: create subject, prepare basket, start capped batch, get batch status,
list opportunities, draft intervention, approve revision, confirm deployment,
compare runs. Identity and workspace always server-derived/authorized; none of
the client can provide an arbitrary provider URL or mark a result grounded.

Workers: durable DB jobs with leases, bounded concurrency, unique execution keys,
per-tenant/global quotas and provider circuit breaker. Retry only known safe
failures; ambiguous charged requests are recorded for reconciliation, not silently
retried. First release uses small explicit runs, not an uncontrolled query fanout.
Cache crawls within terms; do not count cached model answers as fresh observations.
Exact call/dollar caps depend on verified current provider pricing/configuration.

UI: 'Where you are missed' -> 'Why this is a plausible opportunity' ->
'Review the improvement' -> 'Published and tested'. Always show raw evidence,
uncertainty, partial-run/errors, approval and last observation time. The readiness
panel is subordinate to these actionable opportunity cards.

## Acceptance gates and sequencing

1. Correct grounded observation adapters and durable failure/budget recording.
2. Identity matching + review-theme evidence extraction with ambiguity handling.
3. Fixed unbranded basket + per-cluster competitor/citation results.
4. Opportunity rules with inspectable supporting sources and truthful abstention.
5. Exact intervention artifacts + social draft linkage + revision-safe approval.
6. Live deployment confirmation and comparable observation history.
7. Pilot: useful completed interventions, returning agents, measured discovery
   movement and qualified inquiries where attributable; negative outcomes retained.

Test namesakes, team attribution, negative mentions, unsupported prose URLs,
duplicate review syndication, missing data, price outliers, provider failures,
locale/model changes, stale approval, tenant isolation, cap exhaustion, retry
deduplication, malicious source instructions and no-improvement experiments.

Scale later: separate crawl workers if necessary, verified consumer-surface access,
CMS integrations, better outcome calibration. Do not start with separate stacks,
invented demand datasets, universal ranking scores or MLS-dependent quality gates.

## Research basis (read 2026-09-04)

- https://www.tryprofound.com/features — vendor-described competing capabilities.
- https://www.tryprofound.com/features/agents/content-optimization — citation-led
  optimization already marketed; no basis for claiming the generic loop unique.
- https://helpcenter.scrunchai.com/en/articles/11944877-understanding-the-citations-tab-in-scrunch
- https://developers.google.com/search/docs/appearance/ai-features — useful visible
  content and technical access matter; no special AI schema or guaranteed inclusion.
- https://arxiv.org/abs/2311.09735 — GEO benchmark findings vary by domain; not proof
  of lift for this application or today's consumer answer engines.

## September19 implementation refinement
Subject identities now persist per workspace/entity kind (migration0014), with explicit save, role checks and optimistic revisions. A fresh device can use its saved Citelock identity without browser-local CRM setup. Evidence/history stays with its original fingerprint.
Observation method expertise-v2.1 retains the exact website URL and restricts shared-site profile credit to exact paths/query identities. Case-sensitive paths and identity-bearing query values are preserved. Root non-directory websites may receive site-wide credit; this remains a declared footprint, not proof of domain ownership. Changed methods cannot be presented as comparable lift.
Production-runtime verification uses Nitro preview of the actual Vercel artifact, native PostgreSQL and real Better Auth sessions; a compile success alone is insufficient.
