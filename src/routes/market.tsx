import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Calculator,
  DollarSign,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateAvm } from "@/lib/ai";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { useAppStore } from "@/lib/store";

export const Route = createFileRoute("/market")({
  component: MarketPage,
});

function MarketPage() {
  const pushActivity = useAppStore((s) => s.pushActivity);
  const [address, setAddress] = useState("456 Oak Ave, Hillcrest");
  const [type, setType] = useState("Single Family Home");
  const [sqft, setSqft] = useState("1800");
  const [beds, setBeds] = useState("3");
  const [baths, setBaths] = useState("2");
  const [year, setYear] = useState("1932");
  const [condition, setCondition] = useState("3");
  const [result, setResult] = useState<ReturnType<typeof generateAvm> | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  // What-if
  const [renoBudget, setRenoBudget] = useState("45000");
  const [rent, setRent] = useState("4100");

  const runAvm = async () => {
    setLoading(true);
    const avm = generateAvm({
      address,
      type,
      sqft: Number(sqft) || 1500,
      beds: Number(beds) || 3,
      baths: Number(baths) || 2,
      yearBuilt: Number(year) || 2000,
      condition: Number(condition) || 3,
    });
    setResult(avm);
    setLoading(false);
    pushActivity({
      type: "valuation",
      title: "Planning estimate calculated",
      description: `${address || "Property"} · illustrative estimate ${formatCurrency(avm.value)}`,
      badge: "Planning",
    });
    toast.success(`Planning estimate ${formatCurrency(avm.value)}`);
  };

  const forecast = useMemo(() => {
    const base = result?.value ?? 780000;
    const months = ["Now", "3m", "6m", "9m", "12m"];
    const bull = [1, 1.012, 1.028, 1.045, 1.06];
    const baseCase = [1, 1.006, 1.012, 1.018, 1.025];
    const bear = [1, 0.995, 0.988, 0.982, 0.975];
    return months.map((m, i) => ({
      month: m,
      bull: Math.round(base * bull[i]),
      base: Math.round(base * baseCase[i]),
      bear: Math.round(base * bear[i]),
    }));
  }, [result]);

  const whatIf = useMemo(() => {
    const base = result?.value ?? 780000;
    const reno = Number(renoBudget) || 0;
    const afterValue = Math.round(base + reno * 1.35);
    const monthlyRent = Number(rent) || 0;
    const grossYield = monthlyRent * 12;
    const cap = ((grossYield * 0.65) / afterValue) * 100;
    return {
      afterValue,
      uplift: afterValue - base - reno,
      cap: cap.toFixed(2),
      roi: reno > 0 ? (((afterValue - base - reno) / reno) * 100).toFixed(1) : "0",
    };
  }, [result, renoBudget, rent]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Market & valuation
          </h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Illustrative pricing formulas and what-if scenarios—not live MLS data
          </p>
        </div>
        <Badge variant="default">
          <TrendingUp className="h-3 w-3" />
          Planning beta
        </Badge>
      </div>

      <Tabs defaultValue="avm">
        <TabsList>
          <TabsTrigger value="avm">Hybrid AVM</TabsTrigger>
          <TabsTrigger value="forecast">Price forecast</TabsTrigger>
          <TabsTrigger value="whatif">What-if</TabsTrigger>
        </TabsList>

        <TabsContent value="avm" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="h-5 w-5 text-[var(--color-primary)]" />
                    Property valuation
                  </CardTitle>
                  <CardDescription>
                    Enter details for an illustrative formula. No live AI model or verified MLS sales are connected.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Address</Label>
                      <Input
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Property type</Label>
                      <Select value={type} onValueChange={setType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Single Family Home">
                            Single family
                          </SelectItem>
                          <SelectItem value="Condo">Condo</SelectItem>
                          <SelectItem value="Townhouse">Townhouse</SelectItem>
                          <SelectItem value="Multi Family">Multi-family</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Condition (1–5)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={5}
                        value={condition}
                        onChange={(e) => setCondition(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Sqft</Label>
                      <Input
                        value={sqft}
                        onChange={(e) => setSqft(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Beds</Label>
                      <Input
                        value={beds}
                        onChange={(e) => setBeds(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Baths</Label>
                      <Input
                        value={baths}
                        onChange={(e) => setBaths(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Year built</Label>
                      <Input
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => void runAvm()}
                    disabled={loading}
                  >
                    <Zap className="h-4 w-4" />
                    {loading ? "Calculating…" : "Calculate planning estimate"}
                  </Button>
                </CardContent>
              </Card>

              {(result?.comps ?? []).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Comparable sales</CardTitle>
                    <CardDescription>Verified records only</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {result!.comps.map((c) => (
                      <div
                        key={c.address}
                        className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] p-3"
                      >
                        <div>
                          <div className="text-sm font-medium text-[var(--color-fg)]">
                            {c.address}
                          </div>
                          <div className="text-xs text-[var(--color-fg-subtle)]">
                            {formatNumber(c.sqft)} sqft · {c.distance}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-[var(--color-success)] tabular">
                            {formatCurrency(c.price)}
                          </div>
                          <div className="text-xs text-[var(--color-fg-subtle)]">
                            {c.days}d ago
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-[var(--color-success)]" />
                    Illustrative estimate
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-center">
                  <div className="font-display text-4xl font-semibold tabular text-[var(--color-success)]">
                    {result
                      ? formatCurrency(result.value)
                      : "—"}
                  </div>
                  {result && (
                    <>
                      <div className="text-sm text-[var(--color-fg-muted)]">
                        Input completeness {result.confidence}%
                      </div>
                      <Progress value={result.confidence} />
                      <div className="text-xs text-[var(--color-fg-subtle)]">
                        Range {formatCurrency(result.low)} –{" "}
                        {formatCurrency(result.high)}
                      </div>
                      <div className="text-xs text-[var(--color-fg-muted)]">
                        {formatCurrency(result.ppsf)}/sqft
                      </div>
                      <p className="text-left text-xs leading-relaxed text-[var(--color-fg-muted)]">
                        {result.insight}
                      </p>
                    </>
                  )}
                  {!result && (
                    <p className="text-sm text-[var(--color-fg-subtle)]">
                      Calculate an illustrative range. Confirm it with an authorized CMA before client use.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Example market assumptions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <Row
                    label="Trend (12m)"
                    value={
                      <span className="inline-flex items-center gap-1 text-[var(--color-success)]">
                        <ArrowUp className="h-3.5 w-3.5" />
                        +2.5%
                      </span>
                    }
                  />
                  <Row label="Inventory" value="Balanced" />
                  <Row
                    label="DOM city avg"
                    value={
                      <span className="inline-flex items-center gap-1">
                        28d
                        <ArrowDown className="h-3.5 w-3.5 text-[var(--color-success)]" />
                      </span>
                    }
                  />
                  <Row label="Buyer demand" value="Moderate–strong" />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="forecast">
          <Card>
            <CardHeader>
              <CardTitle>12-month price paths</CardTitle>
              <CardDescription>
                Illustrative scenario paths from the current planning baseline
                {result ? ` (${formatCurrency(result.value)})` : " — run AVM for custom base"}
              </CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={forecast}>
                  <defs>
                    <linearGradient id="bull" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3ecf8e" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#3ecf8e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="baseG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#5b8def" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#5b8def" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#2a3040" strokeDasharray="3 3" />
                  <XAxis dataKey="month" stroke="#6b7385" fontSize={12} />
                  <YAxis
                    stroke="#6b7385"
                    fontSize={12}
                    tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#161922",
                      border: "1px solid #2a3040",
                      borderRadius: 12,
                      color: "#eef0f4",
                    }}
                    formatter={(v: number) => formatCurrency(v)}
                  />
                  <Area
                    type="monotone"
                    dataKey="bull"
                    name="Bull"
                    stroke="#3ecf8e"
                    fill="url(#bull)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="base"
                    name="Base"
                    stroke="#5b8def"
                    fill="url(#baseG)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="bear"
                    name="Bear"
                    stroke="#e86a6a"
                    fill="transparent"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="whatif">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Renovation scenario</CardTitle>
                <CardDescription>
                  Model value-add after improvement spend
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Reno budget</Label>
                  <Input
                    type="number"
                    value={renoBudget}
                    onChange={(e) => setRenoBudget(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Target monthly rent</Label>
                  <Input
                    type="number"
                    value={rent}
                    onChange={(e) => setRent(e.target.value)}
                  />
                </div>
                <p className="text-xs text-[var(--color-fg-subtle)]">
                  Uses last AVM ({result ? formatCurrency(result.value) : "default $780K"}) as baseline.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Projected outcomes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Metric
                  label="After-reno value"
                  value={formatCurrency(whatIf.afterValue)}
                />
                <Metric
                  label="Net equity created"
                  value={formatCurrency(whatIf.uplift)}
                  positive={whatIf.uplift > 0}
                />
                <Metric label="Implied reno ROI" value={`${whatIf.roi}%`} />
                <Metric label="Est. cap rate (NOI 65%)" value={`${whatIf.cap}%`} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2 last:border-0 last:pb-0">
      <span className="text-[var(--color-fg-muted)]">{label}</span>
      <span className="font-medium text-[var(--color-fg)]">{value}</span>
    </div>
  );
}

function Metric({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] p-4">
      <div className="text-xs text-[var(--color-fg-subtle)]">{label}</div>
      <div
        className={`mt-1 font-display text-2xl font-semibold tabular ${
          positive ? "text-[var(--color-success)]" : "text-[var(--color-fg)]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
