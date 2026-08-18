import { describe, expect, it } from "vitest";
import type { Property } from "@/data/seed";
import {
  MAX_SELECTED_LISTING_PHOTOS,
  attachMediaToPosts,
  filterListingPhotoSelection,
  needsPhotoCta,
} from "@/lib/imagine-media";

const PHOTO_A = "https://photos.example.test/listing-a.jpg";
const PHOTO_B = "https://photos.example.test/listing-b.jpg";
const PHOTO_C = "https://photos.example.test/listing-c.jpg";
const PHOTO_D = "https://photos.example.test/listing-d.jpg";
const UNKNOWN_PHOTO = "https://elsewhere.example.test/not-this-listing.jpg";

const property: Property = {
  id: "listing-1",
  title: "Canyon View Home",
  address: "1 Canyon View Way",
  neighborhood: "Canyon View",
  city: "San Diego",
  price: 1_500_000,
  beds: 4,
  baths: 3,
  sqft: 2_600,
  yearBuilt: 2019,
  type: "house",
  status: "active",
  daysOnMarket: 8,
  features: ["Canyon views", "Updated kitchen"],
  description: "A real listing with a verified photo gallery.",
  lat: 32.9,
  lng: -117.1,
  pricePerSqft: 577,
  estimatedValue: 1_500_000,
  accent: "sand",
  pattern: 1,
  mlsNumber: "MLS-123",
  listingSide: "mine",
  photoUrls: [PHOTO_A, PHOTO_B, PHOTO_C, PHOTO_D],
  imageUrl: PHOTO_A,
};

const posts = Array.from({ length: 4 }, (_, index) => ({
  id: `post-${index + 1}`,
  visualBrief: `Brief ${index + 1}`,
  altText: `Listing photo ${index + 1}`,
}));

describe("filterListingPhotoSelection", () => {
  it("keeps only listing photos, deduplicates, preserves order, and caps at three", () => {
    expect(
      filterListingPhotoSelection(property, [
        UNKNOWN_PHOTO,
        PHOTO_B,
        PHOTO_B,
        PHOTO_D,
        PHOTO_C,
        PHOTO_A,
      ]),
    ).toEqual([PHOTO_B, PHOTO_D, PHOTO_C]);
    expect(MAX_SELECTED_LISTING_PHOTOS).toBe(3);
  });
});

describe("attachMediaToPosts", () => {
  it("rotates an explicit real-photo selection without attaching Imagine prompts", () => {
    const attached = attachMediaToPosts(posts, property, null, {
      selectedPhotoUrls: [PHOTO_B, PHOTO_D],
      includeImaginePrompt: false,
    });

    expect(attached.map((post) => post.imageUrl)).toEqual([
      PHOTO_B,
      PHOTO_D,
      PHOTO_B,
      PHOTO_D,
    ]);
    expect(attached.every((post) => post.mediaSource === "mls")).toBe(true);
    expect(attached.every((post) => post.imaginePrompt === undefined)).toBe(
      true,
    );
  });

  it("fails closed when an explicit selection is empty or outside the listing", () => {
    for (const selectedPhotoUrls of [[], [UNKNOWN_PHOTO]]) {
      const attached = attachMediaToPosts(posts.slice(0, 1), property, null, {
        selectedPhotoUrls,
        includeImaginePrompt: false,
      });

      expect(attached[0]).toMatchObject({
        imageUrl: undefined,
        mediaSource: "none",
        imaginePrompt: undefined,
      });
    }
  });

  it("preserves automatic campaign behavior when no explicit selection is supplied", () => {
    const attached = attachMediaToPosts(posts, property);

    expect(attached.map((post) => post.imageUrl)).toEqual([
      PHOTO_A,
      PHOTO_B,
      PHOTO_C,
      PHOTO_D,
    ]);
    expect(attached.every((post) => Boolean(post.imaginePrompt))).toBe(true);
  });

  it("keeps the no-photo path honest and generation-free", () => {
    const withoutPhotos = { ...property, photoUrls: [], imageUrl: undefined };
    const [attached] = attachMediaToPosts(posts.slice(0, 1), withoutPhotos);

    expect(attached).toMatchObject({
      imageUrl: undefined,
      mediaSource: "none",
      imaginePrompt: undefined,
    });
    expect(needsPhotoCta(withoutPhotos)).toContain(
      "never invents property images from text",
    );
  });
});
