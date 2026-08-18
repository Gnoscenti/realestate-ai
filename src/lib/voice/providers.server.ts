/** Server-only provider contracts. Live implementations use native `fetch`. */

export interface VoiceRuntimeAgentInput {
  workspaceId: string;
  provisioningIdentity: string;
  displayName: string;
  systemPrompt: string;
  greeting: string;
  recordingDisclosure: string;
  webhookUrl: string;
}

export interface VoiceRuntimeLlmResult {
  providerLlmId: string;
  providerLlmVersion: number;
}

export interface VoiceRuntimeAgentResult {
  providerAgentId: string;
  providerAgentVersion: number;
}

export interface NormalizedVoiceWebhook {
  eventKey: string;
  eventType: string;
  providerCallId: string | null;
  occurredAt: string | null;
  payload: unknown;
}

export interface VoiceRuntimeProvider {
  createLlm(input: VoiceRuntimeAgentInput): Promise<VoiceRuntimeLlmResult>;
  updateLlm(input: VoiceRuntimeAgentInput & {
    providerLlmId: string;
  }): Promise<VoiceRuntimeLlmResult>;
  createOrRecoverAgent(input: VoiceRuntimeAgentInput & {
    providerLlmId: string;
    providerLlmVersion: number;
    agentMarker: string;
  }): Promise<VoiceRuntimeAgentResult>;
  createDraftAgentVersion(input: {
    providerAgentId: string;
    baseVersion: number;
  }): Promise<VoiceRuntimeAgentResult>;
  configureAgentVersion(input: VoiceRuntimeAgentInput & {
    providerAgentId: string;
    providerAgentVersion: number;
    providerLlmId: string;
    providerLlmVersion: number;
  }): Promise<void>;
  publishAgentVersion(input: {
    providerAgentId: string;
    providerAgentVersion: number;
    versionDescription: string;
  }): Promise<void>;
  importAndBindInboundNumber(input: {
    e164: string;
    terminationUri: string;
    providerAgentId: string;
    nickname: string;
  }): Promise<void>;
  bindInboundNumber(input: {
    e164: string;
    providerAgentId: string;
  }): Promise<void>;
  unbindInboundNumber(input: { e164: string }): Promise<void>;
  deleteCall(providerCallId: string): Promise<void>;
  verifyAndNormalizeWebhook(
    rawBody: string,
    signature: string | null,
    nowMs?: number,
  ): NormalizedVoiceWebhook;
}

export interface ReservedPhoneNumber {
  e164: string;
  phoneNumberSid: string;
}

export interface SipRoutingResult {
  trunkSid: string;
  terminationUri: string;
  originationUrlSid: string;
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
  }): Promise<SipRoutingResult>;
  releaseNumber(phoneNumberSid: string): Promise<void>;
}
