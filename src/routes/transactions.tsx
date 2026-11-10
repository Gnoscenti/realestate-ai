import { ComplianceSandboxPanel } from "@/components/compliance-ledger/sandbox-panel";
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  PenTool,
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
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RelativeTime } from "@/components/relative-time";
import { useAppStore } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";

export const Route = createFileRoute("/transactions")({
  component: TransactionsPage,
});

const STAGE_LABEL: Record<string, string> = {
  offer: "Offer",
  under_contract: "Under contract",
  inspection: "Inspection",
  appraisal: "Appraisal",
  clear_to_close: "Clear to close",
  closed: "Closed",
};

function TransactionsPage() {
  const deals = useAppStore((s) => s.deals);
  const advanceDeal = useAppStore((s) => s.advanceDeal);
  const [selectedDealId, setSelectedDealId] = useState(deals[0]?.id ?? "");
  const deal = deals.find((d) => d.id === selectedDealId) ?? deals[0];

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
        <Badge variant="secondary">
          <Clock aria-hidden="true" className="h-3 w-3" />
          Manual tracking
        </Badge>
      </div>

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
                      Documents you have noted on a deal are listed here.
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
                        {doc.confidence > 0 && (
                          <span className="text-xs tabular text-[var(--color-fg-subtle)]">
                            {doc.confidence}% confidence
                          </span>
                        )}
                        {doc.status === "pending" && (
                          <Button size="sm" variant="outline" onClick={() => notConnected("AI document review")}>
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
                  <CardTitle>Open deals</CardTitle>
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
                        {d.clientName} · {formatCurrency(d.value)}
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
          {deals.length === 0 && (
            <NoDealsNotice>
              E-signature isn't connected yet. Documents you mark as signed will be listed here.
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
            <NoDealsNotice>
              Each deal shows its stage here, from offer to close, with one tap to move it
              forward. Adding your own deals isn't available in this beta; the guest demo
              shows this page with sample deals.
            </NoDealsNotice>
          )}
          {deals.map((d) => (
            <Card key={d.id}>
              <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                <div>
                  <CardTitle className="text-base">{d.propertyTitle}</CardTitle>
                  <CardDescription>
                    {d.clientName} · closes{" "}
                    {new Date(d.closingDate).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}{" "}
                    · updated <RelativeTime iso={d.updatedAt} />
                  </CardDescription>
                </div>
                <Badge variant="secondary">
                  {STAGE_LABEL[d.stage] ?? d.stage}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <Progress value={d.progress} />
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      "offer",
                      "under_contract",
                      "inspection",
                      "appraisal",
                      "clear_to_close",
                      "closed",
                    ] as const
                  ).map((stage) => {
                    const order = [
                      "offer",
                      "under_contract",
                      "inspection",
                      "appraisal",
                      "clear_to_close",
                      "closed",
                    ];
                    const done =
                      order.indexOf(stage) <= order.indexOf(d.stage);
                    return (
                      <span
                        key={stage}
                        className={`rounded-full px-2.5 py-1 text-[11px] ${
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
                {d.stage !== "closed" && (
                  <Button size="sm" className="min-h-[40px]" onClick={() => advanceDeal(d.id)}>
                    Move to next stage
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="fractionalization"><ComplianceSandboxPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

function NoDealsNotice({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
          <FileText aria-hidden="true" className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium text-[var(--color-fg)]">No deals yet</p>
        <p className="max-w-md text-sm text-[var(--color-fg-muted)]">{children}</p>
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
