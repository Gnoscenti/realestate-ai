import { getVoiceEnvironment } from "./config.server";
import { RetellVoiceRuntime } from "./retell.server";
import { TwilioTelephonyProvider } from "./twilio.server";

export function createLiveVoiceProviders() {
  const env = getVoiceEnvironment();
  return {
    webhookUrl: `${env.webhookBaseUrl}/api/webhooks/retell`,
    voice: new RetellVoiceRuntime({
      apiKey: env.retellApiKey,
      voiceId: env.retellVoiceId,
      model: env.retellModel,
    }),
    telephony: new TwilioTelephonyProvider({
      accountSid: env.twilioAccountSid,
      username: env.twilioUsername,
      password: env.twilioPassword,
      trunkSid: env.twilioTrunkSid,
      trunkDomain: env.twilioTrunkDomain,
      defaultAreaCode: env.defaultAreaCode,
    }),
  };
}
