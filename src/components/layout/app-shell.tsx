import { useCallback, useEffect, useState } from "react";
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
  Radar,
  Settings2,
  BookOpen,
  Calendar,
  MessageSquare,
  CreditCard,
  Link2,
  Swords,
  Bell,
  type LucideIcon,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ensureHydrationHook, useAppStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { getMlsLabel, myListings } from "@/lib/mls";
import { toast } from "sonner";
import { IosTabBar } from "@/components/layout/ios-tab-bar";
import { initNativeShell } from "@/lib/native";
import { Paywall } from "@/components/billing/paywall";
import { hasAppAccess } from "@/lib/billing";
import { HoverHint } from "@/components/ui/hover-hint";
import { BetaCommentDrawer } from "@/components/beta/beta-comment-drawer";
import { syncNotificationBadges } from "@/lib/app-badge";
import { unreadCount as emailUnreadCount } from "@/lib/email-alerts";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn, SIGN_IN_PATH } from "@/lib/auth/gates";
import {
  bindWorkspaceToUser,
  workspaceStorageKey,
} from "@/lib/auth/workspace-scope";



const NAV_HINTS: Record<string, string> = {
  "/": "Start here each day — ranked work for you",
  "/aieo": "Where AI answers name you, and what to fix",
  "/marketing": "Draft from facts, approve, publish or hand off",
  "/outreach": "Reply to new leads in seconds",
  "/leads": "Your real clients & prospects",
  "/search": "Find homes by criteria",
  "/cma": "Comps & listing value stories",
  "/knowledge": "Local market talking points",
  "/calendar": "Appointments + trusted vendors",
  "/market": "Market trends & valuation views",
  "/transactions": "Deals from offer to close",
  "/properties": "Your listing book",
  "/mls": "Website, CSV, and market observations",
  "/feedback": "Tell us what to improve",
  "/billing": "Access, plan & beta codes",
  "/edge": "Positioning notes",
  "/alerts": "Gmail alerts (token required)",
};

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  tour?: string;
};

const NAV: NavItem[] = [
  { to: "/", label: "Command Center", icon: LayoutDashboard, exact: true },
  { to: "/aieo", label: "CiteLock", icon: Radar },
  { to: "/marketing", label: "Social Desk", icon: Megaphone },
  { to: "/outreach", label: "Instant Response", icon: Zap },
  { to: "/leads", label: "Lead Intelligence", icon: Users },
  { to: "/search", label: "Smart Search", icon: Search },
  { to: "/cma", label: "CMA Studio", icon: BarChart3 },
  { to: "/knowledge", label: "Market Knowledge", icon: BookOpen },
  { to: "/calendar", label: "Calendar & Vendors", icon: Calendar },
  { to: "/market", label: "Market & Valuation", icon: TrendingUp },
  { to: "/transactions", label: "Transaction Hub", icon: FileText },
  { to: "/properties", label: "Property Mgmt", icon: Building2 },
  { to: "/mls", label: "Listings & Data", icon: Link2 },
  { to: "/feedback", label: "Feedback Board", icon: MessageSquare },
  { to: "/billing", label: "Billing & Access", icon: CreditCard },
  { to: "/edge", label: "Edge Playbook", icon: Swords },
  { to: "/alerts", label: "Email Alerts", icon: Bell },
];

function NavItems({
  onNavigate,
  collapsed,
  alertUnread = 0,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  alertUnread?: number;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="flex flex-col gap-0.5 px-2" data-tour="nav-sidebar">
      {NAV.map((item) => {
        const active = item.exact
          ? pathname === item.to
          : pathname === item.to || pathname.startsWith(item.to + "/");
        const Icon = item.icon;
        return (
          <HoverHint
            key={item.to}
            label={NAV_HINTS[item.to] ?? item.label}
            side="right"
            className="w-full"
          >
            <Link
              to={item.to}
              onClick={onNavigate}
              data-tour={
                item.to === "/"
                  ? "nav-command"
                  : item.to === "/outreach"
                    ? "nav-outreach"
                    : item.to === "/leads"
                      ? "nav-leads"
                      : item.to === "/mls"
                        ? "nav-mls"
                        : item.to === "/marketing"
                          ? "nav-marketing"
                          : item.to === "/calendar"
                            ? "nav-calendar"
                            : undefined
              }
              className={cn(
                "group relative flex min-h-[44px] w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium transition-[background-color,color,box-shadow] duration-150",
                active
                  ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-primary)_25%,transparent)]"
                  : "text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]",
                collapsed && "justify-center px-2",
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon
                className={cn(
                  "h-[18px] w-[18px] shrink-0 transition-transform duration-150 group-hover:scale-110",
                  active
                    ? "text-[var(--color-primary)]"
                    : "text-[var(--color-fg-subtle)] group-hover:text-[var(--color-fg-muted)]",
                )}
              />
              {!collapsed && (
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate">{item.label}</span>
                  {item.to === "/alerts" && alertUnread > 0 && (
                    <span className="nav-alert-dot ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-bold text-white">
                      {alertUnread > 9 ? "9+" : alertUnread}
                    </span>
                  )}
                </span>
              )}
              {collapsed && item.to === "/alerts" && alertUnread > 0 && (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[var(--color-danger)]" />
              )}
            </Link>
          </HoverHint>
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
            Agent workspace · Responsive web
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
  const [boundWorkspaceKey, setBoundWorkspaceKey] = useState<string | null>(
    null,
  );
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isPending: authPending } = useCurrentUserState();
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const setCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const onboarded = useAppStore((s) => s.onboarded);
  const hydrated = useAppStore((s) => s.hydrated);
  const profile = useAppStore((s) => s.agentProfile);
  const properties = useAppStore((s) => s.properties);
  const memory = useAppStore((s) => s.agentMemory);
  const resyncFromWebsite = useAppStore((s) => s.resyncFromWebsite);
  const hotCount = useAppStore(
    (s) => s.leads.filter((l) => l.heat === "hot").length,
  );
  const myBook = myListings(properties).length;
  const activateBilling = useAppStore((s) => s.activateBilling);
  const clearBilling = useAppStore((s) => s.clearBilling);
  const [accessCheck,setAccessCheck]=useState<{userId:string|null;status:"pending"|"active"|"inactive"|"error"}>({userId:null,status:"pending"});
  const [accessAttempt,setAccessAttempt]=useState(0);
  const setServerAccess=useCallback((status:"pending"|"active"|"inactive"|"error")=>{
    setAccessCheck({userId:user?.id || null,status});
  },[user?.id]);
  const serverAccess=accessCheck.userId===user?.id ? accessCheck.status : "pending";
  const accessOk = serverAccess === "active";
  const handleAccessGranted=useCallback(()=>setServerAccess("active"),[setServerAccess]);
  const emailAlerts = useAppStore((s) => s.emailAlerts);
  const alertUnread = emailUnreadCount(emailAlerts);
  const targetWorkspaceKey = workspaceStorageKey(user?.id);
  const workspaceReady = boundWorkspaceKey === targetWorkspaceKey;

  useEffect(() => {
    // Register normalization only. The auth-bound effect below performs the
    // sole initial rehydrate after the final user-scoped key is known.
    ensureHydrationHook();
    void initNativeShell();
  }, []);

  useEffect(() => {
    const openProfileSetup = () => setEditProfile(true);
    window.addEventListener(
      "realestate-ai:open-profile-setup",
      openProfileSetup,
    );
    return () =>
      window.removeEventListener(
        "realestate-ai:open-profile-setup",
        openProfileSetup,
      );
  }, []);

  // Bind persisted workspace storage to the signed-in user in this browser.
  // This also runs for the anonymous key, so a signed-out visitor never reads
  // the previous user's workspace back out of localStorage. Cross-device sync
  // requires a server-backed workspace and is intentionally not claimed here.
  useEffect(() => {
    if (authPending) return;
    let cancelled = false;
    const requestedKey = workspaceStorageKey(user?.id);
    setBoundWorkspaceKey(null);
    void bindWorkspaceToUser(user?.id).then(() => {
      if (!cancelled) setBoundWorkspaceKey(requestedKey);
    });
    return () => {
      cancelled = true;
    };
  }, [authPending, user?.id]);

  // The product tour is opt-in from the help button. Automatically opening an
  // 11-step modal on first use obscures the task the tester came to complete.

  // Access must be confirmed for this identity. A cached browser billing value
  // cannot unlock the shell while loading or after a failed server request.
  useEffect(() => {
    if (!workspaceReady || !user?.id) return;
    let cancelled = false;
    setServerAccess("pending");
    void import("@/lib/billing/api")
      .then(({ getMyAccess }) => getMyAccess())
      .then((entitlement) => {
        if (cancelled) return;
        const billing=useAppStore.getState().billing;
        if (entitlement.active) {
          setServerAccess("active");
          if (!hasAppAccess(billing) || billing.currentPeriodEnd !== entitlement.currentPeriodEnd) {
            activateBilling({
              ...billing,
              status: entitlement.source === "code" ? "code" : "trialing",
              source: entitlement.source === "code" ? "free_code" : entitlement.source === "demo" ? "demo_checkout" : "stripe_intro",
              currentPeriodEnd: entitlement.currentPeriodEnd,
              introEndsAt: entitlement.source === "code" ? null : entitlement.currentPeriodEnd,
              activatedAt: billing.activatedAt || new Date().toISOString(),
              isDemo: entitlement.source === "demo",
            });
          }
        } else {
          setServerAccess("inactive");
          if (hasAppAccess(billing)) clearBilling();
        }
      })
      .catch(() => {
        if (!cancelled) setServerAccess("error");
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceReady,user?.id,accessAttempt,setServerAccess,activateBilling,clearBilling]);

  // App icon + favicon notification dots
  useEffect(() => {
    if (!workspaceReady || !hydrated || !accessOk) return;
    void syncNotificationBadges(alertUnread);
  }, [workspaceReady, hydrated, accessOk, alertUnread]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!headerQuery.trim()) return;
    void navigate({
      to: "/search",
      search: { q: headerQuery.trim() },
    });
  };

  // /login is a full-screen landing. It must render outside the shell, and we
  // must never redirect away from it, or the sign-in page would loop.
  if (pathname === SIGN_IN_PATH) return <>{children}</>;

  // The session is still resolving. Rendering the signed-out path here would
  // flash the login screen at signed-in users on every hard reload.
  if (authPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-transparent text-[var(--color-fg-muted)]">
        <div className="text-sm">Loading workspace…</div>
      </div>
    );
  }

  // Gate order is auth -> access -> app. Profile setup is optional and is
  // opened only from an explicit in-app action.
  if (!user) return <RedirectToSignIn />;

  if (!workspaceReady || !hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-transparent text-[var(--color-fg-muted)]">
        <div className="text-sm">Loading workspace…</div>
      </div>
    );
  }

  if(serverAccess==="pending") {
    return <div role="status" className="flex min-h-dvh items-center justify-center text-sm">Verifying workspace access…</div>;
  }
  if(serverAccess==="error") {
    return <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <p role="alert">We couldn't verify your access. Check your connection and retry.</p>
        <Button onClick={()=>setAccessAttempt(attempt=>attempt+1)}>Retry access check</Button>
      </div>
    </div>;
  }
  if (!accessOk && pathname !== "/aieo") {
    return (
      <Paywall
        agentName={profile?.name ?? user.displayName ?? undefined}
        onAccessGranted={handleAccessGranted}
      />
    );
  }

  // Beta testers land in the usable workspace immediately. Profile, MLS, and
  // website setup remain available from the sidebar and are never an entry wall.
  if (editProfile) {
    return (
      <div className="safe-pad-y min-h-dvh">
        <OnboardingWizard
          mode={onboarded ? "edit" : "first"}
          preferredName={user.displayName}
          preferredEmail={user.primaryEmail}
          onDone={() => setEditProfile(false)}
          onCancel={() => setEditProfile(false)}
        />
      </div>
    );
  }

  return (
    <div data-testid={accessOk ? "entitled-workspace" : "free-workspace"} className="gradient-mesh flex min-h-dvh text-[var(--color-fg)]">
      <aside
        className={cn(
          "glass-sidebar sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-[color-mix(in_oklab,var(--color-border)_80%,transparent)] transition-[width] duration-200 md:flex",
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
          <NavItems collapsed={collapsed} alertUnread={alertUnread} />
        </div>
        {!collapsed && (
          <div
            className="space-y-2 border-t border-[var(--color-border)] p-3"
            style={{
              paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
            }}
          >
            {profile ? (
              <button
                type="button"
                onClick={() => setEditProfile(true)}
                className="flex min-h-[44px] w-full items-center gap-2.5 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] p-2.5 text-left transition-colors hover:bg-[var(--color-surface-2)]"
              >
                {profile.photoUrl ? (
                  <img
                    src={profile.photoUrl}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-xs font-semibold text-[var(--color-primary)]">
                    {initials(profile.name)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-[var(--color-fg)]">
                    {profile.name}
                  </div>
                  <div className="truncate text-[10px] text-[var(--color-fg-subtle)]">
                    {profile.phone || profile.areaOfOperations}
                  </div>
                  {profile.agentMlsId && (
                    <div className="truncate text-[10px] text-[var(--color-primary)]">
                      MLS/Lic {profile.agentMlsId}
                    </div>
                  )}
                </div>
                <Settings2 className="h-3.5 w-3.5 shrink-0 text-[var(--color-fg-subtle)]" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setEditProfile(true)}
                className="flex min-h-[44px] w-full items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-primary-soft)] p-2.5 text-left text-xs font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-surface-2)]"
              >
                <Settings2 className="h-4 w-4 shrink-0" />
                Set up profile
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
          className="glass-header sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-bg)_88%,transparent)] px-3 backdrop-blur-md sm:px-5"
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
                aria-label="Open navigation"
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
                <NavItems onNavigate={() => setMobileOpen(false)} alertUnread={alertUnread} />
              </div>
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
                  {profile ? "Edit profile" : "Set up profile"}
                </Button>
              </div>
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
            <>
            <Button
              variant="ghost"
              size="icon"
              className="relative min-h-[44px] min-w-[44px]"
              data-tour="alerts-bell"
              title="Email alerts"
              onClick={() => navigate({ to: "/alerts" })}
            >
              <Bell className="h-4 w-4" />
              {alertUnread > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[9px] font-bold text-white ring-2 ring-[var(--color-bg)]">
                  {alertUnread > 9 ? "9+" : alertUnread}
                </span>
              )}
            </Button>
            <Button data-tour="sync-btn"
              size="sm"
              variant="outline"
              className="hidden min-h-[44px] shrink-0 sm:inline-flex"
              onClick={() => {
                void (async () => {
                  if (profile.website) {
                    const r = await resyncFromWebsite();
                    if (r.error) toast.message(r.error);
                    else
                      toast.success(
                        r.listings
                          ? `Website scanned · ${r.listings} listing(s) observed`
                          : "Website scanned — no listings found",
                      );
                    return;
                  }
                  toast.message("Add your website in the profile, or import listings under Listings & Data");
                  navigate({ to: "/mls" });
                })();
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {profile.website ? "Rescan site" : "Listings"}
            </Button>
            </>
          )}

          <Badge variant="secondary" className="hidden sm:inline-flex">
            {profile?.name.split(" ")[0] ?? user.displayName?.split(" ")[0] ?? "Account"}
          </Badge>
        </header>

        <main className="main-content flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>

      <BetaCommentDrawer />
      <IosTabBar />
      </div>
    </div>
  );
}
