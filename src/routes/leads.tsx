import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Calendar,
  CalendarClock,
  Filter,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  Search,
  Star,
  Trash2,
  Users,
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
import { initials, cn } from "@/lib/utils";
import type { Lead, LeadHeat, LeadSource, LeadStatus } from "@/data/seed";
import { pickFollowUpLeads } from "@/lib/lead-follow-up";
import { leadBudgetText, leadLocation, leadNotes, parseLeadBudget } from "@/lib/lead-facts";

export const Route = createFileRoute("/leads")({
  component: LeadsPage,
});

function heatBadge(heat: LeadHeat) {
  if (heat === "hot") return <Badge variant="hot">Hot</Badge>;
  if (heat === "warm") return <Badge variant="warm">Warm</Badge>;
  return <Badge variant="cold">Cold</Badge>;
}

/** The add-lead form before anything is typed. Budget and property type start blank. */
const EMPTY_LEAD_FORM = {
  name: "",
  email: "",
  phone: "",
  location: "",
  budgetMin: "",
  budgetMax: "",
  propertyType: "",
  preferences: "",
  notes: "",
  source: "website" as LeadSource,
  status: "new" as LeadStatus,
};

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

  const [form, setForm] = useState(EMPTY_LEAD_FORM);

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
    const budget = parseLeadBudget(form.budgetMin, form.budgetMax);
    if (!budget.ok) {
      setFormError(budget.error);
      return;
    }
    setFormError(null);
    // Only what was typed is saved. A blank stays blank; nothing stands in for it.
    const lead = addLead({
      name: form.name.trim(),
      email: form.email.trim() || "—",
      phone: form.phone.trim() || "—",
      location: form.location.trim(),
      budgetMin: budget.value.budgetMin,
      budgetMax: budget.value.budgetMax,
      status: form.status,
      source: form.source,
      propertyType: form.propertyType.trim(),
      preferences: form.preferences.trim(),
      notes: form.notes.trim(),
      lastContact: new Date().toISOString(),
      tags: ["new"],
    });
    setSelectedId(lead.id);
    setOpen(false);
    setForm(EMPTY_LEAD_FORM);
    toast.success(`${lead.name} added · score ${lead.score}`);
  };

  const followUpTargets = pickFollowUpLeads(leads);
  const filtersActive = search.trim() !== "" || heatFilter !== "all";

  const scheduleFollowups = () => {
    const targets = followUpTargets;
    if (!targets.length) return;
    targets.forEach((l) =>
      updateLead(l.id, {
        nextFollowUp: new Date(Date.now() + 86400000).toISOString(),
      }),
    );
    pushActivity({
      type: "lead",
      title: "Follow-up dates set",
      description: `Next follow-up set to tomorrow for ${targets.length} priority leads (rule: highest score first)`,
      badge: "Follow-up",
    });
    toast.success(
      `Follow-up set for tomorrow on ${targets.length} ${targets.length === 1 ? "lead" : "leads"}. Nothing was sent to them.`,
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Lead Intelligence
          </h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Your clients and prospects, ranked by a points score so you know who to call first.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            className="min-h-[44px]"
            onClick={scheduleFollowups}
            disabled={!followUpTargets.length}
            title="Sets tomorrow as the next follow-up for your five highest-scoring warm and hot leads"
          >
            <CalendarClock aria-hidden="true" className="h-4 w-4" />
            Set follow-ups for tomorrow
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="min-h-[44px]">
                <Plus aria-hidden="true" className="h-4 w-4" />
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
                  <Label htmlFor="lead-location">Location</Label>
                  <Input
                    id="lead-location"
                    value={form.location}
                    onChange={(e) =>
                      setForm({ ...form, location: e.target.value })
                    }
                    placeholder="Neighborhood"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-property-type">Property type</Label>
                  <Input
                    id="lead-property-type"
                    value={form.propertyType}
                    onChange={(e) =>
                      setForm({ ...form, propertyType: e.target.value })
                    }
                    placeholder="House, condo, land…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-budget-min">Lowest budget ($)</Label>
                  <Input
                    id="lead-budget-min"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={form.budgetMin}
                    onChange={(e) => {
                      setForm({ ...form, budgetMin: e.target.value });
                      setFormError(null);
                    }}
                    aria-describedby="lead-budget-hint"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lead-budget-max">Highest budget ($)</Label>
                  <Input
                    id="lead-budget-max"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={form.budgetMax}
                    onChange={(e) => {
                      setForm({ ...form, budgetMax: e.target.value });
                      setFormError(null);
                    }}
                    aria-describedby="lead-budget-hint"
                  />
                </div>
                <p
                  id="lead-budget-hint"
                  className="text-xs text-[var(--color-fg-subtle)] sm:col-span-2"
                >
                  Leave the budget blank if you don't know it yet.
                </p>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="lead-preferences">Preferences</Label>
                  <Textarea
                    id="lead-preferences"
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
                  Add lead
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
              {filtered.length === 0 &&
                (leads.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                      <Users aria-hidden="true" className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--color-fg)]">No leads yet</p>
                      <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--color-fg-muted)]">
                        Add your first client or prospect. They'll be scored and ranked here, and
                        show up in your Command Center priorities.
                      </p>
                    </div>
                    <Button className="min-h-[44px]" onClick={() => setOpen(true)}>
                      <Plus aria-hidden="true" className="h-4 w-4" />
                      Add your first lead
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <p className="text-sm text-[var(--color-fg-muted)]">
                      No leads match {filtersActive ? "this search or filter" : "yet"}.
                    </p>
                    {filtersActive && (
                      <Button
                        variant="secondary"
                        className="min-h-[44px]"
                        onClick={() => {
                          setSearch("");
                          setHeatFilter("all");
                        }}
                      >
                        Clear search and filter
                      </Button>
                    )}
                  </div>
                ))}
              {filtered.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  active={selected?.id === lead.id}
                  onSelect={() => setSelectedId(lead.id)}
                  onCall={() => {
                    if (typeof window !== "undefined" && lead.phone) window.location.href = `tel:${lead.phone.replace(/[^\d+]/g, "")}`;
                    touchLead(lead.id);
                    toast.message(`Logged a contact touch for ${lead.name}. Calls happen on your phone; nothing was dialed by the app.`);
                  }}
                  onMail={() => {
                    if (typeof window !== "undefined" && lead.email) window.location.href = `mailto:${lead.email}`;
                    touchLead(lead.id);
                    toast.message(`Opened your mail app for ${lead.email}. Logged a contact touch.`);
                  }}
                  onMsg={() => {
                    if (typeof window !== "undefined" && lead.phone) window.location.href = `sms:${lead.phone.replace(/[^\d+]/g, "")}`;
                    touchLead(lead.id);
                    toast.message(`Opened your messaging app for ${lead.name}. Logged a contact touch.`);
                  }}
                />
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Flags from your records</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {selected && selected.score >= 88 && (
                <Insight
                  tone="success"
                  title="Strong lead"
                  body={`${selected.name} scores ${selected.score} out of 100. Consider offering a showing this week.`}
                />
              )}
              {staleCount > 0 && (
                <Insight
                  tone="primary"
                  title="Follow-up needed"
                  body={`${staleCount} ${staleCount === 1 ? "lead hasn't" : "leads haven't"} been contacted in 5 or more days.`}
                />
              )}
              {!(selected && selected.score >= 88) && staleCount === 0 && (
                <p className="text-sm text-[var(--color-fg-muted)]">
                  {leads.length === 0
                    ? "Flags appear here once you have leads. They come only from your own records."
                    : // Only what the check proves. "Last contact" starts at the moment a
                      // lead is added, so this cannot claim anyone was contacted.
                      "No overdue follow-ups. A lead is flagged here after 5 days with no contact logged."}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                className="min-h-[44px] w-full justify-start"
                onClick={scheduleFollowups}
                disabled={!followUpTargets.length}
              >
                <Calendar aria-hidden="true" className="h-4 w-4" />
                Set follow-ups for tomorrow
              </Button>
              {selected ? (
                <Button asChild className="min-h-[44px] w-full justify-start" variant="outline">
                  <Link to="/outreach" search={{ lead: selected.id, mode: "nurture" }}>
                    <MessageSquare aria-hidden="true" className="h-4 w-4" />
                    <span className="truncate">Draft follow-ups for {selected.name.split(" ")[0]}</span>
                  </Link>
                </Button>
              ) : (
                <Button className="min-h-[44px] w-full justify-start" variant="outline" disabled>
                  <MessageSquare aria-hidden="true" className="h-4 w-4" />
                  Draft follow-up messages
                </Button>
              )}
              <p className="text-xs text-[var(--color-fg-subtle)]">
                {leads.length === 0
                  ? "Add a lead to use these."
                  : "Drafts open in Instant Response for you to copy. Nothing is sent automatically."}
              </p>
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
                {leadNotes(selected) && (
                  <p className="text-[var(--color-fg-muted)]">{leadNotes(selected)}</p>
                )}
                <div className="space-y-1 text-[var(--color-fg-subtle)]">
                  <p>{selected.email}</p>
                  <p>{selected.phone}</p>
                  <p>
                    {leadBudgetText(selected)
                      ? `Budget ${leadBudgetText(selected)}`
                      : "No budget entered"}
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
  // Each of these is blank for a lead saved with only a name and a phone number.
  const location = leadLocation(lead);
  const budget = leadBudgetText(lead, true);
  const notes = leadNotes(lead);
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
          {(location || budget) && (
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--color-fg-muted)]">
              {location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin aria-hidden="true" className="h-3 w-3" />
                  {location}
                </span>
              )}
              {budget && <span>{budget}</span>}
            </div>
          )}
          {notes && (
            <p className="mt-2 text-sm text-[var(--color-fg-muted)] line-clamp-2">{notes}</p>
          )}
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
