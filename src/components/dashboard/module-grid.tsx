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
  PhoneCall,
  Radar,
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
    to: "/voice",
    title: "Voice Assistant",
    description:
      "An AI receptionist that answers the calls you miss, tells callers it is AI, and logs each message.",
    icon: PhoneCall,
    features: ["Inbound only", "Call intake", "Consent"],
  },
  {
    to: "/outreach",
    title: "Instant Response",
    description:
      "Text and email drafts for new leads in minutes, plus follow-up sequences and client briefs.",
    icon: Zap,
    features: ["Fast replies", "Follow-up", "Agreements"],
  },
  {
    to: "/aieo",
    title: "CiteLock",
    description:
      "Where AI answer engines send your clients, who they name instead, and drafted fixes you approve.",
    icon: Radar,
    features: ["Visibility", "Sources", "Fixes"],
  },
  {
    to: "/calendar",
    title: "Calendar & Vendors",
    description:
      "Your appointments and trusted vendors by trade. Export to your own calendar; nothing syncs automatically.",
    icon: Calendar,
    features: ["Appointments", "Reminders", "Vendors"],
  },
  {
    to: "/knowledge",
    title: "Market Knowledge",
    description:
      "Local market talking points, plus practice notes you save yourself.",
    icon: BookOpen,
    features: ["Neighborhoods", "Talking points", "Your notes"],
  },
  {
    to: "/cma",
    title: "CMA Studio",
    description:
      "Compare saved listings and keep verified sold records. It does not pick comps or recommend a price yet.",
    icon: BarChart3,
    features: ["Saved records", "Source checks", "Workflow"],
  },
  {
    to: "/marketing",
    title: "Social Desk",
    description:
      "Use actual listing photos, review sourced drafts, approve the exact revision and export or hand off.",
    icon: Megaphone,
    features: ["Facts first", "Review", "Publish"],
  },
  {
    to: "/leads",
    title: "Lead Intelligence",
    description:
      "Your clients and prospects, ranked by a points score so you know who to call first.",
    icon: Users,
    features: ["Points score", "Follow-up", "Pipeline"],
  },
  {
    to: "/search",
    title: "Smart Search",
    description:
      "Describe a home in plain words and search the listings you have saved.",
    icon: Search,
    features: ["Plain-language", "Ranked matches", "Saved homes"],
  },
  {
    to: "/market",
    title: "Market & Valuation",
    description:
      "Set up authorized sold data before any client-facing valuation work.",
    icon: TrendingUp,
    features: ["Source checks", "MLS data", "Broker review"],
  },
  {
    to: "/transactions",
    title: "Transaction Hub",
    description:
      "Add your deals and track each one from offer to close. Document review and e-sign are not connected.",
    icon: FileText,
    features: ["Milestones", "Risks"],
  },
  {
    to: "/properties",
    title: "Property Management",
    description:
      "Rent, occupancy and lease dates for the rental units you manage.",
    icon: Building2,
    features: ["Rent", "Vacancy", "Leases"],
  },
];

export function ModuleGrid() {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Everything in your workspace
        </h2>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Jump to any tool. The same list is in the menu.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((m) => {
          const Icon = m.icon;
          return (
            <Card
              key={m.to}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                    <Icon aria-hidden="true" className="h-4 w-4" />
                  </div>
                </div>
                <CardTitle className="mt-2 text-base">{m.title}</CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  {m.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1">
                  {m.features.map((f) => (
                    <Badge key={f} variant="secondary" className="text-[11px]">
                      {f}
                    </Badge>
                  ))}
                </div>
                <Button asChild size="sm" variant="outline" className="w-full">
                  <Link to={m.to} aria-label={`Open ${m.title}`}>
                    Open
                    <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
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
