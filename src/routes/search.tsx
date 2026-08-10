import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Filter, Search, Sparkles } from "lucide-react";
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
  "Family homes near schools with large yards",
  "Investment properties with rental potential",
  "3-bed with ADU potential under $800K",
  "Ocean view homes in La Jolla",
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
  const [searching, setSearching] = useState(false);
  const [history, setHistory] = useState<string[]>([
    "Luxury condos downtown",
    "Family homes near schools",
    "Investment properties under $1.5M",
  ]);
  const [detail, setDetail] = useState<Property | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const runSearch = async (raw?: string) => {
    const q = (raw ?? query).trim();
    setSearching(true);
    setCommitted(q);
    navigate({ search: { q: q || undefined } });
    if (q && !history.includes(q)) {
      setHistory((h) => [q, ...h].slice(0, 8));
    }
    await new Promise((r) => setTimeout(r, 600));
    setSearching(false);
    if (q) {
      pushActivity({
        type: "chat",
        title: "AI property search",
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
            Smart property search
          </h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            AI ranks listings in your book—manually added, imported, website-loaded, or MLS-synced.
          </p>
        </div>
      </div>

      <Card className="border-[color-mix(in_oklab,var(--color-primary)_25%,var(--color-border))] bg-[linear-gradient(135deg,var(--color-primary-soft),var(--color-surface))]">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[var(--color-primary)]" />
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
                if (e.key === "Enter") void runSearch();
              }}
            />
            <Button
              onClick={() => void runSearch()}
              disabled={searching}
              className="sm:w-auto"
            >
              {searching ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-primary-fg)] border-t-transparent" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {searching ? "Searching…" : "AI search"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <Button
                key={s}
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => {
                  setQuery(s);
                  void runSearch(s);
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
                matchScore={propertyMatchScore(property, committed)}
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
                onTour={() => {
                  toast.success(`Tour request sent for ${property.title}`);
                  pushActivity({
                    type: "deal",
                    title: "Tour scheduled",
                    description: `Showing requested · ${property.address}`,
                    badge: "Tour",
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
              <CardTitle>AI recommendations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Rec
                title="Perfect match"
                body={
                  filtered[0]
                    ? `${filtered[0].title} ranks highest for this search`
                    : "Run a search to get ranked matches"
                }
              />
              <Rec
                title="Price alert"
                body="Hillcrest Craftsman is ~8% below estimated market value"
              />
              <Rec
                title="Investment tip"
                body="ADU-ready homes could add $150–200K in residual value"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Search history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {history.map((h) => (
                <button
                  key={h}
                  type="button"
                  className="w-full rounded-[var(--radius-sm)] bg-[var(--color-bg-elevated)] px-3 py-2 text-left text-xs text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
                  onClick={() => {
                    setQuery(h);
                    void runSearch(h);
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
                  <Badge variant="secondary">
                    AVM {formatCurrency(detail.estimatedValue)}
                  </Badge>
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
                  className="w-full"
                  onClick={() => {
                    toast.success("Client packet prepared (demo)");
                    setDetail(null);
                  }}
                >
                  Prepare client packet
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Rec({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
      <h4 className="text-sm font-medium text-[var(--color-fg)]">{title}</h4>
      <p className="mt-1 text-xs leading-relaxed text-[var(--color-fg-muted)]">
        {body}
      </p>
    </div>
  );
}
