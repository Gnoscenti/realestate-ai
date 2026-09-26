import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Globe, Loader2, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppStore } from "@/lib/store";
import { RapidDataPanel } from "@/components/rapid-data-panel";

export const Route = createFileRoute("/mls")({
  component: ListingsDataPage,
});

/**
 * Listings & market data. There is deliberately no MLS credential entry in
 * this release: no MLS data license exists yet (see docs/FLAGSHIP-BLOCKERS.md).
 * Inventory comes from the agent's own website, CSV imports, or labeled
 * aggregator observations — and every row says which.
 */
function ListingsDataPage() {
  const profile = useAppStore((s) => s.agentProfile);
  const properties = useAppStore((s) => s.properties);
  const resyncFromWebsite = useAppStore((s) => s.resyncFromWebsite);
  const [busy, setBusy] = useState(false);

  const counts = useMemo(() => {
    const website = properties.filter((p) => p.features?.includes("From agent website")).length;
    const aggregator = properties.filter((p) => p.id.startsWith("rapidapi:")).length;
    const imported = properties.length - website - aggregator;
    return { website, aggregator, imported };
  }, [properties]);

  const syncSite = async () => {
    if (!profile?.website) {
      toast.message("Add your website in the profile to scan it for listings");
      return;
    }
    setBusy(true);
    try {
      const r = await resyncFromWebsite();
      if (r.error) toast.message(r.error);
      else toast.success(r.listings ? `Website scanned · ${r.listings} listing(s) observed` : "Website scanned — no listings found");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 pb-24 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Listings & market data
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--color-fg-muted)]">
            Your inventory comes from your website, your own CSV, or labeled market observations. A licensed MLS
            feed is not connected in this release; nothing here claims MLS verification.
          </p>
        </div>
        <Button variant="outline" className="min-h-[44px]" disabled={busy} onClick={() => void syncSite()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Rescan website
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="From your website" value={String(counts.website)} />
        <Stat label="Imported / added by you" value={String(counts.imported)} />
        <Stat label="Market observations" value={String(counts.aggregator)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4 text-[var(--color-primary)]" /> Sources
          </CardTitle>
          <CardDescription>What each source can and cannot establish.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Website</Badge>
            <span className="text-[var(--color-fg-muted)]">
              Listings shown on {profile?.website || "your site"} are observed with status and price. Representation
              is not asserted from a website card.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">CSV / manual</Badge>
            <span className="text-[var(--color-fg-muted)]">
              Your own declarations. Import from the{" "}
              <Link to="/leads" className="text-[var(--color-primary)] hover:underline">Leads</Link> or{" "}
              <Link to="/properties" className="text-[var(--color-primary)] hover:underline">Properties</Link> pages.
            </span>
            <Upload className="h-3.5 w-3.5 text-[var(--color-fg-subtle)]" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Aggregator</Badge>
            <span className="text-[var(--color-fg-muted)]">
              Zillow via RapidAPI below: market context only. Agent attribution, MLS status, and reuse rights are
              unverified.
            </span>
          </div>
        </CardContent>
      </Card>

      <RapidDataPanel />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-subtle)]">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-[var(--color-fg)] tabular">{value}</div>
    </div>
  );
}
