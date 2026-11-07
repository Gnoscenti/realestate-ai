import {
  voicePromptCustomizationSchema,
  voiceSetupChecklistSchema,
  type VoiceConsoleState,
} from "@/lib/voice/types";

const DEMO_ALLOWANCE_SECONDS = 200 * 60;

/**
 * What a new workspace sees before subscribing, shown to demo visitors so they
 * can tour the phone assistant. Every action on it needs a real account.
 */
export function demoVoiceConsoleState(): VoiceConsoleState {
  return {
    workspaceId: "demo-workspace",
    profile: { ready: true, label: "Demo Agent" },
    setup: {
      assistant: {
        id: "demo-assistant",
        workspaceId: "demo-workspace",
        provider: "retell",
        providerAgentId: null,
        provisioningIdentity: "demo",
        blockedReason: null,
        status: "draft",
        displayName: "Demo Agent",
        language: "en-US",
      },
      phoneNumber: null,
      promptVersion: null,
      promptSyncState: null,
      provisioningState: null,
    },
    entitlement: {
      state: "setup_required",
      allowanceSeconds: DEMO_ALLOWANCE_SECONDS,
      usedSeconds: 0,
      remainingSeconds: DEMO_ALLOWANCE_SECONDS,
      periodStart: null,
      periodEnd: null,
      reason: "VOICE_BILLING_SETUP_REQUIRED",
      canProvision: false,
    },
    billing: {
      monthlyPriceCents: 2300,
      includedMinutes: 200,
      checkoutAvailable: true,
      portalAvailable: false,
      message:
        "$23 per month includes 200 completed inbound AI minutes. New calls pause after completed-call usage reaches 200 minutes; calls already in progress may finish. No overage is charged.",
    },
    customization: voicePromptCustomizationSchema.parse({}),
    checklist: voiceSetupChecklistSchema.parse({}),
    readyForMissedCalls: false,
    push: {
      status: "not_configured",
      message: "Native push is not configured in this release. Completed calls still appear in Call Logs.",
    },
  };
}
