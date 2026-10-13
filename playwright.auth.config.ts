import { defineConfig, devices } from "@playwright/test";

if (process.env.TEST_DATABASE_URL && !/_tests?$/.test(new URL(process.env.TEST_DATABASE_URL).pathname)) {
  throw new Error("Authenticated PostgreSQL tests require a disposable _test or _tests database.");
}

const production = process.env.PLAYWRIGHT_PRODUCTION === "1";
if (production && !process.env.TEST_DATABASE_URL) throw new Error("Production browser tests require TEST_DATABASE_URL.");
export default defineConfig({
  testDir:"tests/auth",fullyParallel:false,forbidOnly:!!process.env.CI,workers:1,
  timeout:90000,expect:{timeout:15000},reporter:"list",outputDir:"tmp/auth-e2e-results",
  use:{...devices["Desktop Chrome"],baseURL:"http://localhost:8132",
    screenshot:"only-on-failure",trace:"retain-on-failure"},
  webServer:{
    command:production ? "npx nitro preview --host 127.0.0.1 --port 8132" : "npx vite dev --config tests/vite.auth.config.ts",
    url:"http://localhost:8132",reuseExistingServer:false,timeout:120000,
    env:{...process.env,NODE_ENV:production ? "production" : "development",DATABASE_URL:process.env.TEST_DATABASE_URL || "",PGLITE_IN_MEMORY:"1",VITE_AUTH_ENABLED:"true",
      BETTER_AUTH_URL:"http://localhost:8132",
      BETTER_AUTH_SECRET:"isolated-auth-test-secret-never-deploy-this-configuration",
      BETA_ACCESS_CODES:"TEST-ACCESS-NOT-PRODUCTION",
      XAI_API_KEY:"",GROK_API_KEY:"",OPENAI_API_KEY:"",GEMINI_API_KEY:"",
      PERPLEXITY_API_KEY:"",RAPIDAPI_KEY:"",STRIPE_SECRET_KEY:"",
      ALLOW_DEMO_CHECKOUT:"",GROK_AUTH_CLIENT_ID:"",GROK_AUTH_CLIENT_SECRET:""},
  },
});
