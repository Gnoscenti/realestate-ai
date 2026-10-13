import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getSql } from "../../src/lib/db";
import { ensurePersonalWorkspace } from "../../src/lib/workspaces/repository.server";
import {
  ensureVoiceAssistantDraft,
  getVoiceSetup,
  savePromptVersion,
} from "../../src/lib/voice/repository.server";

const disclosure =
  "Hi, I am the agent's AI assistant. This call may be recorded and transcribed. Is that okay?";

describe("voice assistant foundation", () => {
  it("creates one draft assistant without calling a provider", async () => {
    const userId = `voice-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    const first = await ensureVoiceAssistantDraft(userId, workspace.id);
    const second = await ensureVoiceAssistantDraft(userId, workspace.id);

    expect(second.id).toBe(first.id);
    expect(first.status).toBe("draft");
    expect(first.providerAgentId).toBeNull();
  });

  it("keeps prompt changes as immutable versions", async () => {
    const userId = `prompt-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    const base = {
      systemPrompt:
        "You are a disclosed AI receptionist for a real-estate professional. Collect contact details and a callback request. Never negotiate, value property, or give legal advice.",
      greeting: "Thanks for calling. I can take a message or request an appointment.",
      recordingDisclosure: disclosure,
      allowedCapabilities: {
        collectLead: true,
        requestAppointment: true,
        transferToHuman: true,
        sendTransactionalText: false,
      },
    };

    const first = await savePromptVersion(userId, workspace.id, base);
    const second = await savePromptVersion(userId, workspace.id, {
      ...base,
      greeting: "Thanks for calling. How can I help with your real-estate inquiry?",
    });
    const setup = await getVoiceSetup(userId, workspace.id);

    expect(second.version).toBe(first.version + 1);
    expect(setup.promptVersion).toBe(second.version);
    expect(setup.phoneNumber).toBeNull();
  });

  it("deletes a workspace after all linked inventory and voice rows cascade", async () => {
    const userId = `cascade-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    const assistant = await ensureVoiceAssistantDraft(userId, workspace.id);
    const sql = await getSql();
    const sourceId = `source-${randomUUID()}`;
    const listingId = `listing-${randomUUID()}`;
    const phoneId = `phone-${randomUUID()}`;
    const callId = `call-${randomUUID()}`;

    await sql.query(
      `insert into data_sources
         (id, workspace_id, kind, display_name)
       values ($1, $2, 'manual', 'Deletion test')`,
      [sourceId, workspace.id],
    );
    await sql.query(
      `insert into listings
         (id, workspace_id, source_id, title, provenance, created_by_user_id)
       values ($1, $2, $3, 'Deletion test', 'unit_test', $4)`,
      [listingId, workspace.id, sourceId, userId],
    );
    await sql.query(
      `insert into voice_phone_numbers
         (id, workspace_id, assistant_id, e164, twilio_phone_number_sid)
       values ($1, $2, $3, $4, $5)`,
      [
        phoneId,
        workspace.id,
        assistant.id,
        `+1555${Math.floor(Math.random() * 1_000_0000)
          .toString()
          .padStart(7, "0")}`,
        `PN${randomUUID().replaceAll("-", "")}`,
      ],
    );
    await sql.query(
      `insert into voice_calls
         (id, workspace_id, assistant_id, phone_number_id, retell_call_id)
       values ($1, $2, $3, $4, $5)`,
      [callId, workspace.id, assistant.id, phoneId, `call_${randomUUID()}`],
    );

    await expect(
      sql.query("delete from workspaces where id = $1", [workspace.id]),
    ).resolves.toEqual([]);

    const linked = await sql.query<{ count: number }>(
      `select count(*)::bigint as count from voice_calls where workspace_id = $1`,
      [workspace.id],
    );
    expect(linked[0]?.count).toBe(0);
  });
});
