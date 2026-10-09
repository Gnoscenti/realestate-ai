// Separate processes exercise the default disk path without Vitest's memory mode.
import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createServer } from "vite";

const mode = process.argv[2];
if (mode !== "write" && mode !== "read") throw new Error("Expected write or read");

const server = await createServer({
  root: fileURLToPath(new URL("../..", import.meta.url)),
  configFile: false,
  envFile: false,
  cacheDir: path.join(process.cwd(), ".vite-startup-test-cache"),
  logLevel: "silent",
  server: { middlewareMode: true, watch: null },
  appType: "custom",
});
let pg;
try {
  if (mode === "write") {
    // Vite itself must not pre-create the database parent and mask the regression.
    await assert.rejects(stat(path.join(process.cwd(), ".local-data")), { code: "ENOENT" });
  }
  const { getPglite } = await server.ssrLoadModule("/src/lib/db.ts");
  pg = await getPglite();
  if (mode === "write") {
    await pg.exec("create table startup_receipt (value text not null)");
    await pg.query("insert into startup_receipt (value) values ($1)", ["persisted across processes"]);
  }
  const { rows } = await pg.query("select value from startup_receipt");
  const migrations = await pg.query("select name from _migrations order by name");
  process.stdout.write(JSON.stringify({ rows, migrations: migrations.rows.map(row => row.name) }));
} finally {
  await pg?.close();
  await server.close();
}
