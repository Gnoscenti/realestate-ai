/**
 * Grounded answer-engine adapters for CiteLock Visibility.
 *
 * Every adapter asks the provider's own web-grounded surface and returns ONLY
 * provider-returned citation metadata (never URLs scraped from prose), the
 * returned model id, usage, and — where the provider reports it — the exact
 * billed cost. Adapters fail closed: no key, no provider; a non-2xx or a
 * malformed body becomes a typed error the engine records on the run row.
 *
 * Verification status (2026-09-07, see docs/FLAGSHIP-LEDGER.md):
 *   - xai/grok: live-verified (Responses API, web_search, url_citation annotations)
 *   - openai:   implemented from current docs; not live-verified (no key here)
 *   - gemini:   implemented from current docs; key present but quota-exhausted (429)
 *   - perplexity: Agent SDK live-verified 2026-09-20; see ledger for exact scope.
 */
import Perplexity from "@perplexity-ai/perplexity_ai";
import { readResponseText } from "@/lib/safe-outbound-url.server";
import { toCitation, type GroundedCitation } from "./evaluate";

export type ProviderId = "xai" | "openai" | "gemini" | "perplexity";

export type ProviderSpec = {
  provider: ProviderId;
  /** Consumer-facing label for the answer engine family. */
  label: string;
  model: string;
  key: string;
  /** Whether this adapter has been exercised against the live API in this repo. */
  verified: boolean;
};

export const PERPLEXITY_AGENT_SURFACE = "perplexity_agent_web_v1";
export const PERPLEXITY_AGENT_MODEL = "openai/gpt-5.6-luna";

export function providerSurface(provider: string): string {
  return provider === "perplexity" ? PERPLEXITY_AGENT_SURFACE : "api_web_grounded";
}

export type GroundedSource = GroundedCitation & {
  sourceId: number;
  snippet?: string;
  date?: string;
  lastUpdated?: string;
};

export type GroundedAnswer = {
  text: string;
  citations: GroundedCitation[];
  /** Retrieved sources are not counted as answer citations. */
  sources?: GroundedSource[];
  httpStatus?: number;
  returnedModel?: string;
  searchCalls?: number;
  usage?: Record<string, unknown>;
  /** 1 USD = 10^10 ticks (xAI convention). Undefined when the provider does not report cost. */
  costUsdTicks?: number;
};

export class ProviderError extends Error {
  constructor(
    readonly code: string,
    message?: string,
    readonly retryAfterMs?: number,
    readonly httpStatus?: number,
  ) {
    super(message || code);
    this.name = "ProviderError";
  }
}

const env = (key: string) => process.env[key]?.trim() || undefined;

export function configuredProviders(): ProviderSpec[] {
  const specs: ProviderSpec[] = [];
  const xai = env("XAI_API_KEY") || env("GROK_API_KEY");
  if (xai)
    specs.push({
      provider: "xai",
      label: "Grok",
      model: env("XAI_VISIBILITY_MODEL") || "grok-4.6",
      key: xai,
      verified: true,
    });
  const openai = env("OPENAI_API_KEY");
  if (openai)
    specs.push({
      provider: "openai",
      label: "ChatGPT",
      model: env("OPENAI_VISIBILITY_MODEL") || "gpt-5.5",
      key: openai,
      verified: false,
    });
  const gemini = env("GEMINI_API_KEY");
  if (gemini)
    specs.push({
      provider: "gemini",
      label: "Gemini",
      model: env("GEMINI_VISIBILITY_MODEL") || "gemini-3.5-flash",
      key: gemini,
      verified: false,
    });
  const perplexity = env("PERPLEXITY_API_KEY");
  if (perplexity)
    specs.push({
      provider: "perplexity",
      label: "Perplexity Agent",
      model: env("PERPLEXITY_VISIBILITY_MODEL") || PERPLEXITY_AGENT_MODEL,
      key: perplexity,
      verified: true,
    });
  return specs;
}

const TIMEOUT_MS = 55_000;

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await readResponseText(response, 4 * 1024 * 1024);
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      throw new ProviderError("provider_invalid_json", `HTTP ${response.status} non-JSON body`);
    }
    return { status: response.status, json };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError")
      throw new ProviderError("provider_timeout");
    throw new ProviderError(
      "provider_network",
      error instanceof Error ? error.message : "network error",
    );
  } finally {
    clearTimeout(timer);
  }
}

function httpError(status: number, json: Record<string, unknown>): ProviderError {
  const detail = (json.error as { message?: string } | undefined)?.message;
  if (status === 401 || status === 403) return new ProviderError("provider_auth", detail);
  if (status === 429) return new ProviderError("provider_rate_limited", detail);
  if (status === 404) return new ProviderError("provider_model_unavailable", detail);
  return new ProviderError(`provider_http_${status}`, detail);
}

type ResponsesOutputItem = {
  type?: string;
  status?: string;
  content?: { type?: string; text?: string; annotations?: unknown[] }[];
};

/** OpenAI-style Responses API (xAI and OpenAI share the shape). */
function parseResponsesApi(json: Record<string, unknown>): GroundedAnswer {
  const output = (json.output as ResponsesOutputItem[] | undefined) || [];
  const chunks: string[] = [];
  const citations = new Map<string, GroundedCitation>();
  let searchCalls = 0;
  for (const item of output) {
    if (item.type === "web_search_call") searchCalls += 1;
    if (item.type !== "message") continue;
    for (const part of item.content || []) {
      if (typeof part.text === "string") chunks.push(part.text);
      for (const annotation of part.annotations || []) {
        const record = annotation as { type?: string; url?: string; title?: string };
        if (record.type !== "url_citation" || typeof record.url !== "string") continue;
        const citation = toCitation(record.url, record.title);
        if (citation && !citations.has(citation.url)) citations.set(citation.url, citation);
      }
    }
  }
  const text = chunks.join("\n").trim();
  if (!text) throw new ProviderError("provider_empty_response");
  const usage = (json.usage as Record<string, unknown> | undefined) || undefined;
  const tools = usage?.server_side_tool_usage_details as
    | { web_search_calls?: number }
    | undefined;
  const ticks = usage?.cost_in_usd_ticks;
  return {
    text,
    citations: [...citations.values()],
    returnedModel: typeof json.model === "string" ? json.model : undefined,
    searchCalls: tools?.web_search_calls ?? searchCalls,
    usage,
    costUsdTicks: typeof ticks === "number" && Number.isFinite(ticks) ? ticks : undefined,
  };
}

async function askXai(spec: ProviderSpec, prompt: string): Promise<GroundedAnswer> {
  const { status, json } = await postJson(
    "https://api.x.ai/v1/responses",
    { Authorization: `Bearer ${spec.key}` },
    {
      model: spec.model,
      input: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search" }],
      reasoning: { effort: "low" },
      store: false,
    },
  );
  if (status < 200 || status >= 300) throw httpError(status, json);
  return parseResponsesApi(json);
}

async function askOpenAi(spec: ProviderSpec, prompt: string): Promise<GroundedAnswer> {
  const { status, json } = await postJson(
    "https://api.openai.com/v1/responses",
    { Authorization: `Bearer ${spec.key}` },
    {
      model: spec.model,
      input: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search", search_context_size: "medium" }],
      store: false,
    },
  );
  if (status < 200 || status >= 300) throw httpError(status, json);
  return parseResponsesApi(json);
}

async function askGemini(spec: ProviderSpec, prompt: string): Promise<GroundedAnswer> {
  const { status, json } = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(spec.model)}:generateContent`,
    { "x-goog-api-key": spec.key },
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
    },
  );
  if (status < 200 || status >= 300) throw httpError(status, json);
  const candidate = (
    json.candidates as
      | {
          content?: { parts?: { text?: string }[] };
          groundingMetadata?: {
            groundingChunks?: { web?: { uri?: string; title?: string } }[];
            webSearchQueries?: string[];
          };
        }[]
      | undefined
  )?.[0];
  const text = (candidate?.content?.parts || [])
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
  if (!text) throw new ProviderError("provider_empty_response");
  const citations = new Map<string, GroundedCitation>();
  for (const chunk of candidate?.groundingMetadata?.groundingChunks || []) {
    const uri = chunk.web?.uri;
    if (typeof uri !== "string") continue;
    const citation = toCitation(uri, chunk.web?.title);
    if (citation && !citations.has(citation.url)) citations.set(citation.url, citation);
  }
  return {
    text,
    citations: [...citations.values()],
    returnedModel:
      typeof json.modelVersion === "string" ? json.modelVersion : spec.model,
    searchCalls: candidate?.groundingMetadata?.webSearchQueries?.length,
    usage: (json.usageMetadata as Record<string, unknown> | undefined) || undefined,
  };
}

/** Parse both Retry-After forms without retrying earlier than requested. */
export function retryAfterMs(value: string | null, now = Date.now()): number {
  if (!value?.trim()) return 60_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1_000, Math.ceil(seconds * 1_000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1_000, date - now) : 60_000;
}

async function askPerplexity(spec: ProviderSpec, prompt: string): Promise<GroundedAnswer> {
  if (!spec.key.trim()) throw new ProviderError("provider_not_configured");
  if (!/^[a-z0-9-]+\/[a-zA-Z0-9._:-]+$/.test(spec.model))
    throw new ProviderError("provider_model_unavailable", "Set PERPLEXITY_VISIBILITY_MODEL to an Agent provider/model ID.");
  const client = new Perplexity({
    apiKey: spec.key,
    baseURL: "https://api.perplexity.ai",
    maxRetries: 0, // Engine owns the durable paid-call retry budget.
    timeout: TIMEOUT_MS,
    logLevel: "off", // Never let SDK debug logging expose prompts or credentials.
    fetch: async (url, init) => {
      // SDK 0.38.5 uses the documented /v1/responses Agent alias.
      const response = await fetch(url, { ...init, redirect: "error" });
      const text = await readResponseText(response, 4_000_000);
      return new Response(text, { status: response.status, headers: response.headers });
    },
  });
  try {
    const { data: response, response: http } = await client.responses.create({
      model: spec.model,
      input: prompt,
      tools: [{ type: "web_search", max_tokens: 6000, max_tokens_per_page: 1200 }],
      instructions: "Search the web before answering. Ground factual claims in retrieved sources and cite them inline. If evidence is insufficient, say so. Do not invent sources.",
      max_steps: 2,
      max_output_tokens: 2000,
      store: false,
    }).withResponse();
    if (response.status !== "completed" || response.error)
      throw new ProviderError("provider_incomplete", undefined, undefined, http.status);
    if (typeof response.output_text !== "string" || !response.output_text.trim())
      throw new ProviderError("provider_empty_answer", undefined, undefined, http.status);
    const citations: GroundedCitation[] = [];
    const sources: GroundedSource[] = [];
    let searchItems = 0;
    for (const item of response.output) {
      if (item.type === "search_results") {
        searchItems += 1;
        for (const source of item.results) {
          const link = toCitation(source.url, source.title);
          if (link) sources.push({ ...link, sourceId: source.id, snippet: source.snippet,
            date: source.date || undefined, lastUpdated: source.last_updated || undefined });
        }
      } else if (item.type === "message") {
        for (const part of item.content) {
          if (part.type !== "output_text") continue;
          for (const annotation of part.annotations || []) {
            if (annotation.type !== "url_citation" || !annotation.url) continue;
            const citation = toCitation(annotation.url, annotation.title);
            if (citation) citations.push(citation);
          }
        }
      }
    }
    const invocations = response.usage?.tool_calls_details?.search_web?.invocation;
    const searchCalls = typeof invocations === "number" && Number.isFinite(invocations)
      ? invocations : searchItems;
    if (!searchItems && searchCalls <= 0)
      throw new ProviderError("provider_ungrounded", undefined, undefined, http.status);
    const cost = response.usage?.cost;
    return {
      text: response.output_text.trim(),
      citations: [...new Map(citations.map(citation => [citation.url, citation])).values()],
      sources,
      returnedModel: response.model,
      searchCalls,
      usage: response.usage ? { ...response.usage } : undefined,
      costUsdTicks: cost?.currency === "USD" && Number.isFinite(cost.total_cost) && cost.total_cost >= 0
        ? Math.round(cost.total_cost * 1e10) : undefined,
      httpStatus: http.status,
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Perplexity.APIConnectionTimeoutError)
      throw new ProviderError("provider_timeout");
    if (error instanceof Perplexity.APIConnectionError)
      throw new ProviderError("provider_network");
    if (error instanceof Perplexity.APIError) {
      const status = error.status;
      const code = status === 401 || status === 403 ? "provider_auth"
        : status === 429 ? "provider_rate_limited"
        : status === 404 ? "provider_model_unavailable" : `provider_http_${status}`;
      // Never propagate SDK messages/bodies: upstream may reflect sensitive input.
      throw new ProviderError(code, undefined,
        status === 429 ? retryAfterMs(error.headers?.get("retry-after") || null) : undefined, status);
    }
    throw new ProviderError(error instanceof SyntaxError ? "provider_invalid_json" : "provider_malformed_response");
  }
}

export async function askGrounded(spec: ProviderSpec, prompt: string): Promise<GroundedAnswer> {
  switch (spec.provider) {
    case "xai":
      return askXai(spec, prompt);
    case "openai":
      return askOpenAi(spec, prompt);
    case "gemini":
      return askGemini(spec, prompt);
    case "perplexity":
      return askPerplexity(spec, prompt);
  }
}

export type ExtractedEntity = {
  name: string;
  kind: "agent" | "team" | "brokerage" | "portal" | "other";
  recommended: boolean;
  brokerage?: string;
};

export type EntityExtraction = {
  entities: ExtractedEntity[];
  model: string;
  costUsdTicks?: number;
};

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    entities: {
      type: "array",
      maxItems: 25,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          kind: { type: "string", enum: ["agent", "team", "brokerage", "portal", "other"] },
          recommended: { type: "boolean" },
          brokerage: { type: "string" },
        },
        required: ["name", "kind", "recommended", "brokerage"],
      },
    },
  },
  required: ["entities"],
} as const;

/**
 * Model-assisted extraction of the people/brokerages an answer names. This is
 * labeled "model-extracted" everywhere it is shown; it never changes the
 * deterministic subject metrics. Uses the xAI chat completions surface without
 * web search so no new sources are introduced.
 */
export async function extractEntities(
  spec: ProviderSpec,
  answer: string,
): Promise<EntityExtraction> {
  if (spec.provider !== "xai" && spec.provider !== "openai") {
    throw new ProviderError("extraction_unsupported_provider");
  }
  const url =
    spec.provider === "xai"
      ? "https://api.x.ai/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";
  const model =
    spec.provider === "xai"
      ? env("XAI_EXTRACTION_MODEL") || "grok-4-1-fast-non-reasoning"
      : env("OPENAI_EXTRACTION_MODEL") || spec.model;
  const { status, json } = await postJson(
    url,
    { Authorization: `Bearer ${spec.key}` },
    {
      model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You extract named entities from an answer about real estate professionals. Return every real estate agent, team, brokerage, or listing portal the answer names. Mark recommended=true only when the answer presents the entity as a recommendation or example to consider. Use an empty string for brokerage when unknown. Do not add entities that are not in the text.",
        },
        { role: "user", content: answer.slice(0, 12_000) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "entities", strict: true, schema: EXTRACTION_SCHEMA },
      },
    },
  );
  if (status < 200 || status >= 300) throw httpError(status, json);
  const content = (json.choices as { message?: { content?: string } }[] | undefined)?.[0]
    ?.message?.content;
  if (typeof content !== "string") throw new ProviderError("extraction_empty");
  let parsed: { entities?: unknown[] };
  try {
    parsed = JSON.parse(content) as { entities?: unknown[] };
  } catch {
    throw new ProviderError("extraction_invalid_json");
  }
  const entities: ExtractedEntity[] = [];
  for (const item of parsed.entities || []) {
    const record = item as Partial<ExtractedEntity>;
    if (typeof record.name !== "string" || !record.name.trim()) continue;
    const kind = ["agent", "team", "brokerage", "portal", "other"].includes(String(record.kind))
      ? (record.kind as ExtractedEntity["kind"])
      : "other";
    entities.push({
      name: record.name.trim().slice(0, 120),
      kind,
      recommended: Boolean(record.recommended),
      brokerage: typeof record.brokerage === "string" && record.brokerage.trim()
        ? record.brokerage.trim().slice(0, 120)
        : undefined,
    });
  }
  const ticks = (json.usage as { cost_in_usd_ticks?: number } | undefined)?.cost_in_usd_ticks;
  return {
    entities,
    model: typeof json.model === "string" ? json.model : model,
    costUsdTicks: typeof ticks === "number" ? ticks : undefined,
  };
}
