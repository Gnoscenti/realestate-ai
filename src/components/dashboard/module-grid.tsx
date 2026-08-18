import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  Building2,
  FileText,
  Megaphone,
  Search,
  TrendingUp,
  Users,
  ArrowUpRight,
  Zap,
  BookOpen,
  Calendar,
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

const modules = [
  {
    to: "/outreach",
    title: "Instant Response",
    description:
      "Sub-5-minute SMS/email drafts, nurture sequences, client briefs, buyer agreements.",
    icon: Zap,
    features: ["Speed-to-lead", "Nurture", "Post-NAR"],
    highlight: true,
  },
  {
    to: "/calendar",
    title: "Calendar & Contractors",
    description:
      "Google/Apple/Outlook sync, AI reminders, and vendors by trade with a Common list.",
    icon: Calendar,
    features: ["Sync", "Reminders", "Vendors"],
    highlight: true,
  },
  {
    to: "/knowledge",
    title: "Market Knowledge",
    description:
      "Local market knowledge plus AI memory that learns your practice over time.",
    icon: BookOpen,
    features: ["Neighborhoods", "Comps rules", "Memory"],
    highlight: true,
  },
  {
    to: "/cma",
    title: "Comparison Planning",
    description:
      "Review saved properties and learn what verified sold data is still required.",
    icon: BarChart3,
    features: ["Saved records", "Source checks", "Workflow"],
    highlight: true,
  },
  {
    to: "/marketing",
    title: "Social Content Agent",
    description:
      "Draft multi-platform campaigns with actual listing photos and local review states.",
    icon: Megaphone,
    features: ["Agentic", "Multi-platform", "Calendar"],
    highlight: true,
  },
  {
    to: "/leads",
    title: "Lead Intelligence",
    description:
      "AI scoring, prioritization, and engagement for every prospect.",
    icon: Users,
    features: ["Scoring", "Follow-up", "Pipeline"],
  },
  {
    to: "/search",
    title: "Smart Property Search",
    description:
      "Natural-language search with ranked matches and favorites.",
    icon: Search,
    features: ["NL search", "Match %", "Tours"],
  },
  {
    to: "/market",
    title: "Market Data Setup",
    description:
      "Prepare authorized Closed/Sold sources before client-facing valuation work.",
    icon: TrendingUp,
    features: ["Source checks", "MLS data", "Broker review"],
  },
  {
    to: "/transactions",
    title: "Transaction Hub",
    description:
      "Document AI review, e-sign tracking, and deal milestones.",
    icon: FileText,
    features: ["Docs AI", "Pipeline", "Risks"],
  },
  {
    to: "/properties",
    title: "Property Management",
    description:
      "Occupancy, rent optimization, and maintenance prioritization.",
    icon: Building2,
    features: ["Rent", "Vacancy", "Maintenance"],
  },
];

export function ModuleGrid() {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Workspace modules
        </h2>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Full agent workspace — knowledge, pipeline, and content in one place
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((m) => {
          const Icon = m.icon;
          return (
            <Card
              key={m.to}
              className={
                m.highlight
                  ? "border-[color-mix(in_oklab,var(--color-primary)_25%,var(--color-border))]"
                  : undefined
              }
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                    <Icon className="h-4 w-4" />
                  </div>
                  {m.highlight && (
                    <Badge variant="accent" className="text-[10px]">
                      Core
                    </Badge>
                  )}
                </div>
                <CardTitle className="mt-2 text-base">{m.title}</CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  {m.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1">
                  {m.features.map((f) => (
                    <Badge key={f} variant="secondary" className="text-[10px]">
                      {f}
                    </Badge>
                  ))}
                </div>
                <Button asChild size="sm" variant="outline" className="w-full">
                  <Link to={m.to}>
                    Open
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
