import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import type {
  NormalizedVoiceWebhook,
  VoiceRuntimeAgentInput,
  VoiceRuntimeAgentResult,
  VoiceRuntimeLlmResult,
  VoiceRuntimeProvider,
} from "./providers.server";

const DEFAULT_BASE_URL = "https://api.retellai.com";
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;

type FetchLike = typeof fetch;

export class VoiceProviderError extends Error {
  readonly provider: "retell" | "twilio";
  readonly status: number;

  constructor(provider: "retell" | "twilio", status: number, message: string) {
    super(`${provider} request failed (${status}): ${message}`);
    this.name = "VoiceProviderError";
    this.provider = provider;
    this.status = status;
  }
}

export class AmbiguousVoiceProviderMutationError extends Error {
  readonly code = "AMBIGUOUS_PROVIDER_MUTATION";

  constructor(resource: string, options?: { cause?: unknown }) {
    super(
      `Retell ${resource} may have succeeded but cannot be reconciled automatically`,
      options,
    );
    this.name = "AmbiguousVoiceProviderMutationError";
  }
}

function mutationMayHaveCommitted(error: unknown): boolean {
  return !(error instanceof VoiceProviderError) || error.status >= 500;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function timestampToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

export function verifyRetellWebhook(
  rawBody: string,
  signature: string | null,
  apiKey: string,
  nowMs = Date.now(),
): NormalizedVoiceWebhook {
  const match = /^v=(\d+),d=([a-f0-9]+)$/i.exec(signature ?? "");
  if (!match) throw new Error("Invalid Retell signature");
  const timestamp = Number(match[1]);
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(nowMs - timestamp) > MAX_CLOCK_SKEW_MS
  ) {
    throw new Error("Expired Retell signature");
  }
  const supplied = Buffer.from(match[2], "hex");
  const expected = createHmac("sha256", apiKey)
    .update(`${rawBody}${timestamp}`)
    .digest();
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    throw new Error("Invalid Retell signature");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error("Invalid Retell JSON");
  }
  const envelope = asObject(parsed);
  const call = asObject(envelope?.call);
  const eventType = optionalString(envelope?.event);
  const providerCallId = optionalString(call?.call_id);
  if (!envelope || !call || !eventType || !providerCallId) {
    throw new Error("Invalid Retell webhook payload");
  }
  const eventKey = createHash("sha256")
    .update(`${eventType}:${providerCallId}`)
    .digest("hex");
  return {
    eventKey,
    eventType,
    providerCallId,
    occurredAt:
      timestampToIso(call.end_timestamp) ??
      timestampToIso(call.start_timestamp),
    payload: parsed,
  };
}

export class RetellVoiceRuntime implements VoiceRuntimeProvider {
  constructor(
    private readonly options: {
      apiKey: string;
      voiceId: string;
      model?: string;
      baseUrl?: string;
      fetchImpl?: FetchLike;
    },
  ) {}

  private async request<T>(
    path: string,
    init: RequestInit,
  ): Promise<T> {
    const response = await (this.options.fetchImpl ?? fetch)(
      `${this.options.baseUrl ?? DEFAULT_BASE_URL}${path}`,
      {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(20_000),
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json",
          ...init.headers,
        },
      },
    );
    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }
    if (!response.ok) {
      const object = asObject(payload);
      throw new VoiceProviderError(
        "retell",
        response.status,
        optionalString(object?.message) ?? "Unexpected provider response",
      );
    }
    return payload as T;
  }

  private llmConfiguration(input: VoiceRuntimeAgentInput) {
    return {
      model: this.options.model ?? "gpt-4.1-mini",
      model_temperature: 0,
      start_speaker: "agent",
      begin_message: input.recordingDisclosure,
      general_prompt: input.systemPrompt,
      general_tools: [
        {
          type: "end_call",
          name: "end_call",
          description: "End the inbound call politely.",
        },
      ],
    };
  }

  private agentConfiguration(
    input: VoiceRuntimeAgentInput,
    providerLlmId: string,
    providerLlmVersion: number,
    agentName?: string,
  ) {
    return {
      response_engine: {
        type: "retell-llm",
        llm_id: providerLlmId,
        version: providerLlmVersion,
      },
      voice_id: this.options.voiceId,
      ...(agentName ? { agent_name: agentName } : {}),
      language: "en-US",
      webhook_url: input.webhookUrl,
      webhook_events: ["call_started", "call_ended", "call_analyzed"],
      webhook_timeout_ms: 5_000,
      // Retell sends artifacts in the signed webhook but does not retain them
      // under this mode. This avoids storing a pre-consent full call there.
      data_storage_setting: "basic_attributes_only",
      opt_in_signed_url: true,
      signed_url_expiration_ms: 600_000,
      end_call_after_silence_ms: 60_000,
      max_call_duration_ms: 1_200_000,
      post_call_analysis_model: "gpt-4.1-mini",
      post_call_analysis_data: [
            {
              type: "string",
              name: "caller_name",
              description: "The caller's full name, when provided.",
              examples: ["Jordan Lee"],
              required: false,
            },
            {
              type: "string",
              name: "appointment_time",
              description:
                "Requested appointment time in ISO-8601 with timezone when enough information is available; otherwise the caller's exact wording.",
              examples: ["2026-08-21T14:00:00-07:00"],
              required: false,
            },
            {
              type: "enum",
              name: "callback_urgency",
              description: "How urgently the realtor should return the call.",
              choices: ["low", "normal", "high", "urgent"],
              required: true,
            },
            {
              type: "enum",
              name: "recording_consent",
              description: "Whether the caller affirmatively consented to recording.",
              choices: ["accepted", "declined", "unknown"],
              required: true,
            },
      ],
      handbook_config: {
        ai_disclosure: true,
        scope_boundaries: true,
        high_empathy: true,
      },
    };
  }

  async createLlm(input: VoiceRuntimeAgentInput): Promise<VoiceRuntimeLlmResult> {
    try {
      const llm = await this.request<{ llm_id?: string; version?: number }>(
        "/create-retell-llm",
        { method: "POST", body: JSON.stringify(this.llmConfiguration(input)) },
      );
      if (!llm.llm_id) throw new Error("Retell did not return an LLM id");
      return {
        providerLlmId: llm.llm_id,
        providerLlmVersion: llm.version ?? 0,
      };
    } catch (error) {
      if (mutationMayHaveCommitted(error)) {
        throw new AmbiguousVoiceProviderMutationError("LLM creation", {
          cause: error,
        });
      }
      throw error;
    }
  }

  async updateLlm(
    input: VoiceRuntimeAgentInput & { providerLlmId: string },
  ): Promise<VoiceRuntimeLlmResult> {
    try {
      const llm = await this.request<{ llm_id?: string; version?: number }>(
        `/update-retell-llm/${encodeURIComponent(input.providerLlmId)}`,
        { method: "PATCH", body: JSON.stringify(this.llmConfiguration(input)) },
      );
      if (!llm.llm_id) throw new Error("Retell did not return the updated LLM id");
      return {
        providerLlmId: llm.llm_id,
        providerLlmVersion: llm.version ?? 0,
      };
    } catch (error) {
      if (mutationMayHaveCommitted(error)) {
        throw new AmbiguousVoiceProviderMutationError("LLM update", {
          cause: error,
        });
      }
      throw error;
    }
  }

  private async findAgentByMarker(agentMarker: string) {
    let paginationKey: string | null = null;
    for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
      const query = new URLSearchParams({ limit: "1000" });
      if (paginationKey) query.set("pagination_key", paginationKey);
      const page = await this.request<{
        items?: Array<{ agent_id?: string; agent_name?: string }>;
        has_more?: boolean;
        pagination_key?: string;
      }>(`/v2/list-agents?${query}`, {
        method: "POST",
        body: JSON.stringify({
          filter_criteria: { channel: { op: "eq", value: "voice" } },
        }),
      });
      const found = page.items?.find((agent) => agent.agent_name === agentMarker);
      if (found?.agent_id) return found.agent_id;
      if (!page.has_more || !page.pagination_key) return null;
      paginationKey = page.pagination_key;
    }
    throw new Error("Retell agent reconciliation exceeded ten pages");
  }

  private async getAgentResult(providerAgentId: string) {
    const agent = await this.request<{
      agent_id?: string;
      version?: number;
    }>(`/get-agent/${encodeURIComponent(providerAgentId)}`, { method: "GET" });
    if (!agent.agent_id) throw new Error("Retell did not return the reconciled agent");
    return {
      providerAgentId: agent.agent_id,
      providerAgentVersion: agent.version ?? 0,
    };
  }

  async createOrRecoverAgent(
    input: VoiceRuntimeAgentInput & {
      providerLlmId: string;
      providerLlmVersion: number;
      agentMarker: string;
    },
  ): Promise<VoiceRuntimeAgentResult> {
    const existing = await this.findAgentByMarker(input.agentMarker);
    if (existing) return this.getAgentResult(existing);
    try {
      const agent = await this.request<{ agent_id?: string; version?: number }>(
        "/create-agent",
        {
          method: "POST",
          body: JSON.stringify(
            this.agentConfiguration(
              input,
              input.providerLlmId,
              input.providerLlmVersion,
              input.agentMarker,
            ),
          ),
        },
      );
      if (!agent.agent_id) throw new Error("Retell did not return an agent id");
      return {
        providerAgentId: agent.agent_id,
        providerAgentVersion: agent.version ?? 0,
      };
    } catch (error) {
      if (!mutationMayHaveCommitted(error)) throw error;
      const reconciled = await this.findAgentByMarker(input.agentMarker);
      if (reconciled) return this.getAgentResult(reconciled);
      throw error;
    }
  }

  async createDraftAgentVersion(input: {
    providerAgentId: string;
    baseVersion: number;
  }): Promise<VoiceRuntimeAgentResult> {
    try {
      const agent = await this.request<{ agent_id?: string; version?: number }>(
        `/create-agent-version/${encodeURIComponent(input.providerAgentId)}`,
        {
          method: "POST",
          body: JSON.stringify({ base_version: input.baseVersion }),
        },
      );
      if (!agent.agent_id || agent.version === undefined) {
        throw new Error("Retell did not return the draft agent version");
      }
      return {
        providerAgentId: agent.agent_id,
        providerAgentVersion: agent.version,
      };
    } catch (error) {
      if (mutationMayHaveCommitted(error)) {
        throw new AmbiguousVoiceProviderMutationError("draft agent creation", {
          cause: error,
        });
      }
      throw error;
    }
  }

  async configureAgentVersion(
    input: VoiceRuntimeAgentInput & {
      providerAgentId: string;
      providerAgentVersion: number;
      providerLlmId: string;
      providerLlmVersion: number;
    },
  ): Promise<void> {
    try {
      await this.request(
        `/update-agent/${encodeURIComponent(input.providerAgentId)}?version=${input.providerAgentVersion}`,
        {
          method: "PATCH",
          body: JSON.stringify(
            this.agentConfiguration(
              input,
              input.providerLlmId,
              input.providerLlmVersion,
            ),
          ),
        },
      );
    } catch (error) {
      if (mutationMayHaveCommitted(error)) {
        throw new AmbiguousVoiceProviderMutationError("draft agent update", {
          cause: error,
        });
      }
      throw error;
    }
  }

  async publishAgentVersion(input: {
    providerAgentId: string;
    providerAgentVersion: number;
    versionDescription: string;
  }): Promise<void> {
    const versions = await this.request<Array<{ version?: number; is_published?: boolean }>>(
      `/get-agent-versions/${encodeURIComponent(input.providerAgentId)}`,
      { method: "GET" },
    );
    if (
      versions.some(
        (version) =>
          version.version === input.providerAgentVersion && version.is_published,
      )
    ) {
      return;
    }
    await this.request<void>(
      `/publish-agent-version/${encodeURIComponent(input.providerAgentId)}`,
      {
        method: "POST",
        body: JSON.stringify({
          version: input.providerAgentVersion,
          version_title: "Production",
          version_description: input.versionDescription,
        }),
      },
    );
  }

  async importAndBindInboundNumber(input: {
    e164: string;
    terminationUri: string;
    providerAgentId: string;
    nickname: string;
  }): Promise<void> {
    try {
      await this.request("/import-phone-number", {
        method: "POST",
        body: JSON.stringify({
          phone_number: input.e164,
          termination_uri: input.terminationUri,
          transport: "TCP",
          inbound_agents: [
            {
              agent_id: input.providerAgentId,
              agent_version: "latest_published",
              weight: 1,
            },
          ],
          outbound_agents: [],
          inbound_sms_agents: [],
          outbound_sms_agents: [],
          nickname: input.nickname,
          allowed_inbound_country_list: ["US", "CA"],
        }),
      });
      return;
    } catch (error) {
      // A timed-out first attempt may have imported the number. Reconcile it
      // before retrying so provisioning never creates a second Retell number.
      if (
        error instanceof VoiceProviderError &&
        ![400, 409, 422].includes(error.status) &&
        error.status < 500
      ) {
        throw error;
      }
      try {
        await this.request(
          `/get-phone-number/${encodeURIComponent(input.e164)}`,
          { method: "GET" },
        );
      } catch {
        throw error;
      }
    }
    await this.bindInboundNumber(input);
  }

  async bindInboundNumber(input: {
    e164: string;
    providerAgentId: string;
  }): Promise<void> {
    await this.request(
      `/update-phone-number/${encodeURIComponent(input.e164)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          inbound_agents: [
            {
              agent_id: input.providerAgentId,
              agent_version: "latest_published",
              weight: 1,
            },
          ],
          outbound_agents: [],
          inbound_sms_agents: [],
          outbound_sms_agents: [],
        }),
      },
    );
  }

  async unbindInboundNumber(input: { e164: string }): Promise<void> {
    try {
      await this.request(
        `/update-phone-number/${encodeURIComponent(input.e164)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            inbound_agents: [],
            outbound_agents: [],
            inbound_sms_agents: [],
            outbound_sms_agents: [],
          }),
        },
      );
    } catch (error) {
      // A pre-bind intent can outlive an import that never committed. Treat a
      // missing number as already unbound so compensation remains idempotent.
      if (error instanceof VoiceProviderError && error.status === 404) return;
      throw error;
    }
  }

  async deleteCall(providerCallId: string): Promise<void> {
    try {
      await this.request<void>(
        `/v2/delete-call/${encodeURIComponent(providerCallId)}`,
        { method: "DELETE" },
      );
    } catch (error) {
      // Retried privacy work is idempotent after a successful delete.
      if (error instanceof VoiceProviderError && error.status === 404) return;
      throw error;
    }
  }

  verifyAndNormalizeWebhook(
    rawBody: string,
    signature: string | null,
    nowMs = Date.now(),
  ): NormalizedVoiceWebhook {
    return verifyRetellWebhook(
      rawBody,
      signature,
      this.options.apiKey,
      nowMs,
    );
  }
}
