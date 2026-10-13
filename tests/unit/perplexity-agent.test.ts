import { afterEach, describe, expect, it, vi } from "vitest";
import {
  askGrounded, configuredProviders, PERPLEXITY_AGENT_MODEL, retryAfterMs, type ProviderSpec,
} from "@/lib/aieo/visibility/providers.server";

const spec: ProviderSpec = {
  provider: "perplexity", label: "Perplexity Agent", model: PERPLEXITY_AGENT_MODEL,
  key: "synthetic-test-key", verified: false,
};
const source = { id: 1, url: "https://reso.org/", title: "RESO", snippet: "Standards organization", date: "2026-09-20" };
const citation = { type: "url_citation", url: "https://reso.org/", title: "RESO", start_index: 0, end_index: 10 };
function body(annotations: unknown[] = [citation]) {
  return {
    id: "response-test", object: "response", created_at: 1, status: "completed", model: spec.model,
    output: [
      { type: "search_results", queries: ["RESO"], results: [source, { ...source, id: 2, url: "https://uncited.example/" }] },
      { type: "message", id: "message-test", role: "assistant", status: "completed",
        content: [{ type: "output_text", text: "Real Estate Standards Organization. [1] https://invented.example/", annotations }] },
    ],
    usage: { input_tokens: 20, output_tokens: 20, total_tokens: 40,
      cost: { currency: "USD", input_cost: 0.001, output_cost: 0.002, total_cost: 0.0055 },
      tool_calls_details: { search_web: { invocation: 1 } } },
  };
}
function stub(response: unknown, status = 200, headers: Record<string, string> = {}) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(response), {
    status, headers: { "content-type": "application/json", ...headers },
  }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Perplexity Agent SDK integration", () => {
  it("sends an independent web-grounded Agent request and separates citations from search metadata", async () => {
    vi.stubEnv("PERPLEXITY_BASE_URL", "https://untrusted.example");
    vi.stubEnv("PERPLEXITY_LOG", "debug");
    const fetch = stub(body([citation, citation, { type: "url_citation", url: "javascript:alert(1)" }]));
    const answer = await askGrounded(spec, "What is RESO?");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe("https://api.perplexity.ai/v1/responses");
    const request = JSON.parse(String(init.body));
    expect(request).toMatchObject({ model: spec.model, input: "What is RESO?",
      tools: [{ type: "web_search", max_tokens: 6000, max_tokens_per_page: 1200 }],
      max_steps: 2, max_output_tokens: 6000, store: false });
    expect(request).not.toHaveProperty("previous_response_id");
    expect(request).not.toHaveProperty("preset");
    expect(answer.text).toContain("Real Estate Standards Organization");
    expect(answer.citations.map(c => c.url)).toEqual(["https://reso.org/"]);
    expect(answer.sources).toHaveLength(2);
    expect(answer.sources?.[0]).toMatchObject({ sourceId: 1, date: "2026-09-20", snippet: source.snippet });
    expect(answer).toMatchObject({ httpStatus: 200, searchCalls: 1, returnedModel: spec.model, costUsdTicks: 55_000_000 });
  });

  it("does not promote retrieved URLs or prose markers to citation evidence", async () => {
    stub(body([]));
    const answer = await askGrounded(spec, "What is RESO?");
    expect(answer.sources).toHaveLength(2);
    expect(answer.citations).toEqual([]);
  });

  it.each([[401,"provider_auth"],[403,"provider_auth"],[404,"provider_model_unavailable"],[429,"provider_rate_limited"],[500,"provider_http_500"]])(
    "sanitizes HTTP %s and never performs hidden SDK retries", async (status, code) => {
      const fetch = stub({ error: { message: "reflected " + spec.key } }, Number(status), { "retry-after": "90" });
      await expect(askGrounded(spec, "query")).rejects.toMatchObject({
        code, message: code, httpStatus: status, retryAfterMs: status === 429 ? 90_000 : undefined,
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );


  it("retains partial answer, source metadata, incomplete reason and billed usage without accepting it", async () => {
    stub({ ...body(), status: "incomplete", incomplete_details: { reason: "max_output_tokens" } });
    await expect(askGrounded(spec, "query")).rejects.toMatchObject({
      code: "provider_incomplete", httpStatus: 200,
      details: { responseStatus: "incomplete", incompleteReason: "max_output_tokens",
        evidence: { text: expect.stringContaining("Real Estate Standards Organization"),
          citations: [expect.objectContaining({ url: source.url })], sources: expect.any(Array),
          costUsdTicks: 55_000_000, usage: expect.objectContaining({ output_tokens: 20 }) } },
    });
  });

  it("records exhausted quota separately from retryable throttling and never echoes messages", async () => {
    for (const provider of ["openai", "xai", "perplexity"] as const) {
      const fetch = stub({ error: { code: "credit_balance_exhausted", type: "insufficient_quota",
        message: "reflected " + spec.key } }, 429, { "retry-after": "90" });
      await expect(askGrounded({ ...spec, provider }, "query")).rejects.toMatchObject({
        code: "provider_quota_exhausted", message: "provider_quota_exhausted", httpStatus: 429,
        retryAfterMs: undefined, details: { providerCode: "credit_balance_exhausted", providerType: "insufficient_quota" },
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });

  it("preserves partial Responses API evidence and honors Retry-After on OpenAI and xAI", async () => {
    for (const provider of ["openai", "xai"] as const) {
      stub({ ...body(), status: "incomplete", incomplete_details: { reason: "max_output_tokens" } });
      await expect(askGrounded({ ...spec, provider }, "query")).rejects.toMatchObject({
        code: "provider_incomplete", details: { incompleteReason: "max_output_tokens",
          evidence: { text: expect.stringContaining("Real Estate Standards Organization"), citations: expect.any(Array) } },
      });
      stub({ error: { type: "rate_limit_error" } }, 429, { "retry-after": "120" });
      await expect(askGrounded({ ...spec, provider }, "query")).rejects.toMatchObject({
        code: "provider_rate_limited", retryAfterMs: 120_000, httpStatus: 429,
      });
    }
  });

  it("honors seconds and HTTP-date Retry-After, with a conservative fallback", () => {
    expect(retryAfterMs("1.5",0)).toBe(1500);
    expect(retryAfterMs("Tue, 01 Jan 2030 00:00:10 GMT", Date.parse("2030-01-01T00:00:00Z"))).toBe(10_000);
    expect(retryAfterMs(null)).toBe(60_000);
    expect(retryAfterMs("invalid")).toBe(60_000);
  });

  it("fails closed on incomplete, empty, ungrounded and malformed responses", async () => {
    stub({ ...body(), status: "incomplete" });
    await expect(askGrounded(spec,"query")).rejects.toMatchObject({ code: "provider_incomplete" });
    stub({ ...body(), output: [] });
    await expect(askGrounded(spec,"query")).rejects.toMatchObject({ code: "provider_empty_answer" });
    stub({ ...body(), output: body().output.slice(1), usage: undefined });
    await expect(askGrounded(spec,"query")).rejects.toMatchObject({ code: "provider_ungrounded" });
    stub({ ...body(), output: null });
    await expect(askGrounded(spec,"query")).rejects.toMatchObject({ code: "provider_malformed_response" });
  });

  it("rejects oversized or invalid JSON and uncertain network outcomes without replay", async () => {
    const fetch = vi.fn(async () => new Response("not JSON", {headers:{"content-type":"application/json"}}));
    vi.stubGlobal("fetch", fetch);
    await expect(askGrounded(spec,"query")).rejects.toMatchObject({ code: "provider_invalid_json" });
    fetch.mockImplementation(async () => new Response("large", {headers:{"content-length":"4000001"}}));
    await expect(askGrounded(spec,"query")).rejects.toMatchObject({ code: "provider_network" });
    fetch.mockImplementation(async () => { throw new Error("connection error " + spec.key); });
    await expect(askGrounded(spec,"query")).rejects.toMatchObject({ code: "provider_network", message:"provider_network" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("reads only the server env key and refuses missing keys and obsolete Sonar models before sending", async () => {
    vi.stubEnv("PERPLEXITY_API_KEY"," ");
    expect(configuredProviders().find(p => p.provider === "perplexity")).toBeUndefined();
    vi.stubEnv("PERPLEXITY_API_KEY","test-only");
    vi.stubEnv("PERPLEXITY_VISIBILITY_MODEL","");
    expect(configuredProviders().find(p => p.provider === "perplexity")?.model).toBe(PERPLEXITY_AGENT_MODEL);
    const fetch=stub(body());
    await expect(askGrounded({...spec,key:""},"query")).rejects.toMatchObject({code:"provider_not_configured"});
    await expect(askGrounded({...spec,model:"sonar-pro"},"query")).rejects.toMatchObject({code:"provider_model_unavailable"});
    expect(fetch).not.toHaveBeenCalled();
  });
});
