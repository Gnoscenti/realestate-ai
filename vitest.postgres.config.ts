import { defineConfig } from "vitest/config";
import path from "node:path";

if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to an isolated database ending in _test or _tests.");
const url = new URL(process.env.TEST_DATABASE_URL);
if (!/_tests?$/.test(url.pathname)) throw new Error("PostgreSQL tests require a dedicated _test or _tests database.");
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "node",
    // Failure injection changes constraints; suites must run serially on this isolated database.
    fileParallelism: false,
    include: [
      "tests/unit/workspace-repository.test.ts", "tests/unit/citelock-repository.test.ts",
      "tests/unit/entitlement.test.ts", "tests/unit/social-desk.test.ts",
      "tests/unit/social-dispatch.test.ts", "tests/unit/visibility-engine.test.ts",
      "tests/unit/visibility-subjects.test.ts", "tests/unit/citelock-guide.test.ts",
    ],
    env: { DATABASE_URL: url.toString(), BETA_ACCESS_CODES: "", XAI_API_KEY: "", GEMINI_API_KEY: "", OPENAI_API_KEY: "", PERPLEXITY_API_KEY: "", RAPIDAPI_KEY: "" },
    testTimeout: 15000,
  },
});
