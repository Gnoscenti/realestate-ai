import { spawnSync } from "node:child_process";
const url = process.env.TEST_DATABASE_URL;
if (!url || !/_tests?$/.test(new URL(url).pathname) || process.env.NODE_ENV === "production") {
  throw new Error("Set TEST_DATABASE_URL to an isolated, disposable database ending in _test or _tests. Never use a production database.");
}
function run(args) {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit", env: { ...process.env, DATABASE_URL: url },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(["scripts/migrate.mjs"]);
run(["scripts/migrate.mjs"]); // repeat application must be a no-op
run(["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.postgres.config.ts"]);
