import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getSql } from "../../src/lib/db";
import {
  getVoiceConsoleState,
  saveVoiceSetupChecklist,
} from "../../src/lib/voice/console.server";
import {
  ensureVoiceAssistantDraft,
  savePromptVersion,
} from "../../src/lib/voice/repository.server";
import {
  approvedVoicePromptCustomizationSchema,
  voiceSetupChecklistSchema,
} from "../../src/lib/voice/types";
import {
  ensurePersonalWorkspace,
  saveAgentProfile,
} from "../../src/lib/workspaces/repository.server";

const completeChecklist = voiceSetupChecklistSchema.parse({
  carrier: "verizon",
  devicePlatform: "iphone",
  conditionalForwardingConfigured: true,
  disclosureVerified: true,
  declinedConsentVerified: true,
  testCallCompleted: true,
  callLogVerified: true,
  rollbackUnderstood: true,
  brokerApprovalConfirmed: true,
});

describe("voice console persistence", () => {
  it("requires broker approval on public prompt saves", () => {
    expect(() =>
      approvedVoicePromptCustomizationSchema.parse({
        greeting: "Thanks for calling. How can I help today?",
        brokerApprovalConfirmed: false,
      }),
    ).toThrow();
  });

  it("keeps provider activation separate from verified field readiness", async () => {
    const userId = `voice-console-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    await saveAgentProfile(userId, workspace.id, {
      displayName: "Alex Agent",
      businessName: "Alex Realty",
      timezone: "America/Los_Angeles",
    });
    const assistant = await ensureVoiceAssistantDraft(userId, workspace.id);
    const sql = await getSql();
    await sql.query(
      `insert into workspace_entitlements (
         workspace_id, product, status, stripe_subscription_id,
         stripe_price_id, billing_verified_at, billing_event_id,
         current_period_start, current_period_end
       ) values ($1, 'voice_assistant', 'active', $2, $3, now(), $4,
                 now(), now() + interval '30 days')`,
      [
        workspace.id,
        `sub_${randomUUID().replaceAll("-", "")}`,
        `price_${randomUUID().replaceAll("-", "")}`,
        `evt_${randomUUID().replaceAll("-", "")}`,
      ],
    );
    const prompt = await savePromptVersion(
      userId,
      workspace.id,
      {
        systemPrompt:
          "You are a disclosed inbound AI receptionist. Request consent before collecting a caller name or message. Never make outbound calls, send texts, transfer calls, negotiate, or provide regulated advice.",
        greeting: "Thanks for calling Alex Realty. How can I help today?",
        recordingDisclosure:
          "I am an AI assistant. This call may be recorded and transcribed. Do you consent?",
      },
      sql,
      {
        greeting: "Thanks for calling Alex Realty. How can I help today?",
        additionalInstructions: "Ask whether the caller is buying or selling.",
        collectLead: true,
        requestAppointment: true,
      },
    );
    await sql.query(
      `update voice_prompt_versions
          set provider_sync_state = 'synced'
        where id = $1`,
      [prompt.id],
    );
    await sql.query(
      `update voice_assistants
          set status = 'active', provider_agent_id = 'agent_test'
        where id = $1`,
      [assistant.id],
    );
    await sql.query(
      `insert into voice_phone_numbers (
         id, workspace_id, assistant_id, e164, twilio_phone_number_sid,
         status, assigned_at
       ) values ($1,$2,$3,$4,$5,'active',now())`,
      [
        `phone_${randomUUID()}`,
        workspace.id,
        assistant.id,
        `+1503${Math.floor(Math.random() * 10_000_000)
          .toString()
          .padStart(7, "0")}`,
        `PN${randomUUID().replaceAll("-", "")}`,
      ],
    );

    const providerOnly = await getVoiceConsoleState(userId, workspace.id, sql);
    expect(providerOnly.setup.assistant.status).toBe("active");
    expect(providerOnly.readyForMissedCalls).toBe(false);
    expect(providerOnly.customization.additionalInstructions).toContain("buying");
    expect(providerOnly.push.status).toBe("not_configured");

    await saveVoiceSetupChecklist(
      userId,
      workspace.id,
      completeChecklist,
      sql,
    );
    const fieldReady = await getVoiceConsoleState(userId, workspace.id, sql);
    expect(fieldReady.checklist).toEqual(completeChecklist);
    expect(fieldReady.readyForMissedCalls).toBe(true);
  });
});
