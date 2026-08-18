import { createHash } from "node:crypto";
import type {
  ReservedPhoneNumber,
  SipRoutingResult,
  TelephonyProvider,
} from "./providers.server";
import { VoiceProviderError } from "./retell.server";

type FetchLike = typeof fetch;

interface TwilioNumber {
  sid?: string;
  phone_number?: string;
  friendly_name?: string;
}

interface TwilioTrunk {
  sid?: string;
  domain_name?: string;
}

interface TwilioOriginationUrl {
  sid?: string;
  sip_url?: string;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export class TwilioTelephonyProvider implements TelephonyProvider {
  constructor(
    private readonly options: {
      accountSid: string;
      username: string;
      password: string;
      trunkSid?: string;
      trunkDomain?: string;
      defaultAreaCode?: string;
      fetchImpl?: FetchLike;
    },
  ) {}

  private authHeader(): string {
    return `Basic ${Buffer.from(
      `${this.options.username}:${this.options.password}`,
    ).toString("base64")}`;
  }

  private async request<T>(
    url: string,
    init: RequestInit,
  ): Promise<T> {
    const response = await (this.options.fetchImpl ?? fetch)(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(20_000),
      headers: {
        authorization: this.authHeader(),
        ...init.headers,
      },
    });
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
        "twilio",
        response.status,
        optionalString(object?.message) ?? "Unexpected provider response",
      );
    }
    return payload as T;
  }

  private form(fields: Record<string, string>): URLSearchParams {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) body.set(key, value);
    return body;
  }

  async reserveLocalNumber(input: {
    country: "US";
    areaCode?: string;
    idempotencyKey: string;
  }): Promise<ReservedPhoneNumber> {
    const areaCode = input.areaCode ?? this.options.defaultAreaCode;
    if (!areaCode || !/^\d{3}$/.test(areaCode)) {
      throw new Error("A three-digit area code is required to provision a number");
    }
    const suffix = createHash("sha256")
      .update(input.idempotencyKey)
      .digest("hex")
      .slice(0, 16);
    const friendlyName = `cloud-realtor-${suffix}`;
    const accountBase = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
      this.options.accountSid,
    )}`;

    // Twilio has no idempotency header for number purchases. A deterministic
    // FriendlyName lets an ambiguous retry reconcile the first purchase.
    const query = new URLSearchParams({
      FriendlyName: friendlyName,
      PageSize: "20",
    });
    const existing = await this.request<{ incoming_phone_numbers?: TwilioNumber[] }>(
      `${accountBase}/IncomingPhoneNumbers.json?${query}`,
      { method: "GET" },
    );
    const found = existing.incoming_phone_numbers?.find(
      (number) => number.friendly_name === friendlyName,
    );
    if (found?.sid && found.phone_number) {
      return { phoneNumberSid: found.sid, e164: found.phone_number };
    }

    let created: TwilioNumber;
    try {
      created = await this.request<TwilioNumber>(
        `${accountBase}/IncomingPhoneNumbers.json`,
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: this.form({ AreaCode: areaCode, FriendlyName: friendlyName }),
        },
      );
    } catch (error) {
      // A timeout or 5xx can occur after Twilio has charged for the number.
      // Re-list using the deterministic name before allowing a retry.
      const reconciled = await this.request<{
        incoming_phone_numbers?: TwilioNumber[];
      }>(`${accountBase}/IncomingPhoneNumbers.json?${query}`, { method: "GET" });
      const purchased = reconciled.incoming_phone_numbers?.find(
        (number) => number.friendly_name === friendlyName,
      );
      if (purchased?.sid && purchased.phone_number) {
        return {
          phoneNumberSid: purchased.sid,
          e164: purchased.phone_number,
        };
      }
      throw error;
    }
    if (!created.sid || !created.phone_number) {
      throw new Error("Twilio did not return the purchased phone number");
    }
    return { phoneNumberSid: created.sid, e164: created.phone_number };
  }

  private async ensureTrunk(): Promise<TwilioTrunk> {
    if (this.options.trunkSid) {
      const trunk = await this.request<TwilioTrunk>(
        `https://trunking.twilio.com/v1/Trunks/${encodeURIComponent(
          this.options.trunkSid,
        )}`,
        { method: "GET" },
      );
      if (!trunk.sid || !trunk.domain_name) {
        throw new Error("Twilio trunk is missing its SID or domain");
      }
      return trunk;
    }

    const domain = this.options.trunkDomain;
    if (!domain) throw new Error("Twilio SIP trunk domain is not configured");
    const page = await this.request<{ trunks?: TwilioTrunk[] }>(
      "https://trunking.twilio.com/v1/Trunks?PageSize=1000",
      { method: "GET" },
    );
    const existing = page.trunks?.find(
      (trunk) => trunk.domain_name?.toLowerCase() === domain.toLowerCase(),
    );
    if (existing?.sid && existing.domain_name) return existing;

    const created = await this.request<TwilioTrunk>(
      "https://trunking.twilio.com/v1/Trunks",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: this.form({
          FriendlyName: "Cloud Realtor Retell inbound",
          DomainName: domain,
        }),
      },
    );
    if (!created.sid || !created.domain_name) {
      throw new Error("Twilio did not return the created SIP trunk");
    }
    return created;
  }

  async configureRetellSipRouting(input: {
    phoneNumberSid: string;
    retellSipUri: string;
  }): Promise<SipRoutingResult> {
    if (!/^sip:/i.test(input.retellSipUri)) {
      throw new Error("Retell origination address must be a SIP URI");
    }
    const trunk = await this.ensureTrunk();
    const urls = await this.request<{ origination_urls?: TwilioOriginationUrl[] }>(
      `https://trunking.twilio.com/v1/Trunks/${encodeURIComponent(
        trunk.sid as string,
      )}/OriginationUrls?PageSize=1000`,
      { method: "GET" },
    );
    let origination = urls.origination_urls?.find(
      (entry) => entry.sip_url === input.retellSipUri,
    );
    if (!origination?.sid) {
      origination = await this.request<TwilioOriginationUrl>(
        `https://trunking.twilio.com/v1/Trunks/${encodeURIComponent(
          trunk.sid as string,
        )}/OriginationUrls`,
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: this.form({
            SipUrl: input.retellSipUri,
            FriendlyName: "Retell inbound",
            Priority: "10",
            Weight: "10",
            Enabled: "true",
          }),
        },
      );
    }
    if (!origination.sid) {
      throw new Error("Twilio did not return the SIP origination URL");
    }

    const accountBase = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
      this.options.accountSid,
    )}`;
    await this.request(
      `${accountBase}/IncomingPhoneNumbers/${encodeURIComponent(
        input.phoneNumberSid,
      )}.json`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: this.form({ TrunkSid: trunk.sid as string }),
      },
    );

    return {
      trunkSid: trunk.sid as string,
      terminationUri: trunk.domain_name as string,
      originationUrlSid: origination.sid,
    };
  }

  async releaseNumber(phoneNumberSid: string): Promise<void> {
    await this.request(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
        this.options.accountSid,
      )}/IncomingPhoneNumbers/${encodeURIComponent(phoneNumberSid)}.json`,
      { method: "DELETE" },
    );
  }
}
