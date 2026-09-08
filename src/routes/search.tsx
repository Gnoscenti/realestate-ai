import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Filter, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PropertyCard } from "@/components/property-card";
import { useAppStore } from "@/lib/store";
import { propertyMatchScore, searchProperties } from "@/lib/ai";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { Property } from "@/data/seed";
import { z } from "zod";

const searchSchema = z.object({
  q: z.string().optional(),
});

export const Route = createFileRoute("/search")({
  validateSearch: searchSchema,
  component: SearchPage,
});

const SUGGESTIONS = [
  "Luxury condos with city views and amenities",
  "3-bedroom houses with large yards",
  "Investment properties with rental potential",
  "3-bed with ADU potential under $800K",
  "Ocean-view homes with at least 2 bedrooms",
];

function SearchPage() {
  const { q: initialQ } = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });
  const properties = useAppStore((s) => s.properties);
  const favorites = useAppStore((s) => s.favorites);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const pushActivity = useAppStore((s) => s.pushActivity);

  const [query, setQuery] = useState(initialQ ?? "");
  const [committed, setCommitted] = useState(initialQ ?? "");
  const [history, setHistory] = useState<string[]>([]);
  const [detail, setDetail] = useState<Property | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const runSearch = (raw?: string) => {
    const q = (raw ?? query).trim();
    setCommitted(q);
    navigate({ search: { q: q || undefined } });
    if (q && !history.includes(q)) {
      setHistory((h) => [q, ...h].slice(0, 8));
    }
    if (q) {
      pushActivity({
        type: "chat",
        title: "Listing search",
        description: `Natural language query: “${q.slice(0, 80)}${q.length > 80 ? "…" : ""}”`,
        badge: "Search",
      });
    }
  };

  const { results, interpretation } = useMemo(
    () => searchProperties(committed, properties),
    [committed, properties],
  );

  const filtered = useMemo(() => {
    if (typeFilter === "all") return results;
    if (typeFilter === "favorites")
      return results.filter((p) => favorites.includes(p.id));
    return results.filter((p) => p.type === typeFilter);
  }, [results, typeFilter, favorites]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Listing search
          </h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Matches words, property facts, features, and budget against listings
            saved in this browser workspace.
          </p>
        </div>
      </div>

      <Card className="border-[color-mix(in_oklab,var(--color-primary)_25%,var(--color-border))] bg-[linear-gradient(135deg,var(--color-primary-soft),var(--color-surface))]">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-[var(--color-primary)]" />
            <h3 className="font-display text-base font-semibold text-[var(--color-fg)]">
              Natural language search
            </h3>
          </div>
          <p className="text-sm text-[var(--color-fg-muted)]">
            Example: “3-bed Spanish revival near dog parks with ADU potential
            under $800K”
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              className="flex-1 bg-[var(--color-bg-elevated)]"
              placeholder="Describe the ideal property…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch();
              }}
            />
            <Button
              onClick={() => runSearch()}
              className="min-h-11 sm:w-auto"
            >
              <Search className="h-4 w-4" />
              Search listings
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <Button
                key={s}
                size="sm"
                variant="outline"
                className="min-h-11 text-xs"
                onClick={() => {
                  setQuery(s);
                  runSearch(s);
                }}
              >
                {s.length > 42 ? s.slice(0, 42) + "…" : s}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-[var(--color-fg-subtle)]" />
        {(
          [
            ["all", "All"],
            ["favorites", "Saved"],
            ["house", "House"],
            ["condo", "Condo"],
            ["townhouse", "Townhouse"],
            ["multi", "Multi"],
          ] as const
        ).map(([v, label]) => (
          <Button
            key={v}
            size="sm"
            variant={typeFilter === v ? "default" : "outline"}
            className="min-h-11"
            aria-pressed={typeFilter === v}
            onClick={() => setTypeFilter(v)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="lg:col-span-3 space-y-4">
          <p className="text-sm text-[var(--color-fg-muted)]">{interpretation}</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filtered.map((property) => (
              <PropertyCard
                key={property.id}
                property={property}
                matchScore={
                  committed
                    ? propertyMatchScore(property, committed)
                    : undefined
                }
                favorited={favorites.includes(property.id)}
                onToggleFavorite={() => {
                  toggleFavorite(property.id);
                  toast.message(
                    favorites.includes(property.id)
                      ? "Removed from saved"
                      : "Saved to favorites",
                  );
                }}
                onView={() => setDetail(property)}
                tourLabel="Plan tour"
                onTour={() => {
                  toast.message(
                    "Tour follow-up noted locally — no request was sent",
                  );
                  pushActivity({
                    type: "deal",
                    title: "Tour follow-up noted",
                    description: `Contact the listing representative to schedule · ${property.address}`,
                    badge: "Local note",
                  });
                }}
              />
            ))}
          </div>
          {filtered.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-sm text-[var(--color-fg-muted)]">
                No listings in your book match. Add or import listings, try a broader query, or clear filters.
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Search history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {history.length === 0 && (
                <p className="text-xs text-[var(--color-fg-muted)]">
                  No searches in this session yet.
                </p>
              )}
              {history.map((h) => (
                <button
                  key={h}
                  type="button"
                  className="w-full rounded-[var(--radius-sm)] bg-[var(--color-bg-elevated)] px-3 py-2 text-left text-xs text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
                  onClick={() => {
                    setQuery(h);
                    runSearch(h);
                  }}
                >
                  {h}
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.title}</DialogTitle>
                <DialogDescription>
                  {detail.address}, {detail.city}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="flex items-baseline justify-between">
                  <span className="font-display text-2xl font-semibold tabular">
                    {formatCurrency(detail.price)}
                  </span>
                </div>
                <p className="text-[var(--color-fg-muted)] leading-relaxed">
                  {detail.description}
                </p>
                <div className="grid grid-cols-2 gap-2 text-[var(--color-fg-muted)]">
                  <span>{detail.beds} beds</span>
                  <span>{detail.baths} baths</span>
                  <span>{formatNumber(detail.sqft)} sqft</span>
                  <span>Built {detail.yearBuilt}</span>
                  <span>{formatCurrency(detail.pricePerSqft)}/sqft</span>
                  <span className="capitalize">{detail.status.replace("_", " ")}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {detail.features.map((f) => (
                    <Badge key={f} variant="secondary">
                      {f}
                    </Badge>
                  ))}
                </div>
                {detail.capRate != null && (
                  <p className="text-[var(--color-accent)]">
                    Cap rate ~{detail.capRate}%
                  </p>
                )}
                <Button
                  className="min-h-11 w-full"
                  onClick={async () => {
                    const summary = `${detail.title}\n${detail.address}, ${detail.city}\n${formatCurrency(detail.price)} · ${detail.beds} bd · ${detail.baths} ba · ${formatNumber(detail.sqft)} sqft`;
                    try {
                      await navigator.clipboard.writeText(summary);
                      toast.success("Listing details copied");
                    } catch {
                      toast.message("Select the listing details to copy");
                    }
                  }}
                >
                  Copy listing details
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
