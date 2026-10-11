/**
 * App icon notification dot / badge count (PWA Badge API + favicon canvas).
 */

let faviconLink: HTMLLinkElement | null = null;
const BASE_ICON = "/icons/icon.svg";

function ensureFavicon(): HTMLLinkElement {
  if (faviconLink && document.contains(faviconLink)) return faviconLink;
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  faviconLink = link;
  return link;
}

/** Draw a red notification dot (and optional count) onto the favicon */
export async function setFaviconBadge(count: number): Promise<void> {
  if (typeof document === "undefined") return;
  const link = ensureFavicon();

  if (count <= 0) {
    link.href = BASE_ICON;
    link.type = "image/svg+xml";
    return;
  }

  try {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Base tile
    ctx.fillStyle = "#0c0d10";
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, 14);
    ctx.fill();

    // Brand mark
    ctx.fillStyle = "#5b8def";
    ctx.beginPath();
    ctx.roundRect(10, 10, 44, 44, 10);
    ctx.fill();
    ctx.fillStyle = "#0a0c12";
    ctx.font = "bold 22px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("AI", size / 2 - 2, size / 2 + 1);

    // Notification dot / count bubble
    const label = count > 9 ? "9+" : String(count);
    const r = count > 1 ? 13 : 10;
    const cx = size - r - 2;
    const cy = r + 2;
    ctx.fillStyle = "#e86a6a";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0c0d10";
    ctx.lineWidth = 3;
    ctx.stroke();
    if (count > 0) {
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${count > 9 ? 11 : 13}px system-ui,sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, cx, cy + 0.5);
    }

    link.type = "image/png";
    link.href = canvas.toDataURL("image/png");
  } catch {
    // ignore canvas failures
  }
}

/** OS / home-screen badge when installed as PWA (Chrome Android, some desktops) */
export async function setAppIconBadge(count: number): Promise<void> {
  if (typeof navigator === "undefined") return;
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (count > 0 && typeof nav.setAppBadge === "function") {
      await nav.setAppBadge(count);
    } else if (count <= 0 && typeof nav.clearAppBadge === "function") {
      await nav.clearAppBadge();
    }
  } catch {
    // unsupported or permission
  }
}

export async function syncNotificationBadges(unread: number): Promise<void> {
  await Promise.all([setAppIconBadge(unread), setFaviconBadge(unread)]);

  // Title prefix so multitasking still shows urgency
  if (typeof document !== "undefined") {
    const base = "RealEstate AI — Agent Workspace";
    document.title = unread > 0 ? `(${unread}) ${base}` : base;
  }
}
