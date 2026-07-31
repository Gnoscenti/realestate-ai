import {
  Bath,
  Bed,
  Heart,
  MapPin,
  Maximize,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Property } from "@/data/seed";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

function PropertyArt({ property }: { property: Property }) {
  const patterns = [
    `radial-gradient(circle at 20% 30%, color-mix(in oklab, white 18%, transparent), transparent 40%),
     linear-gradient(135deg, ${property.accent}, color-mix(in oklab, ${property.accent} 40%, #0c0d10))`,
    `repeating-linear-gradient(45deg, color-mix(in oklab, white 6%, transparent) 0 1px, transparent 1px 12px),
     linear-gradient(160deg, ${property.accent}, #0c0d10)`,
    `radial-gradient(ellipse at 70% 20%, color-mix(in oklab, white 15%, transparent), transparent 50%),
     linear-gradient(200deg, ${property.accent}, #12141a)`,
  ];
  const bg = patterns[property.pattern % patterns.length];

  return (
    <div
      className="relative h-40 w-full overflow-hidden"
      style={{ background: bg }}
      aria-hidden
    >
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(to top, #0c0d10 0%, transparent 55%)",
        }}
      />
      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-white/70">
            {property.neighborhood}
          </div>
          <div className="font-display text-sm font-semibold text-white">
            {property.type}
          </div>
        </div>
        <div className="rounded-full bg-black/35 px-2 py-0.5 text-[10px] text-white/90 backdrop-blur-sm">
          {property.yearBuilt}
        </div>
      </div>
    </div>
  );
}

export function PropertyCard({
  property,
  matchScore,
  favorited,
  onToggleFavorite,
  onView,
  onTour,
}: {
  property: Property;
  matchScore?: number;
  favorited?: boolean;
  onToggleFavorite?: () => void;
  onView?: () => void;
  onTour?: () => void;
}) {
  return (
    <Card className="overflow-hidden transition-[border-color] duration-150 hover:border-[var(--color-border-strong)]">
      <div className="relative">
        <PropertyArt property={property} />
        {matchScore != null && (
          <div className="absolute left-3 top-3">
            <Badge variant="success" className="shadow-[var(--shadow-sm)]">
              <Sparkles className="h-3 w-3" />
              {matchScore}% match
            </Badge>
          </div>
        )}
        <div className="absolute right-3 top-3 flex flex-col items-end gap-1">
          <Badge
            variant={
              property.status === "active"
                ? "success"
                : property.status === "pending"
                  ? "warning"
                  : "secondary"
            }
            className="capitalize shadow-[var(--shadow-sm)]"
          >
            {property.status.replace("_", " ")}
          </Badge>
          {property.listingSide === "mine" && (
            <Badge variant="accent" className="shadow-[var(--shadow-sm)]">
              Your listing
            </Badge>
          )}
        </div>
      </div>
      <CardContent className="space-y-3 p-4">
        <div>
          <div className="font-display text-base font-semibold tracking-tight text-[var(--color-fg)]">
            {formatCurrency(property.price)}
          </div>
          <h3 className="mt-0.5 text-sm font-medium text-[var(--color-fg)]">
            {property.title}
          </h3>
          <div className="mt-1 flex items-center gap-1 text-xs text-[var(--color-fg-muted)]">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {property.address}, {property.city}
            </span>
          </div>
          {property.mlsNumber && (
            <div className="mt-1 text-[10px] uppercase tracking-wide text-[var(--color-fg-subtle)]">
              MLS# {property.mlsNumber}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-[var(--color-fg-muted)]">
          <span className="inline-flex items-center gap-1">
            <Bed className="h-3.5 w-3.5" />
            {property.beds} bd
          </span>
          <span className="inline-flex items-center gap-1">
            <Bath className="h-3.5 w-3.5" />
            {property.baths} ba
          </span>
          <span className="inline-flex items-center gap-1">
            <Maximize className="h-3.5 w-3.5" />
            {formatNumber(property.sqft)} sqft
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={onView}
          >
            Details
          </Button>
          <Button size="sm" className="flex-1" onClick={onTour}>
            Tour
          </Button>
          {onToggleFavorite && (
            <Button
              size="icon"
              variant="outline"
              onClick={onToggleFavorite}
              className={cn(favorited && "text-[var(--color-danger)]")}
              aria-label={favorited ? "Unfavorite" : "Favorite"}
            >
              <Heart
                className={cn("h-4 w-4", favorited && "fill-current")}
              />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
