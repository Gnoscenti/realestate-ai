/**
 * Grok Imagine (xAI) server helpers for real-estate social media.
 *
 * Policy: only operate on real listing photo URLs. Never text-to-image invent.
 * Image path = /v1/images/edits (overlay text on real photo).
 * Video path = /v1/videos/generations image-to-video + poll.
 */
import { assertPublicHttpUrl } from "@/lib/safe-outbound-url.server";

const XAI_BASE = "https://api.x.ai/v1";
const IMAGE_MODEL = "grok-imagine-image-2.0";
const VIDEO_MODEL = "grok-imagine-video";

export type SocialPreset = "modern" | "classic";

export type ListingOverlayFacts = {
  address?: string;
  city?: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  title?: string;
};

function apiKey(): string | null {
  const key = process.env.XAI_API_KEY?.trim();
  return key || null;
}

/** True when we should return deterministic mocks (CI / missing key). */
export function isGrokImagineMockMode(): boolean {
  if (process.env.GROK_IMAGINE_FORCE_LIVE === "1") return false;
  if (!apiKey()) return true;
  if (process.env.NODE_ENV === "test") return true;
  return false;
}

export function buildSocialImagePrompt(
  facts: ListingOverlayFacts,
  preset: SocialPreset,
): string {
  const price =
    typeof facts.price === "number" && facts.price > 0
      ? `$${facts.price.toLocaleString("en-US")}`
      : "";
  const line = [facts.address, facts.city].filter(Boolean).join(", ");
  const bedsBaths = [
    facts.beds != null ? `${facts.beds} bd` : null,
    facts.baths != null ? `${facts.baths} ba` : null,
    facts.sqft != null ? `${facts.sqft.toLocaleString("en-US")} sqft` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const style =
    preset === "classic"
      ? "elegant classic real-estate social template, soft serif type, subtle gold accent line"
      : "modern minimal real-estate social template, bold sans-serif type, clean gradient bar";

  return [
    "Using this exact property photograph as the base image, produce a square ready-to-post social listing creative.",
    "CRITICAL: Do not invent, replace, inpaint, hallucinate, or alter the architecture, rooms, exterior, landscaping, or any physical property details.",
    "Preserve the original photo content completely. Only add professional text and graphic overlays.",
    `Style: ${style}.`,
    price ? `Primary text overlay: ${price}` : "",
    line ? `Secondary text overlay: ${line}` : "",
    bedsBaths ? `Tertiary text: ${bedsBaths}` : "",
    'Optional small badge: "Just Listed".',
    "No fake engagement metrics, no stock people, no extra logos, no watermarks.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildSocialVideoPrompt(
  facts: ListingOverlayFacts,
  preset: SocialPreset,
): string {
  const price =
    typeof facts.price === "number" && facts.price > 0
      ? `$${facts.price.toLocaleString("en-US")}`
      : "";
  const line = [facts.address, facts.city].filter(Boolean).join(", ");
  const motion =
    preset === "classic"
      ? "slow elegant cinematic push-in with soft natural motion"
      : "smooth modern parallax zoom with subtle camera drift";

  return [
    "Animate this exact property photograph into a short social listing video.",
    "The source image is the first frame and must remain the true property — do not invent rooms, exteriors, or people.",
    `${motion}.`,
    price || line
      ? `Keep the property visible throughout; optional subtle lower-third text may show ${[price, line].filter(Boolean).join(" · ")}.`
      : "Keep the property visible throughout.",
    "No fake view counts, no stock actors, no invented architecture.",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Approved media hostnames for listing photos.
 * Restricts Grok Imagine to app-owned or known MLS CDN sources.
 * Expand this list as additional vetted CDN domains are onboarded.
 */
const APPROVED_PHOTO_HOSTS: readonly string[] = [
  // Vercel Blob storage (app-owned)
  "public.blob.vercel-storage.com",
  // Common MLS / real-estate CDN domains
  "cdn.mlsgrid.com",
  "photos.zillowstatic.com",
  "ssl.cdn-redfin.com",
  "ap.rdcpix.com",
  "listing.coldwellbanker.com",
];

async function validatePhotoUrls(urls: string[]): Promise<string[]> {
  if (!urls.length) {
    throw new Error("At least one real listing photo URL is required");
  }
  if (urls.length > 3) {
    throw new Error("Maximum 3 photos per render");
  }
  const validated: string[] = [];
  for (const raw of urls) {
    const u = await assertPublicHttpUrl(raw);
    if (u.protocol !== "https:" && process.env.NODE_ENV === "production") {
      throw new Error("Listing photos must be HTTPS in production");
    }
    if (!isGrokImagineMockMode() && !APPROVED_PHOTO_HOSTS.includes(u.hostname)) {
      throw new Error(
        `Photo host "${u.hostname}" is not an approved media source. ` +
          `Listing photos must be served from a known app-owned or MLS CDN domain.`,
      );
    }
    validated.push(u.toString());
  }
  return validated;
}

export type SocialImageResult = {
  imageUrl: string;
  provider: "grok-imagine" | "mock";
  model: string;
  promptUsed: string;
};

/**
 * Edit a real listing photo into a social creative via Grok Imagine image edits.
 */
export async function generateSocialImageFromPhoto(opts: {
  photoUrls: string[];
  facts: ListingOverlayFacts;
  preset: SocialPreset;
}): Promise<SocialImageResult> {
  const photos = await validatePhotoUrls(opts.photoUrls);
  const prompt = buildSocialImagePrompt(opts.facts, opts.preset);

  if (isGrokImagineMockMode()) {
    return {
      imageUrl: photos[0],
      provider: "mock",
      model: "mock-passthrough",
      promptUsed: prompt,
    };
  }

  const key = apiKey()!;
  const primary = photos[0];
  const body: Record<string, unknown> = {
    model: IMAGE_MODEL,
    prompt,
    image: { url: primary, type: "image_url" },
    response_format: "url",
  };
  if (photos.length > 1) {
    body.images = photos.slice(1).map((url) => ({ url, type: "image_url" }));
  }

  const res = await fetch(`${XAI_BASE}/images/edits`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new Error("Grok Imagine is not configured or the API key is invalid");
    }
    if (res.status === 429) {
      throw new Error("Image generation rate limit reached — try again shortly");
    }
    throw new Error(
      `Grok Imagine image edit failed (${res.status}): ${text.slice(0, 200)}`,
    );
  }

  const json = (await res.json()) as {
    data?: Array<{ url?: string; b64_json?: string }>;
    url?: string;
  };
  const imageUrl =
    json.data?.[0]?.url ||
    json.url ||
    (json.data?.[0]?.b64_json
      ? `data:image/png;base64,${json.data[0].b64_json}`
      : null);

  if (!imageUrl) {
    throw new Error("Grok Imagine returned no image URL");
  }

  return {
    imageUrl,
    provider: "grok-imagine",
    model: IMAGE_MODEL,
    promptUsed: prompt,
  };
}

export type SocialVideoStartResult = {
  jobId: string;
  provider: "grok-imagine" | "mock";
  status: "queued" | "processing" | "completed" | "failed";
  videoUrl?: string;
  promptUsed: string;
};

/**
 * Start image-to-video from a real listing photo.
 * Returns a job id; poll with pollSocialVideo.
 */
export async function startSocialVideoFromPhoto(opts: {
  photoUrl: string;
  facts: ListingOverlayFacts;
  preset: SocialPreset;
  duration?: number;
}): Promise<SocialVideoStartResult> {
  const [photo] = await validatePhotoUrls([opts.photoUrl]);
  const prompt = buildSocialVideoPrompt(opts.facts, opts.preset);
  const duration = Math.min(12, Math.max(4, opts.duration ?? 6));

  if (isGrokImagineMockMode()) {
    return {
      jobId: `mock-video-${Date.now()}`,
      provider: "mock",
      status: "completed",
      videoUrl: photo,
      promptUsed: prompt,
    };
  }

  const key = apiKey()!;
  const body = {
    model: VIDEO_MODEL,
    prompt,
    duration,
    image: { url: photo, type: "image_url" },
  };

  const res = await fetch(`${XAI_BASE}/videos/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new Error("Grok Imagine is not configured or the API key is invalid");
    }
    if (res.status === 429) {
      throw new Error("Video generation rate limit reached — try again shortly");
    }
    throw new Error(
      `Grok Imagine video start failed (${res.status}): ${text.slice(0, 200)}`,
    );
  }

  const json = (await res.json()) as {
    request_id?: string;
    id?: string;
    status?: string;
    url?: string;
    video?: { url?: string };
  };

  const jobId = json.request_id || json.id;
  if (!jobId) {
    const immediate = json.url || json.video?.url;
    if (immediate) {
      return {
        jobId: `immediate-${Date.now()}`,
        provider: "grok-imagine",
        status: "completed",
        videoUrl: immediate,
        promptUsed: prompt,
      };
    }
    throw new Error("Grok Imagine returned no video job id");
  }

  return {
    jobId,
    provider: "grok-imagine",
    status: "queued",
    promptUsed: prompt,
  };
}

export type SocialVideoPollResult = {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  videoUrl?: string;
  error?: string;
};

export async function pollSocialVideo(
  jobId: string,
): Promise<SocialVideoPollResult> {
  if (jobId.startsWith("mock-") || jobId.startsWith("immediate-")) {
    return {
      jobId,
      status: "completed",
      videoUrl: undefined,
    };
  }

  if (isGrokImagineMockMode()) {
    return { jobId, status: "completed" };
  }

  const key = apiKey();
  if (!key) {
    return {
      jobId,
      status: "failed",
      error: "Grok Imagine is not configured",
    };
  }

  const res = await fetch(`${XAI_BASE}/videos/${encodeURIComponent(jobId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${key}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 404) {
      return { jobId, status: "failed", error: "Video job not found" };
    }
    return {
      jobId,
      status: "failed",
      error: `Poll failed (${res.status}): ${text.slice(0, 160)}`,
    };
  }

  const json = (await res.json()) as {
    status?: string;
    url?: string;
    video?: { url?: string };
    error?: string | { message?: string };
  };

  const raw = (json.status || "").toLowerCase();
  let status: SocialVideoPollResult["status"] = "processing";
  if (raw === "completed" || raw === "succeeded" || raw === "done") {
    status = "completed";
  } else if (raw === "failed" || raw === "error" || raw === "cancelled") {
    status = "failed";
  } else if (raw === "queued" || raw === "pending") {
    status = "queued";
  }

  const videoUrl = json.url || json.video?.url;
  const error =
    typeof json.error === "string"
      ? json.error
      : json.error?.message || undefined;

  return { jobId, status, videoUrl, error };
}
