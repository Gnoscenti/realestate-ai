/**
 * Grok Imagine helpers — pick listing/website photos + craft Imagine prompts.
 */
import type { Property } from "@/data/seed";

export type MediaPick = {
  imageUrl: string;
  source: "mls" | "website" | "imagine";
  reason: string;
  imaginePrompt: string;
};

/** Prefer real listing media; fall back to Imagine prompt for generation */
export function pickListingMedia(
  property?: Property | null,
  agentPhotoUrl?: string | null,
): MediaPick {
  const urls = [
    ...(property?.photoUrls ?? []),
    ...(property?.imageUrl ? [property.imageUrl] : []),
  ].filter(Boolean) as string[];

  if (urls[0]) {
    return {
      imageUrl: urls[0],
      source: property?.listingSide ? "mls" : "website",
      reason: "Selected primary photo from your listing / website inventory",
      imaginePrompt: buildImaginePrompt(property, "enhance"),
    };
  }

  // No photo yet — Imagining a photoreal listing creative from facts
  return {
    imageUrl: "",
    source: "imagine",
    reason: "No listing photo on file — use Grok Imagine from property facts",
    imaginePrompt: buildImaginePrompt(property, "create"),
  };
}

export function buildImaginePrompt(
  property?: Property | null,
  mode: "create" | "enhance" = "create",
): string {
  if (!property) {
    return "Photoreal luxury real estate social media hero image, soft California light, no text, no logos, no people, professional listing photography.";
  }
  const feats = property.features.slice(0, 4).join(", ") || "premium finishes";
  const base = `${property.beds} bedroom ${property.type} in ${property.neighborhood}, ${property.city}: ${feats}. ${property.description.slice(0, 180)}`;
  if (mode === "enhance") {
    return `Editorial real estate social crop of this home. ${base}. Clean composition, golden hour, no text overlays, no fake view counts, no watermarks.`;
  }
  return `Photoreal aerial-to-street luxury real estate photograph, ${base}. Architectural digest quality, natural light, empty of people, no text, no logos, no “views” counters.`;
}

/** Attach media picks to campaign posts */
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
  return posts.map((p, i) => {
    // Rotate gallery when multiple photos
    const gallery = property?.photoUrls?.length
      ? property.photoUrls
      : pick.imageUrl
        ? [pick.imageUrl]
        : [];
    const url = gallery[i % Math.max(gallery.length, 1)] || pick.imageUrl;
    return {
      ...p,
      imageUrl: url || undefined,
      mediaSource: url
        ? pick.source === "imagine"
          ? "imagine"
          : property?.mlsNumber
            ? "mls"
            : "website"
        : "imagine",
      imaginePrompt: pick.imaginePrompt,
      visualBrief: url
        ? `${p.visualBrief} · Using listing photo ${1 + (i % Math.max(gallery.length, 1))}`
        : `${p.visualBrief} · Grok Imagine: ${pick.imaginePrompt.slice(0, 120)}…`,
    };
  });
}
