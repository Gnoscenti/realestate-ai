import { useState } from "react";
import { RapidDataPanel } from "@/components/rapid-data-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, Database, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/market")({
  component: MarketDataPage,
});

function MarketDataPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-3xl">
            Market data & scenarios
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--color-fg-muted)]">
            Client-facing valuation is paused until this workspace has an explicit subject property
            and authorized Closed/Sold records that pass objective matching rules.
          </p>
        </div>
        <Badge variant="secondary">
          <ShieldCheck className="h-3 w-3" />
          Source-first beta
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-[var(--color-primary)]" />
            What is required for a reliable price opinion
          </CardTitle>
          <CardDescription>
            The app will not substitute a formula, public website, active asking price, or AI guess
            for verified comparable-sale data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm text-[var(--color-fg-muted)]">
            <li>1. Select a server-saved subject listing with complete property facts.</li>
            <li>
              2. Import an authorized Closed/Sold CSV that you are licensed to use in this
              workspace.
            </li>
            <li>
              3. Apply hard location, property-type, size, and recency filters, then review the set
              with the responsible broker.
            </li>
          </ol>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild className="min-h-11">
              <Link to="/cma">Import authorized Closed/Sold records</Link>
            </Button>
            <Button asChild variant="secondary" className="min-h-11">
              <Link to="/cma">Open comparison planning</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[var(--color-primary)]" />
            Available now
          </CardTitle>
          <CardDescription>
            The authenticated assistant can summarize server-saved inventory and display verified
            Closed/Sold rows as unranked source records. It cannot rank them as comps or recommend a
            numeric value yet.
          </CardDescription>
        </CardHeader>
      </Card>

      <RapidDataPanel />
      <PropertyScenario />
    </div>
  );
}

const fields = [
  ["purchase", "Assumed purchase value ($)"],
  ["renovation", "Renovation budget ($)"],
  ["afterValue", "Your assumed value after renovation ($)"],
  ["monthlyRent", "Assumed monthly rent ($)"],
  ["expenses", "Annual operating expenses ($)"],
  ["vacancy", "Assumed vacancy (%)"],
] as const;
type Field = (typeof fields)[number][0];

function PropertyScenario() {
  const [inputs, setInputs] = useState<Record<Field, string>>({
    purchase: "",
    renovation: "",
    afterValue: "",
    monthlyRent: "",
    expenses: "",
    vacancy: "",
  });
  const values = Object.fromEntries(fields.map(([key]) => [key, Number(inputs[key])])) as Record<
    Field,
    number
  >;
  const complete = fields.every(([key]) => inputs[key].trim() !== "");
  const validInputs =
    complete &&
    fields.every(([key]) => Number.isFinite(values[key]) && values[key] >= 0) &&
    values.purchase > 0 &&
    values.afterValue > 0 &&
    values.vacancy <= 100;
  const cost = values.purchase + values.renovation;
  const income = values.monthlyRent * 12 * (1 - values.vacancy / 100);
  const noi = income - values.expenses;
  const valid =
    validInputs &&
    [
      cost,
      income,
      noi,
      values.afterValue - cost,
      (noi / cost) * 100,
      (noi / values.afterValue) * 100,
    ].every(Number.isFinite);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your property scenario</CardTitle>
        <CardDescription>
          Enter every assumption, including zero where appropriate. These calculations do not
          predict a sale price or future returns. Operating expenses should exclude debt service;
          financing, taxes on sale and transaction costs are not included.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map(([key, label]) => (
            <div className="space-y-2" key={key}>
              <Label htmlFor={`scenario-${key}`}>{label}</Label>
              <Input
                id={`scenario-${key}`}
                type="number"
                min={0}
                max={key === "vacancy" ? 100 : undefined}
                step="any"
                value={inputs[key]}
                onChange={(e) => setInputs((current) => ({ ...current, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        {!complete && (
          <p className="text-sm">Enter all six assumptions to calculate the scenario.</p>
        )}
        {complete && !valid && (
          <p role="alert">
            Use finite, nonnegative amounts, positive property values, and vacancy between 0 and
            100%. Calculated amounts must remain finite.
          </p>
        )}
        {valid && (
          <div aria-live="polite" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Metric label="Purchase plus renovation" value={formatCurrency(cost)} />
            <Metric
              label="Value less purchase and renovation"
              value={formatCurrency(values.afterValue - cost)}
            />
            <Metric label="Annual rent after vacancy" value={formatCurrency(income)} />
            <Metric label="Annual net operating income" value={formatCurrency(noi)} />
            <Metric
              label="NOI / purchase plus renovation"
              value={`${((noi / cost) * 100).toFixed(2)}%`}
            />
            <Metric
              label="NOI / assumed completed value"
              value={`${((noi / values.afterValue) * 100).toFixed(2)}%`}
            />
          </div>
        )}
        <p className="text-xs text-[var(--color-fg-muted)]">
          Source: your inputs. Annual rent = monthly rent × 12 × (1 − vacancy). Net operating income
          = annual rent after vacancy − operating expenses. Assumptions stay in this page until you
          leave; they are not an appraisal or a saved valuation.
        </p>
      </CardContent>
    </Card>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] p-4">
      <p className="text-xs text-[var(--color-fg-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
