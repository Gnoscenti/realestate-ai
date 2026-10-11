/**
 * Capacitor / iOS native bridge with safe web fallbacks.
 * Client-only (guards on window).
 */

export type NativePlatform = "ios" | "android" | "web";

let initPromise: Promise<void> | null = null;
let cachedPlatform: NativePlatform | null = null;

export function isNativePlatform(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const cap = (
      window as unknown as {
        Capacitor?: { isNativePlatform?: () => boolean };
      }
    ).Capacitor;
    if (typeof cap?.isNativePlatform === "function") {
      return cap.isNativePlatform();
    }
  } catch {
    /* ignore */
  }
  return (
    document.documentElement.classList.contains("capacitor") ||
    document.documentElement.classList.contains("plt-ios") ||
    document.documentElement.classList.contains("plt-android")
  );
}

export function getNativePlatform(): NativePlatform {
  if (cachedPlatform) return cachedPlatform;
  if (typeof window === "undefined") return "web";
  try {
    const cap = (
      window as unknown as {
        Capacitor?: {
          isNativePlatform?: () => boolean;
          getPlatform?: () => string;
        };
      }
    ).Capacitor;
    if (cap?.isNativePlatform?.()) {
      const p = cap.getPlatform?.() ?? "web";
      if (p === "ios") return (cachedPlatform = "ios");
      if (p === "android") return (cachedPlatform = "android");
    }
  } catch {
    /* web */
  }
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    return (cachedPlatform = "ios");
  }
  return (cachedPlatform = "web");
}

/** Standalone PWA or Capacitor shell */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    isNativePlatform() ||
    nav.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

export async function initNativeShell(): Promise<void> {
  if (typeof window === "undefined") return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      const platform = Capacitor.getPlatform();
      document.documentElement.classList.add("capacitor-ready");
      if (Capacitor.isNativePlatform()) {
        document.documentElement.classList.add("capacitor", `plt-${platform}`);
        document.documentElement.dataset.platform = platform;
        cachedPlatform = platform === "ios" ? "ios" : platform === "android" ? "android" : "web";
      } else if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        document.documentElement.classList.add("plt-ios", "ios-safari");
        document.documentElement.dataset.platform = "ios-web";
        cachedPlatform = "ios";
      }

      if (!Capacitor.isNativePlatform()) return;

      const [{ StatusBar, Style }, { Keyboard }, { SplashScreen }, { App }] =
        await Promise.all([
          import("@capacitor/status-bar"),
          import("@capacitor/keyboard"),
          import("@capacitor/splash-screen"),
          import("@capacitor/app"),
        ]);

      try {
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: "#0c0d10" });
        await StatusBar.setOverlaysWebView({ overlay: true });
      } catch {
        /* plugin optional in some shells */
      }

      try {
        await Keyboard.setAccessoryBarVisible({ isVisible: true });
        await Keyboard.setScroll({ isDisabled: false });
      } catch {
        /* optional */
      }

      try {
        await SplashScreen.hide({ fadeOutDuration: 280 });
      } catch {
        /* optional */
      }

      void App.addListener("appStateChange", ({ isActive }) => {
        document.documentElement.classList.toggle("app-inactive", !isActive);
      });

      void App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) window.history.back();
      });
    } catch (err) {
      console.warn("[native] init skipped", err);
    }
  })();

  return initPromise;
}

export async function hapticLight(): Promise<void> {
  try {
    if (!isNativePlatform()) return;
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* web */
  }
}

export async function hapticSuccess(): Promise<void> {
  try {
    if (!isNativePlatform()) return;
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    /* web */
  }
}

export async function openExternalUrl(url: string): Promise<void> {
  try {
    if (isNativePlatform()) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url, presentationStyle: "popover" });
      return;
    }
  } catch {
    /* fall through */
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
