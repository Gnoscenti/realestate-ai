# RealEstate AI — CiteLock and the Social Desk

An AI-native workspace for real estate agents and brokerages. Two functions carry the product:

- **CiteLock** — measures where AI answer engines send your clients and what to change so they name you. It asks
  the unbranded questions clients ask ("who should I hire to buy in Rancho Santa Fe?"), records who the engines
  recommend and which sources they cite (provider-returned citations only), ranks the gaps into concrete fixes,
  drafts the fix from facts you can support, and verifies the fix on your live page. Every rate shows its
  numerator and denominator. Nothing promises a citation.
- **Social Desk** — drafts posts from facts on record, runs a fair-housing and claims review, requires a human
  approval of the exact text, then publishes through the agent's own Postiz workspace (which holds the platform
  authorizations) or hands off manually with a receipt. No fake "published" badges.

Around them: a ranked daily action desk, instant-response scripts, a local CRM notebook, CMA/market notes,
calendar and vendor lists, and a labeled aggregator data panel. These are working tools, not automation claims —
see *Scope honesty* below.

## Stack

React 19 · TypeScript · Vite 8 · TanStack Start/Router · Tailwind v4 + Radix · Zustand (browser mirror) ·
Postgres (Neon) via `pg`, PGLite fallback for local dev · Better Auth · Stripe · Vitest · Playwright · Capacitor (iOS shell).

## Run it

```bash
npm install
npm run dev          # http://localhost:8080 (PGLite in-memory DB, auth on)
npm run typecheck
npm run lint
npm run test:unit
npm run test:e2e     # starts the dev server with VITE_AUTH_ENABLED=false
npm run build        # also applies migrations when DATABASE_URL is set
```

Node 22+. On Windows, run the toolchain inside WSL (the repo's node_modules are Linux binaries).

### Environment

See `.env.example`. Production refuses to start without `DATABASE_URL` and `BETTER_AUTH_SECRET`. CiteLock
needs at least one answer-engine key (`XAI_API_KEY` is the live-verified adapter). Beta codes are validated on
the server from `BETA_ACCESS_CODES`.

## Deploy (Vercel)

1. Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `XAI_API_KEY`, `BETA_ACCESS_CODES` (and
   `STRIPE_SECRET_KEY` if selling access).
2. `npm run build` applies pending migrations from `/migrations` to `DATABASE_URL` and builds the Nitro/Vercel output.
3. Verify after deploy: sign up, redeem a code, run a CiteLock visibility batch, create and approve a social draft.
   Rollback: redeploy the previous build; migrations are additive (never dropped).

## Scope honesty

| Area | State |
| --- | --- |
| CiteLock visibility batches | Real provider calls, stored verbatim with citations, cost, latency, and error codes. API surfaces, not consumer apps. |
| CiteLock readiness scan | Real site audit; California DRE registry check; other states record "unsupported". |
| Social publishing | Real through the agent's Postiz connection; otherwise manual handoff + user-reported receipt. |
| MLS | **Not connected.** No license exists; representation is never asserted. See `docs/FLAGSHIP-BLOCKERS.md` for the RESO/MLS Grid route. |
| Market data | Zillow-via-RapidAPI observations, labeled unverified. |
| Email alerts | Gmail scan only with a token you paste for that session; nothing is stored or invented. |
| Transactions | Manual milestone tracking. Document review and e-signature are not connected. |
| Calendar connect | Local toggle, nothing imported. |
| CMA / market pages | Local arithmetic over your own inventory; not a valuation product. |
| iOS | Capacitor shell for a hosted deployment; not App Store ready. |

## Project layout

```
src/lib/aieo/            readiness scan + scoring (score.ts), CA DRE, RealTrends
src/lib/aieo/visibility/ basket, providers, evaluate, report, engine, interventions, api
src/lib/social-desk/     types, fair-housing, drafting, postiz, repository, api
src/lib/billing/         server-side entitlement + api
src/routes/aieo.tsx      CiteLock page · src/routes/marketing.tsx  Social Desk
migrations/              single schema source (applied by build and by PGLite on start)
docs/                    FLAGSHIP-LEDGER (audit trail), FLAGSHIP-BLOCKERS, FLAGSHIP-DELIVERY-REPORT
```

## License

Private / proprietary unless otherwise stated by Gnoscenti.
