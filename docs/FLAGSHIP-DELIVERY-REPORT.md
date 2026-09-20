# Flagship MVP delivery — September 20, 2026

**Release judgment:** Citelock's evidence-to-improvement loop and Social Desk's approved manual-distribution workflow are implemented and locally verified as a deployment candidate. They are suitable for a scoped beta after the target environment is configured and smoke-tested. This is not a claim of a deployed service, a completed paid general release, consumer-app ranking coverage or demonstrated GEO lift.

Source of truth: the local /home/ttroj/code/realestate-ai working tree. Existing changes were preserved. Production provider keys and build settings have now been configured on the verified Vercel project. Commit/push of this preserved working tree is the next release step; no merge, production promotion, account purchase or client-content publication has been performed.

## Audit trail and governing direction

The append-only [FLAGSHIP-LEDGER.md](FLAGSHIP-LEDGER.md) contains repo conventions, architecture, findings A-001 through A-051, product intent, blocker decisions, failures/root causes and verification evidence. Earlier sessions record first-party source reading; Sessions6–7 reopen that evidence and audits changed boundaries and unresolved findings. Generated code, dependencies, binary artifacts and secret values are not represented as line-by-line product source review.

The latest direction adds a free/basic and paid/thorough manual guide without an MLS dependency, documented below. The earlier [approved direction](CITELOCK-APPROVED-DIRECTION-2026-09-08.md) remains available in the advanced workspace: supported expertise → independent discovery → attributable opportunity → usable content → reviewed publication/handoff → comparable observations. Its supplied text is retained. The shared ChatGPT page was inaccessible in the earlier review; no missing content has been invented.

The [blocker register](FLAGSHIP-BLOCKERS.md) records ranked alternatives, chosen working paths and remaining gates, including a refreshed MLS developer route and primary-source links.

| Audited area | Implemented reality and current boundary |
|---|---|
| Architecture/API | TypeScript, React19, TanStack Start/Router server functions, Zod, Vite8/Nitro. Authenticated workspace authorization at durable APIs. Supporting CRM has a separate local browser store. |
| Data model | PostgreSQL production; persistent local PGLite; versioned migrations, memberships, evidence/observations/interventions/drafts/history/entitlements. No production fallback to ephemeral storage. |
| Citelock/agents | Evidence-aware discovery/improvement loop below. Readiness/schema are supporting functions. Some supporting assistant modules use deterministic rules; they are not autonomous external operators. |
| Social/frontend | Server-persisted review, claims/fair-housing checks, handoff/export and reported receipts. Optional Postiz implementation with guarded dispatch; authorized publication remains unverified. |
| Billing/auth | Server beta grants and verified one-time checkout consumption. Production origin/secret/DB guards and account isolation. Recovery/email delivery and paid operational reconciliation remain gaps. |
| Listings/market/CMA | RapidAPI observations and authorized/manual records. Explicit-assumption market scenarios. Bounded comparison notes without invented list-price or condition conclusions. |
| Calendar/email/transactions | Real local appointment entry/export and vendor notes. Session-token Gmail scan; manual transaction tracking. Calendar OAuth, notifications, document review and e-signing remain unconnected. |
| Native/config/CI | Responsive web, Capacitor hosted shell, Vercel artifact, explicit production migration, unit/browser/nativePG CI. Native archive/signing/store release and hosted operations unverified. |

## New guide: source-backed, free/basic and paid/thorough

**Implemented:** the default Citelock screen accepts agent/team/brokerage identity, any target locale, a personal/business website and optional exact broker/ranking/evidence URLs. Authenticated users can enter from the paywall without buying access. The server safely inspects up to four pages, records source timestamps/hashes, distinguishes matched/unmatched/unavailable evidence, and turns the findings into a manual action plan. No MLS or model API key is required.

**Free:** three actionable steps covering defensible claims, consistent identity and one useful local answer. **Full access:** nine steps, adding evidence placement, technical inspection, profile corrections, social distribution, comparable measurement and a four-week plan. Steps have priority, owner, effort, instructions and a completion criterion. Saved history, progress, save-error rollback and Markdown export are implemented. Every read, progress mutation and export checks current server entitlement; paid instruction text is never sent in a basic response.

**Live-verified case:** Julie Pierce Casey's personal biography and RealTrends profile were fetched through the same safe-fetch code used in the application. The parser found 2025 city sides rank1,20sides,$33.61M and detected the personal site's $44M statement. Browser rendering showed both the scoped claim and conflict. See [the case study](CITELOCK-JULIE-CASE-STUDY.md) for sources and concrete recommendations. Official brokerage corroboration remains unverified behind a JavaScript/anti-bot page.

**Limitations:** only the inspected public text is assessed. Identity matching is not proof of licensure, ownership or every claim's truth. Automatic ranking parsing is deliberately narrow (official RealTrends individual-agent profiles); other formats receive manual verification instructions. Three inspections per workspace/day, latest ten reports shown. This is a real instructional assessment, not an observed recommendation score or demonstrated causal lift. All publication remains a user decision.

## Citelock: goal, shipped behavior and gap

**Goal:** help an agent, team or brokerage become discoverable for demonstrable expertise in relevant client questions, while distinguishing evidence, observed answers, editorial hypotheses and outcomes.

**Implemented and tested:**

- Save separate agent/team/brokerage identities on the server, with revisions and cross-device restoration. Individual evidence does not automatically transfer to an organization.
- Record exact excerpts, attribution, dates, permission and contrary evidence. Declarations and selected client reports have explicit labels. Deduplication avoids inflated support; withdrawal preserves history and blocks new use.
- Run a versioned basket of unbranded questions plus separate named identity checks. Supported expertise determines question topics without inserting the subject name or biography into discovery prompts.
- Persist prompts, requested/returned models, API surface, answer text, provider citations, retrieved sources, usage/cost, timing and failures. Rates expose numerators/denominators; failures are not fabricated zeroes.
- Distinguish recommendations, mentions, citations, negative mentions, ambiguous identity and missing extraction. API observations are not consumer ChatGPT/Gemini/Perplexity app measurements.
- Connect supported expertise to a matched public page and relevant competing recommendations. Abstain if prerequisites are absent. Opportunities identify evidence, observed gap, hypothesis and test plan.
- Assemble usable page/FAQ text from exact permitted passages, with attribution, placement/internal-link instructions and interview questions. Approval requires fact/rights review of the current revision.
- Verify public subject identity and every substantive approved passage. Partial pages do not pass. Recheck permissions before and after fetching; withdrawal during the fetch cannot mark the package verified.
- Create a linked Social Desk draft with independent approval and continuing source obligations. Repeat saved baskets and separate incompatible provider/model/method/surface comparisons.

**Newest corrections:** inspected page evidence now uses exact shared-site profiles, consistent with citation attribution. Packages retain exact website paths instead of sending an agent's readers to a brokerage root. Report algorithm is visibility-2.2; observation method remains expertise-v2.1 because measured counts did not change.

**Gap:** no real customer's complete publication-and-later-observation outcome has been demonstrated here. Conservative identity/topic rules and model-assisted extraction are not ground truth. One page cannot establish whole-site absence. Indexing and causal visibility improvement are not guaranteed.

## Social: implemented workflow and reliability

**Implemented and tested:** authenticated workspace persistence; platform length/media/source validation; facts-first optional xAI drafting; deterministic claims review; explicit fact/rights approval; edit invalidation; history; copy/download/share handoff and platform-validated user-reported receipts.

Postiz supports encrypted connections, channel lookup, bounded media transfer, schedule/dispatch and status refresh. Dispatch reserves the approved revision before the provider call. Known rejection returns reviewable content; uncertain outcomes stay frozen and cannot be blindly replayed.

**Newest correction:** status refresh makes the remote read before taking a row lock, then commits publication, draft and history atomically. A delayed pending response cannot undo a confirmed terminal status. Invalid provider release URLs cannot become unsafe links.

**Not live-verified:** authorized Postiz publication. No external post was made. Unknown outcomes without a remote post ID require inspection in the scheduler. Manual handoff is the approved working MVP alternative.

## Other completed corrections

- **Calendar:** removed demo connections/sync and the dead synthetic-event generator. Added manual entry, date validation, device timezone, persistent local records, completion/deletion, rule-based preparation notes and RFC5545 .ics export. UTF-8 folding, escaping and exclusive all-day ends are tested. No invitation or notification is sent.
- **Search:** removed fictitious query history, artificial delay, AI/MLS claims and fake packet success. Property summary download uses supplied fields and identifies missing values/verification limits.
- **CMA:** removed guessed condition, unsupported list-price recommendation and MLS-pull claims. Same-city/type records with positive price/area become reference candidates; missing references stay empty. Page and command-pack exports carry the same limits. These are comparison notes, not verified sold comps or an appraisal.
- **Auth:** production requires explicit BETTER_AUTH_URL, persistent DB and stable secret. It no longer trusts unrelated loopback origins or defaults to shared preview OAuth credentials. Automatic linking is disabled; popup messages must come from the initiating window.
- **Earlier release work retained:** bounded provider/media reads, durable paid-call leases/quotas, atomic beta/checkout grants, migration outside build, nativePG CI, working Nitro production preview and secret-free browser output.

## Verification results

Latest checks ran against this tree. Logs/screenshots remain ignored under tmp/session7 (and earlier tmp/session6*); earlier live-provider evidence retains its original date.

| Check | Result / evidence |
|---|---|
| TypeScript | PASS: npx tsc --noEmit after all source/consumer edits |
| ESLint | PASS: npx eslint . --max-warnings=0 |
| Complete Vitest | PASS:34 files /242 tests; final export boundary passed the focused6/6 guide regression again |
| Native PostgreSQL | PASS:8 critical suites /52 tests, including guide gating, concurrency and tenant isolation |
| Migrations | PASS:15 migration files through0016, repeat application no-op |
| Logical restore | PASS:51 public tables /2,065 rows /15 migration records; counts and complete sorted row-content digests match a fresh target |
| Production build | PASS: declared npm12, Nitro/Vercel output |
| Desktop/mobile browser | PASS:18/18 on a fresh isolated workspace |
| Compiled production + PostgreSQL | PASS:3/3 on the final rebuilt artifact; real sessions, free guide, upgrade, persistence, failed-save rollback, server export, tenant isolation and forbidden-origin403 |
| Client secret scan | PASS:71 emitted text assets; no configured server-secret values found |
| Dependency audit | npm12 audit:0 known vulnerabilities September20; not a security certification |
| Whitespace | PASS, existing CRLF conventions recognized |
| Manual visual inspection | New live Julie guide desktop1440px/mobile390px screenshots inspected; text and controls fit, with no horizontal overflow. Earlier calendar and social checks retain their recorded dates. |
| Live providers | Earlier verified xAI/RapidAPI September19; Perplexity Agent default September20, HTTP200, answer text,15 sources,0 URL-citation annotations. Not repeated during this hardening pass. |

Failures were fixed, not waived: ambiguous calendar textbox/tab locator; repeated PostgreSQL runs accumulating a global budget fixture; command-pack references to the deleted list-price field. Production quota limits and assertions remain intact. Fixture reset rejects non-test database names.

## Run locally and release

Use WSL Ubuntu, Node22+ and declared npm12; this working tree has Linux dependencies.

```bash
cd /home/ttroj/code/realestate-ai
npx --yes npm@12.0.0 ci
export BETTER_AUTH_URL=http://localhost:8131
node --env-file=.env.local node_modules/vite/bin/vite.js dev --host 127.0.0.1 --port 8131
```

Configure server-only keys in ignored .env.local as needed: XAI_API_KEY for the exercised full discovery/extraction loop and optional drafting, PERPLEXITY_API_KEY for Agent answers, RAPIDAPI_KEY for live data. Never prefix secrets with VITE_. Set stable BETTER_AUTH_SECRET locally for sessions across restarts. Production secrets must be configured separately on the host; the local env file is not a deployment secret store.

Open http://localhost:8131 and sign in. The paywall offers the free Citelock guide; full access uses verified checkout or an authorized beta code. Save the Citelock identity; add permitted expertise and inspect a public page; run a batch; review a supported opportunity/package; approve and publish through an authorized editor; confirm the URL; hand off the linked social draft; repeat the basket later. Insufficient evidence produces an honest empty state.

```bash
npm run typecheck
npm run lint -- --max-warnings=0
npm run test:unit
npx playwright install --with-deps chromium
npm run test:e2e
npm run build
npm run test:postgres
PLAYWRIGHT_PRODUCTION=1 npm run test:auth
npm run test:restore
```

NativePG/production-auth require isolated TEST_DATABASE_URL ending in _test or _tests. Restore also requires a different empty TEST_RESTORE_DATABASE_URL. See README for migration/preview environment behavior.

Release order: persistent PostgreSQL and stable auth secret/origin → server keys, beta codes and budgets → target backup → npm run db:migrate with target DATABASE_URL → build/deploy through team process → hosted auth/tenant/entitlement/grounded-batch/social-handoff and restore/monitoring checks. Do not enable Stripe charging before money-flow acceptance.

## Remaining gates and recommended sequence

1. **Not completed:** target public HTTPS/proxy-IP configuration, deployed migrations/backup policy/alerts and production smoke. Local Nitro reports no trusted client IP and shares an auth rate-limit bucket. Configure the actual proxy contract; do not trust arbitrary headers.
2. **Not completed:** real customer publication plus comparable later observations and retention/outcome validation. This is the highest-value pilot work for the 36-month exit objective.
3. **Unverified/deferred:** live Postiz posting and unknown-ID reconciliation. Manual publication/handoff remains usable.
4. **Not completed:** verified recovery/email delivery and paid refund/chargeback/revocation/webhook operations. Server beta access is the launch path; unverified accounts must not receive another account's protected data.
5. **Provider limits:** Perplexity-only competitor extraction is unimplemented; OpenAI/Gemini and alternative Agent models are not live-verified. Retrieved results without annotations earn no citation credit. Use the exercised xAI loop for competitor extraction.
6. **Deferred with working alternatives:** licensed MLS/bulk RealTrends data, calendar OAuth/sync, native iOS signing, unsupported closed-sale/role/period analytics. RapidAPI observations, permitted imports, calendar export and responsive web remain available.
7. **Inferred/recommended:** prioritize permissioned evidence-to-publication records and retained-customer value over more integrations or a proprietary-sounding score. No code guarantees ranking lift or an exit.

The blocker register gives current primary-source MLS steps, prerequisites, fee/timeline uncertainty and AI/media considerations. RESO is not a universal data-access authority. RealTrends retail rankings are not MLS listings and their published non-commercial rights are not a SaaS license.

## Vercel and Git handoff

The verified Vercel project is **cloud-realtor**, linked to **Gnoscenti/realestate-ai**, production alias https://cloud-realtor.vercel.app. The five local provider keys (XAI, OpenAI, Perplexity, Gemini, RapidAPI) were uploaded to **Production**, privately compared to the local values, and marked **Sensitive**. VITE_AUTH_ENABLED=true. Node22.x, npm12 clean installation, Vite/Nitro build, and null framework/root/output overrides were read back successfully. Existing sensitive database/auth/Stripe values were preserved and cannot be read through the API; their operational validity and production schema remain unverified.

[VERCEL-PRODUCTION-RELEASE.md](VERCEL-PRODUCTION-RELEASE.md) documents the reproducible configuration command and the separate migration/promotion gates. Latest observed production remains main@2cd3cb1. The preservation branch has two historical commits not in main, while main has47 commits absent from its base; it must not be force-pushed over production.

All intended project source/docs/tests are prepared for a release commit on **local/2026-09-08-flagship-preservation**. The final commit/push evidence is recorded in the ledger after the operation. Only .env.example is intended for Git. The local keys, authentication files, test credentials, database files, backups, screenshots and logs remain excluded. Secret scan:256 intended files, no configured secret values; emitted client-assets scan:71files, no configured server-secret values.
