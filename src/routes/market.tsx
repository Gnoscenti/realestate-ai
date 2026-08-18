import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, Database, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/market")({
  component: MarketDataPage,
});

function MarketDataPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-3xl">
            Market data
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--color-fg-muted)]">
            Client-facing valuation is paused until this workspace has an
            explicit subject property and authorized Closed/Sold records that
            pass objective matching rules.
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
            The app will not substitute a formula, public website, active
            asking price, or AI guess for verified comparable-sale data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm text-[var(--color-fg-muted)]">
            <li>
              1. Select a server-saved subject listing with complete property
              facts.
            </li>
            <li>
              2. Import an authorized MLS Closed/Sold export or connect a
              licensed RESO feed.
            </li>
            <li>
              3. Apply hard location, property-type, size, and recency filters,
              then review the set with the responsible broker.
            </li>
          </ol>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild className="min-h-11">
              <Link to="/mls">Connect or import data</Link>
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
            The authenticated assistant can summarize server-saved inventory
            and display verified Closed/Sold rows as unranked source records.
            It cannot rank them as comps or recommend a numeric value yet.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
