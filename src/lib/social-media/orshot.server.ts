import { publicHttpsUrlFromAllowlist } from "./url-safety.server";
import type { SocialImageTemplate } from "./templates.server";

export const ORSHOT_RENDER_ENDPOINT = "https://api.orshot.com/v1/studio/render";

export type OrshotFailureCode =
  | "provider_rate_limit"
  | "provider_timeout"
  | "provider_rejected"
  | "provider_unavailable"
  | "provider_response_invalid";

export class OrshotRenderError extends Error {
  readonly code: OrshotFailureCode;
  readonly ambiguousProviderOutcome: boolean;
  readonly retryAfterSeconds?: number;

  constructor(input: {
    code: OrshotFailureCode;
    message: string;
    ambiguousProviderOutcome: boolean;
    retryAfterSeconds?: number;
  }) {
    super(input.message);
    this.name = "OrshotRenderError";
    this.code = input.code;
    this.ambiguousProviderOutcome = input.ambiguousProviderOutcome;
    this.retryAfterSeconds = input.retryAfterSeconds;
  }
}

function timeoutMs(env: NodeJS.ProcessEnv): number {
  const parsed = Number(env.ORSHOT_TIMEOUT_MS?.trim());
  return Number.isInteger(parsed)
    ? Math.max(5_000, Math.min(50_000, parsed))
    : 25_000;
}

function retryAfterSeconds(response: Response): number | undefined {
  const raw = response.headers.get("retry-after")?.trim();
  if (!raw) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.min(3_600, Math.ceil(seconds))
    : undefined;
}

export interface RenderOrshotInput {
  jobId: string;
  template: SocialImageTemplate;
  modifications: Record<string, string>;
}

function modificationsAreApproved(
  input: RenderOrshotInput,
  env: NodeJS.ProcessEnv,
): boolean {
  const textKeys = Object.values(input.template.fields).filter(
    (value): value is string => Boolean(value),
  );
  const approvedKeys = new Set([...input.template.photoKeys, ...textKeys]);
  const suppliedKeys = Object.keys(input.modifications);
  if (
    suppliedKeys.length !== approvedKeys.size ||
    suppliedKeys.some((key) => !approvedKeys.has(key))
  ) {
    return false;
  }
  for (const photoKey of input.template.photoKeys) {
    if (
      !publicHttpsUrlFromAllowlist(
        input.modifications[photoKey],
        env.SOCIAL_MEDIA_PHOTO_HOST_ALLOWLIST,
      )
    ) {
      return false;
    }
  }
  return textKeys.every((key) => {
    const value = input.modifications[key];
    return (
      typeof value === "string" &&
      value.length <= 500 &&
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
    );
  });
}

export async function renderOrshotImage(
  input: RenderOrshotInput,
  options: {
    env?: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<string> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiKey = env.ORSHOT_API_KEY?.trim();
  if (!apiKey) {
    throw new OrshotRenderError({
      code: "provider_rejected",
      message: "Orshot is not configured for this workspace.",
      ambiguousProviderOutcome: false,
    });
  }
  if (!modificationsAreApproved(input, env)) {
    throw new OrshotRenderError({
      code: "provider_rejected",
      message: "The approved template inputs are invalid.",
      ambiguousProviderOutcome: false,
    });
  }

  let response: Response;
  try {
    response = await fetchImpl(ORSHOT_RENDER_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        templateId: input.template.templateId,
        modifications: input.modifications,
        response: {
          type: "url",
          format: "png",
          size: input.template.outputSize,
          includePages: [1],
          fileName: `social-${input.jobId}`,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs(env)),
    });
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError");
    throw new OrshotRenderError({
      code: timedOut ? "provider_timeout" : "provider_unavailable",
      message: timedOut
        ? "The image render timed out. Support must check the job before retrying."
        : "The image provider could not be reached. Support must check the job before retrying.",
      // A network failure may happen after Orshot accepted and billed the job.
      ambiguousProviderOutcome: true,
    });
  }

  if (!response.ok) {
    const retryAfter = retryAfterSeconds(response);
    if (response.status === 429) {
      throw new OrshotRenderError({
        code: "provider_rate_limit",
        message: "Image rendering is busy. Wait a moment and submit a new job.",
        ambiguousProviderOutcome: false,
        ...(retryAfter == null ? {} : { retryAfterSeconds: retryAfter }),
      });
    }
    const serverFailure = response.status >= 500;
    throw new OrshotRenderError({
      code: serverFailure ? "provider_unavailable" : "provider_rejected",
      message: serverFailure
        ? "The image provider reported an error. Support must check the job before retrying."
        : "The approved image template or provider credentials were rejected.",
      ambiguousProviderOutcome: serverFailure,
    });
  }

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > 262_144) {
    throw new OrshotRenderError({
      code: "provider_response_invalid",
      message: "The image provider returned an invalid response.",
      ambiguousProviderOutcome: true,
    });
  }
  const raw = await response.text();
  if (raw.length > 262_144) {
    throw new OrshotRenderError({
      code: "provider_response_invalid",
      message: "The image provider returned an invalid response.",
      ambiguousProviderOutcome: true,
    });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new OrshotRenderError({
      code: "provider_response_invalid",
      message: "The image provider returned an invalid response.",
      ambiguousProviderOutcome: true,
    });
  }
  const content = (json as { data?: { content?: unknown } })?.data?.content;
  const candidate = Array.isArray(content) ? content[0] : content;
  const contentUrl =
    typeof candidate === "string"
      ? publicHttpsUrlFromAllowlist(
          candidate,
          env.ORSHOT_OUTPUT_HOST_ALLOWLIST,
        )
      : null;
  if (!contentUrl) {
    throw new OrshotRenderError({
      code: "provider_response_invalid",
      message: "The image provider returned no approved image URL.",
      ambiguousProviderOutcome: true,
    });
  }
  return contentUrl;
}
