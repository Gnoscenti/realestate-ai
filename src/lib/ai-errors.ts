/**
 * Human-readable descriptions for the machine error codes raised by the
 * server-side AI clients (`ai-text.server.ts`, `visibility/providers.server.ts`).
 * Server functions throw the bare code so the client can map it here; anything
 * unknown falls through to the caller's fallback text.
 */
const MESSAGES: Record<string, string> = {
  text_generation_unconfigured: "AI drafting is not configured on this server (no XAI_API_KEY).",
  text_generation_timeout: "The AI model took too long to answer. Try again; if it keeps happening, set XAI_DRAFT_MODEL to a faster model.",
  text_generation_rate_limited: "The AI provider is rate-limiting requests right now. Wait a minute and try again.",
  text_generation_network: "Could not reach the AI provider. Check the server's network access and try again.",
  text_generation_empty: "The AI provider returned an empty answer. Try again.",
  text_generation_invalid_json: "The AI provider returned an unreadable response. Try again.",
  text_generation_invalid_output: "The AI draft did not match the expected format. Try again.",
  provider_timeout: "The answer engine took too long to respond.",
  provider_rate_limited: "The answer engine is rate-limiting requests (quota or burst limit).",
  provider_unauthorized: "The answer engine rejected the configured API key.",
  provider_network: "Could not reach the answer engine.",
  extraction_unsupported_provider: "Entity extraction is only available through Grok or OpenAI.",
  extraction_empty: "Entity extraction returned nothing.",
  extraction_invalid_json: "Entity extraction returned an unreadable response.",
};

/** Map a raw error (or code string) to a sentence a user can act on. */
export function describeAiError(error: unknown, fallback: string): string {
  const raw = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  if (!raw) return fallback;
  if (MESSAGES[raw]) return MESSAGES[raw];
  const http = /^(?:text_generation|provider)_http_(\d{3})$/.exec(raw);
  if (http) return `The AI provider answered with HTTP ${http[1]}. Try again later.`;
  const prefixed = Object.keys(MESSAGES).find((code) => raw.startsWith(`${code}:`) || raw.startsWith(`${code} `));
  if (prefixed) return `${MESSAGES[prefixed]} (${raw.slice(prefixed.length + 1).trim()})`;
  return raw;
}
