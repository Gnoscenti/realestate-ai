import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for iOS App Store (and Android later).
 *
 * Modes:
 * 1) Bundled shell — `webDir: dist` after `npm run cap:prepare`
 * 2) Live server — set CAP_SERVER_URL to your deployed HTTPS origin so the
 *    native shell loads the full TanStack/SSR app (recommended for this stack)
 *
 * Example:
 *   CAP_SERVER_URL=https://your-app.vercel.app npm run cap:sync
 */
const serverUrl = process.env.CAP_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: "ai.realestate.agentos",
  appName: "RealEstate AI",
  webDir: "dist",
  // Keep bundled assets as fallback; optionally load remote for full SSR.
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: false,
          allowNavigation: [
            "localhost",
            "127.0.0.1",
            "*.vercel.app",
            "*.x.ai",
            serverUrl.replace(/^https?:\/\//, "").split("/")[0],
          ],
        },
      }
    : {
        server: {
          androidScheme: "https",
          iosScheme: "https",
        },
      }),
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#0c0d10",
      showSpinner: false,
      androidSplashResourceName: "splash",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0c0d10",
      overlaysWebView: true,
    },
    Keyboard: {
      // iOS: resize body so inputs stay above keyboard
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
    backgroundColor: "#0c0d10",
    scheme: "RealEstate AI",
    // Allows local storage / IndexedDB (Zustand persist) without ITP quirks of third-party
    limitsNavigationsToAppBoundDomains: false,
    scrollEnabled: true,
  },
  android: {
    backgroundColor: "#0c0d10",
    allowMixedContent: false,
  },
};

export default config;
