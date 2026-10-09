import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbGlobals = globalThis as typeof globalThis & {
  __pgliteInstance__?: Promise<PGlite>;
  __pgliteMigrateChain__?: Promise<void>;
  __pgBootstrapPromise__?: Promise<void>;
};
let folder: string;

async function closeDatabase() {
  await dbGlobals.__pgBootstrapPromise__?.catch(() => undefined);
  const instance = await dbGlobals.__pgliteInstance__?.catch(() => undefined);
  if (instance) await instance.close();
  delete dbGlobals.__pgliteInstance__;
  delete dbGlobals.__pgliteMigrateChain__;
  delete dbGlobals.__pgBootstrapPromise__;
  vi.resetModules();
}

beforeEach(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "realestate-pglite-startup-"));
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VITEST", "");
  vi.stubEnv("PGLITE_IN_MEMORY", "");
  vi.stubEnv("PGLITE_DATA_DIR", path.join(folder, "missing", "nested", "pglite"));
});

afterEach(async () => {
  await closeDatabase();
  vi.unstubAllEnvs();
  await rm(folder, { recursive: true, force: true });
});

describe("PGlite startup", () => {
  it("creates the default directory on first process start and retains data and migrations after restart", async () => {
    const fixture = fileURLToPath(new URL("../fixtures/pglite-startup.mjs", import.meta.url));
    const migrationsDir = fileURLToPath(new URL("../../migrations/", import.meta.url));
    const migrationFiles = (await readdir(migrationsDir)).filter(name => name.endsWith(".sql")).sort();
    await expect(stat(path.join(folder, ".local-data"))).rejects.toMatchObject({ code: "ENOENT" });

    const run = async (mode: "write" | "read") => {
      const { stdout } = await promisify(execFile)(process.execPath, [fixture, mode], {
        cwd: folder,
        // Do not inherit DATABASE_URL, provider secrets, or Vitest's memory flag.
        env: { PATH: process.env.PATH, NODE_ENV: "development" },
        timeout: 30_000,
      });
      return JSON.parse(stdout);
    };

    expect(await run("write")).toEqual({
      rows: [{ value: "persisted across processes" }],
      migrations: migrationFiles,
    });
    expect((await stat(path.join(folder, ".local-data", "pglite"))).isDirectory()).toBe(true);
    expect(await run("read")).toEqual({
      rows: [{ value: "persisted across processes" }],
      migrations: migrationFiles,
    });
  }, 60_000);

  it("boots with missing data-directory parents and preserves data on reopen", async () => {
    await expect(stat(path.join(folder, "missing"))).rejects.toMatchObject({ code: "ENOENT" });
    const first = await import("@/lib/db");
    const sql = await first.getSql();
    await sql.query("create table startup_receipt (value text not null)");
    await sql.query("insert into startup_receipt (value) values ($1)", ["persisted"]);
    await closeDatabase();

    const reopened = await import("@/lib/db");
    const restored = await reopened.getSql();
    expect(await restored.query("select value from startup_receipt")).toEqual([{ value: "persisted" }]);
  });

  it("keeps explicit in-memory initialization off disk", async () => {
    vi.stubEnv("PGLITE_IN_MEMORY", "1");
    const { getSql } = await import("@/lib/db");
    expect(await (await getSql()).query("select 1 as ready")).toEqual([{ ready: 1 }]);
    await expect(stat(path.join(folder, "missing"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("still refuses production startup without PostgreSQL", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(import("@/lib/db")).rejects.toThrow("DATABASE_URL is required in production");
    await expect(stat(path.join(folder, "missing"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
