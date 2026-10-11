/**
 * Provider contracts only. Live implementations arrive after durable
 * entitlement, idempotency, and webhook tests are merged. No permissive mock is
 * provided: an unconfigured deployment must never claim provisioning worked.
 */

export interface VoiceRuntimeAgentInput {
  workspaceId: string;
  displayName: string;
  systemPrompt: string;
  greeting: string;
  recordingDisclosure: string;
  webhookUrl: string;
}

export interface VoiceRuntimeAgentResult {
  provider: "retell";
  providerAgentId: string;
}

export interface NormalizedVoiceWebhook {
  eventKey: string;
  eventType: string;
  providerCallId: string | null;
  occurredAt: string | null;
  payload: unknown;
}

export interface VoiceRuntimeProvider {
  createAgent(input: VoiceRuntimeAgentInput): Promise<VoiceRuntimeAgentResult>;
  updateAgent(
    providerAgentId: string,
    input: VoiceRuntimeAgentInput,
  ): Promise<void>;
  attachInboundNumber(providerAgentId: string, e164: string): Promise<void>;
  verifyAndNormalizeWebhook(
    rawBody: string,
    signature: string | null,
  ): NormalizedVoiceWebhook;
}

export interface ReservedPhoneNumber {
  e164: string;
  phoneNumberSid: string;
}

export interface TelephonyProvider {
  reserveLocalNumber(input: {
    country: "US";
    areaCode?: string;
    idempotencyKey: string;
  }): Promise<ReservedPhoneNumber>;
  configureRetellSipRouting(input: {
    phoneNumberSid: string;
    retellSipUri: string;
  }): Promise<{ trunkSid: string }>;
  releaseNumber(phoneNumberSid: string): Promise<void>;
}
