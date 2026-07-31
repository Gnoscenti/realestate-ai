# RealEstate AI — iOS / Capacitor

This web app is optimized for **Capacitor iOS** wrapping (App Store) and iOS Safari standalone / PWA.

## What’s already wired

| Area | Implementation |
| --- | --- |
| Capacitor config | [`capacitor.config.ts`](./capacitor.config.ts) — app id `ai.realestate.agentos` |
| Status bar / keyboard / splash | [`src/lib/native.ts`](./src/lib/native.ts) |
| Safe areas (notch / home bar) | CSS `env(safe-area-inset-*)` on shell + bottom tabs |
| iOS bottom tab bar | Primary destinations on small screens |
| Touch targets | ≥ 44px controls, no 300ms tap delay, `-webkit-tap-highlight` |
| PWA / home screen | `manifest.webmanifest`, apple meta tags, theme-color |
| Haptics | Light impact on primary tab navigation (native only) |
| External links | `@capacitor/browser` SFSafariViewController when native |

## Prerequisites (Mac for App Store build)

- Xcode 16+ (iOS 17+ SDK)
- CocoaPods
- Apple Developer Program
- Node 22+

## One-time native project

```bash
npm install
npm run cap:prepare
npx cap add ios          # creates ios/ (Mac only)
```

## Point the shell at your deployed app (recommended)

TanStack Start ships SSR on Vercel. Capacitor should load that origin so CMA, auth, and APIs work:

```bash
export CAP_SERVER_URL="https://YOUR_DEPLOYMENT.vercel.app"
npm run cap:sync
npx cap open ios
```

Without `CAP_SERVER_URL`, `dist/` is an offline splash shell only.

## Daily loop

```bash
# After web changes:
CAP_SERVER_URL=https://YOUR_DEPLOYMENT.vercel.app npm run cap:sync
npx cap open ios
# Run on simulator / device from Xcode
```

## App Store checklist

1. **App icons** — replace Capacitor placeholders with 1024×1024 marketing icon + asset catalog
2. **Splash** — brand `SplashScreen` assets (dark `#0c0d10`)
3. **Bundle ID** — match Apple Developer: `ai.realestate.agentos` (or rename in `capacitor.config.ts` + Xcode)
4. **Privacy Nutrition Labels** — if you later add real Google Calendar OAuth / push / location, declare them
5. **ATS** — HTTPS only (`CAP_SERVER_URL` must be https)
6. **ITMS demo account** — provide App Review login if auth is required
7. **IAP** — none currently; if you monetize, use StoreKit (not web checkout for digital goods)
8. **Export compliance** — standard HTTPS crypto → usually exempt

## Info.plist notes (Xcode)

Capacitor generates defaults. Verify:

- `UIViewControllerBasedStatusBarAppearance` = YES  
- `UIStatusBarStyle` = dark content / light content matching dark UI  
- `UILaunchStoryboardName` present  
- Optional: `NSCalendarsUsageDescription` when you switch calendar connect from demo → EventKit  

Suggested usage strings when enabling native APIs:

```
NSCalendarsUsageDescription = "Import showings and inspections into your agent workspace."
NSContactsUsageDescription = "Optional: match lead phones to contacts."
NSPhotoLibraryUsageDescription = "Attach listing photos to content packs."
```

## Architecture note

```
┌─────────────────────┐
│  iOS WKWebView      │  Capacitor shell
│  (StatusBar, etc.)  │
└─────────┬───────────┘
          │ CAP_SERVER_URL (HTTPS)
          ▼
┌─────────────────────┐
│  Vercel / TanStack  │  Full RealEstate AI app
│  Start SSR + API    │
└─────────────────────┘
```

Client-only features (Zustand, RSF KB, contractors, calendar demo) also work when the shell loads the full web app.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run cap:prepare` | Write `dist/` webDir |
| `npm run cap:sync` | prepare + `cap sync` |
| `npm run ios:open` | Open Xcode project |

## Testing on this sandbox

Linux CI cannot compile iOS binaries. Validation here covers:

- Typecheck + web mobile viewport
- `cap:prepare` output
- Capacitor config validity
