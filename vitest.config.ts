import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    maxWorkers: 2,
    include: ["tests/unit/**/*.{test,spec}.ts"],
    exclude: ["node_modules", "dist", ".vercel", "tests/e2e/**"],
    testTimeout: 15_000,
    // Unit tests run under the standard terms that apply after the beta round,
    // whatever today's date is. A test that covers the beta round's lifetime
    // access moves the cutoff itself.
    env: { BETA_LIFETIME_CUTOFF: "2000-01-01T00:00:00.000Z" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
