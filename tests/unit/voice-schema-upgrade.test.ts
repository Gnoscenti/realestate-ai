import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("voice schema upgrade", () => {
  it("preserves foundation rows, backfills stable identity, and never fabricates billing verification", async () => {
    const db = new PGlite();
    const folder = new URL("../../migrations/", import.meta.url);
    const names = (await readdir(folder)).filter(name => name.endsWith(".sql")).sort();
    const apply = async (files: string[]) => {
      const applied = new Set((await db.query<{ name: string }>("select name from _migrations")).rows.map(row => row.name));
      for (const name of files) {
        if (applied.has(name)) continue;
        await db.transaction(async tx => {
          await tx.exec(await readFile(new URL(name, folder), "utf8"));
          await tx.query("insert into _migrations(name) values ($1)", [name]);
        });
      }
    };
    try {
      await db.exec("create table _migrations(name text primary key)");
      await apply(names.filter(name => name < "0020"));
      await db.exec(`
        insert into workspaces(id, name) values ('upgrade-voice', 'Existing workspace');
        insert into voice_assistants(id, workspace_id, display_name, provider_agent_id, status)
          values ('upgrade-assistant', 'upgrade-voice', 'Existing assistant', 'existing-provider-agent', 'paused');
        insert into voice_prompt_versions(id, workspace_id, assistant_id, version, system_prompt, greeting, recording_disclosure, created_by_user_id)
          values ('upgrade-prompt', 'upgrade-voice', 'upgrade-assistant', 1, 'Original prompt', 'Original greeting', 'Original disclosure', 'owner');
        insert into workspace_entitlements(workspace_id, product, status, stripe_subscription_id)
          values ('upgrade-voice', 'voice_assistant', 'active', 'existing-subscription');
        insert into voice_calls(id, workspace_id, assistant_id, retell_call_id, consent_state, transcript)
          values ('upgrade-call', 'upgrade-voice', 'upgrade-assistant', 'existing-call', 'accepted', 'Original consented transcript');
      `);
      await apply(names);
      const assistant = (await db.query("select provider_agent_id, provisioning_identity, status from voice_assistants")).rows[0];
      expect(assistant).toMatchObject({ provider_agent_id: "existing-provider-agent", status: "paused" });
      expect(assistant.provisioning_identity).toMatch(/^voice-workspace-/);
      expect((await db.query("select system_prompt, provider_sync_state, customization from voice_prompt_versions")).rows)
        .toEqual([{ system_prompt: "Original prompt", provider_sync_state: "pending", customization: {} }]);
      expect((await db.query("select stripe_subscription_id, billing_verified_at, billing_event_id from workspace_entitlements")).rows)
        .toEqual([{ stripe_subscription_id: "existing-subscription", billing_verified_at: null, billing_event_id: null }]);
      expect((await db.query("select transcript, consent_state from voice_calls")).rows)
        .toEqual([{ transcript: "Original consented transcript", consent_state: "accepted" }]);
      await db.exec(`insert into voice_workspace_mutation_leases(workspace_id, lease_token, purpose, lease_expires_at)
        values ('upgrade-voice', 'first-owner', 'upgrade-check', now() + interval '5 minutes')`);
      await expect(db.exec(`insert into voice_workspace_mutation_leases(workspace_id, lease_token, purpose, lease_expires_at)
        values ('upgrade-voice', 'second-owner', 'upgrade-check', now() + interval '5 minutes')`))
        .rejects.toMatchObject({ code: "23505" });
      await apply(names);
      expect((await db.query("select provider_agent_id, provisioning_identity, status from voice_assistants")).rows[0]).toEqual(assistant);
      expect((await db.query<{ name: string }>("select name from _migrations order by name")).rows.map(row => row.name)).toEqual(names);
    } finally {
      await db.close();
    }
  }, 30_000);
});
