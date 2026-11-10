import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
  Phone,
  Loader2,
  LogOut,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ensureHydrationHook, useAppStore } from "@/lib/store";
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
import { AccountMenu, SignedInAs } from "@/components/layout/account-menu";
import { useSignOut } from "@/lib/auth/use-sign-out";
import { DemoBanner } from "@/components/layout/demo-banner";
import {
  DEMO_ENTRY_PATH,
  DEMO_LOCKED_MESSAGE,
  endDemoSession,
  isDemoSession,
  leaveDemo,
} from "@/lib/demo-mode";
import { seedDemoWorkspace } from "@/lib/demo-workspace";
import {
  bindWorkspaceToUser,
  currentWorkspaceKey,
  workspaceStorageKey,
} from "@/lib/auth/workspace-scope";



const NAV_HINTS: Record<string, string> = {
  "/": "Start here each day: your ranked to-do list",
  "/aieo": "See where AI answers name you, and what to fix",
  "/marketing": "Draft posts from facts, approve, then publish",
  "/outreach": "Reply to new leads in minutes",
  "/voice": "An AI receptionist for calls you miss",
  "/leads": "Your clients and prospects",
  "/calendar": "Appointments and trusted vendors",
  "/transactions": "Track each deal from offer to close",
  "/alerts": "Client and escrow emails that need you",
  "/search": "Search the listings you have saved",
  "/mls": "Add listings from your website or a CSV",
  "/cma": "Compare saved listings and sold records",
  "/market": "Sold data and live market lookups",
  "/knowledge": "Local market talking points",
  "/properties": "Rental units, rent and occupancy",
  "/billing": "Your access and beta code",
  "/feedback": "Your notes on what to fix or improve",
  "/edge": "How this workspace compares",
};

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  tour?: string;
};

type NavSection = { id: string; title?: string; items: NavItem[] };

/**
 * Eighteen destinations read as a wall when listed flat. They are grouped by
 * the job an agent is doing, with the daily home screen on its own at the top.
 * Labels are the product's canonical names: tests, docs and the feedback
 * drawer's page map all refer to them.
 */
const NAV_SECTIONS: NavSection[] = [
  {
    id: "home",
    items: [{ to: "/", label: "Command Center", icon: LayoutDashboard, exact: true, tour: "nav-command" }],
  },
  {
    id: "grow",
    title: "Win business",
    items: [
      { to: "/aieo", label: "CiteLock", icon: Radar },
      { to: "/marketing", label: "Social Desk", icon: Megaphone, tour: "nav-marketing" },
      { to: "/outreach", label: "Instant Response", icon: Zap, tour: "nav-outreach" },
      { to: "/voice", label: "Voice Assistant", icon: Phone },
    ],
  },
  {
    id: "clients",
    title: "Clients & deals",
    items: [
      { to: "/leads", label: "Lead Intelligence", icon: Users, tour: "nav-leads" },
      { to: "/calendar", label: "Calendar & Vendors", icon: Calendar, tour: "nav-calendar" },
      { to: "/transactions", label: "Transaction Hub", icon: FileText },
      { to: "/alerts", label: "Email Alerts", icon: Bell },
    ],
  },
  {
    id: "listings",
    title: "Listings & market",
    items: [
      { to: "/search", label: "Smart Search", icon: Search },
      { to: "/mls", label: "Listings & Data", icon: Link2, tour: "nav-mls" },
      { to: "/cma", label: "CMA Studio", icon: BarChart3 },
      { to: "/market", label: "Market & Valuation", icon: TrendingUp },
      { to: "/knowledge", label: "Market Knowledge", icon: BookOpen },
      { to: "/properties", label: "Property Management", icon: Building2 },
    ],
  },
  {
    id: "account",
    title: "Account",
    items: [
      { to: "/billing", label: "Billing & Access", icon: CreditCard },
      { to: "/feedback", label: "Feedback Board", icon: MessageSquare },
      { to: "/edge", label: "Edge Playbook", icon: Swords },
    ],
  },
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
  const navRef = useRef<HTMLElement>(null);

  // Keep the current page's link visible. The list is taller than a laptop
  // screen, so without this a destination low in the list opens with its own
  // highlight scrolled out of view. Only the list's own scroller moves.
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[data-nav-active="true"]');
    const scroller = nav?.parentElement;
    if (!active || !scroller) return;
    const item = active.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    if (item.top < view.top) scroller.scrollTop -= view.top - item.top + 8;
    else if (item.bottom > view.bottom) scroller.scrollTop += item.bottom - view.bottom + 8;
  }, [pathname, collapsed]);

  return (
    <nav
      ref={navRef}
      className="flex flex-col px-2"
      data-tour="nav-sidebar"
      aria-label="Workspace"
    >
      {NAV_SECTIONS.map((section, index) => {
        const headingId = `nav-section-${section.id}`;
        return (
          <div
            key={section.id}
            role="group"
            aria-labelledby={section.title && !collapsed ? headingId : undefined}
            aria-label={section.title && collapsed ? section.title : undefined}
            className={cn(
              "flex flex-col gap-0.5",
              index > 0 && collapsed && "mt-2 border-t border-[var(--color-border)] pt-2",
            )}
          >
            {section.title && !collapsed && (
              <p
                id={headingId}
                className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]"
              >
                {section.title}
              </p>
            )}
            {section.items.map((item) => {
              const active = item.exact
                ? pathname === item.to
                : pathname === item.to || pathname.startsWith(item.to + "/");
              const Icon = item.icon;
              const unread = item.to === "/alerts" ? alertUnread : 0;
              return (
                <HoverHint
                  key={item.to}
                  // Collapsed, the label is hidden, so the hint has to name the page.
                  label={
                    collapsed
                      ? item.label
                      : (NAV_HINTS[item.to] ?? item.label)
                  }
                  side="right"
                  className="w-full"
                >
                  <Link
                    to={item.to}
                    onClick={onNavigate}
                    data-tour={item.tour}
                    data-nav-active={active ? "true" : undefined}
                    aria-label={
                      collapsed
                        ? unread > 0
                          ? `${item.label}, ${unread} unread`
                          : item.label
                        : undefined
                    }
                    className={cn(
                      "group relative flex min-h-[44px] w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]",
                      active
                        ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-primary)_25%,transparent)]"
                        : "text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]",
                      collapsed && "justify-center px-2",
                    )}
                  >
                    <Icon
                      aria-hidden="true"
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
                        {unread > 0 && (
                          <span className="nav-alert-dot ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[11px] font-bold text-[var(--color-primary-fg)]">
                            <span aria-hidden="true">{unread > 9 ? "9+" : unread}</span>
                            <span className="sr-only">, {unread} unread</span>
                          </span>
                        )}
                      </span>
                    )}
                    {collapsed && unread > 0 && (
                      <span
                        aria-hidden="true"
                        className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[var(--color-danger)]"
                      />
                    )}
                  </Link>
                </HoverHint>
              );
            })}
          </div>
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
          <div className="text-xs text-[var(--color-fg-subtle)]">
            Agent workspace
          </div>
        </div>
      )}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [headerQuery, setHeaderQuery] = useState("");
  const [editProfile, setEditProfile] = useState(false);
  const [profileSyncError, setProfileSyncError] = useState(false);
  const [profileSyncAttempt, setProfileSyncAttempt] = useState(0);
  const [boundWorkspaceKey, setBoundWorkspaceKey] = useState<string | null>(
    null,
  );
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isPending: authPending } = useCurrentUserState();
  const isDemo = Boolean(user?.isDemo);
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

  // A real session ends any guest demo left in this tab, so server calls work.
  useEffect(() => {
    if (user && !user.isDemo && isDemoSession()) endDemoSession();
  }, [user]);

  useEffect(() => {
    const openProfileSetup = () => {
      // Profile setup saves to the server, which needs a real account.
      if (isDemoSession()) {
        toast.message(DEMO_LOCKED_MESSAGE);
        return;
      }
      setEditProfile(true);
    };
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
  // the previous user's workspace back out of localStorage. Restore the shared
  // confirmed identity from the server after selecting that browser scope.
  useEffect(() => {
    if (authPending) return;
    let cancelled = false;
    const requestedKey = workspaceStorageKey(user?.id);
    setBoundWorkspaceKey(null);
    setEditProfile(false);
    setProfileSyncError(false);
    void bindWorkspaceToUser(user?.id).then(async () => {
      if (cancelled || currentWorkspaceKey() !== requestedKey) return;
      if (user?.isDemo) {
        // Browser-only sample workspace; there is no saved profile to fetch.
        seedDemoWorkspace();
      } else if (user?.id) {
        try {
          const { getOnboardingProfile } = await import("@/lib/onboarding/api");
          const saved = await getOnboardingProfile();
          if (cancelled || currentWorkspaceKey() !== requestedKey) return;
          if (saved && saved.revision > 0) useAppStore.getState().hydrateConfirmedProfile(saved.profile);
        } catch {
          if (!cancelled) setProfileSyncError(true);
        }
      }
      if (!cancelled && currentWorkspaceKey() === requestedKey) {
        setBoundWorkspaceKey(requestedKey);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [authPending, user?.id, user?.isDemo, profileSyncAttempt]);

  // The product tour is opt-in from the help button. Automatically opening an
  // 11-step modal on first use obscures the task the tester came to complete.

  // Access must be confirmed for this identity. A cached browser billing value
  // cannot unlock the shell while loading or after a failed server request.
  useEffect(() => {
    if (!workspaceReady || !user?.id) return;
    if (user.isDemo) {
      // The demo shows every module with sample data. Nothing here unlocks the
      // server: authenticated requests are refused while the demo is active.
      setServerAccess("active");
      return;
    }
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
  }, [workspaceReady,user?.id,user?.isDemo,accessAttempt,setServerAccess,activateBilling,clearBilling]);

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
  if (pathname === SIGN_IN_PATH || pathname === DEMO_ENTRY_PATH) return <>{children}</>;

  // The session is still resolving. Rendering the signed-out path here would
  // flash the login screen at signed-in users on every hard reload.
  if (authPending) return <ShellStatus>Opening your workspace…</ShellStatus>;

  // Gate order is auth -> access -> app. Profile setup is optional and is
  // opened only from an explicit in-app action.
  if (!user) return <RedirectToSignIn />;

  if (!workspaceReady || !hydrated) return <ShellStatus>Opening your workspace…</ShellStatus>;

  if (serverAccess === "pending") return <ShellStatus>Checking your access…</ShellStatus>;
  if (serverAccess === "error") {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="surface-card max-w-md space-y-4 p-6 text-center">
          <p role="alert" className="text-sm leading-relaxed">
            We couldn't verify your access. Check your connection and retry.
          </p>
          <Button className="min-h-[44px]" onClick={() => setAccessAttempt((attempt) => attempt + 1)}>
            Retry access check
          </Button>
          <SignedInAs label={user.primaryEmail ?? user.displayName ?? "this account"} />
        </div>
      </div>
    );
  }
  if (!accessOk && pathname !== "/aieo") {
    return (
      <Paywall
        agentName={profile?.name ?? user.displayName ?? undefined}
        onAccessGranted={handleAccessGranted}
        footer={<SignedInAs label={user.primaryEmail ?? user.displayName ?? "this account"} />}
      />
    );
  }

  // Beta testers land in the usable workspace immediately. Profile, MLS, and
  // website setup remain available from the sidebar and are never an entry wall.
  if (editProfile) {
    return (
      <div className="safe-pad-y min-h-dvh">
        <OnboardingWizard
          key={user.id}
          mode={onboarded ? "edit" : "first"}
          preferredName={user.displayName}
          preferredEmail={user.primaryEmail}
          onDone={() => { setEditProfile(false); void navigate({ to: "/" }); }}
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
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto py-3">
          <NavItems collapsed={collapsed} alertUnread={alertUnread} />
        </div>
        {!collapsed && (
          <div
            className="space-y-2 border-t border-[var(--color-border)] p-3"
            style={{
              paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
            }}
          >
            {isDemo ? (
              <button
                type="button"
                onClick={() => leaveDemo("signup")}
                className="flex min-h-[44px] w-full items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-primary-soft)] p-2.5 text-left text-xs font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-surface-2)]"
              >
                <UserPlus className="h-4 w-4 shrink-0" />
                Create free account
              </button>
            ) : profile ? (
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
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] p-3">
              <div>
                <dt className="text-xs text-[var(--color-fg-subtle)]">Hot leads</dt>
                <dd className="tabular font-display text-xl font-semibold text-[var(--color-fg)]">
                  {hotCount}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-fg-subtle)]">Listings</dt>
                <dd className="tabular font-display text-xl font-semibold text-[var(--color-fg)]">
                  {myBook}
                </dd>
              </div>
              <div className="col-span-2 flex items-center gap-1.5 border-t border-[var(--color-border)] pt-2 text-xs text-[var(--color-fg-muted)]">
                <Sparkles aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
                <dt>AI familiarity</dt>
                <dd className="tabular ml-auto font-medium text-[var(--color-fg)]">
                  {memory.familiarityScore}/100
                </dd>
              </div>
              {profile && (
                <p className="col-span-2 truncate text-xs text-[var(--color-fg-subtle)]">
                  {getMlsLabel(profile.mls).split("(")[0].trim()}
                </p>
              )}
            </dl>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header and demo banner stick together so the banner never scrolls away. */}
        <div className="sticky top-0 z-30">
        <header
          className="glass-header flex items-center gap-3 border-b border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-bg)_88%,transparent)] px-3 backdrop-blur-md sm:px-5"
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
                <Menu aria-hidden="true" className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[min(300px,100vw)] p-0">
              <SheetTitle className="sr-only">Workspace menu</SheetTitle>
              <SheetDescription className="sr-only">
                Go to any part of your workspace, edit your profile or sign out.
              </SheetDescription>
              <div
                className="flex shrink-0 items-center border-b border-[var(--color-border)] px-2"
                style={{
                  paddingTop: "env(safe-area-inset-top)",
                  minHeight: "calc(4rem + env(safe-area-inset-top))",
                }}
              >
                <Brand />
              </div>
              <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pb-3">
                <NavItems onNavigate={() => setMobileOpen(false)} alertUnread={alertUnread} />
              </div>
              <div
                className="shrink-0 border-t border-[var(--color-border)] p-3"
                style={{
                  paddingBottom:
                    "max(0.75rem, env(safe-area-inset-bottom))",
                }}
              >
                {isDemo ? (
                  <>
                    <Button className="min-h-[44px] w-full" onClick={() => leaveDemo("signup")}>
                      <UserPlus className="h-4 w-4" /> Create free account
                    </Button>
                    <Button variant="ghost" className="mt-2 min-h-[44px] w-full" onClick={() => leaveDemo("login")}>
                      <X className="h-4 w-4" /> Exit demo
                    </Button>
                  </>
                ) : (
                  <>
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
                    <MobileSignOutButton />
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>

          <form
            role="search"
            onSubmit={onSearch}
            className="relative min-w-0 flex-1 max-w-xl"
          >
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-fg-subtle)]"
            />
            <Input
              value={headerQuery}
              onChange={(e) => setHeaderQuery(e.target.value)}
              // Smart Search matches the listings saved in this workspace. It
              // is not a market-wide or MLS search, so the prompt must not imply one.
              aria-label="Search your saved listings"
              placeholder="Search your listings…"
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
              aria-label={
                alertUnread > 0 ? `Email alerts, ${alertUnread} unread` : "Email alerts"
              }
              onClick={() => navigate({ to: "/alerts" })}
            >
              <Bell aria-hidden="true" className="h-4 w-4" />
              {alertUnread > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[11px] font-bold text-[var(--color-primary-fg)] ring-2 ring-[var(--color-bg)]"
                >
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
                          ? `Website scanned. ${r.listings} ${r.listings === 1 ? "listing" : "listings"} found.`
                          : "Website scanned. No listings found on it yet.",
                      );
                    return;
                  }
                  toast.message("Add your website to your profile, or import a CSV here.");
                  navigate({ to: "/mls" });
                })();
              }}
            >
              {profile.website ? (
                <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
              ) : (
                <Link2 aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {profile.website ? "Rescan website" : "Add listings"}
            </Button>
            </>
          )}

          <AccountMenu
            name={isDemo ? user.displayName : profile?.name ?? user.displayName}
            email={user.primaryEmail}
            hasProfile={Boolean(profile)}
            isDemo={isDemo}
            onEditProfile={() => setEditProfile(true)}
          />
        </header>
        {isDemo && <DemoBanner />}
        {/* Under the header, in the page's own flow. Floating at the bottom of
            the screen it shared that corner with the feedback button, which
            covered "Try again" on a phone. */}
        {profileSyncError && (
          <div
            role="status"
            data-testid="profile-sync-notice"
            className="flex flex-wrap items-center justify-between gap-2 border-b border-[color-mix(in_oklab,var(--color-warning)_40%,var(--color-border))] bg-[color-mix(in_oklab,var(--color-warning)_14%,var(--color-bg))] px-3 py-2 text-sm text-[var(--color-fg)] sm:px-5"
          >
            <p className="min-w-0 flex-1">
              We couldn't load your saved profile. You can keep working with what's on this device.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="min-h-[40px] shrink-0"
              onClick={() => setProfileSyncAttempt((attempt) => attempt + 1)}
            >
              Try again
            </Button>
          </div>
        )}
        </div>

        <main className="main-content flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>

      <BetaCommentDrawer />
      <IosTabBar />
      </div>
    </div>
  );
}

/** Full-screen "working on it" state for the auth, workspace and access gates. */
function ShellStatus({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="flex min-h-dvh items-center justify-center gap-2 bg-transparent text-sm text-[var(--color-fg-muted)]"
    >
      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
      {children}
    </div>
  );
}

function MobileSignOutButton() {
  const { signingOut, signOut } = useSignOut();
  return (
    <Button
      variant="ghost"
      className="mt-2 min-h-[44px] w-full text-[var(--color-danger)]"
      disabled={signingOut}
      onClick={() => void signOut()}
    >
      <LogOut className="h-4 w-4" />
      {signingOut ? "Signing out…" : "Sign out"}
    </Button>
  );
}
