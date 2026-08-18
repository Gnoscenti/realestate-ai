import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { RetellVoiceRuntime } from "../../src/lib/voice/retell.server";
import { TwilioTelephonyProvider } from "../../src/lib/voice/twilio.server";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Retell voice runtime", () => {
  it("creates and publishes an inbound-only agent with post-call extraction", async () => {
    const requests: Array<{ url: string; init: RequestInit; body: any }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url, init: init ?? {}, body });
      if (url.endsWith("/create-retell-llm")) {
        return jsonResponse({ llm_id: "llm_1", version: 0 });
      }
      if (url.includes("/v2/list-agents?")) {
        return jsonResponse({ items: [], has_more: false });
      }
      if (url.endsWith("/create-agent")) {
        return jsonResponse({ agent_id: "agent_1", version: 0 });
      }
      if (url.endsWith("/get-agent-versions/agent_1")) {
        return jsonResponse([]);
      }
      if (url.endsWith("/publish-agent-version/agent_1")) {
        return new Response(null, { status: 200 });
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    const runtime = new RetellVoiceRuntime({
      apiKey: "retell-secret",
      voiceId: "voice_1",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const input = {
      workspaceId: "workspace-1",
      provisioningIdentity: "voice_identity_workspace_1",
      displayName: "Missed-call assistant",
      systemPrompt:
        "You are the disclosed inbound assistant. Never call, text, transfer, or take an outbound action.",
      greeting: "Thanks for calling. How can I help?",
      recordingDisclosure:
        "I am an AI assistant. This call may be recorded. Do you consent?",
      webhookUrl: "https://example.com/api/webhooks/retell",
    };
    const llm = await runtime.createLlm(input);
    const agent = await runtime.createOrRecoverAgent({
      ...input,
      ...llm,
      agentMarker: "cloud-realtor:voice_identity_workspace_1",
    });
    await runtime.publishAgentVersion({
      ...agent,
      versionDescription: "Production",
    });

    expect({ ...llm, ...agent }).toEqual({
      providerAgentId: "agent_1",
      providerLlmId: "llm_1",
      providerLlmVersion: 0,
      providerAgentVersion: 0,
    });
    expect(requests.map((entry) => new URL(entry.url).pathname)).toEqual([
      "/create-retell-llm",
      "/v2/list-agents",
      "/create-agent",
      "/get-agent-versions/agent_1",
      "/publish-agent-version/agent_1",
    ]);
    expect(requests[0]?.body.general_tools).toEqual([
      expect.objectContaining({ type: "end_call" }),
    ]);
    expect(requests[0]?.body.begin_message).toBe(
      "I am an AI assistant. This call may be recorded. Do you consent?",
    );
    expect(requests[0]?.body.begin_message).not.toContain("Thanks for calling");
    const agentPayload = requests[2]?.body;
    expect(agentPayload.data_storage_setting).toBe("basic_attributes_only");
    expect(agentPayload.signed_url_expiration_ms).toBe(600_000);
    expect(agentPayload).not.toHaveProperty("data_storage_retention_days");
    expect(agentPayload.webhook_events).toEqual([
      "call_started",
      "call_ended",
      "call_analyzed",
    ]);
    expect(agentPayload.post_call_analysis_data.map((entry: any) => entry.name)).toEqual([
      "caller_name",
      "appointment_time",
      "callback_urgency",
      "recording_consent",
    ]);
    expect(JSON.stringify(requests)).not.toContain("outbound_call");
    expect(JSON.stringify(requests)).not.toContain("send_sms");
  });

  it("verifies exact raw-body signatures and rejects stale or changed bodies", () => {
    const apiKey = "retell-webhook-secret";
    const runtime = new RetellVoiceRuntime({ apiKey, voiceId: "unused" });
    const now = 1_800_000_000_000;
    const raw = JSON.stringify({
      event: "call_ended",
      call: { call_id: "call_1", end_timestamp: now - 50 },
    });
    const digest = createHmac("sha256", apiKey)
      .update(`${raw}${now}`)
      .digest("hex");
    const signature = `v=${now},d=${digest}`;

    expect(runtime.verifyAndNormalizeWebhook(raw, signature, now)).toMatchObject({
      eventType: "call_ended",
      providerCallId: "call_1",
    });
    expect(() =>
      runtime.verifyAndNormalizeWebhook(`${raw} `, signature, now),
    ).toThrow("Invalid Retell signature");
    expect(() =>
      runtime.verifyAndNormalizeWebhook(raw, signature, now + 300_001),
    ).toThrow("Expired Retell signature");
  });

  it("marks an ambiguous LLM mutation for manual reconciliation", async () => {
    const runtime = new RetellVoiceRuntime({
      apiKey: "retell-secret",
      voiceId: "voice_1",
      fetchImpl: (async () => jsonResponse({ message: "timeout upstream" }, 500)) as typeof fetch,
    });
    await expect(
      runtime.createLlm({
        workspaceId: "workspace-1",
        provisioningIdentity: "stable-identity",
        displayName: "Missed-call assistant",
        systemPrompt: "Inbound-only consent-first assistant rules.",
        greeting: "Thanks for calling. How can I help?",
        recordingDisclosure: "I am an AI assistant. Do you consent to recording?",
        webhookUrl: "https://example.com/api/webhooks/retell",
      }),
    ).rejects.toMatchObject({
      name: "AmbiguousVoiceProviderMutationError",
      code: "AMBIGUOUS_PROVIDER_MUTATION",
    });
  });

  it("binds only an inbound voice agent and clears every outbound/SMS binding", async () => {
    let payload: any = null;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      payload = JSON.parse(String(init?.body));
      return jsonResponse({ phone_number: "+15035550123" }, 201);
    });
    const runtime = new RetellVoiceRuntime({
      apiKey: "retell-secret",
      voiceId: "unused",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await runtime.importAndBindInboundNumber({
      e164: "+15035550123",
      terminationUri: "cloud.pstn.twilio.com",
      providerAgentId: "agent_1",
      nickname: "Cloud Realtor",
    });

    expect(payload.inbound_agents).toEqual([
      { agent_id: "agent_1", agent_version: "latest_published", weight: 1 },
    ]);
    expect(payload.outbound_agents).toEqual([]);
    expect(payload.inbound_sms_agents).toEqual([]);
    expect(payload.outbound_sms_agents).toEqual([]);
  });

  it("unbinds every channel and idempotently deletes non-consented calls", async () => {
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        url: String(input),
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return new Response(null, { status: 204 });
    });
    const runtime = new RetellVoiceRuntime({
      apiKey: "retell-secret",
      voiceId: "unused",
      fetchImpl: fetchImpl as typeof fetch,
    });
    await runtime.unbindInboundNumber({ e164: "+15035550123" });
    await runtime.deleteCall("call_1");

    expect(requests[0]).toMatchObject({
      method: "PATCH",
      body: {
        inbound_agents: [],
        outbound_agents: [],
        inbound_sms_agents: [],
        outbound_sms_agents: [],
      },
    });
    expect(new URL(requests[1]?.url ?? "https://invalid").pathname).toBe(
      "/v2/delete-call/call_1",
    );
    expect(requests[1]?.method).toBe("DELETE");
  });
});

describe("Twilio SIP provisioning", () => {
  it("reconciles an ambiguous number purchase and configures inbound SIP only", async () => {
    const requests: Array<{ url: string; method: string; body: string }> = [];
    let numberLists = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      requests.push({ url, method, body: String(init?.body ?? "") });
      if (url.includes("IncomingPhoneNumbers.json?") && method === "GET") {
        numberLists += 1;
        return jsonResponse({
          incoming_phone_numbers:
            numberLists === 1
              ? []
              : [
                  {
                    sid: "PN1",
                    phone_number: "+15035550123",
                    friendly_name: new URL(url).searchParams.get("FriendlyName"),
                  },
                ],
        });
      }
      if (url.endsWith("IncomingPhoneNumbers.json") && method === "POST") {
        throw new TypeError("connection reset after purchase");
      }
      if (url.endsWith("/Trunks/TK1") && method === "GET") {
        return jsonResponse({ sid: "TK1", domain_name: "cloud.pstn.twilio.com" });
      }
      if (url.includes("/OriginationUrls?")) {
        return jsonResponse({ origination_urls: [] });
      }
      if (url.endsWith("/OriginationUrls") && method === "POST") {
        return jsonResponse({ sid: "OU1", sip_url: "sip:sip.retellai.com" });
      }
      if (url.endsWith("/IncomingPhoneNumbers/PN1.json") && method === "POST") {
        return jsonResponse({ sid: "PN1" });
      }
      throw new Error(`Unexpected URL ${method} ${url}`);
    });
    const telephony = new TwilioTelephonyProvider({
      accountSid: "AC1",
      username: "SK1",
      password: "secret",
      trunkSid: "TK1",
      defaultAreaCode: "503",
      fetchImpl: fetchImpl as typeof fetch,
    });

    const phone = await telephony.reserveLocalNumber({
      country: "US",
      idempotencyKey: "workspace:key",
    });
    const routing = await telephony.configureRetellSipRouting({
      phoneNumberSid: phone.phoneNumberSid,
      retellSipUri: "sip:sip.retellai.com",
    });

    expect(phone).toEqual({ phoneNumberSid: "PN1", e164: "+15035550123" });
    expect(routing).toEqual({
      trunkSid: "TK1",
      terminationUri: "cloud.pstn.twilio.com",
      originationUrlSid: "OU1",
    });
    expect(requests.at(-1)?.body).toBe("TrunkSid=TK1");
    expect(requests.some((entry) => /Calls|Messages/.test(entry.url))).toBe(false);
  });
});
