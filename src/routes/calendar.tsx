import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  Calendar as CalendarIcon,
  Check,
  Clock,
  Link2,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  Unlink,
  User,
  Wrench,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  APPOINTMENT_KIND_LABEL,
  CALENDAR_PROVIDERS,
  appointmentsNeedingAttention,
  flattenReminders,
  formatApptWhen,
  type AppointmentKind,
  type CalendarProviderId,
} from "@/lib/calendar";
import {
  CONTRACTOR_CATEGORIES,
  commonlyUsedContractors,
  contractorCategoryLabel,
  groupContractorsByCategory,
  type Contractor,
  type ContractorCategory,
} from "@/lib/contractors";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  component: CalendarPage,
});

function CalendarPage() {
  const profile = useAppStore((s) => s.agentProfile);
  const connections = useAppStore((s) => s.calendarConnections);
  const appointments = useAppStore((s) => s.appointments);
  const contractors = useAppStore((s) => s.contractors);
  const connectCalendar = useAppStore((s) => s.connectCalendar);
  const disconnectCalendar = useAppStore((s) => s.disconnectCalendar);
  const syncCalendars = useAppStore((s) => s.syncCalendars);
  const setAppointmentStatus = useAppStore((s) => s.setAppointmentStatus);
  const deleteAppointment = useAppStore((s) => s.deleteAppointment);
  const addContractor = useAppStore((s) => s.addContractor);
  const useContractor = useAppStore((s) => s.useContractor);
  const toggleContractorCommon = useAppStore((s) => s.toggleContractorCommon);
  const archiveContractor = useAppStore((s) => s.archiveContractor);
  const updateContractor = useAppStore((s) => s.updateContractor);

  const [emailDraft, setEmailDraft] = useState<Record<string, string>>({});
  const [catFilter, setCatFilter] = useState<
    ContractorCategory | "all" | "common"
  >("common");
  const [showAdd, setShowAdd] = useState(false);
  const [newCtr, setNewCtr] = useState({
    name: "",
    company: "",
    category: "termite" as ContractorCategory,
    phone: "",
    email: "",
    serviceArea: profile?.areaOfOperations ?? "",
    notes: "",
    rating: 5,
    common: true,
  });

  const upcoming = useMemo(
    () => appointmentsNeedingAttention(appointments, 120),
    [appointments],
  );
  const reminders = useMemo(
    () => flattenReminders(appointments),
    [appointments],
  );
  const commonList = useMemo(
    () => commonlyUsedContractors(contractors),
    [contractors],
  );
  const grouped = useMemo(
    () => groupContractorsByCategory(contractors),
    [contractors],
  );
  const archivedByCategory = useMemo(() => {
    return CONTRACTOR_CATEGORIES.map((cat) => ({
      ...cat,
      items: contractors.filter((c) => !c.active && c.category === cat.id),
    })).filter((g) => g.items.length > 0);
  }, [contractors]);

  const filteredContractors = useMemo(() => {
    if (catFilter === "common") return commonList;
    if (catFilter === "all")
      return contractors
        .filter((c) => c.active)
        .sort((a, b) => b.useCount - a.useCount);
    return contractors
      .filter((c) => c.active && c.category === catFilter)
      .sort((a, b) => b.useCount - a.useCount);
  }, [catFilter, commonList, contractors]);

  const connectedCount = connections.filter((c) => c.connected).length;

  const connect = (id: CalendarProviderId) => {
    const email =
      emailDraft[id] ||
      (profile?.website
        ? `calendar@${profile.website.replace(/^https?:\/\//, "").split("/")[0]}`
        : undefined);
    connectCalendar(id, email);
    toast.success(
      `${CALENDAR_PROVIDERS.find((p) => p.id === id)?.label} connected`,
    );
  };

  const onSync = () => {
    if (!connectedCount) {
      toast.message("Connect at least one calendar first");
      return;
    }
    syncCalendars();
    toast.success("Appointments refreshed from connected calendars");
  };

  const markUsed = (id: string, company: string) => {
    useContractor(id);
    toast.success(`Logged use · ${company} stays on Common list`);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="relative overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(ellipse 50% 70% at 10% 0%, color-mix(in oklab, var(--color-primary) 14%, transparent), transparent 55%), radial-gradient(ellipse 40% 50% at 100% 100%, color-mix(in oklab, var(--color-accent) 10%, transparent), transparent 50%)",
          }}
        />
        <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7">
          <div className="max-w-2xl">
            <div className="flex flex-wrap gap-2">
              <Badge variant="accent">
                <CalendarIcon className="h-3 w-3" />
                Calendar hub
              </Badge>
              <Badge variant="secondary">{connectedCount} connected</Badge>
              <Badge variant="secondary">{upcoming.length} upcoming</Badge>
            </div>
            <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Calendars, AI reminders & vendors
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-fg-muted)]">
              Connect Google, Apple/iOS, Outlook, or CalDAV. Import real estate
              appointments so the AI surfaces prep reminders. Keep termite,
              inspection, electrician, and other vendors under category
              headings — with a Commonly Used list that persists.
            </p>
          </div>
          <Button onClick={onSync} className="shrink-0">
            <RefreshCw className="h-4 w-4" />
            Sync calendars
          </Button>
        </div>
      </div>

      <Tabs defaultValue="appointments">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="reminders">
            AI reminders
            {reminders.length > 0 && (
              <span className="ml-1.5 rounded-full bg-[var(--color-primary-soft)] px-1.5 text-[10px] text-[var(--color-primary)]">
                {reminders.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="connect">Connect</TabsTrigger>
          <TabsTrigger value="contractors">Contractors</TabsTrigger>
        </TabsList>

        <TabsContent value="connect" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {CALENDAR_PROVIDERS.map((p) => {
              const conn = connections.find((c) => c.id === p.id);
              const connected = conn?.connected;
              return (
                <Card key={p.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] text-xs font-bold text-white"
                          style={{ background: p.color }}
                        >
                          {p.short.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <CardTitle className="text-base">{p.label}</CardTitle>
                          <CardDescription className="text-xs">
                            {p.blurb}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant={connected ? "success" : "secondary"}>
                        {connected ? "Connected" : "Off"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!connected ? (
                      <>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Account email</Label>
                          <Input
                            value={emailDraft[p.id] ?? ""}
                            onChange={(e) =>
                              setEmailDraft((d) => ({
                                ...d,
                                [p.id]: e.target.value,
                              }))
                            }
                            placeholder={`${p.id}@yourbrokerage.com`}
                          />
                        </div>
                        <Button
                          className="w-full"
                          onClick={() => connect(p.id)}
                        >
                          <Link2 className="h-4 w-4" />
                          Connect & import
                        </Button>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-[var(--color-fg-muted)]">
                          {conn?.accountEmail}
                          {conn?.lastSyncAt
                            ? ` · synced ${formatApptWhen(conn.lastSyncAt)}`
                            : ""}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={onSync}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Sync now
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              disconnectCalendar(p.id);
                              toast.message(`${p.label} disconnected`);
                            }}
                          >
                            <Unlink className="h-3.5 w-3.5" />
                            Disconnect
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <p className="text-xs text-[var(--color-fg-subtle)]">
            Demo mode simulates OAuth + pull. Connected calendars import
            showings, inspections, listing appointments, closings, and
            contractor visits with AI-extracted reminders.
          </p>
        </TabsContent>

        <TabsContent value="appointments" className="space-y-3">
          {!connectedCount && appointments.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-start gap-3 py-8 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium">No calendars connected yet</div>
                  <p className="text-sm text-[var(--color-fg-muted)]">
                    Connect Google, Apple, or Outlook to pull real estate
                    appointments.
                  </p>
                </div>
                <Button
                  onClick={() => {
                    connect("google");
                    toast.success("Google Calendar connected");
                  }}
                >
                  Quick-connect Google
                </Button>
              </CardContent>
            </Card>
          )}

          {upcoming.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {APPOINTMENT_KIND_LABEL[a.kind as AppointmentKind]}
                    </Badge>
                    <Badge
                      variant={
                        a.status === "needs_prep"
                          ? "warning"
                          : a.status === "confirmed"
                            ? "success"
                            : "secondary"
                      }
                    >
                      {a.status.replace("_", " ")}
                    </Badge>
                    <span className="text-[10px] uppercase tracking-wide text-[var(--color-fg-subtle)]">
                      {a.source}
                    </span>
                  </div>
                  <div className="font-medium text-[var(--color-fg)]">
                    {a.title}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-fg-muted)]">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatApptWhen(a.start)}
                    </span>
                    {a.location && <span>{a.location}</span>}
                    {a.clientName && (
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {a.clientName}
                      </span>
                    )}
                    {a.propertyLabel && <span>{a.propertyLabel}</span>}
                  </div>
                  {a.reminders.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-[var(--color-fg-muted)]">
                      {a.reminders.map((r) => (
                        <li key={r} className="flex gap-1.5">
                          <Bell className="mt-0.5 h-3 w-3 shrink-0 text-[var(--color-primary)]" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {a.status !== "completed" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setAppointmentStatus(a.id, "completed");
                        toast.success("Marked complete");
                      }}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Done
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      deleteAppointment(a.id);
                      toast.message("Removed from hub");
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {appointments.length > 0 && upcoming.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--color-fg-muted)]">
              No appointments in the next few days. Sync again or add from your
              calendar.
            </p>
          )}
        </TabsContent>

        <TabsContent value="reminders" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bell className="h-4 w-4 text-[var(--color-primary)]" />
                AI picked these up from your calendar
              </CardTitle>
              <CardDescription>
                Prep tasks extracted from imported appointments — ask the
                assistant “what’s on my calendar?” anytime
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {reminders.length === 0 ? (
                <p className="text-sm text-[var(--color-fg-muted)]">
                  Connect a calendar and sync to load reminders.
                </p>
              ) : (
                reminders.map((r, i) => (
                  <div
                    key={`${r.appointmentId}-${i}`}
                    className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-[var(--color-fg-subtle)]">
                      <span>{formatApptWhen(r.when)}</span>
                      <span>·</span>
                      <span>{APPOINTMENT_KIND_LABEL[r.kind]}</span>
                      <span>·</span>
                      <span className="truncate">{r.title}</span>
                    </div>
                    <div className="mt-1 text-sm text-[var(--color-fg)]">
                      {r.reminder}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contractors" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">
                Contractor directory
              </h2>
              <p className="text-sm text-[var(--color-fg-muted)]">
                Grouped by trade (termite, inspection, electrician…). Commonly
                Used list is retained and grows as you log usage.
              </p>
            </div>
            <Button onClick={() => setShowAdd((v) => !v)}>
              <Plus className="h-4 w-4" />
              Add contractor
            </Button>
          </div>

          {showAdd && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">New vendor</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Contact name</Label>
                  <Input
                    value={newCtr.name}
                    onChange={(e) =>
                      setNewCtr((s) => ({ ...s, name: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Company</Label>
                  <Input
                    value={newCtr.company}
                    onChange={(e) =>
                      setNewCtr((s) => ({ ...s, company: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <select
                    className="flex h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-sm"
                    value={newCtr.category}
                    onChange={(e) =>
                      setNewCtr((s) => ({
                        ...s,
                        category: e.target.value as ContractorCategory,
                      }))
                    }
                  >
                    {CONTRACTOR_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input
                    value={newCtr.phone}
                    onChange={(e) =>
                      setNewCtr((s) => ({ ...s, phone: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input
                    value={newCtr.email}
                    onChange={(e) =>
                      setNewCtr((s) => ({ ...s, email: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Service area</Label>
                  <Input
                    value={newCtr.serviceArea}
                    onChange={(e) =>
                      setNewCtr((s) => ({ ...s, serviceArea: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Notes</Label>
                  <Input
                    value={newCtr.notes}
                    onChange={(e) =>
                      setNewCtr((s) => ({ ...s, notes: e.target.value }))
                    }
                    placeholder="Gate codes, specialties, pricing notes…"
                  />
                </div>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Button
                    onClick={() => {
                      if (!newCtr.name.trim() || !newCtr.company.trim()) {
                        toast.message("Name and company required");
                        return;
                      }
                      addContractor(newCtr);
                      setShowAdd(false);
                      setNewCtr({
                        name: "",
                        company: "",
                        category: "termite",
                        phone: "",
                        email: "",
                        serviceArea: profile?.areaOfOperations ?? "",
                        notes: "",
                        rating: 5,
                        common: true,
                      });
                      toast.success("Contractor saved under category");
                    }}
                  >
                    Save contractor
                  </Button>
                  <Button variant="ghost" onClick={() => setShowAdd(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-1.5">
            <FilterChip
              active={catFilter === "common"}
              onClick={() => setCatFilter("common")}
              label={`Commonly used (${commonList.length})`}
            />
            <FilterChip
              active={catFilter === "all"}
              onClick={() => setCatFilter("all")}
              label="All by category"
            />
            {CONTRACTOR_CATEGORIES.map((c) => {
              const n = contractors.filter(
                (x) => x.active && x.category === c.id,
              ).length;
              if (!n) return null;
              return (
                <FilterChip
                  key={c.id}
                  active={catFilter === c.id}
                  onClick={() => setCatFilter(c.id)}
                  label={`${c.short} (${n})`}
                />
              );
            })}
          </div>

          {catFilter === "common" && (
            <Card className="border-[color-mix(in_oklab,var(--color-primary)_25%,var(--color-border))]">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Star className="h-4 w-4 text-[var(--color-accent)]" />
                  Commonly used list
                </CardTitle>
                <CardDescription>
                  Pinned favorites + high-use vendors. Archive removes from
                  active use but keeps them under their trade heading.
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          {catFilter === "all" ? (
            <div className="space-y-6">
              {grouped.map((g) => (
                <section key={g.category} className="space-y-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-fg)]">
                    <Wrench className="h-3.5 w-3.5 text-[var(--color-primary)]" />
                    {g.label}
                    <span className="font-normal text-[var(--color-fg-subtle)]">
                      ({g.items.length})
                    </span>
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {g.items.map((c) => (
                      <ContractorCard
                        key={c.id}
                        c={c}
                        onUse={() => markUsed(c.id, c.company)}
                        onToggleCommon={() => toggleContractorCommon(c.id)}
                        onArchive={() => {
                          archiveContractor(c.id);
                          toast.message(
                            "Archived — retained under category heading",
                          );
                        }}
                        onRestore={() =>
                          updateContractor(c.id, { active: true })
                        }
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {filteredContractors.map((c) => (
                <ContractorCard
                  key={c.id}
                  c={c}
                  onUse={() => markUsed(c.id, c.company)}
                  onToggleCommon={() => toggleContractorCommon(c.id)}
                  onArchive={() => {
                    archiveContractor(c.id);
                    toast.message("Archived — retained under category heading");
                  }}
                  onRestore={() => updateContractor(c.id, { active: true })}
                />
              ))}
              {!filteredContractors.length && (
                <p className="col-span-full py-8 text-center text-sm text-[var(--color-fg-muted)]">
                  No contractors in this view yet.
                </p>
              )}
            </div>
          )}

          {archivedByCategory.length > 0 && (
            <section className="space-y-4 border-t border-[var(--color-border)] pt-4">
              <h3 className="text-sm font-semibold text-[var(--color-fg-muted)]">
                Archived (retained by category)
              </h3>
              {archivedByCategory.map((g) => (
                <div key={g.id} className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-fg-subtle)]">
                    {g.label}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {g.items.map((c) => (
                      <ContractorCard
                        key={c.id}
                        c={c}
                        onUse={() => markUsed(c.id, c.company)}
                        onToggleCommon={() => toggleContractorCommon(c.id)}
                        onArchive={() => {}}
                        onRestore={() => {
                          updateContractor(c.id, { active: true });
                          toast.success("Restored to active directory");
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
        active
          ? "border-[color-mix(in_oklab,var(--color-primary)_40%,var(--color-border))] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
          : "border-[var(--color-border)] text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]",
      )}
    >
      {label}
    </button>
  );
}

function ContractorCard({
  c,
  onUse,
  onToggleCommon,
  onArchive,
  onRestore,
}: {
  c: Contractor;
  onUse: () => void;
  onToggleCommon: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  return (
    <Card className={cn(!c.active && "opacity-70")}>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px]">
                {contractorCategoryLabel(c.category)}
              </Badge>
              {c.common && (
                <Badge variant="accent" className="text-[10px]">
                  <Star className="h-2.5 w-2.5" />
                  Common
                </Badge>
              )}
              {!c.active && (
                <Badge variant="secondary" className="text-[10px]">
                  Archived
                </Badge>
              )}
            </div>
            <div className="mt-1 font-medium text-[var(--color-fg)]">
              {c.company}
            </div>
            <div className="text-xs text-[var(--color-fg-muted)]">
              {c.name} · ★ {c.rating} · used {c.useCount}×
            </div>
          </div>
        </div>
        <div className="text-xs text-[var(--color-fg-muted)]">
          {c.phone} · {c.email}
        </div>
        <div className="text-xs text-[var(--color-fg-subtle)]">
          {c.serviceArea}
        </div>
        {c.notes && (
          <p className="text-xs leading-relaxed text-[var(--color-fg-muted)]">
            {c.notes}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {c.active ? (
            <>
              <Button size="sm" variant="secondary" onClick={onUse}>
                Log use
              </Button>
              <Button size="sm" variant="outline" onClick={onToggleCommon}>
                {c.common ? "Unpin" : "Pin common"}
              </Button>
              <Button size="sm" variant="ghost" onClick={onArchive}>
                Archive
              </Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" onClick={onRestore}>
              Restore
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
