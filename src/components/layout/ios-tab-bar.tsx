import { Link, useRouterState } from "@tanstack/react-router";
import {
  Calendar,
  LayoutDashboard,
  Megaphone,
  Search,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/native";

type Tab = {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

const TABS: Tab[] = [
  { to: "/", label: "Home", icon: LayoutDashboard, exact: true },
  { to: "/outreach", label: "Respond", icon: Zap },
  { to: "/search", label: "Search", icon: Search },
  { to: "/calendar", label: "Calendar", icon: Calendar },
  { to: "/marketing", label: "Content", icon: Megaphone },
];

/**
 * iOS-style bottom tab bar — primary destinations for Capacitor / iPhone.
 * Hidden from md+ where the sidebar is primary navigation.
 */
export function IosTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      className="ios-tab-bar fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-surface)_92%,transparent)] backdrop-blur-xl md:hidden"
      style={{
        paddingBottom: "max(0.35rem, env(safe-area-inset-bottom))",
      }}
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-1 pt-1">
        {TABS.map((tab) => {
          const active = tab.exact
            ? pathname === tab.to
            : pathname === tab.to || pathname.startsWith(tab.to + "/");
          const Icon = tab.icon;
          return (
            <li key={tab.to} className="flex-1">
              <Link
                to={tab.to}
                onClick={() => {
                  void hapticLight();
                }}
                className={cn(
                  "flex min-h-[48px] flex-col items-center justify-center gap-0.5 px-1 py-1 text-[10px] font-medium tracking-wide transition-colors",
                  active
                    ? "text-[var(--color-primary)]"
                    : "text-[var(--color-fg-subtle)] active:text-[var(--color-fg-muted)]",
                )}
              >
                <Icon
                  className={cn(
                    "h-[22px] w-[22px]",
                    active && "drop-shadow-[0_0_8px_color-mix(in_oklab,var(--color-primary)_55%,transparent)]",
                  )}
                  strokeWidth={active ? 2.25 : 1.75}
                />
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
