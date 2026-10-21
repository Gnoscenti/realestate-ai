import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, Copy, FileText, Mail, Megaphone, Target } from "lucide-react";
import { toast } from "sonner";
import type { Property } from "@/data/seed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createListingLaunchPlan,
  exportListingLaunchPlan,
  type ListingLaunchPlan as LaunchPlan,
} from "@/lib/listing-launch-plan";

export function ListingLaunchPlan({
  properties,
  initialPropertyId,
  agentName,
  onUseListingInDraft,
}: {
  properties: Property[];
  initialPropertyId?: string;
  agentName?: string | null;
  onUseListingInDraft?: (propertyId: string) => void;
}) {
  const listings = useMemo(
    () =>
      properties.filter(
        (property) =>
          property.listingSide !== "market" &&
          (property.status === "active" || property.status === "coming_soon"),
      ),
    [properties],
  );
  const [propertyId, setPropertyId] = useState("");
  const [plan, setPlan] = useState<LaunchPlan | null>(null);

  useEffect(() => {
    if (initialPropertyId && listings.some((listing) => listing.id === initialPropertyId)) {
      setPropertyId(initialPropertyId);
      setPlan(null);
    }
  }, [initialPropertyId, listings]);

  const selected = listings.find((listing) => listing.id === propertyId);

  const buildPlan = () => {
    if (!selected) return;
    setPlan(createListingLaunchPlan({ listing: selected, agentName }));
  };

  const copyPlan = async () => {
    if (!plan || !navigator.clipboard) {
      toast.error("Copy is unavailable in this browser");
      return;
    }
    try {
      await navigator.clipboard.writeText(exportListingLaunchPlan(plan));
      toast.success("Launch plan copied");
    } catch {
      toast.error("Could not copy the launch plan");
    }
  };

  return (
    <section data-testid="listing-launch-plan" aria-label="Listing launch plan">
      <Card>
        <CardHeader className="gap-2">
          <Badge variant="accent" className="w-fit">
            <Target className="h-3 w-3" /> Listing launch plan
          </Badge>
          <CardTitle>Build a four-week, fact-bound listing launch plan</CardTitle>
          <CardDescription>
            Select one of your saved active or coming-soon listings. The plan creates review
            checkpoints and connects the listing to Social Desk; it does not invent property facts,
            calculate pricing, schedule, or publish.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {listings.length > 0 ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label className="text-sm font-medium" htmlFor="launch-plan-listing">
                  Listing on record
                </label>
                <Select
                  value={propertyId || "none"}
                  onValueChange={(value) => {
                    setPropertyId(value === "none" ? "" : value);
                    setPlan(null);
                  }}
                >
                  <SelectTrigger id="launch-plan-listing" className="mt-1.5">
                    <SelectValue placeholder="Choose an active listing" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Choose an active listing</SelectItem>
                    {listings.map((listing) => (
                      <SelectItem key={listing.id} value={listing.id}>
                        {listing.title} · {listing.address}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={buildPlan} disabled={!selected}>
                <Target className="h-4 w-4" /> Build launch plan
              </Button>
            </div>
          ) : (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 text-sm text-[var(--color-fg-muted)]">
              Add or import one of your own active listings in Listings &amp; Data before building a
              launch plan. New workspaces stay empty until you add records you are authorized to
              use.
            </div>
          )}
        </CardContent>
      </Card>

      {plan && selected && (
        <div className="mt-4 space-y-4">
          <Card className="border-[var(--color-primary)]/30 bg-[var(--color-primary-soft)]/30">
            <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-3xl">
                <p className="font-medium">{plan.listingLabel}</p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--color-fg-muted)]">
                  {plan.summary}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void copyPlan()}>
                  <Copy className="h-3.5 w-3.5" /> Copy plan
                </Button>
                {onUseListingInDraft && (
                  <Button size="sm" onClick={() => onUseListingInDraft(selected.id)}>
                    <Megaphone className="h-3.5 w-3.5" /> Use in Social Desk
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2">
            {plan.weeks.map((week) => (
              <Card key={week.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <CalendarClock className="h-4 w-4 text-[var(--color-primary)]" />
                    {week.title}
                  </CardTitle>
                  <CardDescription className="text-xs">{week.objective}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-[var(--color-fg-muted)]">
                    {week.tasks.map((task) => (
                      <li key={task} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
                        <span>{task}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-[var(--color-primary)]" /> Suggested email sequence
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2 text-sm text-[var(--color-fg-muted)]">
                  {plan.emailSequence.map((item, index) => (
                    <li key={item} className="flex gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-xs font-semibold text-[var(--color-primary)]">
                        {index + 1}
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Megaphone className="h-4 w-4 text-[var(--color-primary)]" /> Suggested social
                  calendar
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-[var(--color-fg-muted)]">
                  {plan.socialCalendar.map((item) => (
                    <li key={item} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card className="border-[var(--color-warning)]/40 bg-[var(--color-warning-soft)]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-[var(--color-warning)]" /> Pricing review boundary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
                {plan.pricingGuidance}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Saved facts used in this plan</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm text-[var(--color-fg-muted)]">
                {plan.knownFacts.map((fact) => (
                  <li key={fact}>• {fact}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
