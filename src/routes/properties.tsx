import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  DollarSign,
  Users,
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAppStore } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";

export const Route = createFileRoute("/properties")({
  component: PropertiesPage,
});

function PropertiesPage() {
  const rentals = useAppStore((s) => s.rentals);
  const applyMarketRent = useAppStore((s) => s.applyMarketRent);
  const updateRental = useAppStore((s) => s.updateRental);

  const monthly = rentals
    .filter((r) => r.occupancy !== "vacant")
    .reduce((s, r) => s + r.rent, 0);
  const marketGap = rentals.reduce(
    (s, r) => s + Math.max(0, r.marketRent - r.rent),
    0,
  );
  const occupied = rentals.filter((r) => r.occupancy === "occupied").length;
  const vacant = rentals.filter((r) => r.occupancy === "vacant").length;
  const occRate = Math.round(
    (rentals.filter((r) => r.occupancy !== "vacant").length / rentals.length) *
      100,
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Property management
          </h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Dynamic pricing, maintenance signals, and tenant analytics
          </p>
        </div>
        <Badge variant="success">
          <Building2 className="h-3 w-3" />
          Portfolio live
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={DollarSign}
          label="In-place rent"
          value={formatCurrency(monthly) + "/mo"}
        />
        <Stat
          icon={TrendingIcon}
          label="Mark-to-market gap"
          value={formatCurrency(marketGap) + "/mo"}
        />
        <Stat
          icon={Users}
          label="Occupancy"
          value={`${occRate}%`}
          hint={`${occupied} occ · ${vacant} vacant`}
        />
        <Stat
          icon={Wrench}
          label="Units"
          value={String(rentals.length)}
          hint="Across portfolio"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Pricing engine</CardTitle>
            <CardDescription>
              AI recommends mark-to-market when gap exceeds 3%
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-[var(--color-fg-muted)]">
            <p>
              Units below market by more than 5% show an optimize action.
              Applying updates rent and logs activity.
            </p>
          </CardContent>
        </Card>
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Predictive maintenance</CardTitle>
            <CardDescription>
              Health scores from work-order history
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-[var(--color-fg-muted)]">
            Lower scores surface open issues. Clear items when resolved.
          </CardContent>
        </Card>
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Tenant analytics</CardTitle>
            <CardDescription>Lease runway and notice status</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-[var(--color-fg-muted)]">
            Notice and vacant units bubble to the top of your action list.
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Units</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {rentals.map((unit) => {
            const gap = unit.marketRent - unit.rent;
            const gapPct = unit.rent > 0 ? (gap / unit.rent) * 100 : 0;
            return (
              <Card key={unit.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">
                        {unit.address}
                        <span className="text-[var(--color-fg-subtle)]">
                          {" "}
                          · Unit {unit.unit}
                        </span>
                      </CardTitle>
                      <CardDescription>
                        {unit.beds}bd / {unit.baths}ba · {unit.sqft} sqft
                      </CardDescription>
                    </div>
                    <OccBadge status={unit.occupancy} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-[var(--color-fg-subtle)]">
                        Current rent
                      </div>
                      <div className="font-semibold tabular">
                        {formatCurrency(unit.rent)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--color-fg-subtle)]">
                        Market rent
                      </div>
                      <div className="font-semibold tabular text-[var(--color-accent)]">
                        {formatCurrency(unit.marketRent)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--color-fg-subtle)]">
                        Tenant
                      </div>
                      <div>{unit.tenant ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--color-fg-subtle)]">
                        Lease end
                      </div>
                      <div>
                        {unit.leaseEnd
                          ? new Date(unit.leaseEnd).toLocaleDateString()
                          : "—"}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span className="text-[var(--color-fg-subtle)]">
                        Maintenance health
                      </span>
                      <span className="tabular">{unit.maintenanceScore}</span>
                    </div>
                    <Progress value={unit.maintenanceScore} />
                  </div>

                  {unit.issues.length > 0 && (
                    <ul className="space-y-1.5">
                      {unit.issues.map((issue) => (
                        <li
                          key={issue}
                          className="flex items-start gap-2 text-xs text-[var(--color-fg-muted)]"
                        >
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-warning)]" />
                          {issue}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {gapPct >= 5 && (
                      <Button
                        size="sm"
                        onClick={() => {
                          applyMarketRent(unit.id);
                          toast.success(
                            `Rent updated to ${formatCurrency(unit.marketRent)}`,
                          );
                        }}
                      >
                        Apply market rent (+{formatCurrency(gap)})
                      </Button>
                    )}
                    {unit.issues.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          updateRental(unit.id, {
                            issues: [],
                            maintenanceScore: Math.min(
                              98,
                              unit.maintenanceScore + 8,
                            ),
                          });
                          toast.success("Maintenance items cleared");
                        }}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Resolve issues
                      </Button>
                    )}
                    {unit.occupancy === "vacant" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          updateRental(unit.id, {
                            occupancy: "occupied",
                            tenant: "New tenant",
                            rent: unit.marketRent,
                            leaseEnd: new Date(
                              Date.now() + 365 * 86400000,
                            ).toISOString(),
                          });
                          toast.success("Lease started at market rent");
                        }}
                      >
                        Mark leased
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TrendingIcon(props: React.ComponentProps<typeof DollarSign>) {
  return <DollarSign {...props} />;
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-[var(--color-fg-subtle)]">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <div className="mt-2 font-display text-xl font-semibold tabular">
          {value}
        </div>
        {hint && (
          <div className="mt-1 text-[11px] text-[var(--color-fg-muted)]">
            {hint}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OccBadge({
  status,
}: {
  status: "occupied" | "vacant" | "notice";
}) {
  if (status === "occupied") return <Badge variant="success">Occupied</Badge>;
  if (status === "vacant") return <Badge variant="danger">Vacant</Badge>;
  return <Badge variant="warning">Notice</Badge>;
}
