import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Check,
  ChevronRight,
  Clock,
  Copy,
  DollarSign,
  FileCheck2,
  Flame,
  Gauge,
  Megaphone,
  MessageSquare,
  Package,
  RefreshCw,
  Scale,
  UserPlus,
  Link2,
  Settings2,
  Sparkles,
  Zap,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AIAssistant } from "@/components/dashboard/ai-assistant";
import { ModuleGrid } from "@/components/dashboard/module-grid";
import { QuickStats } from "@/components/dashboard/quick-stats";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import {
  buildCommandPack,
  type CommandArtifact,
} from "@/lib/command-pack";
import {
  buildPriorityQueue,
  responseTimeInsight,
  type PriorityKind,
} from "@/lib/priorities";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { buildDailyEdgeBrief } from "@/lib/competitors";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

const KIND_ICON: Record<PriorityKind, typeof Zap> = {
  speed_to_lead: Zap,
  overdue_followup: Clock,
  hot_lead: Flame,
  deal_risk: AlertTriangle,
  deal_milestone: Gauge,
  sphere_reactivate: RefreshCw,
  vacancy: Building2,
  rent_gap: DollarSign,
  content_gap: Megaphone,
  social_campaign: Megaphone,
  cma_package: BarChart3,
  compliance_package: Scale,
  calendar_prep: Calendar,
};

const ARTIFACT_ICON: Record<CommandArtifact["kind"], typeof Package> = {
  words: MessageSquare,
  cma: BarChart3,
  compliance: FileCheck2,
  social: Megaphone,
  brief: Sparkles,
};

const FIRST_TASKS = [
  {
    to: "/leads",
    label: "Add a lead",
    help: "Start with one real contact and get the next follow-up.",
    icon: UserPlus,
  },
  {
    to: "/mls",
    label: "Connect listings",
    help: "Bring in inventory from MLS, a website, or CSV.",
    icon: Link2,
  },
  {
    to: "/calendar",
    label: "Add appointment",
    help: "Put the next client event where the workspace can prepare it.",
    icon: Calendar,
  },
] as const;

function FreshWorkspaceGuide({ hasProfile }: { hasProfile: boolean }) {
  return (
    <Card
      className="border-[color-mix(in_oklab,var(--color-primary)_35%,var(--color-border))]"
      data-testid="fresh-workspace-guide"
    >
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">Start here</Badge>
          <span className="text-xs text-[var(--color-fg-subtle)]">
            Setup is optional
          </span>
        </div>
        <CardTitle>Choose one real task</CardTitle>
        <CardDescription>
          Your workspace is ready. Add the item you already have in front of
          you; RealEstate AI will build the next actions from it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {FIRST_TASKS.map((task) => {
            const Icon = task.icon;
            return (
              <Button
                key={task.to}
                asChild
                variant="outline"
                className="h-auto min-h-[72px] justify-start whitespace-normal p-3 text-left"
              >
                <Link to={task.to}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>
                    <span className="block font-semibold">{task.label}</span>
                    <span className="mt-0.5 block text-xs font-normal text-[var(--color-fg-muted)]">
                      {task.help}
                    </span>
                  </span>
                </Link>
              </Button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[var(--color-fg-muted)]">
            Profile, market, and MLS details can be added whenever they become
            useful.
          </p>
          <Button
            type="button"
            variant="ghost"
            className="min-h-[44px] justify-start sm:shrink-0"
            onClick={() =>
              window.dispatchEvent(
                new Event("realestate-ai:open-profile-setup"),
              )
            }
          >
            <Settings2 className="h-4 w-4" />
            {hasProfile ? "Review profile" : "Add profile (optional)"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.message("Select text to copy");
  }
}

function DashboardPage() {
  const leads = useAppStore((s) => s.leads);
  const deals = useAppStore((s) => s.deals);
  const rentals = useAppStore((s) => s.rentals);
  const properties = useAppStore((s) => s.properties);
  const appointments = useAppStore((s) => s.appointments);
  const activityCount = useAppStore((s) => s.activity.length);
  const profile = useAppStore((s) => s.agentProfile);
  const completed = useAppStore((s) => s.completedPriorities);
  const completePriority = useAppStore((s) => s.completePriority);
  const clearCompleted = useAppStore((s) => s.clearCompletedPriorities);
  const touchLead = useAppStore((s) => s.touchLead);
  const navigate = useNavigate();

  const queue = useMemo(
    () =>
      buildPriorityQueue({
        leads,
        deals,
        rentals,
        properties,
        appointments,
        completedIds: completed,
      }),
    [leads, deals, rentals, properties, appointments, completed],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedItem =
    queue.find((q) => q.id === selectedId) ?? queue[0] ?? null;

  const pack = useMemo(
    () =>
      selectedItem
        ? buildCommandPack(selectedItem, { leads, properties, deals })
        : null,
    [selectedItem, leads, properties, deals],
  );

  const insight = useMemo(() => responseTimeInsight(leads), [leads]);
  const isFreshWorkspace =
    leads.length === 0 &&
    properties.length === 0 &&
    deals.length === 0 &&
    appointments.length === 0;
  const first = profile?.name?.split(" ")[0] ?? "Agent";

  const markDone = (id: string) => {
    completePriority(id);
    if (selectedId === id) setSelectedId(null);
    toast.success("Marked done");
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="relative overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(ellipse 55% 80% at 0% 0%, color-mix(in oklab, var(--color-primary) 14%, transparent), transparent 55%), radial-gradient(ellipse 40% 50% at 100% 0%, color-mix(in oklab, var(--color-accent) 10%, transparent), transparent 50%)",
          }}
        />
        <div className="relative flex flex-col gap-4 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap gap-2">
              <Badge variant="accent">
                <Sparkles className="h-3 w-3" />
                Command Center
              </Badge>
              <Badge variant="secondary">
                {queue.length} ranked work items
              </Badge>
              {profile && (
                <Badge variant="secondary">{profile.areaOfOperations}</Badge>
              )}
            </div>
            <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Good focus, {first}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-fg-muted)]">
              Agent-first Action Desk: ranked queue for speed-to-lead, follow-ups,
              calendar prep, CMAs, and compliance — with the words ready in one
              place.
            </p>
            <p className="mt-2 text-xs text-[var(--color-fg-subtle)]">
              Avg touch lag ~{insight.avgHours}h · {insight.underFiveMinPotential}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link to="/calendar">
                <Calendar className="h-4 w-4" />
                Calendar & vendors
              </Link>
            </Button>
            <Button asChild>
              <Link to="/outreach">
                <Zap className="h-4 w-4" />
                Instant response
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {isFreshWorkspace ? (
        <FreshWorkspaceGuide hasProfile={Boolean(profile)} />
      ) : (
        <>
          <QuickStats />
          <EdgeBriefBar />
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-5" data-tour="action-desk">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Action Desk
              </h2>
              <p className="text-xs text-[var(--color-fg-muted)]">
                Select a priority → pack opens with words + CMA + compliance
              </p>
            </div>
            {completed.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => clearCompleted()}>
                Reset done
              </Button>
            )}
          </div>

          <ScrollArea className="h-[min(32rem,60dvh)] pr-2">
            <div className="space-y-2 pb-2">
              {queue.map((item) => {
                const Icon = KIND_ICON[item.kind] ?? Zap;
                const active = selectedItem?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      "glass-card w-full p-3 text-left transition-[transform,background-color,border-color] duration-150 hover:-translate-y-0.5",
                      active
                        ? "border-[color-mix(in_oklab,var(--color-primary)_40%,var(--color-border))] bg-[var(--color-surface)]"
                        : "border-[var(--color-border)] bg-[var(--color-surface)]/60 hover:bg-[var(--color-surface-2)]/50",
                    )}
                  >
                    <div className="flex gap-3">
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)]",
                          item.urgency === "critical"
                            ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                            : item.urgency === "high"
                              ? "bg-[var(--color-warning-soft)] text-[var(--color-warning)]"
                              : "bg-[var(--color-primary-soft)] text-[var(--color-primary)]",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant={
                              item.urgency === "critical"
                                ? "danger"
                                : item.urgency === "high"
                                  ? "warning"
                                  : "secondary"
                            }
                            className="text-[10px]"
                          >
                            {item.urgency}
                          </Badge>
                          <span className="text-[10px] uppercase tracking-wide text-[var(--color-fg-subtle)]">
                            {item.kind.replaceAll("_", " ")}
                          </span>
                        </div>
                        <div className="mt-1 text-sm font-medium text-[var(--color-fg)]">
                          {item.title}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-fg-muted)]">
                          {item.reason}
                        </p>
                      </div>
                      <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-[var(--color-fg-subtle)]" />
                    </div>
                  </button>
                );
              })}
              {!queue.length && (
                <Card>
                  <CardContent className="py-10 text-center text-sm text-[var(--color-fg-muted)]">
                    {isFreshWorkspace
                      ? "Add one real lead, listing, or appointment above. Your ranked next action will appear here."
                      : "Queue clear — great work. Reset done items or sync calendars for new prep tasks."}
                  </CardContent>
                </Card>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="space-y-4 lg:col-span-7">
          {pack && selectedItem ? (
            <Card className="border-[color-mix(in_oklab,var(--color-primary)_20%,var(--color-border))]">
              <CardHeader className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="accent">Action pack</Badge>
                  <Badge variant="secondary">{selectedItem.kind.replaceAll("_", " ")}</Badge>
                </div>
                <CardTitle className="text-xl">{pack.headline}</CardTitle>
                <CardDescription>{pack.subtitle}</CardDescription>
                <p className="text-xs text-[var(--color-fg-subtle)]">
                  {selectedItem.researchNote}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      if (selectedItem.leadId) touchLead(selectedItem.leadId);
                      markDone(selectedItem.id);
                    }}
                  >
                    <Check className="h-3.5 w-3.5" />
                    Mark done
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void navigate({ to: selectedItem.href as "/" });
                    }}
                  >
                    {selectedItem.actionLabel}
                  </Button>
                </div>

                <div className="space-y-3">
                  {pack.artifacts.map((art) => {
                    const AIcon = ARTIFACT_ICON[art.kind] ?? Package;
                    return (
                      <div
                        key={art.id}
                        className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                              <AIcon className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="text-sm font-medium">
                                {art.title}
                              </div>
                              <div className="text-xs text-[var(--color-fg-subtle)]">
                                {art.summary}
                              </div>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void copyText(art.body)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Copy
                          </Button>
                        </div>
                        <pre className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-[var(--color-fg-muted)]">
                          {art.body}
                        </pre>
                        {art.href && (
                          <Button
                            asChild
                            size="sm"
                            variant="ghost"
                            className="mt-2"
                          >
                            <Link to={art.href as "/"}>
                              {art.hrefLabel ?? "Open"}
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-16 text-center text-sm text-[var(--color-fg-muted)]">
                Select a ranked work item to open its action pack.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className={cn(isFreshWorkspace ? "lg:col-span-12" : "lg:col-span-7")}>
          <AIAssistant />
        </div>
        {!isFreshWorkspace && (
          <div className="space-y-6 lg:col-span-5">
            {activityCount > 0 && <RecentActivity />}
            <ModuleGrid />
          </div>
        )}
      </div>
    </div>
  );
}


function EdgeBriefBar() {
  const profile = useAppStore((s) => s.agentProfile);
  const leads = useAppStore((s) => s.leads);
  const properties = useAppStore((s) => s.properties);
  const deals = useAppStore((s) => s.deals);
  const mlsConnections = useAppStore((s) => s.mlsConnections);
  const brief = buildDailyEdgeBrief({
    agentName: profile?.name,
    newLeadCount: leads.filter((l) => l.status === "new").length,
    hotLeadCount: leads.filter((l) => l.heat === "hot").length,
    listingCount: properties.filter((p) =>
      ["active", "coming_soon", "pending"].includes(p.status),
    ).length,
    openDealCount: deals.filter((d) => d.stage !== "closed").length,
    hasMlsConnection: mlsConnections.some(
      (c) => c.status === "connected" || c.hasCredentials,
    ),
    hasWebsite: Boolean(profile?.website),
  });
  return (
    <div
      data-tour="edge-brief"
      className="glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
          Competitive edge · today
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-[var(--color-fg-muted)]">
          {brief.split("\n").slice(1, 3).join(" · ").replace(/^• /g, "")}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline" className="min-h-[40px]">
          <Link to="/edge">Edge Playbook</Link>
        </Button>
        <Button asChild size="sm" className="min-h-[40px]">
          <Link to="/outreach">5-min protocol</Link>
        </Button>
      </div>
    </div>
  );
}
