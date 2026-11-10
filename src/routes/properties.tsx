import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  DollarSign,
  Pencil,
  Plus,
  Trash2,
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
import { useAppStore } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";
import type { RentalUnit } from "@/data/seed";
import {
  EMPTY_RENTAL_FORM,
  RENTAL_STATUS_LABEL,
  parseRentalForm,
  rentalFields,
  rentalFormFrom,
  rentalLabel,
  type RentalForm,
} from "@/lib/book-entry";

/** Matches the native selects on Calendar & Vendors. */
const SELECT_CLASS =
  "h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 text-sm text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]";

export const Route = createFileRoute("/properties")({
  component: PropertiesPage,
});

function PropertiesPage() {
  const rentals = useAppStore((s) => s.rentals);
  const addRental = useAppStore((s) => s.addRental);
  const applyMarketRent = useAppStore((s) => s.applyMarketRent);
  const updateRental = useAppStore((s) => s.updateRental);
  const deleteRental = useAppStore((s) => s.deleteRental);

  // One dialog adds and edits. `editing` is the unit being changed, or null to add.
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RentalUnit | null>(null);
  const [form, setForm] = useState<RentalForm>(EMPTY_RENTAL_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RentalUnit | null>(null);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_RENTAL_FORM);
    setFormError(null);
    setFormOpen(true);
  };
  /** `preset` starts the form on a status, for "Record lease" on a vacant unit. */
  const openEdit = (unit: RentalUnit, preset?: Partial<RentalForm>) => {
    setEditing(unit);
    setForm({ ...rentalFormFrom(unit), ...preset });
    setFormError(null);
    setFormOpen(true);
  };
  const setField = (field: keyof RentalForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFormError(null);
  };
  const submitUnit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseRentalForm(form);
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }
    if (editing) {
      updateRental(editing.id, rentalFields(parsed.value));
      toast.success("Rental unit updated");
    } else {
      addRental(parsed.value);
      toast.success("Rental unit saved on this device");
    }
    setFormOpen(false);
  };
  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteRental(deleteTarget.id);
    setDeleteTarget(null);
    toast.message("Rental unit deleted");
  };
  const rented = form.occupancy === "occupied" || form.occupancy === "notice";

  const monthly = rentals
    .filter((r) => r.occupancy !== "vacant")
    .reduce((s, r) => s + r.rent, 0);
  // Only a rented unit with a market rent on record can be "below market". A
  // vacant unit used to add its whole market rent to this total.
  const marketGap = rentals
    .filter((r) => r.occupancy !== "vacant" && r.marketRent > 0)
    .reduce((s, r) => s + Math.max(0, r.marketRent - r.rent), 0);
  const occupied = rentals.filter((r) => r.occupancy === "occupied").length;
  const onNotice = rentals.filter((r) => r.occupancy === "notice").length;
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
            Rent, occupancy and lease dates for the rental units you manage.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:flex-nowrap">
          {hasUnits && (
            <Badge variant="secondary">
              <Building2 aria-hidden="true" className="h-3 w-3" />
              {rentals.length} {rentals.length === 1 ? "unit" : "units"}
            </Badge>
          )}
          <Badge variant="secondary">Saved on this device</Badge>
          <Button className="min-h-[44px]" onClick={openAdd}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            Add unit
          </Button>
        </div>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit rental unit" : "Add rental unit"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Change any detail, including whether the unit is rented."
                : "Enter the address and whether the unit is rented."}{" "}
              Units are saved on this device only.
            </DialogDescription>
          </DialogHeader>
          <form noValidate onSubmit={submitUnit} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="unit-address">Street address</Label>
              <Input
                id="unit-address"
                value={form.address}
                onChange={(event) => setField("address", event.target.value)}
                maxLength={200}
                autoComplete="off"
                required
                aria-required="true"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-number">Unit (optional)</Label>
              <Input
                id="unit-number"
                value={form.unit}
                onChange={(event) => setField("unit", event.target.value)}
                placeholder="A, 2B or 101"
                maxLength={20}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-status">Status</Label>
              {/* No status is pre-selected: a unit is never saved with one nobody chose. */}
              <select
                id="unit-status"
                className={SELECT_CLASS}
                value={form.occupancy}
                onChange={(event) => setField("occupancy", event.target.value)}
                required
                aria-required="true"
              >
                <option value="">Choose a status</option>
                {(["occupied", "notice", "vacant"] as const).map((status) => (
                  <option key={status} value={status}>
                    {RENTAL_STATUS_LABEL[status]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-beds">Bedrooms</Label>
              <Input
                id="unit-beds"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={form.beds}
                onChange={(event) => setField("beds", event.target.value)}
                required
                aria-required="true"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit-baths">Bathrooms</Label>
              <Input
                id="unit-baths"
                type="number"
                inputMode="decimal"
                min={0.5}
                step={0.5}
                value={form.baths}
                onChange={(event) => setField("baths", event.target.value)}
                required
                aria-required="true"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="unit-sqft">Square feet (optional)</Label>
              <Input
                id="unit-sqft"
                type="number"
                inputMode="numeric"
                min={1}
                value={form.sqft}
                onChange={(event) => setField("sqft", event.target.value)}
              />
            </div>
            {/* A vacant unit has no rent, tenant or lease, so those fields are not asked. */}
            {rented && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="unit-rent">Monthly rent ($)</Label>
                  <Input
                    id="unit-rent"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={form.rent}
                    onChange={(event) => setField("rent", event.target.value)}
                    required
                    aria-required="true"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="unit-lease-end">Lease end date (optional)</Label>
                  <Input
                    id="unit-lease-end"
                    type="date"
                    value={form.leaseEnd}
                    onChange={(event) => setField("leaseEnd", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="unit-tenant">Tenant name (optional)</Label>
                  <Input
                    id="unit-tenant"
                    value={form.tenant}
                    onChange={(event) => setField("tenant", event.target.value)}
                    maxLength={200}
                    autoComplete="off"
                  />
                </div>
              </>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="unit-market-rent">Market rent estimate ($ per month, optional)</Label>
              <Input
                id="unit-market-rent"
                type="number"
                inputMode="numeric"
                min={1}
                value={form.marketRent}
                onChange={(event) => setField("marketRent", event.target.value)}
                aria-describedby="unit-market-rent-help"
              />
              <p id="unit-market-rent-help" className="text-xs text-[var(--color-fg-subtle)]">
                Your own estimate. It isn't checked against market data.
              </p>
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
                {editing ? "Save changes" : "Add unit"}
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
            <DialogTitle>Delete this rental unit?</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `${rentalLabel(deleteTarget)} will be removed from Property Management. This can't be undone.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              className="min-h-[44px]"
              onClick={() => setDeleteTarget(null)}
            >
              Keep unit
            </Button>
            <Button variant="danger" className="min-h-[44px]" onClick={confirmDelete}>
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              Delete unit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          hint={
            hasUnits
              ? [
                  `${occupied} occupied`,
                  // Named only when there is one, so the three counts always add up.
                  ...(onNotice > 0 ? [`${onNotice} on notice`] : []),
                  `${vacant} vacant`,
                ].join(" · ")
              : "No units yet"
          }
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
              Open issues and a health score, where they are on record
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-[var(--color-fg-muted)]">
            You can't record maintenance issues for your own units yet. The guest demo
            shows sample issues and scores.
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
                Add a unit to track its rent, tenant and lease end date. Units are saved
                on this device only.
              </p>
              <Button className="min-h-[44px]" onClick={openAdd}>
                <Plus aria-hidden="true" className="h-4 w-4" />
                Add your first unit
              </Button>
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
                        {unit.unit && (
                          <span className="text-[var(--color-fg-subtle)]">
                            {" "}
                            · Unit {unit.unit}
                          </span>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {unit.beds}bd / {unit.baths}ba
                        {unit.sqft > 0 ? ` · ${unit.sqft.toLocaleString("en-US")} sqft` : ""}
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
                        {unit.occupancy === "vacant" ? "—" : formatCurrency(unit.rent)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--color-fg-subtle)]">
                        Market rent
                      </div>
                      <div className="font-semibold tabular text-[var(--color-accent)]">
                        {unit.marketRent > 0 ? formatCurrency(unit.marketRent) : "—"}
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

                  {/* Sample units carry a score. A unit an agent adds has none. */}
                  {typeof unit.maintenanceScore === "number" && (
                    <div>
                      <div className="mb-1.5 flex justify-between text-xs">
                        <span className="text-[var(--color-fg-subtle)]">
                          Maintenance health
                        </span>
                        <span className="tabular">{unit.maintenanceScore}</span>
                      </div>
                      <Progress value={unit.maintenanceScore} />
                    </div>
                  )}

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
                    {/* More than 5%, the same rule the Command Center uses. */}
                    {unit.marketRent > 0 && gapPct > 5 && (
                      <Button
                        size="sm"
                        className="min-h-[44px]"
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
                        className="min-h-[44px]"
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
                      // Opens the same form as Edit, already set to Occupied. This
                      // used to be three browser pop-ups in a row.
                      <Button
                        size="sm"
                        variant="secondary"
                        className="min-h-[44px]"
                        onClick={() => openEdit(unit, { occupancy: "occupied" })}
                      >
                        Record lease
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-[44px]"
                      aria-label={`Edit unit: ${rentalLabel(unit)}`}
                      onClick={() => openEdit(unit)}
                    >
                      <Pencil aria-hidden="true" className="h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="min-h-[44px]"
                      aria-label={`Delete unit: ${rentalLabel(unit)}`}
                      onClick={() => setDeleteTarget(unit)}
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                      Delete
                    </Button>
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
