import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const mainOnly = new Set([
  "0007_citelock_recognition_runs.sql", "0009_social_media_renders.sql",
  "0013_citelock_panel_reservations.sql", "0014_managed_listing_media.sql",
  "0015_social_stripe_lifecycle.sql", "0016_public_media_operations.sql",
]);
const shared = new Set([
  "0001_auth.sql", "0002_workspaces.sql", "0003_inventory_comps_assistant.sql",
  "0004_voice_foundation.sql", "0006_citelock_scans.sql",
]);
const localOnly = new Set([
  "0007_citelock_trust_foundation.sql", "0008_rapidapi_observations.sql",
  "0009_social_desk.sql", "0010_citelock_visibility.sql", "0011_citelock_expertise.sql",
  "0012_social_dispatch.sql", "0013_expertise_withdrawal.sql", "0014_citelock_subjects.sql",
  "0015_perplexity_agent.sql", "0016_citelock_guides.sql",
]);
async function apply(db: PGlite, names: string[]) {
  await db.exec("create table if not exists _migrations(name text primary key, applied_at timestamptz default now())");
  const done = new Set((await db.query<{name:string}>("select name from _migrations")).rows.map(r=>r.name));
  for (const name of names) {
    if(done.has(name)) continue;
    const sql=await readFile(resolve("migrations",name),"utf8");
    await db.transaction(async tx=>{
      await tx.exec(sql);
      await tx.query("insert into _migrations(name) values($1)",[name]);
    });
  }
}
describe("integrated migration lineage",()=>{
  for(const lineage of ["fresh","main","preserved-local"] as const) {
    it(`preserves evidence and migration timestamps upgrading ${lineage}`,async()=>{
      const db=new PGlite();
      try {
        const names=(await readdir("migrations")).filter(n=>n.endsWith(".sql")).sort();
        const baseline=lineage==="fresh"?[]:names.filter(n=>lineage==="main"
          ? shared.has(n)||mainOnly.has(n) : shared.has(n)||localOnly.has(n));
        await apply(db,baseline);
        if(lineage!=="fresh") {
          await db.exec("insert into workspaces(id,name) values('upgrade-evidence','Preserved workspace')");
        }
        if(lineage==="preserved-local") {
          await db.query(`insert into citelock_recognition_runs
            (id,workspace_id,created_by_user_id,subject_fingerprint,query_id,provider,prompt,
             mentioned,cited,correct_identity,correct_brokerage,observed_at,response_text)
            values('legacy-proof','upgrade-evidence','owner',$1,'q','provider','Original prompt',
             true,false,true,false,now(),'Original answer')`,["a".repeat(64)]);
        }
        const before=(await db.query("select name, applied_at from _migrations order by name")).rows;
        await apply(db,names);
        const after=(await db.query<{name:string;applied_at:unknown}>("select name, applied_at from _migrations order by name")).rows;
        expect(after).toHaveLength(names.length);
        expect(after.filter(r=>baseline.includes(r.name))).toEqual(before);
        await apply(db,names);
        expect((await db.query("select name, applied_at from _migrations order by name")).rows).toEqual(after);
        if(lineage==="preserved-local") {
          expect((await db.query("select id,prompt,response_text from citelock_legacy_recognition_runs")).rows)
            .toEqual([{id:"legacy-proof",prompt:"Original prompt",response_text:"Original answer"}]);
          expect((await db.query("select * from citelock_recognition_runs")).rows).toHaveLength(0);
        }
        for(const table of ["citelock_recognition_runs","citelock_visibility_runs","citelock_guides","managed_listing_media","social_drafts"]){
          const rows=(await db.query<{name:string|null}>("select to_regclass($1)::text as name",[table])).rows;
          expect(rows[0].name,table).toBeTruthy();
        }
        const columns=(await db.query<{column_name:string}>("select column_name from information_schema.columns where table_name='citelock_recognition_runs'")).rows.map(r=>r.column_name);
        expect(columns).toContain("scan_id");
        expect(columns).toContain("panel_version");
      } finally { await db.close(); }
    },30000);
  }
});
