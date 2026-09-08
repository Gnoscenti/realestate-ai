import type {
  VoiceConsoleState,
  VoiceSetupChecklist,
} from "./types";

export type ForwardingGuideKey =
  | VoiceSetupChecklist["carrier"]
  | VoiceSetupChecklist["devicePlatform"];

export interface ForwardingGuide {
  title: string;
  steps: string[];
  caution: string;
}

export const FORWARDING_GUIDES: Record<ForwardingGuideKey, ForwardingGuide> = {
  iphone: {
    title: "iPhone",
    steps: [
      "Open Settings, then Apps, Phone, and Call Forwarding to see what your carrier exposes.",
      "Conditional forwarding for busy, unanswered, or unreachable calls may not appear in iPhone Settings. If it is missing, use your carrier account or contact carrier support.",
      "Ask for conditional forwarding only, keep your normal phone as the first destination, and enter the AI number shown here.",
    ],
    caution:
      "Do not enable unconditional forwarding unless you intentionally want every call sent to the assistant.",
  },
  android: {
    title: "Android",
    steps: [
      "Open the Phone app, then Settings and Calling accounts or Calls. Menu names vary by manufacturer and carrier.",
      "Look for busy, unanswered, and unreachable forwarding. Set only the conditions you want to use.",
      "If those options are absent or locked, use your carrier account or ask carrier support to configure conditional forwarding.",
    ],
    caution:
      "Confirm the destination number and ring delay in the carrier record; the phone screen alone may not prove the network setting changed.",
  },
  desk_phone: {
    title: "Desk phone",
    steps: [
      "Open the business phone administrator portal or contact the person who manages your phone system.",
      "Create a no-answer and, if desired, busy rule that forwards externally to the AI number.",
      "Choose a ring delay that gives the agent time to answer before the assistant receives the call.",
    ],
    caution:
      "External forwarding can require an administrator setting or incur carrier usage charges. Verify both before testing.",
  },
  att: {
    title: "AT&T",
    steps: [
      "Check the forwarding controls for your exact wireless or business-line plan in your AT&T account.",
      "If conditional options are unavailable, ask AT&T support to configure busy, unanswered, and unreachable forwarding to the AI number.",
      "Have support confirm how to disable the rule and whether forwarded minutes are billed on your plan.",
    ],
    caution:
      "Dial codes and feature availability vary by plan, line type, and region. This app intentionally does not provide an unverified universal code.",
  },
  tmobile: {
    title: "T-Mobile",
    steps: [
      "Review call-forwarding controls for your exact line in your T-Mobile account or device settings.",
      "Ask support for conditional busy, unanswered, and unreachable forwarding if the settings are not visible.",
      "Confirm the off or reset procedure for your line before making the test call.",
    ],
    caution:
      "Dial codes and feature availability vary by plan and line type. Use the carrier-confirmed procedure for your account.",
  },
  verizon: {
    title: "Verizon",
    steps: [
      "Check your Verizon account for the forwarding features available on this specific line.",
      "Ask Verizon support to confirm whether conditional busy or no-answer forwarding is supported and to set the AI number as the destination.",
      "Get the exact disable procedure for this line before testing.",
    ],
    caution:
      "Feature names and activation methods vary across wireless, One Talk, and business products. Do not assume a code found online applies to your line.",
  },
  business_pbx: {
    title: "Business VoIP or PBX",
    steps: [
      "In the admin portal, find the user's call handling, overflow, or failover rules.",
      "Route no-answer and optional busy events to the AI number as an external destination. Do not replace the primary inbound route.",
      "Save the original rule and ring timeout so you can restore them immediately.",
    ],
    caution:
      "Ask the phone-system administrator to test from outside the company network and verify any external-forwarding charges.",
  },
  other: {
    title: "Other carrier or system",
    steps: [
      "Contact the carrier or phone-system administrator for the exact line.",
      "Request conditional forwarding for missed, busy, or unanswered calls to the AI number—not unconditional forwarding.",
      "Ask them to document the disable or rollback procedure and any forwarding charges.",
    ],
    caution:
      "Do not use a generic dial code without confirmation from the carrier or administrator responsible for this line.",
  },
};

export const REQUIRED_CHECKLIST_KEYS: ReadonlyArray<
  keyof VoiceSetupChecklist
> = [
  "conditionalForwardingConfigured",
  "disclosureVerified",
  "declinedConsentVerified",
  "testCallCompleted",
  "callLogVerified",
  "rollbackUnderstood",
  "brokerApprovalConfirmed",
];

export function isVoiceChecklistComplete(
  checklist: VoiceSetupChecklist,
): boolean {
  return REQUIRED_CHECKLIST_KEYS.every((key) => checklist[key] === true);
}

export function voiceReadinessLabel(
  state: Pick<VoiceConsoleState, "setup" | "readyForMissedCalls">,
): string {
  if (state.readyForMissedCalls) return "Ready for missed calls";
  if (state.setup.assistant.status === "provisioning") return "Provisioning";
  if (state.setup.assistant.status === "failed") return "Setup needs attention";
  if (state.setup.assistant.status === "active") return "Finish forwarding test";
  return "Not activated";
}

export function formatVoicePhone(value: string | null): string {
  if (!value) return "Not assigned";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return value;
}

export function safeRecordingUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
