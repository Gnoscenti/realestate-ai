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
      transferToHuman: z.boolean().default(true),
      sendTransactionalText: z.boolean().default(false),
    })
    .default({
      collectLead: true,
      requestAppointment: true,
      transferToHuman: true,
      sendTransactionalText: false,
    }),
});

export type VoicePromptInput = z.input<typeof voicePromptInputSchema>;

export interface VoiceAssistantRecord {
  id: string;
  workspaceId: string;
  provider: "retell";
  providerAgentId: string | null;
  status: "draft" | "provisioning" | "active" | "paused" | "failed" | "canceled";
  displayName: string;
  language: string;
}

export interface VoiceSetup {
  assistant: VoiceAssistantRecord;
  phoneNumber: string | null;
  promptVersion: number | null;
}
