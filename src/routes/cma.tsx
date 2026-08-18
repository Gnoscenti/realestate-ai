import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  Copy,
  Download,
  FileSpreadsheet,
  Sparkles,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/lib/store";
import { generateCmaReport } from "@/lib/ai";
import { getMlsLabel, myListings } from "@/lib/mls";
import { formatCurrency, formatNumber } from "@/lib/utils";

export const Route = createFileRoute("/cma")({
  component: CmaPage,
});

function CmaPage() {
  const properties = useAppStore((s) => s.properties);
  const profile = useAppStore((s) => s.agentProfile);
  const pushActivity = useAppStore((s) => s.pushActivity);
  const subjects = properties.filter((p) =>
    ["active", "pending", "coming_soon"].includes(p.status),
  );
  const mineFirst = [
    ...subjects.filter((p) => p.listingSide === "mine"),
    ...subjects.filter((p) => p.listingSide !== "mine"),
  ];
  const [subjectId, setSubjectId] = useState(mineFirst[0]?.id ?? "");
  const subject =
    properties.find((p) => p.id === subjectId) ?? mineFirst[0];

  const report = useMemo(
    () => (subject ? generateCmaReport(subject, properties) : null),
    [subject, properties],
  );
  const hasEnoughComparisons = (report?.comps.length ?? 0) >= 3;

  const exportText = () => {
    if (!report || !subject) return "";
    return [
      report.headline,
      report.subjectSummary,
      subject.mlsNumber ? `MLS# ${subject.mlsNumber}` : "",
      profile ? `Prepared by ${profile.name} · ${profile.areaOfOperations}` : "",
      profile?.website ? profile.website : "",
      "",
      `Suggested list: ${formatCurrency(report.suggestedList)}`,
      "",
      "Workspace comparison set (not verified sold comps):",
      ...report.comps.map(
        (c) =>
          `• ${c.title} | ${c.address} | ${formatCurrency(c.price)} | ${c.sqft} sqft | ${formatCurrency(c.ppsf)}/sf | ${c.adj}`,
      ),
      "",
      "Strategy:",
      ...report.strategy.map((s) => `• ${s}`),
      "",
      "Buyer value script:",
      report.buyerValueScript,
    ]
      .filter(Boolean)
      .join("\n");
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            <Badge variant="default">
              <BarChart3 className="h-3 w-3" />
              CMA Studio
            </Badge>
            {profile && (
              <Badge variant="secondary">
                {getMlsLabel(profile.mls).split("(")[0].trim()} ·{" "}
                {profile.areaOfOperations}
              </Badge>
            )}
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Comparative market analysis
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-[var(--color-fg-muted)] leading-relaxed">
            Uses properties saved in this workspace
            {profile ? ` for ${profile.areaOfOperations}` : ""}. This beta does
            not yet retrieve verified sold comps automatically.
          </p>
        </div>
        <div className="w-full max-w-sm">
          <Select value={subject?.id} onValueChange={setSubjectId}>
            <SelectTrigger>
              <SelectValue placeholder="Subject property" />
            </SelectTrigger>
            <SelectContent>
              {mineFirst.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.listingSide === "mine" ? "★ " : ""}
                  {p.title}
                  {p.mlsNumber ? ` (${p.mlsNumber})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {myListings(properties).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {myListings(properties).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSubjectId(p.id)}
              className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-elevated)]"
            >
              Your listing · {p.neighborhood}
              {p.mlsNumber ? ` · ${p.mlsNumber}` : ""}
            </button>
          ))}
        </div>
      )}

      {!subject && (
        <Card>
          <CardHeader>
            <CardTitle>No subject property yet</CardTitle>
            <CardDescription>
              CMA Studio needs a real property in this workspace before it can
              build a comparison set. Connect your MLS or add a property first.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild className="min-h-11">
              <Link to="/mls">Connect or import listings</Link>
            </Button>
            <Button asChild variant="secondary" className="min-h-11">
              <Link to="/properties">Add a property</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {report && subject && !hasEnoughComparisons && (
        <Card>
          <CardHeader>
            <CardTitle>More comparison data needed</CardTitle>
            <CardDescription>
              Only {report.comps.length} other saved {report.comps.length === 1 ? "property is" : "properties are"} available. Add at least three before creating a planning estimate. Verified Closed/Sold MLS comp search is not connected yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild className="min-h-11">
              <Link to="/mls">Connect or import listings</Link>
            </Button>
            <Button asChild variant="secondary" className="min-h-11">
              <Link to="/properties">Add a property</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {report && subject && hasEnoughComparisons && (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>{report.headline}</CardTitle>
                <CardDescription>
                  {report.subjectSummary}
                  {subject.mlsNumber ? ` · MLS# ${subject.mlsNumber}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {subject.listingSide === "mine" && (
                  <Badge variant="accent">Your listing</Badge>
                )}
                {subject.features.slice(0, 6).map((f) => (
                  <Badge key={f} variant="secondary">
                    {f}
                  </Badge>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex h-full flex-col justify-center p-6">
                <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
                  Planning estimate
                </div>
                <div className="mt-2 font-display text-3xl font-semibold tabular text-[var(--color-success)]">
                  {formatCurrency(report.suggestedList)}
                </div>
                <p className="mt-2 text-xs text-[var(--color-fg-muted)]">
                  Formula based on saved workspace properties—not a verified
                  appraisal or sold-comp analysis · current ask{" "}
                  {formatCurrency(subject.price)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Workspace comparison set</CardTitle>
                <CardDescription>
                  Other saved properties ranked by type, neighborhood, and size.
                  Verify status, source, and closing data before client use.
                </CardDescription>
              </div>
              <FileSpreadsheet className="h-5 w-5 text-[var(--color-fg-subtle)]" />
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-[11px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
                    <th className="pb-3 pr-3 font-medium">Property</th>
                    <th className="pb-3 pr-3 font-medium">Price</th>
                    <th className="pb-3 pr-3 font-medium">Sqft</th>
                    <th className="pb-3 pr-3 font-medium">$/sf</th>
                    <th className="pb-3 pr-3 font-medium">Beds/Baths</th>
                    <th className="pb-3 pr-3 font-medium">DOM</th>
                    <th className="pb-3 font-medium">Adjustment</th>
                  </tr>
                </thead>
                <tbody>
                  {report.comps.map((c) => (
                    <tr
                      key={c.address + c.title}
                      className="border-b border-[var(--color-border)]/60"
                    >
                      <td className="py-3 pr-3">
                        <div className="font-medium text-[var(--color-fg)]">
                          {c.title}
                        </div>
                        <div className="text-xs text-[var(--color-fg-subtle)]">
                          {c.address}
                        </div>
                      </td>
                      <td className="py-3 pr-3 tabular">
                        {formatCurrency(c.price)}
                      </td>
                      <td className="py-3 pr-3 tabular">
                        {formatNumber(c.sqft)}
                      </td>
                      <td className="py-3 pr-3 tabular">
                        {formatCurrency(c.ppsf)}
                      </td>
                      <td className="py-3 pr-3">
                        {c.beds}/{c.baths}
                      </td>
                      <td className="py-3 pr-3">{c.dom}</td>
                      <td className="py-3 text-[var(--color-fg-muted)]">
                        {c.adj}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Go-to-market strategy</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-[var(--color-fg-muted)]">
                  {report.strategy.map((s) => (
                    <li key={s} className="flex gap-2">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
                      {s}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Buyer value script</CardTitle>
                <CardDescription>Post-NAR fee conversation</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
                  {report.buyerValueScript}
                </p>
                {profile && (
                  <p className="mt-3 text-xs text-[var(--color-fg-subtle)]">
                    — {profile.name}
                    {profile.brokerage ? `, ${profile.brokerage}` : ""}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                const text = exportText();
                try {
                  await navigator.clipboard.writeText(text);
                  toast.success("CMA copied");
                } catch {
                  toast.message("Select text to copy");
                }
                pushActivity({
                  type: "valuation",
                  title: "CMA exported",
                  description: subject.title,
                  badge: "CMA",
                });
              }}
            >
              <Copy className="h-4 w-4" />
              Copy CMA package
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const blob = new Blob([exportText()], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `cma-${subject.id}.txt`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success("Download started");
              }}
            >
              <Download className="h-4 w-4" />
              Download
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
