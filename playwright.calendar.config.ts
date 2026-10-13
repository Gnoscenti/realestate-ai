import { defineConfig } from "@playwright/test";
import { mkdirSync, mkdtempSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import base from "./playwright.config";

// Each invocation gets a fresh optimizer cache and disposable database. Pass
// the chosen directory to workers so they share this run's artifact location.
const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const artifactRoot = path.join(projectRoot, "tmp/calendar-cold-start");
mkdirSync(artifactRoot, { recursive: true });
const runDirectory = process.env.CALENDAR_TEST_DIRECTORY ??=
  mkdtempSync(path.join(artifactRoot, "run-"));

export default defineConfig({
  ...base,
  testMatch: "calendar.spec.ts",
  retries: 0,
  reporter: "list",
  outputDir: path.join(runDirectory, "results"),
  use: {
    ...base.use,
    baseURL: "http://127.0.0.1:8142",
    trace: "retain-on-failure",
  },
  webServer: {
    cwd: projectRoot,
    command: "node node_modules/vite/bin/vite.js dev --config tests/vite.calendar.config.ts",
    url: "http://127.0.0.1:8142",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      CALENDAR_TEST_DIRECTORY: runDirectory,
      NODE_ENV: "development",
      DATABASE_URL: "",
      PGLITE_IN_MEMORY: "1",
      VITE_AUTH_ENABLED: "false",
      BETTER_AUTH_URL: "http://127.0.0.1:8142",
      BETTER_AUTH_SECRET: "isolated-calendar-test-never-deploy-this",
      BETA_ACCESS_CODES: "",
      XAI_API_KEY: "", GROK_API_KEY: "", OPENAI_API_KEY: "",
      GEMINI_API_KEY: "", PERPLEXITY_API_KEY: "", RAPIDAPI_KEY: "",
      STRIPE_SECRET_KEY: "", GROK_AUTH_CLIENT_ID: "", GROK_AUTH_CLIENT_SECRET: "",
    },
  },
});
