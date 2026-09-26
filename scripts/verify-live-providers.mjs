// Explicit manual smoke run; never invoked by unit tests or builds.
// Spends real provider budget (RapidAPI units + one grounded answer per engine).
// Refuses to run when DATABASE_URL points anywhere: it writes a diagnostics
// workspace and must only ever touch the local PGLite fallback.
//   node --env-file=.env.local scripts/verify-live-providers.mjs
import { createServer } from "vite";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

if (process.env.DATABASE_URL?.trim()) {
  console.error("Refusing to run live provider diagnostics against a configured DATABASE_URL.");
  process.exit(2);
}

const server = await createServer({
  configFile: false,
  cacheDir: "tmp/vite-providers",
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
  resolve: { alias: { "@": path.resolve("src") } },
  server: { middlewareMode: true },
  logLevel: "error",
});
const checks = [];
try {
  const { ensurePersonalWorkspace } = await server.ssrLoadModule("/src/lib/workspaces/repository.server.ts");
  const { queryRapidApi } = await server.ssrLoadModule("/src/lib/rapidapi/adapter.server.ts");
  const { rapidQuerySchema } = await server.ssrLoadModule("/src/lib/rapidapi/types.ts");
  const { configuredProviders, askGrounded } = await server.ssrLoadModule("/src/lib/aieo/visibility/providers.server.ts");
  const user = "local-provider-diagnostics";
  const ws = await ensurePersonalWorkspace(user);
  await mkdir("tmp", { recursive: true });
  async function lookup(input) {
    const q = rapidQuerySchema.parse(input);
    const r = await queryRapidApi(user, ws.id, q);
    if (r.ok) await writeFile("tmp/normalized-" + q.operation + ".json", JSON.stringify(r, null, 2), { mode: 0o600 });
    const check = { provider: "rapidapi", operation: q.operation, ok: r.ok, cached: r.cached, listings: r.listings.length, agents: r.agents.length, importable: r.listings.filter((l) => l.property).length, error: r.error };
    checks.push(check);
    console.log(JSON.stringify(check));
    return r;
  }
  if (!process.env.SKIP_RAPIDAPI) {
    await lookup({ operation: "search", query: "San Diego, CA" });
    await lookup({ operation: "agents", query: "san-diego-ca" });
  }
  for (const spec of configuredProviders().filter(s => !process.env.LIVE_PROVIDER || s.provider === process.env.LIVE_PROVIDER)) {
    try {
      const answer = await askGrounded(spec, "Who are well-regarded real estate agents in Rancho Santa Fe, California? Cite sources.");
      const check = { provider: spec.provider, model: spec.model, returnedModel: answer.returnedModel, citations: answer.citations.length, searchCalls: answer.searchCalls, costUsd: answer.costUsdTicks ? answer.costUsdTicks / 1e10 : undefined, ok: true };
      checks.push(check);
      console.log(JSON.stringify(check));
    } catch (error) {
      const check = { provider: spec.provider, model: spec.model, ok: false, code: error?.code || "unknown", message: String(error?.message || "").slice(0, 200) };
      checks.push(check);
      console.log(JSON.stringify(check));
    }
  }
  await writeFile("tmp/live-provider-checks.json", JSON.stringify({ checkedAt: new Date().toISOString(), checks }, null, 2), { mode: 0o600 });
  if (checks.some((c) => c.ok === false)) process.exitCode = 1;
} finally {
  const { getPglite } = await server.ssrLoadModule("/src/lib/db.ts");
  await (await getPglite()).close();
  await server.close();
}
