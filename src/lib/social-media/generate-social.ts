/**
 * Client-callable server functions for one-click social image & video generation.
 * Backed by Grok Imagine (xAI). Real listing photos only.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { SEED_PROPERTIES } from "@/data/seed";
import { listingPhotoUrls } from "@/lib/imagine-media";

const presetSchema = z.enum(["modern", "classic"]);

const factsSchema = z.object({
  address: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  price: z.number().nonnegative().optional(),
  beds: z.number().nonnegative().optional(),
  baths: z.number().nonnegative().optional(),
  sqft: z.number().nonnegative().optional(),
  title: z.string().max(200).optional(),
});

const imageInputSchema = z.object({
  listingId: z.string().min(1).max(120),
  preset: presetSchema.default("modern"),
  photoUrls: z.array(z.string().url().max(2000)).min(1).max(3),
  facts: factsSchema,
});

const videoStartSchema = z.object({
  listingId: z.string().min(1).max(120),
  preset: presetSchema.default("modern"),
  photoUrl: z.string().url().max(2000),
  facts: factsSchema,
  duration: z.number().min(4).max(12).optional(),
});

const videoPollSchema = z.object({
  jobId: z.string().min(1).max(200),
});

/**
 * Assert that every URL in `urls` is part of the listing's own media.
 * Throws if the listing is not found or if any URL is not in the listing's gallery.
 */
function assertUrlsOwnedByListing(listingId: string, urls: string[]): void {
  const listing = SEED_PROPERTIES.find((p) => p.id === listingId);
  if (!listing) {
    throw new Error("Listing not found");
  }
  const allowed = new Set(listingPhotoUrls(listing));
  for (const url of urls) {
    if (!allowed.has(url)) {
      throw new Error(
        "One or more photo URLs do not belong to the specified listing",
      );
    }
  }
}

export const generateSocialImage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(imageInputSchema)
  .handler(async ({ data, context }) => {
    void context.userId;
    assertUrlsOwnedByListing(data.listingId, data.photoUrls);
    const { generateSocialImageFromPhoto } = await import(
      "@/lib/social-media/grok-imagine.server"
    );
    return generateSocialImageFromPhoto({
      photoUrls: data.photoUrls,
      facts: data.facts,
      preset: data.preset,
    });
  });

export const startSocialVideo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(videoStartSchema)
  .handler(async ({ data, context }) => {
    void context.userId;
    assertUrlsOwnedByListing(data.listingId, [data.photoUrl]);
    const { startSocialVideoFromPhoto } = await import(
      "@/lib/social-media/grok-imagine.server"
    );
    return startSocialVideoFromPhoto({
      photoUrl: data.photoUrl,
      facts: data.facts,
      preset: data.preset,
      duration: data.duration,
    });
  });

export const pollSocialVideoJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(videoPollSchema)
  .handler(async ({ data, context }) => {
    void context.userId;
    const { pollSocialVideo } = await import(
      "@/lib/social-media/grok-imagine.server"
    );
    return pollSocialVideo(data.jobId);
  });
