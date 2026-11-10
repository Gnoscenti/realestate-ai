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
import { parseLocalCalendarDate } from "@/lib/calendar-date";

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
  const hasUnits = rentals.length > 0;
  // No units means no rate at all. Dividing by zero used to print "NaN%".
  const occRate = hasUnits
    ? Math.round(
        (rentals.filter((r) => r.occupancy !== "vacant").length / rentals.length) * 100,
      )
    : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Property Management
          </h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Rent, occupancy and maintenance for the rental units you manage.
          </p>
        </div>
        {hasUnits && (
          <Badge variant="secondary">
            <Building2 aria-hidden="true" className="h-3 w-3" />
            {rentals.length} {rentals.length === 1 ? "unit" : "units"}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={DollarSign}
          label="Current rent"
          value={formatCurrency(monthly) + "/mo"}
        />
        <Stat
          icon={TrendingIcon}
          label="Below market"
          value={formatCurrency(marketGap) + "/mo"}
        />
        <Stat
          icon={Users}
          label="Occupancy"
          value={occRate === null ? "—" : `${occRate}%`}
          hint={hasUnits ? `${occupied} occupied · ${vacant} vacant` : "No units yet"}
        />
        <Stat
          icon={Wrench}
          label="Units"
          value={String(rentals.length)}
          hint="In your portfolio"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Rent check</CardTitle>
            <CardDescription>
              Compares each unit's rent with the market rent on record
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-[var(--color-fg-muted)]">
            <p>
              A unit more than 5% below market offers a one-tap update. Applying it
              changes the rent here and adds a note to your activity log.
            </p>
          </CardContent>
        </Card>
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Maintenance</CardTitle>
            <CardDescription>
              A health score and open issues for each unit
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-[var(--color-fg-muted)]">
            A lower score means more open issues. Clear each one when it is resolved.
          </CardContent>
        </Card>
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Leases</CardTitle>
            <CardDescription>Lease end dates and notice status</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-[var(--color-fg-muted)]">
            Vacant units and units renting below market appear in your Command Center priorities.
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Units</h2>
        {!hasUnits && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                <Building2 aria-hidden="true" className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-[var(--color-fg)]">No rental units yet</p>
              <p className="max-w-md text-sm text-[var(--color-fg-muted)]">
                Adding your own units isn't available in this beta. The guest demo
                shows this page with sample units so you can see how it works.
              </p>
            </CardContent>
          </Card>
        )}
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
                          updateRental(unit.id, { issues: [] });
                          toast.message("Issue list cleared on your record. The score is unchanged; it is your own rating, not a measurement.");
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
                          const tenant = window.prompt("Tenant name (as on the lease):", "");
                          if (!tenant?.trim()) return;
                          const rentInput = window.prompt("Monthly rent on the lease ($):", String(unit.rent || unit.marketRent));
                          const rent = Number((rentInput || "").replace(/[^\d.]/g, ""));
                          if (!Number.isFinite(rent) || rent <= 0) {
                            toast.error("Enter the rent from the lease");
                            return;
                          }
                          const end = window.prompt("Lease end date (YYYY-MM-DD):", "");
                          const leaseEnd = parseLocalCalendarDate(end);
                          if (!leaseEnd) {
                            toast.error("Enter a valid lease end date (YYYY-MM-DD)");
                            return;
                          }
                          updateRental(unit.id, {
                            occupancy: "occupied",
                            tenant: tenant.trim(),
                            rent,
                            leaseEnd: leaseEnd.toISOString(),
                          });
                          toast.success(`Recorded lease for ${tenant.trim()} (your entry)`);
                        }}
                      >
                        Record lease
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
