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
import { BusinessStart } from "@/components/onboarding/business-start";

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

/** Reader-facing names. The queue's internal kinds are snake_case identifiers. */
const KIND_LABEL: Record<PriorityKind, string> = {
  speed_to_lead: "New lead",
  overdue_followup: "Overdue follow-up",
  hot_lead: "Hot lead",
  deal_risk: "Deal at risk",
  deal_milestone: "Deal milestone",
  sphere_reactivate: "Reconnect",
  vacancy: "Vacancy",
  rent_gap: "Rent below market",
  content_gap: "Content idea",
  social_campaign: "Social campaign",
  cma_package: "Listing comparison",
  compliance_package: "Buyer agreement",
  calendar_prep: "Appointment prep",
};

const URGENCY_LABEL: Record<"critical" | "high" | "medium", string> = {
  critical: "Urgent",
  high: "High",
  medium: "Normal",
};

const ARTIFACT_ICON: Record<CommandArtifact["kind"], typeof Package> = {
  words: MessageSquare,
  cma: BarChart3,
  compliance: FileCheck2,
  social: Megaphone,
  brief: Sparkles,
};

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  } catch {
    toast.error("Couldn't copy automatically. Select the text and copy it yourself.");
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
  const hasActiveLeads = leads.some(
    (lead) => !["closed_won", "closed_lost"].includes(lead.status),
  );
  const isFreshWorkspace =
    leads.length === 0 &&
    properties.length === 0 &&
    deals.length === 0 &&
    appointments.length === 0;
  const first = profile?.name?.split(" ")[0];

  const markDone = (id: string) => {
    completePriority(id);
    if (selectedId === id) setSelectedId(null);
    toast.success("Done. Removed from today's list.");
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
                <Sparkles aria-hidden="true" className="h-3 w-3" />
                Command Center
              </Badge>
              <Badge variant="secondary">
                {queue.length === 1 ? "1 priority" : `${queue.length} priorities`}
              </Badge>
              {profile && (
                <Badge variant="secondary">{profile.areaOfOperations}</Badge>
              )}
            </div>
            <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              {first ? `Here's your day, ${first}` : "Here's your day"}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-fg-muted)]">
              Your work, ranked: leads to answer, follow-ups, deal deadlines and
              appointment prep. Each one comes with wording you can copy and send.
            </p>
            {hasActiveLeads && (
              <p className="mt-2 text-xs text-[var(--color-fg-subtle)]">
                On average it has been about {insight.avgHours}{" "}
                {insight.avgHours === 1 ? "hour" : "hours"} since you last contacted
                your active leads.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link to="/calendar">
                <Calendar aria-hidden="true" className="h-4 w-4" />
                Calendar & Vendors
              </Link>
            </Button>
            <Button asChild>
              <Link to="/outreach">
                <Zap aria-hidden="true" className="h-4 w-4" />
                Instant Response
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {isFreshWorkspace ? (
        <BusinessStart />
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
                Pick a priority to see its message, notes and next step.
              </p>
            </div>
            {completed.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="min-h-[40px] shrink-0"
                onClick={() => {
                  clearCompleted();
                  toast.message("Completed items are back on your list.");
                }}
              >
                Restore {completed.length} completed
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
                    aria-pressed={active}
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      "glass-card w-full p-3 text-left transition-[transform,background-color,border-color] duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]",
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
                        <Icon aria-hidden="true" className="h-4 w-4" />
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
                            className="text-[11px]"
                          >
                            {URGENCY_LABEL[item.urgency]}
                          </Badge>
                          <span className="text-[11px] uppercase tracking-wide text-[var(--color-fg-subtle)]">
                            {KIND_LABEL[item.kind] ?? item.kind.replaceAll("_", " ")}
                          </span>
                        </div>
                        <div className="mt-1 text-sm font-medium text-[var(--color-fg)]">
                          {item.title}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-fg-muted)]">
                          {item.reason}
                        </p>
                      </div>
                      <ChevronRight aria-hidden="true" className="mt-2 h-4 w-4 shrink-0 text-[var(--color-fg-subtle)]" />
                    </div>
                  </button>
                );
              })}
              {!queue.length && (
                <Card>
                  <CardContent className="py-10 text-center text-sm text-[var(--color-fg-muted)]">
                    {isFreshWorkspace
                      ? "Nothing to do yet. Your priorities appear here once you add a lead, a listing or an appointment."
                      : "You're all caught up. Restore completed items, or add an appointment to get prep tasks."}
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
                  <Badge variant="secondary">
                    {KIND_LABEL[selectedItem.kind] ?? selectedItem.kind.replaceAll("_", " ")}
                  </Badge>
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
                    <Check aria-hidden="true" className="h-3.5 w-3.5" />
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
                              <AIcon aria-hidden="true" className="h-4 w-4" />
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
                            className="shrink-0"
                            aria-label={`Copy ${art.title}`}
                            onClick={() => void copyText(art.body)}
                          >
                            <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                            Copy
                          </Button>
                        </div>
                        <pre
                          // Focusable so the keyboard can scroll a long draft.
                          tabIndex={0}
                          aria-label={`${art.title} text`}
                          className="scrollbar-thin mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-[var(--radius-sm)] font-sans text-xs leading-relaxed text-[var(--color-fg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                        >
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
                              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
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
                Pick a priority on the left to see its action pack.
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
  const brief = buildDailyEdgeBrief({
    agentName: profile?.name,
    newLeadCount: leads.filter((l) => l.status === "new").length,
    hotLeadCount: leads.filter((l) => l.heat === "hot").length,
    listingCount: properties.filter((p) =>
      ["active", "coming_soon", "pending"].includes(p.status),
    ).length,
    openDealCount: deals.filter((d) => d.stage !== "closed").length,
    hasMlsConnection: false,
    hasWebsite: Boolean(profile?.website),
  });
  return (
    <div
      data-tour="edge-brief"
      className="glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
          Today's edge
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
          <Link to="/outreach">Reply to new leads</Link>
        </Button>
      </div>
    </div>
  );
}
