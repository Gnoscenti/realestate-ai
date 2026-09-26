// Explicit live request; spends provider credits. No database writes or key output.
// node --env-file=.env.local scripts/smoke-perplexity-agent.mjs
import { createServer } from "vite";
import path from "node:path";

if (!process.env.PERPLEXITY_API_KEY?.trim()) {
  console.error("PERPLEXITY_API_KEY is missing. Create one at https://console.perplexity.ai and export it in your own terminal.");
  process.exit(2);
}
const server = await createServer({
  configFile: false, cacheDir: "tmp/vite-perplexity-smoke",
  optimizeDeps: { noDiscovery: true, include: [] }, appType: "custom",
  resolve: { alias: { "@": path.resolve("src") } },
  server: { middlewareMode: true }, logLevel: "silent",
});
try {
  const { configuredProviders, askGrounded } = await server.ssrLoadModule("/src/lib/aieo/visibility/providers.server.ts");
  const spec = configuredProviders().find(provider => provider.provider === "perplexity");
  const answer = await askGrounded(spec,
    "Search the official RESO website. In one sentence, what does RESO stand for? Cite the source.");
  console.log(JSON.stringify({ status: answer.httpStatus, shape: {
    text: typeof answer.text, citations: answer.citations.length, sources: answer.sources?.length ?? 0,
    searchCalls: answer.searchCalls, returnedModel: typeof answer.returnedModel,
    usage: typeof answer.usage, costReported: typeof answer.costUsdTicks === "number",
  } }));
} catch (error) {
  console.log(JSON.stringify({ status: error?.httpStatus ?? null,
    shape: { code: error?.code ?? "provider_unknown", retryAfterMs: error?.retryAfterMs } }));
  // No immediate retry. The app persists cooldowns; rerun this diagnostic only after Retry-After.
  process.exitCode = 1;
} finally {
  await server.close();
}
