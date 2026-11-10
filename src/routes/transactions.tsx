import { ComplianceSandboxPanel } from "@/components/compliance-ledger/sandbox-panel";
import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  PenTool,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RelativeTime } from "@/components/relative-time";
import { useAppStore } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";
import type { Deal } from "@/data/seed";
import {
  DEAL_STAGES,
  DEAL_STAGE_LABEL as STAGE_LABEL,
  EMPTY_DEAL_FORM,
  dealFields,
  dealFormFrom,
  parseDealForm,
  type DealForm,
} from "@/lib/book-entry";

export const Route = createFileRoute("/transactions")({
  component: TransactionsPage,
});

/** Matches the native selects on Calendar & Vendors. */
const SELECT_CLASS =
  "h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-sm text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]";

function TransactionsPage() {
  const deals = useAppStore((s) => s.deals);
  const addDeal = useAppStore((s) => s.addDeal);
  const updateDeal = useAppStore((s) => s.updateDeal);
  const advanceDeal = useAppStore((s) => s.advanceDeal);
  const deleteDeal = useAppStore((s) => s.deleteDeal);
  const [selectedDealId, setSelectedDealId] = useState(deals[0]?.id ?? "");
  const deal = deals.find((d) => d.id === selectedDealId) ?? deals[0];

  // One dialog adds and edits. `editing` is the deal being changed, or null to add.
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Deal | null>(null);
  const [form, setForm] = useState<DealForm>(EMPTY_DEAL_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Deal | null>(null);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_DEAL_FORM);
    setFormError(null);
    setFormOpen(true);
  };
  const openEdit = (target: Deal) => {
    setEditing(target);
    setForm(dealFormFrom(target));
    setFormError(null);
    setFormOpen(true);
  };
  const setField = (field: keyof DealForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFormError(null);
  };
  const submitDeal = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseDealForm(form);
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }
    if (editing) {
      updateDeal(editing.id, dealFields(parsed.value));
      toast.success("Deal updated");
    } else {
      const created = addDeal(parsed.value);
      setSelectedDealId(created.id);
      toast.success("Deal saved on this device");
    }
    setFormOpen(false);
  };
  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteDeal(deleteTarget.id);
    setDeleteTarget(null);
    toast.message("Deal deleted");
  };
  // E-signature rows exist only for documents already marked on a deal.
  const hasSignatureRows = deals.some((d) =>
    d.documents.some((doc) => ["reviewed", "signed", "issue"].includes(doc.status)),
  );

  // Document upload, AI review, and e-signature are not connected in this
  // release. The buttons say so instead of inventing a result (ledger A-022).
  const notConnected = (feature: string) =>
    toast.message(`${feature} is not connected in this release. Track the milestone here; keep documents in your transaction platform.`);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Transaction Hub
          </h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Track each deal's milestones by hand. Document review and e-signature aren't connected yet.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:flex-nowrap">
          <Badge variant="secondary">
            <Clock aria-hidden="true" className="h-3 w-3" />
            Manual tracking
          </Badge>
          <Badge variant="secondary">Saved on this device</Badge>
          <Button className="min-h-[44px]" onClick={openAdd}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            Add deal
          </Button>
        </div>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit deal" : "Add deal"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Change any detail, including the stage."
                : "Enter the property, the client and the price."}{" "}
              Deals are saved on this device only.
            </DialogDescription>
          </DialogHeader>
          <form noValidate onSubmit={submitDeal} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="deal-property">Property</Label>
              <Input
                id="deal-property"
                value={form.propertyTitle}
                onChange={(event) => setField("propertyTitle", event.target.value)}
                placeholder="Address or listing name"
                maxLength={200}
                required
                aria-required="true"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="deal-client">Client name</Label>
              <Input
                id="deal-client"
                value={form.clientName}
                onChange={(event) => setField("clientName", event.target.value)}
                maxLength={200}
                autoComplete="off"
                required
                aria-required="true"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deal-price">Price ($)</Label>
              <Input
                id="deal-price"
                type="number"
                inputMode="numeric"
                min={1}
                value={form.value}
                onChange={(event) => setField("value", event.target.value)}
                required
                aria-required="true"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deal-stage">Stage</Label>
              {/* No stage is pre-selected: a deal is never saved with one nobody chose. */}
              <select
                id="deal-stage"
                className={SELECT_CLASS}
                value={form.stage}
                onChange={(event) => setField("stage", event.target.value)}
                required
                aria-required="true"
              >
                <option value="">Choose a stage</option>
                {DEAL_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {STAGE_LABEL[stage]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="deal-closing-date">Closing date (optional)</Label>
              <Input
                id="deal-closing-date"
                type="date"
                value={form.closingDate}
                onChange={(event) => setField("closingDate", event.target.value)}
              />
            </div>
            {formError && (
              <p className="text-sm text-[var(--color-danger)] sm:col-span-2" role="alert">
                {formError}
              </p>
            )}
            <DialogFooter className="sm:col-span-2">
              <Button
                type="button"
                variant="secondary"
                className="min-h-[44px]"
                onClick={() => setFormOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="min-h-[44px]">
                {editing ? "Save changes" : "Add deal"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this deal?</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `${deleteTarget.propertyTitle} for ${deleteTarget.clientName} will be removed from Transaction Hub. This can't be undone.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              className="min-h-[44px]"
              onClick={() => setDeleteTarget(null)}
            >
              Keep deal
            </Button>
            <Button variant="danger" className="min-h-[44px]" onClick={confirmDelete}>
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              Delete deal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="milestones">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="signatures">E-signature</TabsTrigger>
          <TabsTrigger value="fractionalization">Fractionalization lab</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload aria-hidden="true" className="h-5 w-5 text-[var(--color-fg-subtle)]" />
                    Document upload and review
                  </CardTitle>
                  <CardDescription>
                    Not available yet. No file is uploaded and no review runs.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* A notice, not a drop zone: an upload prompt that cannot upload reads as broken. */}
                  <div
                    role="note"
                    className="flex w-full flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-6 py-8 text-center"
                  >
                    <span className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-warning-soft)] px-3 py-1.5 text-xs font-medium text-[var(--color-warning)]">
                      <Zap aria-hidden="true" className="h-3.5 w-3.5" />
                      Coming later
                    </span>
                    <p className="mt-3 max-w-sm text-sm text-[var(--color-fg-muted)]">
                      Keep contracts in your transaction platform for now, and track
                      the deal's progress under Milestones.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Documents on this deal</CardTitle>
                  <CardDescription>
                    {deal?.propertyTitle ?? "No deal selected"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!deal && (
                    <p className="text-sm text-[var(--color-fg-muted)]">
                      There are no deals yet, so there are no documents to show.
                    </p>
                  )}
                  {deal && deal.documents.length === 0 && (
                    <p className="text-sm text-[var(--color-fg-muted)]">
                      No documents are recorded for this deal. You can't add documents here yet.
                    </p>
                  )}
                  {deal?.documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <FileText className="h-4 w-4 text-[var(--color-fg-subtle)]" />
                          <span className="text-sm font-medium text-[var(--color-fg)]">
                            {doc.name}
                          </span>
                          <DocBadge status={doc.status} />
                        </div>
                        {doc.findings.length > 0 && (
                          <ul className="mt-2 space-y-1 text-xs text-[var(--color-fg-muted)]">
                            {doc.findings.map((f) => (
                              <li key={f} className="flex items-start gap-1.5">
                                {doc.status === "issue" ? (
                                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-[var(--color-warning)]" />
                                ) : (
                                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-[var(--color-success)]" />
                                )}
                                {f}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {doc.status === "pending" && (
                          <Button size="sm" variant="outline" onClick={() => notConnected("Document review")}>
                            Review not connected
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Deals</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {deals.length === 0 && (
                    <p className="text-sm text-[var(--color-fg-muted)]">No deals yet.</p>
                  )}
                  {deals.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      aria-pressed={deal?.id === d.id}
                      onClick={() => setSelectedDealId(d.id)}
                      className={`w-full rounded-[var(--radius-md)] border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
                        deal?.id === d.id
                          ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]/30"
                          : "border-[var(--color-border)] hover:bg-[var(--color-bg-elevated)]"
                      }`}
                    >
                      <div className="text-sm font-medium text-[var(--color-fg)]">
                        {d.propertyTitle}
                      </div>
                      <div className="mt-0.5 text-xs text-[var(--color-fg-muted)]">
                        {d.clientName} · {formatCurrency(d.value)} · {STAGE_LABEL[d.stage] ?? d.stage}
                      </div>
                      <div className="mt-2">
                        <Progress value={d.progress} className="h-1.5" />
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>

              {deal && deal.issues.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Risk flags</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {deal.issues.map((issue) => (
                      <div
                        key={issue.text}
                        className="flex gap-2 rounded-[var(--radius-sm)] bg-[var(--color-warning-soft)] p-2 text-xs text-[var(--color-fg-muted)]"
                      >
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[var(--color-warning)]" />
                        <span>
                          <span className="font-medium capitalize text-[var(--color-warning)]">
                            {issue.severity}:{" "}
                          </span>
                          {issue.text}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="signatures" className="space-y-4">
          {!hasSignatureRows && (
            <NoDealsNotice title={deals.length === 0 ? "No deals yet" : "No documents on your deals"}>
              E-signature isn't connected yet. Keep signed documents in your transaction platform.
            </NoDealsNotice>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {deals.flatMap((d) =>
              d.documents
                .filter((doc) =>
                  ["reviewed", "signed", "issue"].includes(doc.status),
                )
                .map((doc) => (
                  <Card key={doc.id}>
                    <CardContent className="flex items-start justify-between gap-3 p-5">
                      <div>
                        <div className="flex items-center gap-2">
                          <PenTool className="h-4 w-4 text-[var(--color-primary)]" />
                          <span className="text-sm font-medium">{doc.name}</span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
                          {d.clientName} · {d.propertyTitle}
                        </p>
                      </div>
                      {doc.status === "signed" ? (
                        <Badge variant="secondary">Marked signed by you</Badge>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => notConnected("E-signature")}>
                          E-sign not connected
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )),
            )}
          </div>
        </TabsContent>

        <TabsContent value="milestones" className="space-y-4">
          {deals.length === 0 && (
            <NoDealsNotice
              action={
                <Button className="min-h-[44px]" onClick={openAdd}>
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  Add your first deal
                </Button>
              }
            >
              Add a deal to track its stage here, from offer to close, and move it forward
              with one tap. Deals are saved on this device only.
            </NoDealsNotice>
          )}
          {deals.map((d) => (
            <Card key={d.id}>
              <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                <div>
                  <CardTitle className="text-base">{d.propertyTitle}</CardTitle>
                  <CardDescription>
                    {d.clientName} · {formatCurrency(d.value)} · {closingText(d.closingDate)} ·
                    updated <RelativeTime iso={d.updatedAt} />
                  </CardDescription>
                </div>
                <Badge variant="secondary">
                  {STAGE_LABEL[d.stage] ?? d.stage}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <Progress value={d.progress} />
                <div className="flex flex-wrap gap-2">
                  {DEAL_STAGES.map((stage) => {
                    const done = DEAL_STAGES.indexOf(stage) <= DEAL_STAGES.indexOf(d.stage);
                    return (
                      <span
                        key={stage}
                        className={`rounded-full px-2.5 py-1 text-xs ${
                          done
                            ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                            : "bg-[var(--color-surface-2)] text-[var(--color-fg-subtle)]"
                        }`}
                      >
                        {STAGE_LABEL[stage]}
                      </span>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {d.stage !== "closed" && (
                    <Button size="sm" className="min-h-[44px]" onClick={() => advanceDeal(d.id)}>
                      Move to next stage
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-[44px]"
                    aria-label={`Edit deal: ${d.propertyTitle}`}
                    onClick={() => openEdit(d)}
                  >
                    <Pencil aria-hidden="true" className="h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-[44px]"
                    aria-label={`Delete deal: ${d.propertyTitle}`}
                    onClick={() => setDeleteTarget(d)}
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="fractionalization"><ComplianceSandboxPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

/** "closes Dec 1, 2026", or a plain statement when the agent set no date. */
function closingText(iso: string): string {
  const date = iso ? new Date(iso) : null;
  if (!date || !Number.isFinite(date.getTime())) return "no closing date set";
  return `closes ${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function NoDealsNotice({
  title = "No deals yet",
  action,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
          <FileText aria-hidden="true" className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium text-[var(--color-fg)]">{title}</p>
        <p className="max-w-md text-sm text-[var(--color-fg-muted)]">{children}</p>
        {action}
      </CardContent>
    </Card>
  );
}

function DocBadge({
  status,
}: {
  status: "pending" | "reviewed" | "signed" | "issue";
}) {
  const map = {
    pending: { v: "secondary" as const, t: "Pending" },
    reviewed: { v: "success" as const, t: "Reviewed" },
    signed: { v: "accent" as const, t: "Signed" },
    issue: { v: "warning" as const, t: "Issues" },
  };
  const m = map[status];
  return <Badge variant={m.v}>{m.t}</Badge>;
}
