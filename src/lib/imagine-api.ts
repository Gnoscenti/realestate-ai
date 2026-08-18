/**
 * Server routes: Grok Imagine image + video generation (xAI only).
 * Requires XAI_API_KEY. Prefer real listing imageUrl for I2I/I2V — never claim
 * text-only outputs are MLS photos.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";

const XAI_BASE = "https://api.x.ai/v1";

function xaiKey(): string | null {
  const k =
    process.env.XAI_API_KEY?.trim() ||
    process.env.GROK_API_KEY?.trim() ||
    process.env.XAI_KEY?.trim();
  return k || null;
}

const imageInput = z.object({
  prompt: z.string().min(8).max(2000),
  imageUrl: z.string().url().optional(),
  aspectRatio: z.string().max(12).optional(),
  n: z.number().min(1).max(4).optional(),
});

const videoInput = z.object({
  prompt: z.string().min(8).max(2000),
  imageUrl: z.string().url().optional(),
  duration: z.number().min(2).max(12).optional(),
  aspectRatio: z.string().max(12).optional(),
});

export type GenerateImageResult =
  | { ok: true; urls: string[]; model: string }
  | { ok: false; error: string };

export type GenerateVideoResult =
  | { ok: true; url: string; model: string; requestId?: string }
  | { ok: false; error: string; requestId?: string };

async function callXai(
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: any }> {
  const key = xaiKey();
  if (!key) {
    return { status: 0, json: { error: "XAI_API_KEY is not configured on the server" } };
  }
  const res = await fetch(`${XAI_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

export const generateImage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(imageInput)
  .handler(async ({ data }): Promise<GenerateImageResult> => {
    if (!xaiKey()) {
      return {
        ok: false,
        error:
          "Grok Imagine is not configured (set XAI_API_KEY). Until then, use real MLS/website photoUrls on the listing.",
      };
    }

    const model = data.imageUrl
      ? "grok-imagine-image-quality"
      : "grok-imagine-image-2.0";

    if (data.imageUrl) {
      const { status, json } = await callXai("/images/edits", {
        model,
        prompt: data.prompt,
        image: { url: data.imageUrl },
        n: data.n ?? 1,
        response_format: "url",
      });
      if (status < 200 || status >= 300) {
        return {
          ok: false,
          error:
            json?.error?.message ||
            json?.error ||
            `Imagine image edit failed (${status})`,
        };
      }
      const urls: string[] = (json?.data ?? [])
        .map((d: { url?: string }) => d.url)
        .filter(Boolean);
      if (!urls.length && json?.url) urls.push(json.url);
      if (!urls.length) {
        return { ok: false, error: "Imagine returned no image URLs" };
      }
      return { ok: true, urls, model };
    }

    const { status, json } = await callXai("/images/generations", {
      model,
      prompt: data.prompt,
      n: data.n ?? 1,
      ...(data.aspectRatio ? { aspect_ratio: data.aspectRatio } : {}),
      response_format: "url",
    });
    if (status < 200 || status >= 300) {
      return {
        ok: false,
        error:
          json?.error?.message ||
          json?.error ||
          `Imagine image generation failed (${status})`,
      };
    }
    const urls: string[] = (json?.data ?? [])
      .map((d: { url?: string }) => d.url)
      .filter(Boolean);
    if (!urls.length) {
      return { ok: false, error: "Imagine returned no image URLs" };
    }
    return { ok: true, urls, model };
  });

export const generateVideo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(videoInput)
  .handler(async ({ data }): Promise<GenerateVideoResult> => {
    if (!xaiKey()) {
      return {
        ok: false,
        error:
          "Grok Imagine is not configured (set XAI_API_KEY). Add a real listing photo first, then generate video.",
      };
    }

    const model = "grok-imagine-video-1.5";
    const body: Record<string, unknown> = {
      model,
      prompt: data.prompt,
      duration: data.duration ?? 6,
      ...(data.aspectRatio ? { aspect_ratio: data.aspectRatio } : {}),
    };
    if (data.imageUrl) {
      body.image = { url: data.imageUrl };
    }

    const { status, json } = await callXai("/videos/generations", body);
    if (status < 200 || status >= 300) {
      return {
        ok: false,
        error:
          json?.error?.message ||
          json?.error ||
          `Imagine video failed (${status})`,
      };
    }

    const direct =
      json?.video?.url || json?.url || json?.data?.[0]?.url || null;
    if (direct) {
      return { ok: true, url: direct, model, requestId: json?.request_id };
    }

    const requestId = json?.request_id as string | undefined;
    if (!requestId) {
      return { ok: false, error: "Imagine video returned no URL or request_id" };
    }

    const key = xaiKey()!;
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const poll = await fetch(`${XAI_BASE}/videos/${requestId}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const pj = await poll.json().catch(() => ({}));
      if (pj?.status === "done" || pj?.status === "completed") {
        const url = pj?.video?.url || pj?.url;
        if (url) return { ok: true, url, model, requestId };
        return { ok: false, error: "Video done but no URL", requestId };
      }
      if (pj?.status === "expired" || pj?.status === "failed") {
        return {
          ok: false,
          error: pj?.error || `Video ${pj.status}`,
          requestId,
        };
      }
    }
    return {
      ok: false,
      error: "Video generation timed out — try again in a moment",
      requestId,
    };
  });
