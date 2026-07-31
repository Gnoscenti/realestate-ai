#!/usr/bin/env node
/**
 * Builds a Capacitor-ready `dist/` webDir.
 *
 * Strategy:
 * - Prefer a thin shell that boots the live app origin (CAP_SERVER_URL) when set
 * - Otherwise emit a self-contained offline shell that still works as a demo
 *   and points developers at connecting CAP_SERVER_URL for full SSR features
 *
 * Run: node scripts/prepare-capacitor.mjs
 */
import { mkdirSync, writeFileSync, existsSync, cpSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dist = join(root, "dist");
const serverUrl = (process.env.CAP_SERVER_URL || "").replace(/\/$/, "");

if (existsSync(dist)) {
  rmSync(dist, { recursive: true, force: true });
}
mkdirSync(dist, { recursive: true });

// Copy public assets if present
const publicDir = join(root, "public");
if (existsSync(publicDir)) {
  cpSync(publicDir, dist, { recursive: true });
}

const theme = "#0c0d10";
const accent = "#5b8def";

const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
  <meta name="color-scheme" content="dark" />
  <meta name="theme-color" content="${theme}" media="(prefers-color-scheme: dark)" />
  <meta name="theme-color" content="${theme}" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="RealEstate AI" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="format-detection" content="telephone=no" />
  <meta name="description" content="AI agent OS for real estate — leads, CMA, calendar, RSF knowledge, content." />
  <link rel="manifest" href="./manifest.webmanifest" />
  <link rel="apple-touch-icon" href="./icons/apple-touch-icon.png" />
  <title>RealEstate AI</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; min-height: 100%;
      background: ${theme};
      color: #eef0f4;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "DM Sans", system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
      -webkit-tap-highlight-color: transparent;
      overscroll-behavior-y: none;
    }
    .shell {
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom));
      text-align: center;
      background:
        radial-gradient(ellipse 70% 50% at 50% 0%, rgba(91,141,239,0.18), transparent 55%),
        ${theme};
    }
    .mark {
      width: 72px; height: 72px; border-radius: 18px;
      background: linear-gradient(145deg, ${accent}, #3dceb0);
      display: grid; place-items: center;
      font-weight: 700; font-size: 28px; color: #0a0c12;
      box-shadow: 0 12px 40px rgba(91,141,239,0.35);
      margin-bottom: 20px;
    }
    h1 { font-size: 1.35rem; margin: 0 0 8px; letter-spacing: -0.02em; }
    p { margin: 0; color: #9aa3b5; font-size: 0.95rem; line-height: 1.5; max-width: 28rem; }
    .spin {
      width: 22px; height: 22px; margin: 28px auto 0;
      border: 2.5px solid rgba(255,255,255,0.12);
      border-top-color: ${accent};
      border-radius: 50%;
      animation: r 0.7s linear infinite;
    }
    @keyframes r { to { transform: rotate(360deg); } }
    .hint { margin-top: 16px; font-size: 12px; color: #6b7385; }
    a.btn {
      display: inline-flex; margin-top: 20px; padding: 12px 18px;
      border-radius: 12px; background: ${accent}; color: #0a0c12;
      font-weight: 600; text-decoration: none; min-height: 44px; align-items: center;
    }
  </style>
</head>
<body>
  <div class="shell" id="shell">
    <div class="mark">AI</div>
    <h1>RealEstate AI</h1>
    <p id="msg">Starting your agent workspace…</p>
    <div class="spin" id="spin" aria-hidden="true"></div>
    <p class="hint" id="hint"></p>
  </div>
  <script>
    (function () {
      var SERVER = ${JSON.stringify(serverUrl)};
      var msg = document.getElementById("msg");
      var hint = document.getElementById("hint");
      var spin = document.getElementById("spin");

      // Prefer live server for full app features (SSR, API, auth)
      if (SERVER) {
        msg.textContent = "Connecting to workspace…";
        // Capacitor server.url usually handles this; redirect as fallback
        window.location.replace(SERVER + window.location.hash);
        return;
      }

      // No remote URL: stay on offline shell with install guidance
      spin.style.display = "none";
      msg.textContent = "Native shell is ready. Point CAP_SERVER_URL at your deployed app for full features, then run npm run cap:sync.";
      hint.innerHTML = "Dev: CAP_SERVER_URL=https://your-app.vercel.app npm run cap:sync";
    })();
  </script>
</body>
</html>
`;

writeFileSync(join(dist, "index.html"), indexHtml, "utf8");

// Minimal SVG-based icons for touch icon placeholder (PNG would be better; SVG apple-touch is limited)
// Write a simple PNG-less fallback using data - use SVG as icon for web manifest
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="108" fill="${theme}"/>
  <rect x="48" y="48" width="416" height="416" rx="84" fill="url(#g)"/>
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="#3dceb0"/>
    </linearGradient>
  </defs>
  <text x="256" y="300" text-anchor="middle" font-family="system-ui,sans-serif" font-size="180" font-weight="700" fill="#0a0c12">AI</text>
</svg>`;

mkdirSync(join(dist, "icons"), { recursive: true });
writeFileSync(join(dist, "icons", "icon.svg"), iconSvg, "utf8");
// apple-touch-icon.png placeholder note: stores use 1024 AppIcon via Xcode
writeFileSync(
  join(dist, "icons", "README.txt"),
  "Replace apple-touch-icon.png (180x180) and AppIcon 1024x1024 in Xcode before App Store submit.\n",
  "utf8",
);

const manifest = {
  name: "RealEstate AI",
  short_name: "RE AI",
  description:
    "AI agent OS for real estate professionals — Command Center, CMA, calendar, RSF knowledge, content.",
  start_url: "/",
  display: "standalone",
  display_override: ["standalone", "minimal-ui"],
  orientation: "portrait-primary",
  background_color: theme,
  theme_color: theme,
  categories: ["business", "productivity"],
  icons: [
    {
      src: "./icons/icon.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any maskable",
    },
  ],
};

writeFileSync(
  join(dist, "manifest.webmanifest"),
  JSON.stringify(manifest, null, 2),
  "utf8",
);

// Capacitor config echo
writeFileSync(
  join(dist, "capacitor-build.json"),
  JSON.stringify(
    {
      preparedAt: new Date().toISOString(),
      serverUrl: serverUrl || null,
      appId: "ai.realestate.agentos",
      appName: "RealEstate AI",
    },
    null,
    2,
  ),
  "utf8",
);

console.log(
  `[prepare-capacitor] dist/ ready${serverUrl ? ` → ${serverUrl}` : " (offline shell; set CAP_SERVER_URL for live app)"}`,
);
