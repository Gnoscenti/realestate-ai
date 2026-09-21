import { z } from "zod";

export const urgencySchema = z.enum(["low", "normal", "high", "urgent"]);
export type CallUrgency = z.infer<typeof urgencySchema>;

export const voicePromptInputSchema = z.object({
  systemPrompt: z.string().trim().min(100).max(20_000),
  greeting: z.string().trim().min(10).max(1_000),
  recordingDisclosure: z.string().trim().min(20).max(1_000),
  allowedCapabilities: z
    .object({
      collectLead: z.boolean().default(true),
      requestAppointment: z.boolean().default(true),
      transferToHuman: z.literal(false).default(false),
      sendTransactionalText: z.literal(false).default(false),
    })
    .default({
      collectLead: true,
      requestAppointment: true,
      transferToHuman: false,
      sendTransactionalText: false,
    }),
});

export type VoicePromptInput = z.input<typeof voicePromptInputSchema>;

export const voicePromptCustomizationSchema = z.object({
  greeting: z
    .string()
    .trim()
    .min(10)
    .max(500)
    .default("Thanks for calling. How can I help with your real-estate inquiry?"),
  additionalInstructions: z.string().trim().max(4_000).default(""),
  collectLead: z.boolean().default(true),
  requestAppointment: z.boolean().default(true),
});

export type VoicePromptCustomization = z.input<
  typeof voicePromptCustomizationSchema
>;

export type StoredVoicePromptCustomization = z.output<
  typeof voicePromptCustomizationSchema
>;

export const approvedVoicePromptCustomizationSchema =
  voicePromptCustomizationSchema.extend({
    brokerApprovalConfirmed: z.literal(true),
  });

export const voiceSetupChecklistSchema = z.object({
  carrier: z
    .enum(["att", "tmobile", "verizon", "business_pbx", "other"])
    .default("other"),
  devicePlatform: z
    .enum(["iphone", "android", "desk_phone", "other"])
    .default("other"),
  conditionalForwardingConfigured: z.boolean().default(false),
  disclosureVerified: z.boolean().default(false),
  declinedConsentVerified: z.boolean().default(false),
  testCallCompleted: z.boolean().default(false),
  callLogVerified: z.boolean().default(false),
  rollbackUnderstood: z.boolean().default(false),
  brokerApprovalConfirmed: z.boolean().default(false),
});

export type VoiceSetupChecklist = z.output<typeof voiceSetupChecklistSchema>;

export const provisionVoiceInputSchema = z.object({
  workspaceId: z.string().trim().min(1).max(240),
  idempotencyKey: z
    .string()
    .trim()
    .min(8)
    .max(120)
    .regex(/^[A-Za-z0-9._:-]+$/),
  areaCode: z.string().regex(/^\d{3}$/).optional(),
  confirmation: z.literal("PROVISION_NUMBER"),
});

export type ProvisionVoiceInput = z.infer<typeof provisionVoiceInputSchema>;

export interface VoiceAssistantRecord {
  id: string;
  workspaceId: string;
  provider: "retell";
  providerAgentId: string | null;
  providerLlmId?: string | null;
  providerLlmVersion?: number | null;
  providerAgentVersion?: number | null;
  provisioningIdentity: string;
  blockedReason: string | null;
  status: "draft" | "provisioning" | "active" | "paused" | "failed" | "canceled";
  displayName: string;
  language: string;
}

export interface VoiceCallRecord {
  id: string;
  retellCallId: string;
  fromNumber: string | null;
  toNumber: string | null;
  status: "started" | "ended" | "analyzed" | "failed";
  consentState: "unknown" | "accepted" | "declined" | "not_recorded";
  consentRecordedAt: string | null;
  consentEvidenceSource: "retell_post_call_classification" | null;
  transcript: string | null;
  recordingUrl: string | null;
  recordingExpiresAt: string | null;
  recordingAvailable: boolean;
  callerName: string | null;
  callbackNumber: string | null;
  appointmentTime: string | null;
  appointmentTimeRaw: string | null;
  urgency: CallUrgency | null;
  summary: string | null;
  durationSeconds: number | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

export interface VoiceSetup {
  assistant: VoiceAssistantRecord;
  phoneNumber: string | null;
  promptVersion: number | null;
  promptSyncState: "pending" | "synced" | "failed" | null;
  provisioningState?:
    | "pending"
    | "running"
    | "failed"
    | "completed"
    | "setup_required"
    | "blocked"
    | "dead_letter"
    | null;
}

export interface VoiceConsoleState {
  workspaceId: string;
  profile: {
    ready: boolean;
    label: string | null;
  };
  setup: VoiceSetup;
  entitlement: {
    state: "active" | "setup_required" | "inactive" | "allowance_exhausted";
    allowanceSeconds: number;
    usedSeconds: number;
    remainingSeconds: number;
    periodStart: string | null;
    periodEnd: string | null;
    reason: string | null;
    canProvision: boolean;
  };
  billing: {
    monthlyPriceCents: 7900;
    includedMinutes: 200;
    checkoutAvailable: boolean;
    portalAvailable: boolean;
    message: string;
  };
  customization: StoredVoicePromptCustomization;
  checklist: VoiceSetupChecklist;
  readyForMissedCalls: boolean;
  push: {
    status: "not_configured" | "subscription_saved_delivery_not_configured";
    message: string;
  };
}
