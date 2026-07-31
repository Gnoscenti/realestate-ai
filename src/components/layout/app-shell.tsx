import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  FileText,
  Home,
  LayoutDashboard,
  Megaphone,
  Menu,
  Search,
  TrendingUp,
  Users,
  Sparkles,
  PanelLeftClose,
  PanelLeft,
  Zap,
  BarChart3,
  RefreshCw,
  Settings2,
  BookOpen,
  Calendar,
  MessageSquare,
  CreditCard,
  type LucideIcon,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { rehydrateStore, useAppStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { getMlsLabel, myListings } from "@/lib/mls";
import { toast } from "sonner";
import { IosTabBar } from "@/components/layout/ios-tab-bar";
import { initNativeShell } from "@/lib/native";
import { Paywall } from "@/components/billing/paywall";
import { hasAppAccess } from "@/lib/billing";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

const NAV: NavItem[] = [
  { to: "/", label: "Command Center", icon: LayoutDashboard, exact: true },
  { to: "/outreach", label: "Instant Response", icon: Zap },
  { to: "/leads", label: "Lead Intelligence", icon: Users },
  { to: "/search", label: "Smart Search", icon: Search },
  { to: "/cma", label: "CMA Studio", icon: BarChart3 },
  { to: "/knowledge", label: "Market Knowledge", icon: BookOpen },
  { to: "/calendar", label: "Calendar & Vendors", icon: Calendar },
  { to: "/market", label: "Market & Valuation", icon: TrendingUp },
  { to: "/transactions", label: "Transaction Hub", icon: FileText },
  { to: "/properties", label: "Property Mgmt", icon: Building2 },
  { to: "/marketing", label: "Content Agent", icon: Megaphone },
  { to: "/feedback", label: "Feedback Board", icon: MessageSquare },
  { to: "/billing", label: "Billing & Access", icon: CreditCard },
];

function NavItems({
  onNavigate,
  collapsed,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {NAV.map((item) => {
        const active = item.exact
          ? pathname === item.to
          : pathname === item.to || pathname.startsWith(item.to + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "group flex min-h-[44px] items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium transition-[background-color,color] duration-150",
              active
                ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                : "text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]",
              collapsed && "justify-center px-2",
            )}
            title={collapsed ? item.label : undefined}
          >
            <Icon
              className={cn(
                "h-[18px] w-[18px] shrink-0",
                active
                  ? "text-[var(--color-primary)]"
                  : "text-[var(--color-fg-subtle)] group-hover:text-[var(--color-fg-muted)]",
              )}
            />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link to="/" className="flex min-h-[44px] items-center gap-2.5 px-3 py-1">
      <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary)] text-[var(--color-primary-fg)] shadow-[var(--shadow-sm)]">
        <Home className="h-4 w-4" />
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <div className="font-display text-sm font-semibold tracking-tight text-[var(--color-fg)]">
            RealEstate AI
          </div>
          <div className="text-[11px] text-[var(--color-fg-subtle)]">
            Agent OS · iOS ready
          </div>
        </div>
      )}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [headerQuery, setHeaderQuery] = useState("");
  const [editProfile, setEditProfile] = useState(false);
  const navigate = useNavigate();
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const setCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const onboarded = useAppStore((s) => s.onboarded);
  const hydrated = useAppStore((s) => s.hydrated);
  const profile = useAppStore((s) => s.agentProfile);
  const properties = useAppStore((s) => s.properties);
  const memory = useAppStore((s) => s.agentMemory);
  const syncMls = useAppStore((s) => s.syncMlsListings);
  const hotCount = useAppStore(
    (s) => s.leads.filter((l) => l.heat === "hot").length,
  );
  const myBook = myListings(properties).length;
  const billing = useAppStore((s) => s.billing);
  const accessOk = hasAppAccess(billing);

  useEffect(() => {
    rehydrateStore();
    void initNativeShell();
  }, []);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!headerQuery.trim()) return;
    void navigate({
      to: "/search",
      search: { q: headerQuery.trim() },
    });
  };

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--color-bg)] text-[var(--color-fg-muted)]">
        <div className="text-sm">Loading workspace…</div>
      </div>
    );
  }

  if (!onboarded || editProfile) {
    return (
      <div className="safe-pad-y min-h-dvh">
        <OnboardingWizard
          mode={editProfile && onboarded ? "edit" : "first"}
          onDone={() => setEditProfile(false)}
        />
      </div>
    );
  }

  if (!accessOk) {
    return <Paywall agentName={profile?.name} />;
  }

  return (
    <div className="flex min-h-dvh bg-[var(--color-bg)] text-[var(--color-fg)]">
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-[width] duration-200 md:flex",
          collapsed ? "w-[72px]" : "w-[240px]",
        )}
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex h-16 items-center justify-between border-b border-[var(--color-border)] px-2">
          <Brand collapsed={collapsed} />
          <Button
            size="icon"
            variant="ghost"
            className="shrink-0"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto py-3">
          <NavItems collapsed={collapsed} />
        </div>
        {!collapsed && (
          <div
            className="space-y-2 border-t border-[var(--color-border)] p-3"
            style={{
              paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
            }}
          >
            {profile && (
              <button
                type="button"
                onClick={() => setEditProfile(true)}
                className="flex min-h-[44px] w-full items-center gap-2.5 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] p-2.5 text-left transition-colors hover:bg-[var(--color-surface-2)]"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-xs font-semibold text-[var(--color-primary)]">
                  {initials(profile.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-[var(--color-fg)]">
                    {profile.name}
                  </div>
                  <div className="truncate text-[10px] text-[var(--color-fg-subtle)]">
                    {profile.areaOfOperations}
                  </div>
                </div>
                <Settings2 className="h-3.5 w-3.5 shrink-0 text-[var(--color-fg-subtle)]" />
              </button>
            )}
            <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-[var(--color-fg)]">
                <Sparkles className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                AI · {memory.familiarityScore}/100
              </div>
              <div className="mt-1 font-display text-2xl font-semibold">
                {hotCount}
              </div>
              <p className="mt-0.5 text-[11px] text-[var(--color-fg-subtle)]">
                Hot leads · {myBook} listings
                {profile
                  ? ` · ${getMlsLabel(profile.mls).split("(")[0].trim()}`
                  : ""}
              </p>
            </div>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-bg)_88%,transparent)] px-3 backdrop-blur-md sm:px-5"
          style={{
            paddingTop: "max(0.5rem, env(safe-area-inset-top))",
            minHeight: "calc(4rem + env(safe-area-inset-top))",
          }}
        >
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="min-h-[44px] min-w-[44px] md:hidden"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[min(280px,100vw)] p-0">
              <div
                className="flex items-center border-b border-[var(--color-border)] px-2"
                style={{
                  paddingTop: "env(safe-area-inset-top)",
                  minHeight: "calc(4rem + env(safe-area-inset-top))",
                }}
              >
                <Brand />
              </div>
              <div
                className="overflow-y-auto py-3"
                style={{ maxHeight: "calc(100dvh - 8rem)" }}
              >
                <NavItems onNavigate={() => setMobileOpen(false)} />
              </div>
              {profile && (
                <div
                  className="border-t border-[var(--color-border)] p-3"
                  style={{
                    paddingBottom:
                      "max(0.75rem, env(safe-area-inset-bottom))",
                  }}
                >
                  <Button
                    variant="secondary"
                    className="min-h-[44px] w-full"
                    onClick={() => {
                      setMobileOpen(false);
                      setEditProfile(true);
                    }}
                  >
                    <Settings2 className="h-4 w-4" />
                    Edit profile / MLS
                  </Button>
                </div>
              )}
            </SheetContent>
          </Sheet>

          <form
            onSubmit={onSearch}
            className="relative min-w-0 flex-1 max-w-xl"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
            <Input
              value={headerQuery}
              onChange={(e) => setHeaderQuery(e.target.value)}
              placeholder={
                profile
                  ? `Search ${profile.areaOfOperations} inventory…`
                  : "Search inventory…"
              }
              className="h-11 pl-9 text-base md:text-sm"
              enterKeyHint="search"
              autoCapitalize="off"
              autoCorrect="off"
            />
          </form>

          {profile && (
            <Button
              size="sm"
              variant="outline"
              className="hidden min-h-[44px] shrink-0 sm:inline-flex"
              onClick={() => {
                syncMls();
                toast.success("MLS listings refreshed");
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Sync MLS
            </Button>
          )}

          <Badge variant="secondary" className="hidden sm:inline-flex">
            {profile ? profile.name.split(" ")[0] : "Setup"}
          </Badge>
        </header>

        <main className="main-content flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>

        <IosTabBar />
      </div>
    </div>
  );
}
