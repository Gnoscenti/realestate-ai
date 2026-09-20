import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RapidDataPanel } from "@/components/rapid-data-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";

export const Route = createFileRoute("/market")({ component: MarketPage });

const fields = [
  ["purchase", "Assumed purchase value ($)"],
  ["renovation", "Renovation budget ($)"],
  ["afterValue", "Your assumed value after renovation ($)"],
  ["monthlyRent", "Assumed monthly rent ($)"],
  ["expenses", "Annual operating expenses ($)"],
  ["vacancy", "Assumed vacancy (%)"],
] as const;
type Field = typeof fields[number][0];

function MarketPage() {
  const [inputs, setInputs] = useState<Record<Field, string>>({
    purchase: "", renovation: "", afterValue: "", monthlyRent: "", expenses: "", vacancy: "",
  });
  const values = Object.fromEntries(fields.map(([key]) => [key, Number(inputs[key])])) as Record<Field, number>;
  const complete = fields.every(([key]) => inputs[key].trim() !== "");
  const valid = complete && fields.every(([key]) => Number.isFinite(values[key]) && values[key] >= 0)
    && values.purchase > 0 && values.afterValue > 0 && values.vacancy <= 100;
  const cost = values.purchase + values.renovation;
  const income = values.monthlyRent * 12 * (1 - values.vacancy / 100);
  const noi = income - values.expenses;
  return <div className="mx-auto max-w-6xl space-y-6">
    <div>
      <h1 className="font-display text-2xl font-semibold">Market data & scenarios</h1>
      <p className="mt-2 text-sm text-[var(--color-fg-muted)]">Third-party property data via RapidAPI, with a calculator for your own assumptions.</p>
    </div>
    <RapidDataPanel />
    <Card>
      <CardHeader>
        <CardTitle>Your property scenario</CardTitle>
        <CardDescription>Enter every assumption, including zero where appropriate. These calculations do not predict a sale price or future returns. Operating expenses should exclude debt service; financing, taxes on sale and transaction costs are not included.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map(([key,label]) => <div className="space-y-2" key={key}>
            <Label htmlFor={`scenario-${key}`}>{label}</Label>
            <Input id={`scenario-${key}`} type="number" min={0} max={key === "vacancy" ? 100 : undefined} step="any"
              value={inputs[key]} onChange={e=>setInputs(current=>({...current,[key]:e.target.value}))} />
          </div>)}
        </div>
        {!complete && <p className="text-sm">Enter all six assumptions to calculate the scenario.</p>}
        {complete && !valid && <p role="alert">Use finite, nonnegative amounts, positive property values, and vacancy between 0 and 100%.</p>}
        {valid && <div aria-live="polite" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Metric label="Purchase plus renovation" value={formatCurrency(cost)} />
          <Metric label="Value less purchase and renovation" value={formatCurrency(values.afterValue-cost)} />
          <Metric label="Annual rent after vacancy" value={formatCurrency(income)} />
          <Metric label="Annual net operating income" value={formatCurrency(noi)} />
          <Metric label="NOI / purchase plus renovation" value={`${(noi/cost*100).toFixed(2)}%`} />
          <Metric label="NOI / assumed completed value" value={`${(noi/values.afterValue*100).toFixed(2)}%`} />
        </div>}
        <p className="text-xs text-[var(--color-fg-muted)]">Source: your inputs. Annual rent = monthly rent × 12 × (1 − vacancy). Net operating income = annual rent after vacancy − operating expenses. Assumptions stay in this page until you leave; they are not an appraisal or a saved valuation.</p>
      </CardContent>
    </Card>
  </div>;
}
function Metric({label,value}:{label:string;value:string}) {
  return <div className="rounded-xl border border-[var(--color-border)] p-4">
    <p className="text-xs text-[var(--color-fg-muted)]">{label}</p>
    <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
  </div>;
}
