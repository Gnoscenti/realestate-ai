# RealEstate AI — Agent OS

AI-native workspace for real estate professionals, evolved from the [realestate-ai-ios](https://github.com/Gnoscenti/realestate-ai-ios) product vision into a full web + Capacitor (iOS) app.

**Built for Rancho Santa Fe and surrounding San Diego luxury corridors**, with adaptive agent memory, MLS-style inventory, CMA, calendar/vendors, and a social content agent.

## Product surface

| Module | What it does |
| --- | --- |
| **Command Center** | Ranked daily actions (speed-to-lead, follow-ups, content gaps, calendar prep) with scripted packs |
| **Onboarding** | Name, area of operations, website, MLS → pulls active listings for content + comps |
| **Instant Response** | Speed-to-lead scripts + compliance outline |
| **CMA Studio** | Hybrid AVM / comps tuned for RSF estates |
| **Content Agent** | Agentic social campaigns (IG, FB, LinkedIn, email) using brand memory |
| **RSF Knowledge** | Covenants, HOAs, neighborhoods, talk tracks |
| **Calendar & Vendors** | Local calendar UI (no OAuth, nothing is imported yet), AI reminders, contractor directory |
| **Billing** | Stripe checkout — **one-time $9.99 for 30 days of access**, no subscription and no renewal; 5 free beta codes |
| **Feedback Board** | Pre-launch comments by product section (unlocked via code or paid access) |
| **iOS / Capacitor** | Safe areas, bottom tabs, native status bar / keyboard / haptics bridge |

## Stack

- React 19 + TypeScript + Vite 8  
- TanStack Start / Router / Query  
- Tailwind CSS v4 + Radix (shadcn-style)  
- Zustand (persisted workspace)  
- Capacitor 8 (iOS wrap)  
- Stripe (server checkout; demo mode only when `ALLOW_DEMO_CHECKOUT=1`)

## Quick start

```bash
npm install
npm run dev        # http://0.0.0.0:8080
npm run typecheck
npm run build
```

### Environment (optional)

| Variable | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY` | Live Stripe Checkout for the one-time $9.99 payment |
| `ALLOW_DEMO_CHECKOUT` | Set to `1` to allow unlocking without payment. Never set in production. |
| `GITHUB_TOKEN` | Server-only Suggest → GitHub Issue delivery |
| `RESEND_API_KEY` + `BETA_FEEDBACK_EMAIL` | Optional server-only feedback email copy |
| `CAP_SERVER_URL` | Capacitor live-reload/preview only; do not ship in production |

### Free beta codes (pre-launch)

```
RSF-BETA-01
RSF-BETA-02
COVENANT-AI
LISTINGPRO
AGENTOS-X
```

Redeem on the paywall to unlock full access **and** the feedback board.

## iOS (Capacitor)

See [IOS.md](./IOS.md).

```bash
# Windows/Linux preparation and validation:
npm run ci
npm run cap:prepare
npm run cap:sync
# Compile, sign, and upload on a cloud macOS builder.
```

The current remote-origin shell is suitable only for preview. A production
App Store build needs bundled mobile web assets, cloud Xcode signing, and
StoreKit or a purchase-free companion-app model. The no-Mac execution plan is
in [IOS.md](./IOS.md).

## Project layout

```
src/
  components/   # shell, billing paywall, onboarding, UI
  data/         # RSF knowledge + seed inventory
  lib/          # store, AI, billing, calendar, social agent, stripe
  routes/       # file-based TanStack routes
public/         # PWA manifest + icons
scripts/        # migrate, capacitor prepare, browser smoke
```

## License

Private / proprietary unless otherwise stated by Gnoscenti.

## Testing

```bash
# Unit + integration (Vitest) — scrape parser, CSV import, billing codes
npm run test:unit

# E2E (Playwright) — onboarding, website scrape, empty book, paywall
# Starts dev server if needed (or reuses :8080)
npx playwright install chromium   # first time only
npm run test:e2e

# Full CI gate
npm run ci
```

Specs live under `tests/unit/` and `tests/e2e/`. Mock realtor site: `tests/fixtures/mock-realtor-site.mjs`.
