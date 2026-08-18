import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
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
});
