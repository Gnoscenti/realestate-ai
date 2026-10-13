// Disposable test databases only. Refuses a populated restore target; never drops tables.
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const source = new URL(process.env.TEST_DATABASE_URL || "");
const target = new URL(process.env.TEST_RESTORE_DATABASE_URL || "");
for (const url of [source,target]) {
  if (!/_tests?$/.test(url.pathname) || process.env.NODE_ENV === "production")
    throw new Error("Restore verification requires disposable databases ending in _test or _tests.");
}
if (source.host === target.host && source.pathname === target.pathname)
  throw new Error("Source and restore target must be different databases.");
function environment(url) {
  return { ...process.env, PGHOST:url.hostname, PGPORT:url.port || "5432",
    PGUSER:decodeURIComponent(url.username), PGPASSWORD:decodeURIComponent(url.password),
    PGDATABASE:decodeURIComponent(url.pathname.slice(1)), PGCONNECT_TIMEOUT:"10",
    PGSSLMODE:url.searchParams.get("sslmode") || "prefer" };
}
function run(command, args, url) {
  const result = spawnSync(command,args,{env:environment(url),encoding:"utf8"});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(command + " failed: " + result.stderr);
}
async function snapshot(client) {
  const tables = (await client.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows;
  const result = {};
  for (const {tablename} of tables) {
    const quoted = '"' + tablename.replaceAll('"','""') + '"';
    result[tablename] = (await client.query(
      `select count(*)::integer as rows, md5(coalesce(string_agg(row_to_json(t)::text, E'\n' order by row_to_json(t)::text),'')) as digest from ${quoted} t`,
    )).rows[0];
  }
  return result;
}
const clients = [new pg.Client({connectionString:source.toString()}),new pg.Client({connectionString:target.toString()})];
try {
  await Promise.all(clients.map(client=>client.connect()));
  if (Object.keys(await snapshot(clients[1])).length) throw new Error("Restore target is not empty. Choose a fresh disposable database.");
  const before = await snapshot(clients[0]);
  const temporaryRoot = path.resolve("tmp");
  await mkdir(temporaryRoot, { recursive: true, mode: 0o700 });
  const folder = await mkdtemp(path.join(temporaryRoot,"postgres-restore-"));
  const backup = path.join(folder,"database.dump");
  run("pg_dump",["--format=custom","--no-owner","--no-acl","--file",backup],source);
  run("pg_restore",["--exit-on-error","--no-owner","--no-acl","--dbname",decodeURIComponent(target.pathname.slice(1)),backup],target);
  const after = await snapshot(clients[1]);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Restored table counts/content digests differ.");
  console.log(JSON.stringify({ok:true,tables:Object.keys(after).length,
    rows:Object.values(after).reduce((n,item)=>n+item.rows,0),migrations:after._migrations?.rows,backup,
    scope:"Disposable PostgreSQL full logical data restore; external roles/ACLs and deployed backup policy are not exercised."},null,2));
} finally { await Promise.all(clients.map(client=>client.end())); }
