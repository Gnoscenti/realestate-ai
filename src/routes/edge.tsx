import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Crosshair,
  ExternalLink,
  Shield,
  Swords,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  COMPETITORS,
  EDGE_PILLARS,
  buildDailyEdgeBrief,
} from "@/lib/competitors";
import { useAppStore } from "@/lib/store";

export const Route = createFileRoute("/edge")({
  component: EdgePlaybookPage,
});

function EdgePlaybookPage() {
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
    <div className="mx-auto max-w-5xl space-y-6 p-4 pb-24 sm:p-6">
      <div className="glass-panel surface-shine p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Badge className="mb-2 gap-1">
              <Swords className="h-3 w-3" />
              Competitive Edge
            </Badge>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Beat the big apps — without their bloat
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-[var(--color-fg-muted)]">
              Follow Up Boss, kvCORE, Lofty, Ylopo, and portals each win on one
              thing. This OS counters them with a faster daily loop, real data,
              and listing-native AI — built for how agents actually work.
            </p>
          </div>
          <Button asChild className="min-h-[44px]">
            <Link to="/outreach">
              <Zap className="h-4 w-4" />
              Run 5-min protocol
            </Link>
          </Button>
        </div>
      </div>

      <Card className="glass-card border-0">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-[var(--color-primary)]" />
            Today’s edge brief
          </CardTitle>
          <CardDescription>
            Auto-built from your book — not generic marketing copy
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] p-3 font-sans text-sm leading-relaxed text-[var(--color-fg-muted)]">
            {brief}
          </pre>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 font-display text-lg font-semibold">
          Six pillars where we win
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {EDGE_PILLARS.map((p) => (
            <Card key={p.id} className="glass-card border-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{p.title}</CardTitle>
                <CardDescription className="text-xs">
                  Beats: {p.beats}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-[var(--color-fg-muted)]">{p.body}</p>
                <Button asChild size="sm" variant="outline" className="min-h-[40px]">
                  <Link to={p.href}>{p.hrefLabel}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-1 font-display text-lg font-semibold">
          Competitor map
        </h2>
        <p className="mb-3 text-sm text-[var(--color-fg-muted)]">
          Their edge → our counter → exactly where to click in this app.
        </p>
        <div className="space-y-3">
          {COMPETITORS.map((c) => (
            <Card key={c.id} className="glass-card border-0">
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display font-semibold text-[var(--color-fg)]">
                    {c.name}
                  </span>
                  <Badge variant="secondary">{c.category}</Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
                      <Crosshair className="h-3 w-3" />
                      Their edge
                    </div>
                    <p className="text-sm text-[var(--color-fg-muted)]">
                      {c.theirEdge}
                    </p>
                  </div>
                  <div className="rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--color-accent)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-accent-soft)_55%,transparent)] p-3">
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-accent)]">
                      <Shield className="h-3 w-3" />
                      Our counter
                    </div>
                    <p className="text-sm text-[var(--color-fg)]">{c.ourCounter}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[var(--color-fg-subtle)]">
                    Use:
                  </span>
                  {c.useModules.map((m) => (
                    <Button
                      key={m.href + m.label}
                      asChild
                      size="sm"
                      variant="ghost"
                      className="h-9"
                    >
                      <Link to={m.href}>
                        {m.label}
                        <ExternalLink className="h-3 w-3 opacity-50" />
                      </Link>
                    </Button>
                  ))}
                </div>
                <p className="flex items-start gap-2 text-xs text-[var(--color-fg-muted)]">
                  <Trophy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-warning)]" />
                  <span>
                    <strong className="text-[var(--color-fg)]">Do this: </strong>
                    {c.doThis}
                  </span>
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
