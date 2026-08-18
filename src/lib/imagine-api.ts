/**
 * Authenticated social-render entry points.
 *
 * Callers supply only workspace/listing/media ids. Listing facts, source URLs,
 * and provider prompts are resolved from server-owned inventory after the
 * authenticated user's workspace access is verified.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import type { Sql } from "@/lib/db";
import type { OwnedListingFacts } from "@/lib/listing-media/repository.server";
import type {
  SocialRenderJob,
  SocialRenderKind,
} from "@/lib/social-render/repository.server";

const XAI_BASE = "https://api.x.ai/v1";
const IMAGE_MODEL = "grok-imagine-image-quality";
const VIDEO_MODEL = "grok-imagine-video-1.5";
const MOCK_MODEL = "listing-media-mock-v1";

const opaqueId = z
  .string()
  .min(1)
  .max(240)
  .refine((value) => value === value.trim() && !/[\u0000-\u001f]/.test(value));

export const socialRenderInputSchema = z
  .object({
    workspaceId: opaqueId,
    listingId: opaqueId,
    mediaId: opaqueId,
    preset: z.enum(["modern", "classic"]).default("modern"),
    idempotencyKey: opaqueId,
  })
  .strict();

export const socialRenderPollSchema = z
  .object({
    workspaceId: opaqueId,
    jobId: opaqueId,
  })
  .strict();

export type SocialRenderInput = z.input<typeof socialRenderInputSchema>;
export type SocialRenderPollInput = z.input<typeof socialRenderPollSchema>;
type ParsedSocialRenderInput = z.output<typeof socialRenderInputSchema>;

export type RenderPreview =
  | { kind: "image"; url: string }
  | { kind: "video"; url: string };

export type PublicSocialRenderJob = {
  id: string;
  kind: SocialRenderKind;
  status: SocialRenderJob["status"];
  preview?: RenderPreview;
  errorCode?: string;
};

export type SocialRenderResult =
  | {
      ok: true;
      job: PublicSocialRenderJob;
      model: string;
      replayed: boolean;
    }
  | {
      ok: false;
      code:
        | "disabled"
        | "not_configured"
        | "entitlement_required"
        | "quota_exceeded"
        | "listing_media_unavailable"
        | "idempotency_conflict"
        | "provider_error"
        | "provider_unavailable"
        | "invalid_provider_output"
        | "job_unavailable";
      error: string;
      job?: PublicSocialRenderJob;
    };

export type GrokMediaMode = "mock" | "live" | "disabled";
type Environment = Record<string, string | undefined>;

function configuredMode(env: Environment): string | null {
  const raw = env.GROK_MEDIA_MODE?.trim().toLowerCase();
  return raw || null;
}

function xaiKey(env: Environment = process.env): string | null {
  const key = env.XAI_API_KEY?.trim();
  return key || null;
}

/**
 * Preview and tests can never make a paid call. Production is fail-closed and
 * requires both an explicit live mode and the one documented server key.
 */
export function getGrokMediaMode(
  env: Environment = process.env,
): GrokMediaMode {
  const explicit = configuredMode(env);
  if (explicit === "disabled") return "disabled";
  if (explicit && !["mock", "live"].includes(explicit)) return "disabled";

  if (env.NODE_ENV === "test") return "mock";
  if (env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "development") {
    return "mock";
  }
  if (env.VERCEL_ENV === "production") {
    return explicit === "live" && Boolean(xaiKey(env)) ? "live" : "disabled";
  }

  if (explicit === "mock") return "mock";
  if (explicit === "live") return xaiKey(env) ? "live" : "disabled";
  if (env.NODE_ENV === "production") return "disabled";
  return "mock";
}

function disabledResult(env: Environment = process.env): SocialRenderResult {
  const explicitlyLive = configuredMode(env) === "live";
  if (explicitlyLive && !xaiKey(env)) {
    return {
      ok: false,
      code: "not_configured",
      error: "Live Grok media is not configured on this deployment.",
    };
  }
  return {
    ok: false,
    code: "disabled",
    error: "Live Grok media is disabled on this deployment.",
  };
}

function listingReference(facts: OwnedListingFacts): string {
  const location = [
    facts.addressLine1,
    facts.city,
    facts.state,
    facts.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
  const details = [
    facts.beds == null ? null : `${facts.beds} beds`,
    facts.baths == null ? null : `${facts.baths} baths`,
    facts.livingArea == null ? null : `${facts.livingArea} sq ft`,
  ]
    .filter(Boolean)
    .join(", ");
  return [facts.title, location, details].filter(Boolean).join(" — ");
}

export function buildOwnedImagePrompt(
  facts: OwnedListingFacts,
  preset: ParsedSocialRenderInput["preset"],
): string {
  const finish =
    preset === "classic"
      ? "balanced contrast, natural color, and a timeless editorial crop"
      : "clean contrast, natural daylight, and a modern editorial crop";
  return [
    "Edit only the supplied listing-inventory photograph.",
    `Use ${finish}.`,
    "Preserve the property's architecture, materials, fixtures, views, and room geometry exactly.",
    "Do not add or remove objects, people, text, logos, watermarks, or property features.",
    `Server listing reference: ${listingReference(facts)}.`,
  ].join(" ");
}

export function buildOwnedVideoPrompt(
  facts: OwnedListingFacts,
  preset: ParsedSocialRenderInput["preset"],
): string {
  const motion =
    preset === "classic"
      ? "a restrained slow push with steady framing"
      : "a subtle cinematic push with gentle parallax";
  return [
    "Animate only the supplied listing-inventory photograph using",
    `${motion}.`,
    "Preserve all architecture, materials, fixtures, views, objects, and room geometry exactly.",
    "No people, invented spaces, text, logos, watermarks, cuts, or transitions.",
    `Server listing reference: ${listingReference(facts)}.`,
  ].join(" ");
}

/** Syntax-only normalization: deliberately no DNS lookup or network access. */
export function normalizeMockSourceUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname) {
    throw new Error("Listing media has no safe preview URL");
  }
  url.hash = "";
  return url.toString();
}

function publicJob(job: SocialRenderJob): PublicSocialRenderJob {
  const preview =
    job.outputUrl && job.previewKind
      ? ({ kind: job.previewKind, url: job.outputUrl } as RenderPreview)
      : undefined;
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    ...(preview ? { preview } : {}),
    ...(job.errorCode ? { errorCode: job.errorCode } : {}),
  };
}

async function requestFingerprint(
  kind: SocialRenderKind,
  input: ParsedSocialRenderInput,
): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256")
    .update(
      JSON.stringify([
        kind,
        input.workspaceId,
        input.listingId,
        input.mediaId,
        input.preset,
      ]),
    )
    .digest("hex");
}

type ResolvedJob = {
  sourceUrl: string;
  prompt: string;
  job: SocialRenderJob;
  replayed: boolean;
  model: string;
  key: string | null;
};

function safeRepositoryError(error: unknown): SocialRenderResult {
  const message = error instanceof Error ? error.message : "";
  if (message.toLowerCase().includes("idempotency")) {
    return {
      ok: false,
      code: "idempotency_conflict",
      error: "That idempotency key belongs to a different render request.",
    };
  }
  return {
    ok: false,
    code: "listing_media_unavailable",
    error: "The selected listing photo is unavailable for this workspace.",
  };
}

async function settleUsageFailure(
  job: SocialRenderJob,
  errorCode: string,
  sqlOverride?: Sql,
): Promise<SocialRenderJob> {
  const { failSocialRenderJob } = await import(
    "@/lib/social-render/repository.server"
  );
  const failed = await failSocialRenderJob(
    job.userId,
    job.workspaceId,
    job.id,
    errorCode,
    sqlOverride,
  );
  if (job.usageId) {
    const { finalizeAiGeneration } = await import(
      "@/lib/ai-usage/repository.server"
    );
    await finalizeAiGeneration(
      {
        id: job.usageId,
        userId: job.userId,
        workspaceId: job.workspaceId,
        status: "failed",
        errorCode,
      },
      sqlOverride,
    ).catch((error) => {
      console.error("[social-render] usage failure settlement failed", error);
    });
  }
  return failed;
}

async function settleUsageSuccess(
  job: SocialRenderJob,
  outputUrl: string,
  previewKind: "image" | "video",
  sqlOverride?: Sql,
): Promise<SocialRenderJob> {
  const { completeSocialRenderJob } = await import(
    "@/lib/social-render/repository.server"
  );
  const completed = await completeSocialRenderJob(
    job.userId,
    job.workspaceId,
    job.id,
    outputUrl,
    previewKind,
    sqlOverride,
  );
  if (job.usageId) {
    const { finalizeAiGeneration } = await import(
      "@/lib/ai-usage/repository.server"
    );
    await finalizeAiGeneration(
      {
        id: job.usageId,
        userId: job.userId,
        workspaceId: job.workspaceId,
        status: "completed",
      },
      sqlOverride,
    ).catch((error) => {
      console.error("[social-render] usage success settlement failed", error);
    });
  }
  return completed;
}

async function resolveAndCreateJob(
  userId: string,
  kind: SocialRenderKind,
  input: ParsedSocialRenderInput,
  sqlOverride?: Sql,
): Promise<ResolvedJob | SocialRenderResult> {
  const mode = getGrokMediaMode();
  if (mode === "disabled") return disabledResult();

  try {
    const { getOwnedListingMedia } = await import(
      "@/lib/listing-media/repository.server"
    );
    const selection = await getOwnedListingMedia(
      userId,
      input.workspaceId,
      input.listingId,
      [input.mediaId],
      sqlOverride,
    );
    const sourceUrl = selection.media[0]!.sourceUrl;
    const prompt =
      kind === "image"
        ? buildOwnedImagePrompt(selection.listing, input.preset)
        : buildOwnedVideoPrompt(selection.listing, input.preset);
    const model =
      mode === "mock" ? MOCK_MODEL : kind === "image" ? IMAGE_MODEL : VIDEO_MODEL;
    const fingerprint = await requestFingerprint(kind, input);
    let usageId: string | undefined;

    if (mode === "live") {
      const { reserveAiGeneration } = await import(
        "@/lib/ai-usage/repository.server"
      );
      const reservation = await reserveAiGeneration(
        {
          userId,
          workspaceId: input.workspaceId,
          product: "grok_media",
          operation: kind,
          model,
          inputChars: prompt.length,
          units: kind === "image" ? 1 : 5,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: fingerprint,
        },
        sqlOverride,
      );
      if (!reservation.allowed) {
        return {
          ok: false,
          code: reservation.reason,
          error:
            reservation.reason === "entitlement_required"
              ? "Live Grok media requires an active workspace entitlement."
              : "Your Grok media quota has been reached.",
        };
      }
      usageId = reservation.id;
    }

    const { createSocialRenderJob } = await import(
      "@/lib/social-render/repository.server"
    );
    // Keep the usage reservation open if durable job creation fails. A retry
    // with the same key can then attach the same charged reservation; marking
    // it failed here would make a later successful provider result impossible
    // to settle without charging twice.
    const created = await createSocialRenderJob(
      {
        userId,
        workspaceId: input.workspaceId,
        listingId: input.listingId,
        mediaId: input.mediaId,
        kind,
        provider: mode === "mock" ? "mock" : "xai",
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: fingerprint,
        ...(usageId ? { usageId } : {}),
      },
      sqlOverride,
    );

    return {
      sourceUrl,
      prompt,
      job: created.job,
      replayed: created.replayed,
      model,
      key: mode === "live" ? xaiKey() : null,
    };
  } catch (error) {
    return safeRepositoryError(error);
  }
}

function isFailure(value: ResolvedJob | SocialRenderResult): value is SocialRenderResult {
  return "ok" in value;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return record(await response.json().catch(() => ({})));
}

function nestedString(value: unknown, key: string): string | null {
  const candidate = record(value)[key];
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : null;
}

function firstDataUrl(json: Record<string, unknown>): string | null {
  const data = Array.isArray(json.data) ? json.data : [];
  return nestedString(data[0], "url") ?? nestedString(json, "url");
}

function videoUrl(json: Record<string, unknown>): string | null {
  return (
    nestedString(json.video, "url") ??
    nestedString(json, "url") ??
    firstDataUrl(json)
  );
}

async function assertLiveUrl(rawUrl: string): Promise<string> {
  const { assertPublicHttpUrl } = await import("@/lib/safe-outbound-url.server");
  return (await assertPublicHttpUrl(rawUrl)).toString();
}

function replayResult(resolved: ResolvedJob): SocialRenderResult | null {
  if (!resolved.replayed || resolved.job.status === "reserved") return null;
  if (resolved.job.status === "failed") {
    return errorWithJob(
      "provider_error",
      "The earlier render attempt failed.",
      resolved.job,
    );
  }
  return {
    ok: true,
    job: publicJob(resolved.job),
    model: resolved.model,
    replayed: true,
  };
}

function errorWithJob(
  code: Extract<SocialRenderResult, { ok: false }>["code"],
  error: string,
  job: SocialRenderJob,
): SocialRenderResult {
  return { ok: false, code, error, job: publicJob(job) };
}

export async function generateImageForUser(
  userId: string,
  rawInput: SocialRenderInput,
  sqlOverride?: Sql,
): Promise<SocialRenderResult> {
  const input = socialRenderInputSchema.parse(rawInput);
  const resolved = await resolveAndCreateJob(userId, "image", input, sqlOverride);
  if (isFailure(resolved)) return resolved;
  const replay = replayResult(resolved);
  if (replay) return replay;

  if (resolved.job.provider === "mock") {
    try {
      const completed = await settleUsageSuccess(
        resolved.job,
        normalizeMockSourceUrl(resolved.sourceUrl),
        "image",
        sqlOverride,
      );
      return { ok: true, job: publicJob(completed), model: resolved.model, replayed: resolved.replayed };
    } catch {
      const failed = await settleUsageFailure(
        resolved.job,
        "unsafe_mock_url",
        sqlOverride,
      ).catch(() => resolved.job);
      return errorWithJob(
        "listing_media_unavailable",
        "The selected listing photo has no safe preview URL.",
        failed,
      );
    }
  }

  // A reserved live replay may have reached the provider before a crash. Never
  // issue a second paid request when provider submission cannot be proven absent.
  if (resolved.replayed) {
    return errorWithJob(
      "job_unavailable",
      "This render is still reserved; retrying could duplicate a paid request.",
      resolved.job,
    );
  }

  try {
    const sourceUrl = await assertLiveUrl(resolved.sourceUrl);
    const response = await fetch(`${XAI_BASE}/images/edits`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolved.key!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt: resolved.prompt,
        image: { url: sourceUrl },
        n: 1,
        response_format: "url",
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const json = await responseJson(response);
    if (!response.ok) throw new Error(`provider_http_${response.status}`);
    const outputUrl = firstDataUrl(json);
    if (!outputUrl) {
      const failed = await settleUsageFailure(resolved.job, "empty_response", sqlOverride);
      return errorWithJob("invalid_provider_output", "Grok returned no image.", failed);
    }
    const completed = await settleUsageSuccess(
      resolved.job,
      await assertLiveUrl(outputUrl),
      "image",
      sqlOverride,
    );
    return { ok: true, job: publicJob(completed), model: resolved.model, replayed: false };
  } catch {
    const failed = await settleUsageFailure(resolved.job, "provider_error", sqlOverride);
    return errorWithJob("provider_error", "Grok image generation failed.", failed);
  }
}

export async function startVideoForUser(
  userId: string,
  rawInput: SocialRenderInput,
  sqlOverride?: Sql,
): Promise<SocialRenderResult> {
  const input = socialRenderInputSchema.parse(rawInput);
  const resolved = await resolveAndCreateJob(userId, "video", input, sqlOverride);
  if (isFailure(resolved)) return resolved;
  const replay = replayResult(resolved);
  if (replay) return replay;

  if (resolved.job.provider === "mock") {
    try {
      const completed = await settleUsageSuccess(
        resolved.job,
        normalizeMockSourceUrl(resolved.sourceUrl),
        "image",
        sqlOverride,
      );
      return { ok: true, job: publicJob(completed), model: resolved.model, replayed: resolved.replayed };
    } catch {
      const failed = await settleUsageFailure(
        resolved.job,
        "unsafe_mock_url",
        sqlOverride,
      ).catch(() => resolved.job);
      return errorWithJob(
        "listing_media_unavailable",
        "The selected listing photo has no safe preview URL.",
        failed,
      );
    }
  }

  if (resolved.replayed) {
    return errorWithJob(
      "job_unavailable",
      "This video is still reserved; retrying could duplicate a paid request.",
      resolved.job,
    );
  }

  try {
    const sourceUrl = await assertLiveUrl(resolved.sourceUrl);
    const response = await fetch(`${XAI_BASE}/videos/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolved.key!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: VIDEO_MODEL,
        prompt: resolved.prompt,
        duration: 6,
        aspect_ratio: "9:16",
        image: { url: sourceUrl },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const json = await responseJson(response);
    if (!response.ok) throw new Error(`provider_http_${response.status}`);

    const directUrl = videoUrl(json);
    if (directUrl) {
      const completed = await settleUsageSuccess(
        resolved.job,
        await assertLiveUrl(directUrl),
        "video",
        sqlOverride,
      );
      return { ok: true, job: publicJob(completed), model: resolved.model, replayed: false };
    }
    const requestId = nestedString(json, "request_id");
    if (!requestId) {
      const failed = await settleUsageFailure(resolved.job, "empty_response", sqlOverride);
      return errorWithJob("invalid_provider_output", "Grok returned no video job.", failed);
    }
    const { markSocialRenderSubmitted } = await import(
      "@/lib/social-render/repository.server"
    );
    const submitted = await markSocialRenderSubmitted(
      userId,
      input.workspaceId,
      resolved.job.id,
      requestId,
      sqlOverride,
    );
    return { ok: true, job: publicJob(submitted), model: resolved.model, replayed: false };
  } catch {
    const failed = await settleUsageFailure(resolved.job, "provider_error", sqlOverride);
    return errorWithJob("provider_error", "Grok video submission failed.", failed);
  }
}

export async function pollVideoForUser(
  userId: string,
  rawInput: SocialRenderPollInput,
  sqlOverride?: Sql,
): Promise<SocialRenderResult> {
  const input = socialRenderPollSchema.parse(rawInput);
  const { getSocialRenderJob } = await import(
    "@/lib/social-render/repository.server"
  );
  let job: SocialRenderJob;
  try {
    job = await getSocialRenderJob(
      userId,
      input.workspaceId,
      input.jobId,
      sqlOverride,
    );
  } catch {
    return { ok: false, code: "job_unavailable", error: "Video job not found." };
  }
  if (job.kind !== "video") {
    return errorWithJob("job_unavailable", "That job is not a video render.", job);
  }
  if (job.status === "completed" || job.status === "failed") {
    if (job.status === "failed") {
      return errorWithJob("provider_error", "The video render failed.", job);
    }
    return { ok: true, job: publicJob(job), model: job.provider === "mock" ? MOCK_MODEL : VIDEO_MODEL, replayed: true };
  }
  if (job.provider !== "xai" || job.status !== "submitted" || !job.providerRequestId) {
    return errorWithJob("job_unavailable", "This video is not ready to poll.", job);
  }
  const mode = getGrokMediaMode();
  const key = xaiKey();
  if (mode !== "live" || !key) return disabledResult();

  let response: Response;
  try {
    response = await fetch(`${XAI_BASE}/videos/${encodeURIComponent(job.providerRequestId)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return errorWithJob(
      "provider_unavailable",
      "Grok video status is temporarily unavailable.",
      job,
    );
  }
  const json = await responseJson(response);
  if (!response.ok) {
    if (response.status >= 500 || response.status === 429) {
      return errorWithJob(
        "provider_unavailable",
        "Grok video status is temporarily unavailable.",
        job,
      );
    }
    const failed = await settleUsageFailure(job, "poll_rejected", sqlOverride);
    return errorWithJob("provider_error", "Grok rejected the video status request.", failed);
  }

  const status = nestedString(json, "status")?.toLowerCase();
  if (["failed", "expired", "cancelled", "canceled"].includes(status ?? "")) {
    const failed = await settleUsageFailure(job, `provider_${status}`, sqlOverride);
    return errorWithJob("provider_error", "Grok video generation failed.", failed);
  }
  if (["done", "completed", "succeeded"].includes(status ?? "")) {
    const outputUrl = videoUrl(json);
    if (!outputUrl) {
      const failed = await settleUsageFailure(job, "empty_response", sqlOverride);
      return errorWithJob("invalid_provider_output", "Grok returned no video.", failed);
    }
    try {
      const completed = await settleUsageSuccess(
        job,
        await assertLiveUrl(outputUrl),
        "video",
        sqlOverride,
      );
      return { ok: true, job: publicJob(completed), model: VIDEO_MODEL, replayed: false };
    } catch {
      const failed = await settleUsageFailure(job, "unsafe_output_url", sqlOverride);
      return errorWithJob("invalid_provider_output", "Grok returned an invalid video URL.", failed);
    }
  }

  // Exactly one provider poll per server call. The client controls cadence.
  return { ok: true, job: publicJob(job), model: VIDEO_MODEL, replayed: true };
}

export const generateImage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(socialRenderInputSchema)
  .handler(({ context, data }) => generateImageForUser(context.userId, data));

export const generateVideo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(socialRenderInputSchema)
  .handler(({ context, data }) => startVideoForUser(context.userId, data));

export const pollVideo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(socialRenderPollSchema)
  .handler(({ context, data }) => pollVideoForUser(context.userId, data));
