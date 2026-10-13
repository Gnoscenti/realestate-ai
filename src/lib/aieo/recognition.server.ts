import { createHash, randomUUID } from "node:crypto";
import type { CiteLockScanRecord } from "./scan-types";
import { sanitizeCiteLockPublicUrl } from "./scan-types";
import type {
  CiteRecognitionCapture,
  RecognitionPanelResult,
  RecognitionProviderId,
} from "./recognition-types";
import {
  RECOGNITION_LOCATION,
  RECOGNITION_PANEL_VERSION,
  recognitionRunDate,
} from "./recognition-types";

type PanelPrompt = { queryId: string; prompt: string };
type ProviderResponse = {
  status: "succeeded" | "failed";
  text: string;
  raw: Record<string, unknown>;
  model?: string;
  errorCode?: string;
};

export type RecognitionProviderAdapter = {
  id: RecognitionProviderId;
  model: string;
  run(prompt: string): Promise<ProviderResponse>;
};

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function normalizedWords(value: string): string[] {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1);
}

function containsName(text: string, name: string, minimumWords = 2): boolean {
  const haystack = " " + normalizedWords(text).join(" ") + " ";
  const words = normalizedWords(name);
  return words.length >= minimumWords &&
    haystack.includes(" " + words.join(" ") + " ");
}

function bestEvidence(scan: CiteLockScanRecord, field: string): string | undefined {
  return scan.evidence.find(
    (item) => item.field === field && item.status !== "unknown",
  )?.value;
}

export function buildRecognitionPanel(scan: CiteLockScanRecord): PanelPrompt[] {
  const broker = bestEvidence(scan, "responsible_broker");
  const area =
    bestEvidence(scan, "service_area") ||
    scan.profilePatch.areaOfOperations ||
    "San Diego County";
  const context = [
    `Search location: ${RECOGNITION_LOCATION}.`,
    "Use current public web sources and include source URLs for factual claims.",
    "Do not assume the person represents a listing unless an authoritative provider says so.",
    "If evidence is missing or conflicting, state that plainly.",
  ].join(" ");
  return [
    {
      queryId: "identity",
      prompt: `${context}\n\nWho is ${scan.agentName}, and what real estate services do they provide?`,
    },
    {
      queryId: "license-broker",
      prompt: `${context}\n\nIs ${scan.agentName} licensed, and who is their responsible broker${broker ? ` (reported as ${broker})` : ""}?`,
    },
    {
      queryId: "service-area",
      prompt: `${context}\n\nWhat areas does ${scan.agentName} serve around ${area}?`,
    },
    {
      queryId: "local-discovery",
      prompt: `${context}\n\nWhich real estate agents have verifiable experience in ${area}?`,
    },
  ];
}

function extractText(json: Record<string, any>): string {
  if (typeof json.output_text === "string") return json.output_text.trim();
  const chunks: string[] = [];
  for (const item of Array.isArray(json.output) ? json.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === "string") chunks.push(content.text);
      if (typeof content?.output_text === "string") chunks.push(content.output_text);
    }
  }
  const choice = json.choices?.[0]?.message?.content;
  if (typeof choice === "string") chunks.push(choice);
  return chunks.join("\n").trim();
}

function collectCitationUrls(value: Record<string, unknown>, provider: RecognitionProviderId): string[] {
  // Request echoes, prose URLs, tool arguments, and error-help links are not citations.
  const urls = new Set<string>();
  const add = (candidate: unknown) => {
    if (typeof candidate !== "string") return;
    const safe = sanitizeCiteLockPublicUrl(candidate);
    if (safe) urls.add(safe);
  };
  if (provider === "perplexity") {
    if (Array.isArray(value.citations)) value.citations.forEach(add);
  } else {
    const output = value.output;
    if (Array.isArray(output)) for (const item of output) {
      if (!item || !Array.isArray(item.content)) continue;
      for (const content of item.content) {
        if (!content || !Array.isArray(content.annotations)) continue;
        for (const annotation of content.annotations) {
          if (annotation?.type === "url_citation") add(annotation.url);
        }
      }
    }
  }
  return [...urls];
}

function safeRawResponse(value: unknown): Record<string, unknown> {
  const clean = (input: unknown, depth = 0): unknown => {
    if (depth > 12) return "[depth truncated]";
    if (Array.isArray(input)) return input.slice(0, 200).map((item) => clean(item, depth + 1));
    if (!input || typeof input !== "object") return input;
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .filter(([key]) => !/token|secret|authorization|api.?key|credential|cookie/i.test(key))
        .map(([key, item]) => [key, clean(item, depth + 1)]),
    );
  };
  const cleaned = clean(value) as Record<string, unknown>;
  const serialized = JSON.stringify(cleaned);
  if (serialized.length <= 100_000) return cleaned;
  return {
    truncated: true,
    originalCharacters: serialized.length,
    preview: serialized.slice(0, 95_000),
  };
}

function responsesAdapter(
  id: "chatgpt" | "grok",
  baseUrl: string,
  apiKey: string,
  model: string,
): RecognitionProviderAdapter {
  return {
    id,
    model,
    async run(prompt) {
      try {
        const response = await fetch(`${baseUrl}/responses`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            input: prompt,
            tools: [{ type: "web_search" }],
            max_output_tokens: 1200,
          }),
          signal: AbortSignal.timeout(35_000),
        });
        const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        const raw = safeRawResponse(json);
        const text = extractText(raw);
        if (!response.ok || !text) {
          return {
            status: "failed",
            text,
            raw,
            errorCode: `provider_http_${response.status || 0}`,
          };
        }
        return {
          status: "succeeded",
          text,
          raw,
          model: typeof raw.model === "string" ? raw.model : model,
        };
      } catch (error) {
        return {
          status: "failed",
          text: "",
          raw: { error: error instanceof Error ? error.message : "Provider request failed" },
          errorCode: "provider_request_failed",
        };
      }
    },
  };
}

function perplexityAdapter(apiKey: string, model: string): RecognitionProviderAdapter {
  return {
    id: "perplexity",
    model,
    async run(prompt) {
      try {
        const response = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: 1200,
            temperature: 0,
          }),
          signal: AbortSignal.timeout(35_000),
        });
        const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        const raw = safeRawResponse(json);
        const text = extractText(raw);
        if (!response.ok || !text) {
          return {
            status: "failed",
            text,
            raw,
            errorCode: `provider_http_${response.status || 0}`,
          };
        }
        return {
          status: "succeeded",
          text,
          raw,
          model: typeof raw.model === "string" ? raw.model : model,
        };
      } catch (error) {
        return {
          status: "failed",
          text: "",
          raw: { error: error instanceof Error ? error.message : "Provider request failed" },
          errorCode: "provider_request_failed",
        };
      }
    },
  };
}

export function configuredRecognitionProviders(): RecognitionProviderAdapter[] {
  const providers: RecognitionProviderAdapter[] = [];
  const openai = process.env.OPENAI_API_KEY?.trim();
  const xai = (process.env.XAI_API_KEY || process.env.GROK_API_KEY)?.trim();
  const perplexity = process.env.PERPLEXITY_API_KEY?.trim();
  if (openai)
    providers.push(
      responsesAdapter(
        "chatgpt",
        "https://api.openai.com/v1",
        openai,
        process.env.CITELOCK_OPENAI_MODEL?.trim() || "gpt-5-mini",
      ),
    );
  if (xai)
    providers.push(
      responsesAdapter(
        "grok",
        "https://api.x.ai/v1",
        xai,
        process.env.CITELOCK_XAI_MODEL?.trim() || "grok-4.6",
      ),
    );
  if (perplexity)
    providers.push(
      perplexityAdapter(
        perplexity,
        process.env.CITELOCK_PERPLEXITY_MODEL?.trim() || "sonar",
      ),
    );
  return providers;
}

export async function runRecognitionPanel(
  scan: CiteLockScanRecord,
  providers: RecognitionProviderAdapter[] = configuredRecognitionProviders(),
  now: () => string = () => new Date().toISOString(),
): Promise<RecognitionPanelResult> {
  const uniqueProviders = new Set(providers.map((provider) => provider.id));
  if (uniqueProviders.size < 3)
    throw new Error(
      "CiteLock Recognition requires three configured providers: OpenAI, xAI, and Perplexity.",
    );
  const prompts = buildRecognitionPanel(scan);
  const observedAt = now();
  const runDate = recognitionRunDate(observedAt);
  const broker = bestEvidence(scan, "responsible_broker") || "";
  const license = bestEvidence(scan, "license") || "";
  const tasks = providers.slice(0, 3).flatMap((provider) =>
    prompts.map(async ({ queryId, prompt }): Promise<CiteRecognitionCapture> => {
      const response = await provider.run(prompt);
      const citations = response.status === "succeeded" ? collectCitationUrls(response.raw, provider.id) : [];
      const mentioned = response.status === "succeeded" && containsName(response.text, scan.agentName);
      const correctIdentity =
        mentioned &&
        (license
          ? response.text.replace(/\D/g, "").includes(license.replace(/\D/g, "")) ||
            citations.some((url) => new URL(url).hostname === new URL(scan.website).hostname)
          : true);
      const correctBrokerage = broker ? response.status === "succeeded" && containsName(response.text, broker, 1) : false;
      const rawResponse = safeRawResponse(response.raw);
      return {
        id: randomUUID(),
        scanId: scan.id,
        subjectFingerprint: scan.subjectFingerprint,
        panelVersion: RECOGNITION_PANEL_VERSION,
        provider: provider.id,
        model: response.model || provider.model,
        queryId,
        prompt,
        promptHash: sha256(prompt),
        location: RECOGNITION_LOCATION,
        runDate,
        status: response.status,
        responseText: response.text.slice(0, 40_000),
        rawResponse,
        responseHash: sha256(JSON.stringify(rawResponse)),
        mentioned,
        cited: citations.length > 0,
        correctIdentity,
        correctBrokerage,
        citations,
        observedAt,
        errorCode: response.errorCode,
      };
    }),
  );
  return {
    panelVersion: RECOGNITION_PANEL_VERSION,
    location: RECOGNITION_LOCATION,
    configuredProviders: providers.slice(0, 3).map((provider) => provider.id),
    captures: await Promise.all(tasks),
  };
}
