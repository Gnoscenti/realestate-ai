/**
 * Competitive multi-channel packs — counteract FUB/Structurely with one surface.
 */
import type { Lead } from "@/data/seed";
import {
  generateInstantResponse,
  generateNurtureSequence,
} from "@/lib/ai";
import {
  SPEED_TO_LEAD_SLA_MINUTES,
  minutesSince,
  slaStatus,
} from "@/lib/competitors";

export type ChannelPack = {
  sms: string;
  emailSubject: string;
  emailBody: string;
  voicemail: string;
  callOpener: string;
  allInOne: string;
};

export function buildMultiChannelPack(lead: Lead, agentName?: string): ChannelPack {
  const sms = generateInstantResponse(lead, "sms");
  const email = generateInstantResponse(lead, "email");
  const vm = generateInstantResponse(lead, "voicemail");
  const agent = agentName || "your local agent";

  const callOpener = `Hi ${lead.name.split(" ")[0]}, this is ${agent}. I saw your interest${
    lead.location ? ` around ${lead.location}` : ""
  } and wanted to help personally—do you have two minutes?`;

  const allInOne = [
    `=== MULTI-CHANNEL PACK · ${lead.name} ===`,
    `SLA target: first touch under ${SPEED_TO_LEAD_SLA_MINUTES} minutes`,
    "",
    "— SMS —",
    sms.body,
    "",
    "— EMAIL —",
    `Subject: ${email.subject || "Following up"}`,
    email.body,
    "",
    "— VOICEMAIL —",
    vm.body,
    "",
    "— CALL OPENER —",
    callOpener,
    "",
    "— AFTER SEND —",
    "1) Mark sent in app  2) Set next follow-up  3) Add notes from their reply",
  ].join("\n");

  return {
    sms: sms.body,
    emailSubject: email.subject || "Following up",
    emailBody: email.body,
    voicemail: vm.body,
    callOpener,
    allInOne,
  };
}

export type TouchPlan = {
  step: number;
  when: string;
  channel: string;
  purpose: string;
  body: string;
};

export function buildFiveMinuteProtocol(lead: Lead): {
  minutesOpen: number;
  sla: ReturnType<typeof slaStatus>;
  steps: { n: number; label: string; detail: string }[];
  pack: ChannelPack;
  touches: TouchPlan[];
} {
  const minutesOpen = minutesSince(lead.lastContact);
  const sla = slaStatus(minutesOpen);
  const pack = buildMultiChannelPack(lead);
  const nurture = generateNurtureSequence(lead);

  const steps = [
    {
      n: 1,
      label: "Copy SMS (30 sec)",
      detail: "Send the SMS pack first — highest open rate for new leads.",
    },
    {
      n: 2,
      label: "Send email (60 sec)",
      detail: "Same story, longer form—use the email subject + body.",
    },
    {
      n: 3,
      label: "Call or voicemail (2 min)",
      detail: "If no text reply, use call opener or drop the voicemail script.",
    },
    {
      n: 4,
      label: "Mark sent (10 sec)",
      detail: "Log in the app so Action Desk and SLA stay honest.",
    },
    {
      n: 5,
      label: "Schedule touch 2",
      detail: "If quiet, follow the 3-touch plan below (day 0 / day 2 / day 5).",
    },
  ];

  const touches: TouchPlan[] = [
    {
      step: 1,
      when: "Now (0–5 min)",
      channel: "SMS + Email",
      purpose: "Win the first conversation (beat average 15h response)",
      body: pack.sms,
    },
    {
      step: 2,
      when: "Day 2",
      channel: "SMS or call",
      purpose: "Value bump — market note or listing match",
      body:
        nurture[1]?.body ||
        `Quick follow-up, ${lead.name.split(" ")[0]} — happy to shortlist 2–3 homes that fit ${lead.location || "your area"} this week.`,
    },
    {
      step: 3,
      when: "Day 5",
      channel: "Email",
      purpose: "Soft reactivation + clear CTA",
      body:
        nurture[2]?.body ||
        `Want me to keep an eye on new listings for you? Reply YES and I’ll send a short list.`,
    },
  ];

  return { minutesOpen, sla, steps, pack, touches };
}
