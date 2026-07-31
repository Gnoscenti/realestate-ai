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
  const reviewDocument = useAppStore((s) => s.reviewDocument);
  const pushActivity = useAppStore((s) => s.pushActivity);
  const [selectedDealId, setSelectedDealId] = useState(deals[0]?.id ?? "");
  const deal = deals.find((d) => d.id === selectedDealId) ?? deals[0];

  const simulateUpload = () => {
    if (!deal) return;
    toast.success("Document uploaded — AI review queued");
    pushActivity({
      type: "document",
      title: "Document uploaded",
      description: `New file attached to ${deal.propertyTitle}`,
      badge: "Upload",
    });
    const pending = deal.documents.find((d) => d.status === "pending");
    if (pending) {
      setTimeout(() => {
        reviewDocument(deal.id, pending.id);
        toast.message("AI review complete");
      }, 900);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Transaction hub
          </h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Document AI, e-sign tracking, and deal milestones
          </p>
        </div>
        <Badge variant="warning">
          <Clock className="h-3 w-3" />
          Pipeline live
        </Badge>
      </div>

      <Tabs defaultValue="documents">
        <TabsList>
          <TabsTrigger value="documents">Document AI</TabsTrigger>
          <TabsTrigger value="signatures">E-signature</TabsTrigger>
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5 text-[var(--color-warning)]" />
                    Upload & analyze
                  </CardTitle>
                  <CardDescription>
                    Drop contracts for AI review (demo simulates analysis)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <button
                    type="button"
                    onClick={simulateUpload}
                    className="flex w-full flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-6 py-10 text-center transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]/20"
                  >
                    <Upload className="mb-3 h-10 w-10 text-[var(--color-fg-subtle)]" />
                    <p className="text-sm text-[var(--color-fg-muted)]">
                      Click to upload a contract package
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">
                      PDF, DOC, DOCX up to 10MB
                    </p>
                    <span className="mt-4 inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-warning-soft)] px-3 py-1.5 text-xs font-medium text-[var(--color-warning)]">
                      <Zap className="h-3.5 w-3.5" />
                      Run demo upload
                    </span>
                  </button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Documents on deal</CardTitle>
                  <CardDescription>
                    {deal?.propertyTitle ?? "Select a deal"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
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
                            {doc.confidence}% conf.
                          </span>
                        )}
                        {doc.status === "pending" && (
                          <Button
                            size="sm"
                            onClick={() => {
                              reviewDocument(deal.id, doc.id);
                              toast.success("AI review complete");
                            }}
                          >
                            Run AI review
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
                  {deals.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setSelectedDealId(d.id)}
                      className={`w-full rounded-[var(--radius-md)] border p-3 text-left transition-colors ${
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
                        <Badge variant="success">Signed</Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => {
                            useAppStore.getState().updateDeal(d.id, {
                              documents: d.documents.map((x) =>
                                x.id === doc.id
                                  ? { ...x, status: "signed" as const }
                                  : x,
                              ),
                            });
                            toast.success("Signature request sent");
                          }}
                        >
                          Request sign
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )),
            )}
          </div>
        </TabsContent>

        <TabsContent value="milestones" className="space-y-4">
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
                  <Button size="sm" onClick={() => advanceDeal(d.id)}>
                    Advance stage
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
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
