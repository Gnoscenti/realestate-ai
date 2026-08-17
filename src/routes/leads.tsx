import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Calendar,
  Filter,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  Search,
  Star,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RelativeTime } from "@/components/relative-time";
import { useAppStore } from "@/lib/store";
import {
  formatCurrency,
  initials,
  cn,
} from "@/lib/utils";
import type { Lead, LeadHeat, LeadSource, LeadStatus } from "@/data/seed";

export const Route = createFileRoute("/leads")({
  component: LeadsPage,
});

function heatBadge(heat: LeadHeat) {
  if (heat === "hot") return <Badge variant="hot">Hot</Badge>;
  if (heat === "warm") return <Badge variant="warm">Warm</Badge>;
  return <Badge variant="cold">Cold</Badge>;
}

function scoreTone(score: number) {
  if (score >= 90) return "text-[var(--color-success)] bg-[var(--color-success-soft)]";
  if (score >= 70) return "text-[var(--color-warning)] bg-[var(--color-warning-soft)]";
  return "text-[var(--color-danger)] bg-[var(--color-danger-soft)]";
}

function LeadsPage() {
  const leads = useAppStore((s) => s.leads);
  const addLead = useAppStore((s) => s.addLead);
  const updateLead = useAppStore((s) => s.updateLead);
  const deleteLead = useAppStore((s) => s.deleteLead);
  const touchLead = useAppStore((s) => s.touchLead);
  const pushActivity = useAppStore((s) => s.pushActivity);

  const [search, setSearch] = useState("");
  const [heatFilter, setHeatFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(leads[0]?.id ?? null);
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    location: "",
    budgetMin: "500000",
    budgetMax: "900000",
    propertyType: "House",
    preferences: "",
    notes: "",
    source: "website" as LeadSource,
    status: "new" as LeadStatus,
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return leads
      .filter((l) => {
        if (heatFilter !== "all" && l.heat !== heatFilter) return false;
        if (!q) return true;
        return (
          l.name.toLowerCase().includes(q) ||
          l.email.toLowerCase().includes(q) ||
          l.location.toLowerCase().includes(q) ||
          l.preferences.toLowerCase().includes(q) ||
          l.tags.some((t) => t.includes(q))
        );
      })
      .sort((a, b) => b.score - a.score);
  }, [leads, search, heatFilter]);

  const selected = leads.find((l) => l.id === selectedId) ?? filtered[0] ?? null;

  const staleCount = leads.filter((l) => {
    if (["closed_won", "closed_lost"].includes(l.status)) return false;
    return (Date.now() - new Date(l.lastContact).getTime()) / 86400000 >= 5;
  }).length;

  const createLead = () => {
    if (!form.name.trim()) {
      setFormError("Enter the lead’s name.");
      return;
    }
    if (!form.email.trim() && !form.phone.trim()) {
      setFormError("Add at least an email address or phone number.");
      return;
    }
    setFormError(null);
    const lead = addLead({
      name: form.name.trim(),
      email: form.email.trim() || "—",
      phone: form.phone.trim() || "—",
      location: form.location.trim() || "Metro",
      budgetMin: Number(form.budgetMin) || 0,
      budgetMax: Number(form.budgetMax) || 0,
      status: form.status,
      source: form.source,
      propertyType: form.propertyType,
      preferences: form.preferences,
      notes: form.notes || "New lead — AI scoring applied.",
      lastContact: new Date().toISOString(),
      tags: ["new"],
    });
    setSelectedId(lead.id);
    setOpen(false);
    setForm({
      name: "",
      email: "",
      phone: "",
      location: "",
      budgetMin: "500000",
      budgetMax: "900000",
      propertyType: "House",
      preferences: "",
      notes: "",
      source: "website",
      status: "new",
    });
    toast.success(`${lead.name} added · score ${lead.score}`);
  };

  const scheduleFollowups = () => {
    const targets = leads.filter((l) => l.heat !== "cold").slice(0, 5);
    targets.forEach((l) =>
      updateLead(l.id, {
        nextFollowUp: new Date(Date.now() + 86400000).toISOString(),
      }),
    );
    pushActivity({
      type: "lead",
      title: "Follow-ups scheduled",
      description: `AI scheduled outreach for ${targets.length} priority leads`,
      badge: "Nurture",
    });
    toast.success(`Scheduled follow-ups for ${targets.length} leads`);
  };

  const sendNurture = () => {
    if (!selected) return;
    touchLead(selected.id);
    pushActivity({
      type: "chat",
      title: "AI nurture sent",
      description: `Personalized sequence started for ${selected.name}`,
      badge: "Nurture",
    });
    toast.success(`Nurture sequence sent to ${selected.name}`);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Lead intelligence
          </h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            AI scoring, prioritization, and engagement for your pipeline
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={scheduleFollowups}>
            <TrendingUp className="h-4 w-4" />
            AI analysis
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                Add lead
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add lead</DialogTitle>
                <DialogDescription>
                  Start with a name and either email or phone. You can add the
                  rest later.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="lead-name">Name</Label>
                  <Input
                    id="lead-name"
                    value={form.name}
                    onChange={(e) => {
                      setForm({ ...form, name: e.target.value });
                      setFormError(null);
                    }}
                    placeholder="Full name"
                    required
                    aria-required="true"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-email">Email</Label>
                  <Input
                    id="lead-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => {
                      setForm({ ...form, email: e.target.value });
                      setFormError(null);
                    }}
                    placeholder="email@example.com"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-phone">Phone</Label>
                  <Input
                    id="lead-phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => {
                      setForm({ ...form, phone: e.target.value });
                      setFormError(null);
                    }}
                    placeholder="(555) 000-0000"
                    autoComplete="tel"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Location</Label>
                  <Input
                    value={form.location}
                    onChange={(e) =>
                      setForm({ ...form, location: e.target.value })
                    }
                    placeholder="Neighborhood"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Property type</Label>
                  <Input
                    value={form.propertyType}
                    onChange={(e) =>
                      setForm({ ...form, propertyType: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Budget min</Label>
                  <Input
                    type="number"
                    value={form.budgetMin}
                    onChange={(e) =>
                      setForm({ ...form, budgetMin: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Budget max</Label>
                  <Input
                    type="number"
                    value={form.budgetMax}
                    onChange={(e) =>
                      setForm({ ...form, budgetMax: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Preferences</Label>
                  <Textarea
                    value={form.preferences}
                    onChange={(e) =>
                      setForm({ ...form, preferences: e.target.value })
                    }
                    placeholder="Beds, views, schools, ADU…"
                  />
                </div>
              </div>
              {formError && (
                <p
                  className="text-sm text-[var(--color-danger)]"
                  role="alert"
                >
                  {formError}
                </p>
              )}
              <DialogFooter>
                <Button
                  variant="secondary"
                  className="min-h-[44px]"
                  onClick={() => {
                    setFormError(null);
                    setOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button className="min-h-[44px]" onClick={createLead}>
                  Create lead
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
          <Input
            className="pl-9"
            placeholder="Search leads…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={heatFilter} onValueChange={setHeatFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <Filter className="h-4 w-4 opacity-50" />
            <SelectValue placeholder="Heat" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All heat</SelectItem>
            <SelectItem value="hot">Hot</SelectItem>
            <SelectItem value="warm">Warm</SelectItem>
            <SelectItem value="cold">Cold</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>
                Active leads{" "}
                <span className="text-[var(--color-fg-subtle)] font-normal">
                  ({filtered.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {filtered.length === 0 && (
                <p className="py-8 text-center text-sm text-[var(--color-fg-muted)]">
                  No leads match your filters.
                </p>
              )}
              {filtered.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  active={selected?.id === lead.id}
                  onSelect={() => setSelectedId(lead.id)}
                  onCall={() => {
                    touchLead(lead.id);
                    toast.success(`Call logged · ${lead.phone}`);
                  }}
                  onMail={() => {
                    touchLead(lead.id);
                    toast.success(`Email drafted to ${lead.email}`);
                  }}
                  onMsg={() => {
                    touchLead(lead.id);
                    toast.success(`SMS queued for ${lead.name}`);
                  }}
                />
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>AI insights</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {selected && selected.score >= 88 && (
                <Insight
                  tone="success"
                  title="High-value opportunity"
                  body={`${selected.name} shows ${selected.score}% conversion signal. Prioritize a showing this week.`}
                />
              )}
              {staleCount > 0 && (
                <Insight
                  tone="primary"
                  title="Follow-up needed"
                  body={`${staleCount} lead${staleCount === 1 ? "" : "s"} haven't been contacted in 5+ days.`}
                />
              )}
              <Insight
                tone="accent"
                title="Market signal"
                body="ADU interest up ~40% this month — surface conversion-ready homes to warm buyers."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full justify-start" onClick={scheduleFollowups}>
                <Calendar className="h-4 w-4" />
                Schedule follow-ups
              </Button>
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={sendNurture}
                disabled={!selected}
              >
                <MessageSquare className="h-4 w-4" />
                Send AI nurture
              </Button>
              <Button
                className="w-full justify-start"
                variant="outline"
                onClick={() => {
                  toast.success("Lead report exported (demo)");
                  pushActivity({
                    type: "lead",
                    title: "Lead report generated",
                    description: `Portfolio report · ${leads.length} leads · avg score ${Math.round(leads.reduce((s, l) => s + l.score, 0) / Math.max(1, leads.length))}`,
                    badge: "Report",
                  });
                }}
              >
                <TrendingUp className="h-4 w-4" />
                Generate report
              </Button>
            </CardContent>
          </Card>

          {selected && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{selected.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  {heatBadge(selected.heat)}
                  <Badge variant="secondary" className="capitalize">
                    {selected.status.replace("_", " ")}
                  </Badge>
                </div>
                <p className="text-[var(--color-fg-muted)]">{selected.notes}</p>
                <div className="space-y-1 text-[var(--color-fg-subtle)]">
                  <p>{selected.email}</p>
                  <p>{selected.phone}</p>
                  <p>
                    Budget {formatCurrency(selected.budgetMin)} –{" "}
                    {formatCurrency(selected.budgetMax)}
                  </p>
                </div>
                <Select
                  value={selected.status}
                  onValueChange={(v) =>
                    updateLead(selected.id, { status: v as LeadStatus })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      [
                        "new",
                        "contacted",
                        "qualified",
                        "proposal",
                        "negotiation",
                        "closed_won",
                        "closed_lost",
                      ] as LeadStatus[]
                    ).map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="danger"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    deleteLead(selected.id);
                    setSelectedId(null);
                    toast.message("Lead removed");
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete lead
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function LeadRow({
  lead,
  active,
  onSelect,
  onCall,
  onMail,
  onMsg,
}: {
  lead: Lead;
  active: boolean;
  onSelect: () => void;
  onCall: () => void;
  onMail: () => void;
  onMsg: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
      className={cn(
        "cursor-pointer rounded-[var(--radius-lg)] border p-4 transition-[border-color,background-color] duration-150",
        active
          ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]/40"
          : "border-[var(--color-border)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-elevated)]",
      )}
    >
      <div className="flex gap-3">
        <Avatar>
          <AvatarFallback>{initials(lead.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-[var(--color-fg)]">{lead.name}</h3>
            {heatBadge(lead.heat)}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--color-fg-muted)]">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {lead.location}
            </span>
            <span>
              {formatCurrency(lead.budgetMin, true)} –{" "}
              {formatCurrency(lead.budgetMax, true)}
            </span>
          </div>
          <p className="mt-2 text-sm text-[var(--color-fg-muted)] line-clamp-2">
            {lead.notes}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-[var(--color-fg-subtle)]">
              Last contact <RelativeTime iso={lead.lastContact} />
            </span>
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              <Button
                size="icon-sm"
                variant="outline"
                className="min-h-[44px] min-w-[44px]"
                onClick={onCall}
                aria-label="Call"
                disabled={!lead.phone || lead.phone === "—"}
              >
                <Phone className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon-sm"
                variant="outline"
                className="min-h-[44px] min-w-[44px]"
                onClick={onMail}
                aria-label="Email"
                disabled={!lead.email || lead.email === "—"}
              >
                <Mail className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon-sm"
                variant="outline"
                className="min-h-[44px] min-w-[44px]"
                onClick={onMsg}
                aria-label="Message"
                disabled={!lead.phone || lead.phone === "—"}
              >
                <MessageSquare className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
        <div
          className={cn(
            "inline-flex h-fit items-center gap-1 rounded-full px-2 py-1 text-xs font-medium tabular",
            scoreTone(lead.score),
          )}
        >
          <Star className="h-3 w-3" />
          {lead.score}
        </div>
      </div>
    </div>
  );
}

function Insight({
  title,
  body,
  tone,
}: {
  title: string;
  body: string;
  tone: "success" | "primary" | "accent";
}) {
  const styles = {
    success:
      "bg-[var(--color-success-soft)] border-[color-mix(in_oklab,var(--color-success)_25%,transparent)] text-[var(--color-success)]",
    primary:
      "bg-[var(--color-primary-soft)] border-[color-mix(in_oklab,var(--color-primary)_25%,transparent)] text-[var(--color-primary)]",
    accent:
      "bg-[var(--color-accent-soft)] border-[color-mix(in_oklab,var(--color-accent)_25%,transparent)] text-[var(--color-accent)]",
  };
  return (
    <div className={cn("rounded-[var(--radius-md)] border p-3", styles[tone])}>
      <h4 className="text-sm font-medium">{title}</h4>
      <p className="mt-1 text-xs opacity-90 leading-relaxed text-[var(--color-fg-muted)]">
        {body}
      </p>
    </div>
  );
}
