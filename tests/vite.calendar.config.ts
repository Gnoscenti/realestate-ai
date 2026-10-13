import path from "node:path";
import baseConfig from "../vite.config";

export default (env: { command: "build" | "serve"; mode: string }) => {
  const runDirectory = process.env.CALENDAR_TEST_DIRECTORY;
  if (!runDirectory) throw new Error("Use playwright.calendar.config.ts for an isolated calendar run.");
  const resolved = typeof baseConfig === "function"
    ? baseConfig({ ...env, isSsrBuild: false, isPreview: false })
    : baseConfig;
  return {
    ...resolved,
    cacheDir: path.join(runDirectory, "vite-cache"),
    server: {
      ...resolved.server,
      host: "127.0.0.1",
      port: 8142,
      strictPort: true,
    },
  };
};
