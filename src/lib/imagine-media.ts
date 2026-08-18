/**
 * Listing media for marketing — real MLS / website photos only.
 * Never invent property imagery from text facts.
 */
import type { Property } from "@/data/seed";

export type MediaSource = "listing_record" | "none";

export type MediaPick = {
  imageUrl: string;
  source: MediaSource;
  reason: string;
  needsRealPhoto: boolean;
};

export function listingPhotoUrls(property?: Property | null): string[] {
  if (!property) return [];
  const urls = [
    ...(property.photoUrls ?? []),
    ...(property.imageUrl ? [property.imageUrl] : []),
  ].filter((u): u is string => Boolean(u && String(u).trim()));
  return [...new Set(urls)];
}

export function pickListingMedia(
  property?: Property | null,
  _agentPhotoUrl?: string | null,
): MediaPick {
  const urls = listingPhotoUrls(property);

  if (urls[0]) {
    return {
      imageUrl: urls[0],
      // The browser Property model does not retain original photo provenance.
      // Label it only as a photo attached to this listing record.
      source: "listing_record",
      reason: "Actual photo saved with this listing (source not independently verified)",
      needsRealPhoto: false,
    };
  }

  return {
    imageUrl: "",
    source: "none",
    reason:
      "No listing photo yet — scan your agent website or connect MLS so we use real photos (we never invent property images from text).",
    needsRealPhoto: true,
  };
}

export function attachMediaToPosts<
  T extends {
    visualBrief: string;
    altText: string;
    imageUrl?: string;
    imaginePrompt?: string;
    mediaSource?:
      | "mls"
      | "website"
      | "listing_record"
      | "imagine"
      | "none";
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
      mediaSource: "listing_record" as const,
      imaginePrompt: undefined,
      visualBrief: `${p.visualBrief} · Listing photo ${1 + (i % gallery.length)} of ${gallery.length}`,
    };
  });
}

export function needsPhotoCta(_property?: Property | null): string {
  return "Open MLS Hub → scan your agent website (or connect MLS) so we can use actual property photos. Marketing never invents or generatively alters property imagery.";
}
