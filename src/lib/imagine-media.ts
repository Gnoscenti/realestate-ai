/**
 * Listing media helpers for social campaigns.
 *
 * STRICT POLICY (issue #19):
 * - Only real property photos (MLS / website / agent-uploaded) may be used.
 * - Never invent, synthesize, or recommend generating property imagery from text facts.
 * - Grok Imagine is used only to overlay text/branding or animate an existing photo.
 */
import type { Property } from "@/data/seed";

export type MediaSource = "mls" | "website" | "none";

export type MediaPick = {
  imageUrl: string;
  source: MediaSource;
  reason: string;
  /** Overlay / animation prompt only — never a text-to-image invent prompt */
  imaginePrompt: string;
  hasRealPhoto: boolean;
};

/** True when the listing has at least one usable photo URL. */
export function listingHasRealPhotos(property?: Property | null): boolean {
  if (!property) return false;
  if (property.imageUrl?.trim()) return true;
  return Boolean(property.photoUrls?.some((u) => Boolean(u?.trim())));
}

/** Collect unique non-empty photo URLs from a listing. */
export function listingPhotoUrls(property?: Property | null): string[] {
  if (!property) return [];
  const urls = [
    ...(property.photoUrls ?? []),
    ...(property.imageUrl ? [property.imageUrl] : []),
  ]
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter(Boolean);
  return [...new Set(urls)];
}

/**
 * Prefer real listing media. When none exist, return an empty pick —
 * callers must disable Generate Image / Video actions.
 */
export function pickListingMedia(
  property?: Property | null,
  _agentPhotoUrl?: string | null,
): MediaPick {
  const urls = listingPhotoUrls(property);

  if (urls[0]) {
    return {
      imageUrl: urls[0],
      source: property?.listingSide || property?.mlsNumber ? "mls" : "website",
      reason: "Selected primary photo from your listing / website inventory",
      imaginePrompt: buildOverlayPrompt(property, "modern"),
      hasRealPhoto: true,
    };
  }

  return {
    imageUrl: "",
    source: "none",
    reason: "Add at least one real listing photo to create media.",
    imaginePrompt: "",
    hasRealPhoto: false,
  };
}

/**
 * Overlay / animation prompt only. Never asks the model to invent a property.
 * Used by Grok Imagine image-edit and image-to-video paths.
 */
export function buildOverlayPrompt(
  property?: Property | null,
  preset: "modern" | "classic" = "modern",
): string {
  if (!property) {
    return preset === "classic"
      ? "Add elegant serif listing text overlays (price and address) in the lower third. Keep the exact property photo unchanged — no new rooms, no invented architecture, no people, no logos other than text."
      : "Add clean modern sans-serif listing text overlays (price and address) in the lower third with subtle gradient. Keep the exact property photo unchanged — no new rooms, no invented architecture, no people, no logos other than text.";
  }

  const price =
    typeof property.price === "number" && property.price > 0
      ? `$${property.price.toLocaleString("en-US")}`
      : "";
  const line = [property.address, property.city].filter(Boolean).join(", ");
  const bedsBaths = `${property.beds} bd · ${property.baths} ba · ${property.sqft?.toLocaleString?.() ?? property.sqft} sqft`;
  const style =
    preset === "classic"
      ? "elegant classic real-estate template, soft serif type, gold accent line"
      : "modern minimal real-estate template, bold sans-serif type, clean white/dark bar";

  return [
    `Using this exact property photograph as the base, produce a ready-to-post social listing image.`,
    `Do not invent, replace, inpaint, or alter the architecture, rooms, exterior, or landscaping.`,
    `Only add professional ${style} text overlays.`,
    price ? `Primary overlay: ${price}` : "",
    line ? `Secondary overlay: ${line}` : "",
    `Tertiary: ${bedsBaths}`,
    `Optional badge: "Just Listed".`,
    `No fake view counts, no watermarks, no stock people, no logos beyond the text.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** @deprecated Use buildOverlayPrompt — invent-from-facts path removed. */
export function buildImaginePrompt(
  property?: Property | null,
  _mode: "create" | "enhance" = "enhance",
): string {
  return buildOverlayPrompt(property, "modern");
}

/** Attach real listing photos to campaign posts. Never falls back to invent prompts. */
export function attachMediaToPosts<
  T extends {
    visualBrief: string;
    altText: string;
    imageUrl?: string;
    imaginePrompt?: string;
    mediaSource?: "mls" | "website" | "imagine" | "none";
  },
>(posts: T[], property?: Property | null, agentPhoto?: string | null): T[] {
  const pick = pickListingMedia(property, agentPhoto);
  const gallery = listingPhotoUrls(property);

  return posts.map((p, i) => {
    const url = gallery.length
      ? gallery[i % gallery.length]
      : pick.imageUrl || undefined;

    if (!url) {
      return {
        ...p,
        imageUrl: undefined,
        mediaSource: "none" as const,
        imaginePrompt: undefined,
        visualBrief: `${p.visualBrief} · Add a real listing photo before generating creatives`,
      };
    }

    return {
      ...p,
      imageUrl: url,
      mediaSource: (pick.source === "mls" ? "mls" : "website") as
        | "mls"
        | "website",
      imaginePrompt: pick.imaginePrompt,
      visualBrief: `${p.visualBrief} · Using listing photo ${1 + (i % Math.max(gallery.length, 1))}`,
    };
  });
}
