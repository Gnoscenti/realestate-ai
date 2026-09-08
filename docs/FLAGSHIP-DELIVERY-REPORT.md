# Flagship MVP — Delivery Report

Date: 2026-09-07 · Source of truth: the local working tree (`~/code/realestate-ai`), not GitHub.
Audit trail: `docs/FLAGSHIP-LEDGER.md` (findings A-001…A-028, decisions D-001…D-009, verification log) and `docs/FLAGSHIP-BLOCKERS.md` (blocker register with scenarios).

Every claim below carries exactly one status:

| Tag | Meaning |
| --- | --- |
| **Implemented** | Code exists in the working tree. |
| **Tested** | Covered by an automated test that passed in this session (`vitest run`). |
| **Manually verified** | Exercised in a real browser against the dev server (auth on, real provider keys) in this session. |
| **Inferred** | Believed correct from reading code or documentation; not executed. |
| **Recommended** | Not done; a proposed next step with reasoning. |
| **Not completed** | In scope but not delivered; reason given. |

## 1. What the product is now

RealEstate AI is a single-login agent workspace with two flagship functions that work for real:

1. **CiteLock Visibility** (`/aieo`, `src/lib/aieo/visibility/*`): asks grounded answer engines the unbranded questions a client asks ("which agents should I work with in Rancho Santa Fe, CA?"), records who each answer names and which pages it cites, and reports discovery rate, citation rate, identity accuracy, source gaps and ranked fixes, each with numerator and denominator and with the verbatim answers kept for audit. It is a measurable, defensible GEO/AIEO assessment. It never promises that an engine will cite the agent.
2. **Social Desk** (`/marketing`, `src/lib/social-desk/*`): facts-first AI caption drafting, deterministic fair-housing and claims review, revision-safe approve → publish (Postiz) or manual handoff with a receipt, persisted server-side per workspace.

Everything else in the app is either honest supporting workflow (leads, calendar, CMA notes, instant-response scripts) or explicitly labelled "manual tracking" / "not connected". No MLS feed is connected (decision D-006); all MLS endpoints and dependent code were removed.

## 2. Phase 1 — Audit (summary; details in ledger A-001…A-028)

The prior Codex audit (A-001…A-016) was re-verified and extended. Findings that changed product decisions:

- Features presented as complete but simulated: MLS sync, listing attestation/recognition, social publishing "success" toasts, document AI review and e-signature, a Gmail inbox demo containing a fabricated wire-instructions email, product tour, seeded activity with real street addresses. All removed or replaced with truthful states (ledger implementation log).
- Security and safety: Gmail token in localStorage (removed), Capacitor script injection (escaped), dev fallbacks that would silently run in production without a database or auth secret (now fail closed), client-side-only paywall (now server-side entitlement).
- Tests covered the simulated paths and not the real ones; rewritten (see §6).

## 3. Phase 2 — CiteLock intent vs. implementation

**Intent (reconstructed from `docs/CITELOCK-VISIBILITY-DESIGN.md`, README history and route copy):** make an agent or brokerage visible and correctly described inside LLM answers, and prove it with evidence rather than a score.

**Implemented now:** the full measurement loop: basket → grounded providers → deterministic evaluation → report → opportunities → drafted interventions → live-page verification → trend across batches. Ledger D-005 records why measurement-first was chosen over "optimization" claims.

**Gap that remains (Recommended):** the *boost* is delivered as approved, verifiable interventions (profile-claim checklists, drafted site pages and FAQs built only from the agent's own facts). Whether engines subsequently cite those pages is measured by the next batch, never asserted. Multi-provider coverage beyond Grok is implemented but unverified live (§5).

## 4. Phase 3 — Blockers and the MLS worked example

See `docs/FLAGSHIP-BLOCKERS.md` (Session 2 tables). Decision: **no MLS pull for the flagship** (D-006).

- Scenario 1 (chosen, Implemented): marketing rewritten; `mls-fetch.ts`, `mls-sync.ts`, `mls-platforms.ts`, attestation and recognition modules and their tests deleted; listing-role scoring gate downgraded from block to warn; the "Listings & Data" page explains data sources honestly.
- Scenario 2 (researched, Inferred): RESO Web API access through an MLS or vendor (for example MLS Grid: Heartland $100 setup + $175/month; NorthstarMLS $1,000 + $500) requires brokerage sponsorship, a data-access agreement, an approved use case and an unpublished approval timeline. RealTrends downloads cost $599 and are non-commercial. Not viable inside the MVP window; the sequence and prerequisites are recorded in the blocker register.
- Scenarios 3–6 (Recommended): agent-supplied listings (partly implemented via website and CSV import), aggregator APIs (RapidAPI panel exists, labelled as third-party observations), brokerage feed partnership, feature-flagged deferral (the `CITELOCK_MLS_ENABLED` flag was removed rather than left dormant).

## 5. Phase 4 — What was built and how it was checked

### CiteLock Visibility

- Prompt basket v1 (5 unbranded clusters + 2 branded checks); unbranded prompts never contain the subject's name, brokerage or site. **Tested** (`visibility-report.test.ts`, `visibility-engine.test.ts`).
- Provider adapters. xAI Responses `web_search` with `url_citation` annotations and cost ticks: **Manually verified** live (real citations to fastexpert, usnews, realtor.com, sdbj, sothebysrealty; cost tracked per run). OpenAI Responses `web_search`, Gemini `google_search` grounding, Perplexity `search_results`: **Implemented, Inferred from documentation, labelled "unverified adapter" in the UI**. Gemini fails live with `provider_rate_limited` on this key (quota), and the run table shows that honestly.
- Resumable leased batch execution in short server slices, daily quotas, entitlement gate: **Tested** (retry-once, lease expiry) and **Manually verified** (a batch interrupted by a reload resumed from the "Resume batch" banner).
- Report: discovery, citation and identity rates with sample sizes, per-intent rows, competitor entities (model-extracted, labelled as such), source gaps against directory hosts, opportunities with priority = gap × reach × actionability × fit: **Tested**.
- Interventions: deterministic profile-claim checklist; Grok-drafted site page or FAQ from facts only with `factsUsed` and `unsupportedClaimsAvoided`; approve, edit, dismiss; "I published it — verify" fetches the live page and checks that approved sentences are present. **Implemented**; the failure path (unreachable page → note recorded) is **Manually verified**; the success path is **Inferred** because it needs a real public page.
- Evidence locker and readiness scan retained from the prior release: **Implemented**; the scan's SSRF guard (reserved hosts refused) is **Manually verified**.

### Social Desk

- Drafting: xAI JSON-schema completion, facts-only prompt, platform length truncation, hashtag normalisation, daily quota, entitlement. **Tested** (`social-desk.test.ts` with fetch stubs) and **Manually verified** (§7).
- Fair-housing and claims review with block-versus-review rules, including a source-of-income rule ("no Section 8", "no vouchers") added after manual testing: **Tested**. Blocked captions cannot be approved; enforced server-side and the UI disables the button: **Tested** and **Manually verified**.
- AI model latency (A-029, D-010): entity extraction and drafting default to the fast Grok aliases (`grok-4-1-fast-non-reasoning` / `grok-4-1-fast-reasoning`) because grok-4.6 structured output took 27 s in a probe and timed out in production paths. **Manually verified** (batch #2 extraction, page drafts). Raw error codes are now mapped to actionable sentences by `src/lib/ai-errors.ts`: **Implemented**.
- Draft lifecycle with revision-safe commands and history: **Tested**.
- Postiz publishing: AES-256-GCM encrypted API key, live channel check on connect, upload → create post → status refresh, failed publication rows kept while the draft stays approved. **Implemented and Tested with stubbed HTTP**; **not verified against a live Postiz workspace** (no key available). The connect flow with an invalid key failing cleanly is **Manually verified**.
- Manual handoff: copy, share, download, receipt. **Manually verified**.

### Access, security, deploy readiness

- Server-side entitlement (`workspace_entitlements`, code redemption once per workspace, verified Stripe checkout grant once per session): **Tested** (`entitlement.test.ts`) and **Manually verified** (wrong code rejected by the server; pilot code grants access; paywall disappears after redemption).
- Fail-closed production checks (no `DATABASE_URL` or no `BETTER_AUTH_SECRET` → startup throws): **Implemented**, **Inferred** (not executed with `NODE_ENV=production`).
- Migration `0010_citelock_visibility.sql` applied at startup and at build: **Manually verified** on PGLite; **Inferred** for Postgres (plain SQL, no PGLite-specific syntax).
- CI: lint runs with `--max-warnings=0`: **Implemented**. Playwright e2e specs rewritten: **Implemented, not executed locally** (Chromium cannot launch in this WSL; CI installs browsers with system deps).

## 6. Automated verification (final run in this session)

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | PASS |
| Lint | `npx eslint . --max-warnings=0` | PASS, 0 errors and 0 warnings, after adding the gitignored `tmp/**` scratch folder to the ignore list |
| Unit and integration | `npx vitest run` | PASS · 27 files · 198 tests |
| Production build | `npx vite build` | PASS after the final edits (Nitro Vercel preset output generated; log in `tmp/checks/final-build.log`) |
| E2E | `npx playwright test` | NOT RUN locally (missing libnss3 and libnspr4; sudo unavailable). Specs: `paywall-beta.spec.ts`, `citelock.spec.ts`. |

## 7. Manual verification log (auth-on dev server, port 8123, real xAI key)

Full table with timestamps and observations: ledger, "manual verification log, second pass". Condensed:

| Flow | Observed |
| --- | --- |
| Sign-up → paywall → server-side code redemption | Paywall shown for a new account; wrong codes rejected by the server; pilot code grants access; Command Center opens. |
| Profile wizard with a reserved test host | Website scan refused by the SSRF guard; "Continue without website scan" then "Launch workspace" saves the profile. |
| CiteLock batch #1 (14 runs, 45 s slices) | 7 ok (xAI, real citations), 7 failed (Gemini quota, shown as `provider_rate_limited`), cost $0.98. Report, opportunities and verbatim answers rendered. Found A-029: entity extraction timed out on every run. |
| A-029 fix, then CiteLock batch #2 | 7 ok / 7 failed, cost $0.92; "Who engines named" and "Who gets recommended instead" populated from model extraction on all five unbranded runs; trend table shows both batches. |
| Resume after interruption (earlier in the session) | "Resume batch" banner continued a batch from 4/14 to 8/14 without re-running stored answers. |
| Opportunities → drafts | Profile-claim checklist created deterministically; two site-page drafts from the fast Grok model in under 20 s, each with "Facts used" and "Claims deliberately NOT made". |
| Approve → "I published it — verify" | State becomes deployed with the note "Could not fetch the page: Local or reserved hostnames are not allowed"; verify stays available. Success path needs a real public page. |
| Social Desk AI draft | Caption plus facts-used and claims-avoided lists in ~10 s; two alternative hooks. |
| Fair-housing review | "Perfect for families" and "#1 agent" flagged for review; "No kids" blocks and disables approval; "no Section 8" was missed, so a source-of-income block rule was added with tests. |
| Approve → handoff → receipt | Approved revision; Copy / Share / Download; "I'll post this myself" then receipt URL → state "Posted (reported)". |
| Postiz connect with an invalid key | Toast "Postiz rejected the API key"; nothing stored. |
| Listings & Data page | States plainly that no MLS feed is connected; RapidAPI panel labelled as unverified market context. |

## 8. How to run

```bash
cp .env.example .env.local   # set DATABASE_URL, BETTER_AUTH_SECRET, XAI_API_KEY at minimum
npm install
npm run dev                  # http://localhost:3000
npm run typecheck && npm run lint && npm test
npm run build                # applies migrations, then vite build (Nitro Vercel preset)
```

Beta codes: set `BETA_ACCESS_CODES` (comma-separated) in production. The built-in pilot codes only work outside production.

## 9. Known limitations and risks

- Only the xAI adapter is live-verified. OpenAI, Gemini and Perplexity adapters are implemented from documentation, and the UI labels them "unverified adapter" until a real run succeeds.
- Postiz publishing has not been exercised against a live Postiz workspace. The HTTP contract follows the public API docs and is unit-tested with stubs.
- The intervention "verify" success path needs a real public page; only the failure path was exercised.
- Playwright e2e could not run on this machine. It runs in CI, but CI has not been observed green in this session.
- Remaining truthfulness debt outside the flagship paths (Recommended, not completed): the "Live suite" badge and hard-coded market statistics in `market.tsx`, uncited figures in `priorities.ts`, competitor claims in `competitors.ts`, feedback-board copy, and seed data with real-looking addresses. Each is listed in the ledger open items.
- Local development uses an in-memory PGLite database when `DATABASE_URL` is unset, so data is lost on restart. This happened once in this session when the WSL VM restarted.

## 10. Not completed, and why

- Live multi-provider verification: the Gemini key has no quota; no OpenAI or Perplexity keys are present in `.env.local`. Recorded as a blocker rather than faked.
- Live Postiz publish: no Postiz API key is available, and buying access was out of bounds by standing constraint.
- E2E execution: environment limitation, see §6.
- Features removed rather than finished (document e-sign, AI document review, inbox scanning, product tour, multiplayer): out of flagship scope. Their UI now states "not connected" instead of simulating success.
