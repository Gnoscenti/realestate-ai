import { timingSafeEqual } from "node:crypto";

const read = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value || undefined;
};

function required(key: string): string {
  const value = read(key);
  if (!value) throw new Error(`Voice service is not configured: ${key} is missing`);
  return value;
}

function httpsOrigin(value: string, key: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" &&
    !(process.env.NODE_ENV !== "production" && url.hostname === "localhost")
  ) {
    throw new Error(`${key} must be an HTTPS origin`);
  }
  return url.origin;
}

export interface VoiceEnvironment {
  retellApiKey: string;
  retellVoiceId: string;
  retellModel: string;
  webhookBaseUrl: string;
  twilioAccountSid: string;
  twilioUsername: string;
  twilioPassword: string;
  twilioTrunkSid?: string;
  twilioTrunkDomain?: string;
  defaultAreaCode?: string;
}

/** Read provider credentials only when a live provider action is requested. */
export function getVoiceEnvironment(): VoiceEnvironment {
  const twilioAccountSid = required("TWILIO_ACCOUNT_SID");
  const apiKeySid = read("TWILIO_API_KEY_SID");
  const apiKeySecret = read("TWILIO_API_KEY_SECRET");
  const authToken = read("TWILIO_AUTH_TOKEN");

  if (Boolean(apiKeySid) !== Boolean(apiKeySecret)) {
    throw new Error(
      "TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET must be configured together",
    );
  }
  if (process.env.NODE_ENV === "production" && !apiKeySid) {
    throw new Error(
      "Production voice provisioning requires TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET",
    );
  }
  if (!apiKeySid && !authToken) {
    throw new Error("Voice service is not configured: Twilio credentials are missing");
  }

  const twilioTrunkSid = read("TWILIO_SIP_TRUNK_SID");
  const twilioTrunkDomain = read("TWILIO_SIP_TRUNK_DOMAIN");
  if (!twilioTrunkSid && !twilioTrunkDomain) {
    throw new Error(
      "Set TWILIO_SIP_TRUNK_SID or TWILIO_SIP_TRUNK_DOMAIN for Retell SIP routing",
    );
  }
  if (
    twilioTrunkDomain &&
    !/^[a-z0-9-]+\.pstn\.twilio\.com$/i.test(twilioTrunkDomain)
  ) {
    throw new Error("TWILIO_SIP_TRUNK_DOMAIN must end in .pstn.twilio.com");
  }
  const defaultAreaCode = read("VOICE_DEFAULT_AREA_CODE");
  if (defaultAreaCode && !/^\d{3}$/.test(defaultAreaCode)) {
    throw new Error("VOICE_DEFAULT_AREA_CODE must be three digits");
  }

  return {
    retellApiKey: required("RETELL_API_KEY"),
    retellVoiceId: required("RETELL_VOICE_ID"),
    retellModel: read("RETELL_MODEL") ?? "gpt-4.1-mini",
    webhookBaseUrl: httpsOrigin(
      required("VOICE_WEBHOOK_BASE_URL"),
      "VOICE_WEBHOOK_BASE_URL",
    ),
    twilioAccountSid,
    twilioUsername: apiKeySid ?? twilioAccountSid,
    twilioPassword: apiKeySecret ?? (authToken as string),
    twilioTrunkSid,
    twilioTrunkDomain,
    defaultAreaCode,
  };
}

/** The webhook receiver uses the key marked for webhook verification in Retell. */
export function getRetellWebhookApiKey(): string {
  return required("RETELL_WEBHOOK_API_KEY");
}

/** Provider maintenance needs REST access but no Twilio or voice selection. */
export function getRetellRuntimeApiKey(): string {
  return required("RETELL_API_KEY");
}

export function requireCronAuthorization(request: Request): void {
  const secret = required("CRON_SECRET");
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    const error = new Error("Unauthorized") as Error & { status?: number };
    error.status = 401;
    throw error;
  }
}
