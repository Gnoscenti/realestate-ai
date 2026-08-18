/**
 * Listing media for marketing — real MLS / website photos only.
 * Never invent property imagery from text facts.
 */
import type { Property } from "@/data/seed";

export type MediaSource = "mls" | "website" | "none";

export type MediaPick = {
  imageUrl: string;
  source: MediaSource;
  reason: string;
  /** Enhancement prompt only when a real photo exists (image-to-image / video) */
  imaginePrompt: string;
  /** True when agent must link website or sync MLS before creatives */
  needsRealPhoto: boolean;
};

/** Collect real photo URLs from a listing (website scrape or MLS). */
export function listingPhotoUrls(property?: Property | null): string[] {
  if (!property) return [];
  const urls = [
    ...(property.photoUrls ?? []),
    ...(property.imageUrl ? [property.imageUrl] : []),
  ].filter((u): u is string => Boolean(u && String(u).trim()));
  // de-dupe
  return [...new Set(urls)];
}

/**
 * Prefer real listing media. If none — do NOT fabricate from facts.
 * Point the agent at website scrape or MLS Hub instead.
 */
export function pickListingMedia(
  property?: Property | null,
  _agentPhotoUrl?: string | null,
): MediaPick {
  const urls = listingPhotoUrls(property);

  if (urls[0]) {
    const fromMls = Boolean(property?.mlsNumber || property?.listingSide);
    return {
      imageUrl: urls[0],
      source: fromMls ? "mls" : "website",
      reason: fromMls
        ? "Primary photo from MLS / listing inventory"
        : "Primary photo from your website inventory",
      imaginePrompt: buildImaginePrompt(property, "enhance"),
      needsRealPhoto: false,
    };
  }

  return {
    imageUrl: "",
    source: "none",
    reason:
      "No listing photo yet — scan your agent website or connect MLS so we use real photos (we never invent property images from text).",
    imaginePrompt: "",
    needsRealPhoto: true,
  };
}

/**
 * Prompts only for enhancing / animating an existing real photo.
 * "create from facts" path is intentionally removed.
 */
export function buildImaginePrompt(
  property?: Property | null,
  mode: "enhance" | "video" = "enhance",
): string {
  if (!property) {
    return mode === "video"
      ? "Slow cinematic pan across a luxury home exterior, natural light, no text, no logos, no people."
      : "Editorial real estate social crop, soft California light, no text, no logos, no people.";
  }
  const feats = property.features.slice(0, 4).join(", ") || "premium finishes";
  const base = `${property.beds}bd ${property.type} in ${property.neighborhood}, ${property.city}: ${feats}`;
  if (mode === "video") {
    return `Slow cinematic reveal of this real listing exterior/interior. ${base}. Natural light, empty of people, no text overlays, no watermarks.`;
  }
  return `Editorial real estate social crop of this home. ${base}. Clean composition, golden hour, no text overlays, no fake view counts, no watermarks.`;
}

/** Attach real listing photos to campaign posts. Skip inventing imagery. */
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
    if (!gallery.length) {
      return {
        ...p,
        imageUrl: undefined,
        mediaSource: "none" as const,
        imaginePrompt: undefined,
        visualBrief: `${p.visualBrief} · Add website or MLS photos before publishing creatives`,
      };
    }
    const url = gallery[i % gallery.length]!;
    return {
      ...p,
      imageUrl: url,
      mediaSource: (pick.source === "mls" ? "mls" : "website") as
        | "mls"
        | "website",
      imaginePrompt: pick.imaginePrompt,
      visualBrief: `${p.visualBrief} · Listing photo ${1 + (i % gallery.length)} of ${gallery.length}`,
    };
  });
}

/** CTA copy when inventory has no photos */
export function needsPhotoCta(_property?: Property | null): string {
  return "Open MLS Hub → scan your agent website (or connect MLS) so we pull real photoUrls. Marketing never invents property images from text.";
}
