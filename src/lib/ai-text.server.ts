/**
 * Server-only structured text generation (xAI chat completions, JSON schema
 * output). Used for drafting content from declared facts. Fails closed when no
 * key is configured; callers must record the model and surface drafts as
 * "needs review", never as facts.
 */
import { readResponseText } from "@/lib/safe-outbound-url.server";

export class TextGenerationError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message || code);
    this.name = "TextGenerationError";
  }
}

export function textGenerationConfigured(): boolean {
  return Boolean(process.env.XAI_API_KEY?.trim() || process.env.GROK_API_KEY?.trim());
}

export type JsonCompletion<T> = { value: T; model: string; costUsdTicks: number };

export async function completeJson<T>(input: {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
}): Promise<JsonCompletion<T>> {
  const key = process.env.XAI_API_KEY?.trim() || process.env.GROK_API_KEY?.trim();
  if (!key) throw new TextGenerationError("text_generation_unconfigured");
  const model = process.env.XAI_DRAFT_MODEL?.trim() || "grok-4-1-fast-reasoning";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50_000);
  try {
    const response = await (input.fetchImpl || fetch)("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: input.maxTokens ?? 1800,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: input.schemaName, strict: true, schema: input.schema },
        },
      }),
    });
    const text = await readResponseText(response, 2 * 1024 * 1024);
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      throw new TextGenerationError("text_generation_invalid_json");
    }
    if (!response.ok) {
      const detail = (json.error as { message?: string } | undefined)?.message;
      throw new TextGenerationError(
        response.status === 429 ? "text_generation_rate_limited" : `text_generation_http_${response.status}`,
        detail,
      );
    }
    const content = (json.choices as { message?: { content?: string } }[] | undefined)?.[0]
      ?.message?.content;
    if (typeof content !== "string") throw new TextGenerationError("text_generation_empty");
    let value: T;
    try {
      value = JSON.parse(content) as T;
    } catch {
      throw new TextGenerationError("text_generation_invalid_output");
    }
    const ticks = (json.usage as { cost_in_usd_ticks?: number } | undefined)?.cost_in_usd_ticks;
    return {
      value,
      model: typeof json.model === "string" ? json.model : model,
      costUsdTicks: typeof ticks === "number" ? ticks : 0,
    };
  } catch (error) {
    if (error instanceof TextGenerationError) throw error;
    if (error instanceof Error && error.name === "AbortError")
      throw new TextGenerationError("text_generation_timeout");
    throw new TextGenerationError("text_generation_network", error instanceof Error ? error.message : undefined);
  } finally {
    clearTimeout(timer);
  }
}
