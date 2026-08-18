import { describe, expect, it } from "vitest";
import {
  listingHasRealPhotos,
  listingPhotoUrls,
  pickListingMedia,
  buildOverlayPrompt,
  attachMediaToPosts,
} from "@/lib/imagine-media";
import {
  buildSocialImagePrompt,
  buildSocialVideoPrompt,
  isGrokImagineMockMode,
} from "@/lib/social-media/grok-imagine.server";
import type { Property } from "@/data/seed";

const withPhotos: Property = {
  id: "p1",
  title: "Skyline Loft",
  address: "123 Main St",
  neighborhood: "Downtown",
  city: "San Diego",
  price: 850000,
  beds: 2,
  baths: 2,
  sqft: 1200,
  yearBuilt: 2018,
  type: "condo",
  status: "active",
  daysOnMarket: 5,
  features: ["City Views"],
  description: "Floor-to-ceiling glass.",
  lat: 32.7,
  lng: -117.1,
  pricePerSqft: 708,
  estimatedValue: 860000,
  accent: "#000",
  pattern: 1,
  photoUrls: [
    "https://images.example.com/listing-a.jpg",
    "https://images.example.com/listing-b.jpg",
  ],
  mlsNumber: "SD-123",
  listingSide: "mine",
};

const noPhotos: Property = {
  ...withPhotos,
  id: "p2",
  photoUrls: [],
  imageUrl: undefined,
  mlsNumber: undefined,
  listingSide: undefined,
};

describe("real-photo policy", () => {
  it("listingHasRealPhotos is true only with URLs", () => {
    expect(listingHasRealPhotos(withPhotos)).toBe(true);
    expect(listingHasRealPhotos(noPhotos)).toBe(false);
    expect(listingHasRealPhotos(null)).toBe(false);
  });

  it("listingPhotoUrls dedupes and trims", () => {
    const urls = listingPhotoUrls({
      ...withPhotos,
      imageUrl: "https://images.example.com/listing-a.jpg",
      photoUrls: [
        " https://images.example.com/listing-a.jpg ",
        "https://images.example.com/c.jpg",
      ],
    });
    expect(urls).toEqual([
      "https://images.example.com/listing-a.jpg",
      "https://images.example.com/c.jpg",
    ]);
  });

  it("pickListingMedia never invents when photos missing", () => {
    const pick = pickListingMedia(noPhotos);
    expect(pick.hasRealPhoto).toBe(false);
    expect(pick.imageUrl).toBe("");
    expect(pick.source).toBe("none");
    expect(pick.reason).toMatch(/real listing photo/i);
  });

  it("pickListingMedia returns real photo when present", () => {
    const pick = pickListingMedia(withPhotos);
    expect(pick.hasRealPhoto).toBe(true);
    expect(pick.imageUrl).toBe(withPhotos.photoUrls![0]);
    expect(pick.source).toBe("mls");
  });

  it("attachMediaToPosts marks none when no photos", () => {
    const posts = attachMediaToPosts(
      [{ visualBrief: "Hero", altText: "x" }],
      noPhotos,
    );
    expect(posts[0].mediaSource).toBe("none");
    expect(posts[0].imageUrl).toBeUndefined();
  });
});

describe("overlay prompts", () => {
  it("buildOverlayPrompt never asks to invent architecture", () => {
    const p = buildOverlayPrompt(withPhotos, "modern");
    expect(p).toMatch(/exact property photograph/i);
    expect(p).toMatch(/Do not invent/i);
    expect(p).not.toMatch(/photoreal aerial/i);
    expect(p).toContain("$850,000");
  });

  it("buildSocialImagePrompt includes price and forbids invention", () => {
    const p = buildSocialImagePrompt(
      {
        address: "123 Main",
        city: "San Diego",
        price: 850000,
        beds: 2,
        baths: 2,
        sqft: 1200,
      },
      "classic",
    );
    expect(p).toMatch(/Do not invent/i);
    expect(p).toContain("$850,000");
    expect(p).toMatch(/classic/i);
  });

  it("buildSocialVideoPrompt keeps source as first frame", () => {
    const p = buildSocialVideoPrompt(
      { address: "123 Main", price: 850000 },
      "modern",
    );
    expect(p).toMatch(/exact property photograph/i);
    expect(p).toMatch(/first frame|source image/i);
  });
});

describe("mock mode", () => {
  it("isGrokImagineMockMode is true without XAI_API_KEY", () => {
    expect(isGrokImagineMockMode()).toBe(true);
  });
});
