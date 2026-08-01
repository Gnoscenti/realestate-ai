# Put RealEstate AI on your iPhone (no Mac needed)

You **do not need a Mac** to get an icon on your Home Screen.  
iPhone can install this as a **web app** (full-screen icon) from Safari.

A Mac is only required for a true App Store / TestFlight build. Skip that for now.

---

## Option A — Pin to Home Screen (recommended, free, no Mac)

### Step 1: Get a public web link

The app must open in **Safari** at an `https://…` address (not only inside Grok chat).

**Easiest deploy (phone or PC, no Mac):**

1. Open [vercel.com](https://vercel.com) and sign in (GitHub login is fine).
2. **Add New… → Project**.
3. Import **`Gnoscenti/realestate-ai`**.
4. Click **Deploy** (defaults are fine).
5. Copy your live URL, e.g. `https://realestate-ai-….vercel.app`.

(Repo: [github.com/Gnoscenti/realestate-ai](https://github.com/Gnoscenti/realestate-ai))

### Step 2: Add to Home Screen (on the iPhone)

1. Open that URL in **Safari** (not Chrome).
2. Tap the **Share** button (square with arrow up).
3. Scroll and tap **Add to Home Screen**.
4. Name it **RealEstate AI** → **Add**.

Open the new icon. It runs full-screen like an app.

### First open tips

- Complete onboarding, then unlock with **$9.99 intro** (demo works without Stripe keys) or a beta code:  
  `RSF-BETA-01` · `RSF-BETA-02` · `COVENANT-AI` · `LISTINGPRO` · `AGENTOS-X`
- If the icon looks plain, that’s OK — branding polish can wait; the app still works.

---

## Option B — Real App Store app (needs a Mac *or* a cloud Mac)

Apple only allows iOS app **binaries** to be built on macOS (Xcode). Without your own Mac:

| Path | Notes |
| --- | --- |
| Borrow / buy Mac, or MacStadium / MacinCloud | Run Xcode + Capacitor (`IOS.md`) |
| Codemagic / GitHub Actions macOS | CI builds from the repo; still need Apple Developer ($99/yr) |
| TestFlight | Same: Apple Developer account + iOS build |

Home Screen (Option A) is enough for beta testing and daily use.

---

## Troubleshooting

| Issue | Fix |
| --- | --- |
| Don’t see “Add to Home Screen” | Use **Safari**, not Instagram/Grok/Chrome in-app browser |
| Page won’t load | Confirm deploy finished; open the Vercel URL on Wi‑Fi |
| Lost after reopen | Normal for web apps — data is on-device; don’t clear Safari data |
| Want push notifications later | Needs native shell (Option B) or web push (limited on iOS) |
