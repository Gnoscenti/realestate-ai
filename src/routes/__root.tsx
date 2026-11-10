import type { ReactNode } from "react";
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";
import appCss from "@/styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        // No maximum-scale / user-scalable=no: pinch-zoom must stay available
        // (WCAG 1.4.4). iOS would zoom on focusing a field under 16px, so
        // styles.css holds every form control at 16px below the md breakpoint.
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      {
        title: "RealEstate AI — Agent Workspace",
      },
      {
        name: "description",
        content:
          "A workspace for real estate agents: see how AI search describes you, draft fact-based social posts, reply to leads fast and keep your day in order.",
      },
      { name: "theme-color", content: "#0c0d10" },
      { name: "color-scheme", content: "dark" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      {
        name: "apple-mobile-web-app-status-bar-style",
        content: "black-translucent",
      },
      { name: "apple-mobile-web-app-title", content: "RealEstate AI" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "format-detection", content: "telephone=no" },
      {
        name: "application-name",
        content: "RealEstate AI",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Instrument+Sans:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap",
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/icon.svg" },
      { rel: "icon", href: "/icons/icon.svg", type: "image/svg+xml" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <AppShell>
        <Outlet />
      </AppShell>
      <Toaster />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
