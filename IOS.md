# RealEstate AI — iOS / Capacitor

RealEstate AI is web-first and has a Capacitor iOS shell. You can prepare it
from Windows or Linux, but an iOS binary still has to be compiled and signed on
macOS with Xcode. A cloud macOS builder is the practical path when you do not
own a Mac.

## What is already wired

| Area | Implementation |
| --- | --- |
| Capacitor config | [`capacitor.config.ts`](./capacitor.config.ts) — app id `ai.realestate.agentos` |
| Native shell | Status bar, keyboard, splash, safe areas, bottom tabs, haptics |
| Web/PWA | Manifest, Apple meta tags, mobile layout |
| External links | `@capacitor/browser` / SFSafariViewController when native |
| CI | Typecheck, unit tests, web build, and Playwright E2E |

Capacitor 8 currently requires Xcode 26+ and supports iOS 15+:
https://capacitorjs.com/docs/ios

## Important production blocker

Do not ship `CAP_SERVER_URL` in an App Store build. Capacitor documents
`server.url` and `allowNavigation` as live-reload settings that are not
intended for production:
https://capacitorjs.com/docs/config

The current `dist/` output is only an offline splash shell, so the production
mobile build needs a real bundled SPA/static entry that calls the Vercel API
over HTTPS. Keep SSR for the web deployment; add a mobile build target for the
Capacitor bundle.

`CAP_SERVER_URL` is acceptable for short-lived development or an internal
proof-of-concept build:

```bash
CAP_SERVER_URL=https://YOUR_PREVIEW.vercel.app npm run cap:sync
```

## No-Mac build plan

### 1. Work from Windows or Linux

```bash
npm ci
npm run ci
npm run cap:prepare
npm run cap:sync
```

You can validate the web app and generated Capacitor assets locally. You cannot
run the iOS simulator or compile/sign the iOS target without macOS/Xcode.

### 2. Use a cloud macOS builder

Recommended first route: Codemagic, because it supports Capacitor, automatic iOS
code signing, TestFlight, and App Store Connect API-key authentication:
https://docs.codemagic.io/yaml-quick-start/building-an-ionic-app/

GitHub Actions `macos-*` runners are a valid alternative, but you must manage
the distribution certificate and provisioning profile as encrypted repository
secrets:
https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications

Do not use Ionic Appflow as the default new setup; current documentation says
new Appflow Enterprise sales are discontinued.

### 3. Owner setup in Apple

1. Enroll in the Apple Developer Program.
2. Create the App Store Connect app with bundle id `ai.realestate.agentos`.
3. Create a dedicated App Store Connect API key with only the role the build
   service needs. Download the `.p8` file once and store it only in the build
   service's encrypted secrets.
4. Configure automatic signing for the App Store distribution profile.
5. Add one real iPhone as a TestFlight tester; cloud builds replace the need for
   a local simulator, but not device testing.

### 4. First build target: internal TestFlight

For the first iOS beta:

- use beta-code or existing-account access only;
- hide the Stripe checkout CTA in the native app;
- submit one cloud-built IPA to internal TestFlight;
- test sign-in/access, device-local persistence, Suggest issue creation,
  external links, safe areas, keyboard behavior, and offline/error states.

Apple requires in-app purchase to unlock digital app functionality unless the
app qualifies as a free companion with no purchase CTA. A web Stripe checkout
inside the iOS app is not the safe default:
https://developer.apple.com/app-store/review/guidelines/#in-app-purchase

### 5. Before public App Store review

- replace the remote shell with bundled production web assets;
- add native value beyond a repackaged website (for example EventKit calendar
  import, push notifications, camera/photo attachment, or share-sheet flows);
- choose StoreKit subscriptions or make the iOS app a free companion with no
  in-app/outbound purchase CTA;
- verify Stripe sessions server-side for the web paid flow and implement the
  advertised renewal before calling it `$49/month`;
- provide App Review a working demo account or beta access path;
- finish icons, splash assets, privacy manifest/labels, usage descriptions, and
  export-compliance answers.

Apple's minimum-functionality rule requires more than a repackaged website:
https://developer.apple.com/app-store/review/guidelines/#minimum-functionality

## Suggested cloud workflow gates

A release job should stop unless each gate passes:

1. `npm ci`
2. `npm run typecheck`
3. `npm run test:unit`
4. `npm run build` for the bundled mobile target
5. `npx cap sync ios`
6. Xcode archive on a pinned macOS/Xcode image
7. signed IPA export
8. upload to internal TestFlight
9. manual promotion only after device smoke testing

Keep signing keys, App Store Connect keys, GitHub tokens, and feedback tokens in
encrypted CI/provider secrets. Never use `VITE_` for a secret.

## Native permissions to add only when implemented

- `NSCalendarsUsageDescription` for EventKit calendar import
- `NSContactsUsageDescription` for optional contact matching
- `NSPhotoLibraryUsageDescription` for listing-photo attachment

Do not declare permissions before the corresponding native feature exists.
