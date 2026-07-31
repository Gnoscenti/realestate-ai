import { DollarSign, Home, TrendingUp, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAppStore } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";

export function QuickStats() {
  const leads = useAppStore((s) => s.leads);
  const properties = useAppStore((s) => s.properties);
  const deals = useAppStore((s) => s.deals);

  const activeLeads = leads.filter(
    (l) => !["closed_won", "closed_lost"].includes(l.status),
  ).length;
  const listed = properties.filter((p) =>
    ["active", "pending", "coming_soon"].includes(p.status),
  ).length;
  const pipeline = deals
    .filter((d) => d.stage !== "closed")
    .reduce((sum, d) => sum + d.value, 0);
  const avgScore =
    leads.length === 0
      ? 0
      : Math.round(leads.reduce((s, l) => s + l.score, 0) / leads.length);

  const stats = [
    {
      title: "Active leads",
      value: String(activeLeads),
      hint: `${leads.filter((l) => l.heat === "hot").length} hot`,
      icon: Users,
      tint: "text-[var(--color-primary)]",
      bg: "bg-[var(--color-primary-soft)]",
    },
    {
      title: "Listings",
      value: String(listed),
      hint: `${properties.filter((p) => p.status === "active").length} active`,
      icon: Home,
      tint: "text-[var(--color-accent)]",
      bg: "bg-[var(--color-accent-soft)]",
    },
    {
      title: "Pipeline",
      value: formatCurrency(pipeline, true),
      hint: `${deals.filter((d) => d.stage !== "closed").length} open deals`,
      icon: DollarSign,
      tint: "text-[var(--color-success)]",
      bg: "bg-[var(--color-success-soft)]",
    },
    {
      title: "AI lead score",
      value: `${avgScore}%`,
      hint: "Portfolio average",
      icon: TrendingUp,
      tint: "text-[var(--color-warning)]",
      bg: "bg-[var(--color-warning-soft)]",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {stats.map((stat) => (
        <Card key={stat.title} className="overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-[var(--color-fg-subtle)]">
                  {stat.title}
                </p>
                <p className="mt-2 font-display text-2xl font-semibold tracking-tight tabular text-[var(--color-fg)] sm:text-[1.75rem]">
                  {stat.value}
                </p>
                <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
                  {stat.hint}
                </p>
              </div>
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] ${stat.bg}`}
              >
                <stat.icon className={`h-4 w-4 ${stat.tint}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
