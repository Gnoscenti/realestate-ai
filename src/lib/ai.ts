import type { AgentProfile, Deal, Lead, Property, RentalUnit } from "@/data/seed";
import {
  isRsfCorridor,
  RSF_MARKET_META,
  searchKnowledge,
} from "@/data/rsf-knowledge";
import {
  formatRetrievedKnowledge,
  parseRememberCommand,
  personalizationPreamble,
  retrieveMarketKnowledge,
  type AgentMemory,
} from "@/lib/agent-memory";
import {
  appointmentsNeedingAttention,
  flattenReminders,
  formatApptWhen,
  APPOINTMENT_KIND_LABEL,
  type CalendarAppointment,
} from "@/lib/calendar";
import {
  commonlyUsedContractors,
  contractorCategoryLabel,
  type Contractor,
  type ContractorCategory,
} from "@/lib/contractors";
import { formatCurrency } from "@/lib/utils";

function topLeads(leads: Lead[], n = 5) {
  return [...leads].sort((a, b) => b.score - a.score).slice(0, n);
}

function matchProperties(query: string, properties: Property[]): Property[] {
  const q = query.toLowerCase();
  const tokens = q.split(/[^a-z0-9.$]+/).filter(Boolean);

  const budgetMatch = q.match(/under\s*\$?([\d.]+)\s*(k|m)?/i);
  let maxBudget: number | null = null;
  if (budgetMatch) {
    const raw = parseFloat(budgetMatch[1]);
    const unit = (budgetMatch[2] || "").toLowerCase();
    maxBudget = unit === "m" ? raw * 1_000_000 : unit === "k" ? raw * 1_000 : raw;
  }
  const minBeds = q.match(/(\d+)\s*-?\s*bed/);
  const bedsNeeded = minBeds ? parseInt(minBeds[1], 10) : null;

  return properties
    .map((p) => {
      let score = 0;
      const hay = `${p.title} ${p.address} ${p.neighborhood} ${p.city} ${p.type} ${p.features.join(" ")} ${p.description}`.toLowerCase();
      for (const t of tokens) {
        if (hay.includes(t)) score += 8;
      }
      if (q.includes("luxury") && (p.price >= 1000000 || p.features.some((f) => /view|pool|concierge/i.test(f))))
        score += 20;
      if (q.includes("investment") || q.includes("rental") || q.includes("roi")) {
        if (p.type === "multi" || p.capRate) score += 25;
        if (p.features.some((f) => /adu|rental|duplex/i.test(f))) score += 15;
      }
      if (q.includes("family") || q.includes("school")) {
        if (p.beds >= 3) score += 12;
        if (p.features.some((f) => /school|yard|family/i.test(f))) score += 15;
      }
      if (q.includes("adu") && p.features.some((f) => /adu/i.test(f))) score += 30;
      if (q.includes("ocean") || q.includes("coast") || q.includes("beach")) {
        if (/ocean|coast|beach|la jolla|pacific|del mar|solana/i.test(hay)) score += 25;
      }
      if (/rancho|rsf|covenant|fairbanks|bridges|equestrian|horse/.test(q)) {
        if (/rancho|covenant|fairbanks|bridges|equestrian|horse|estate|acre/i.test(hay))
          score += 30;
        if (p.price >= 2000000) score += 12;
      }
      if (q.includes("condo") && p.type === "condo") score += 15;
      if (q.includes("townhouse") && p.type === "townhouse") score += 15;
      if (q.includes("house") && p.type === "house") score += 10;
      if (bedsNeeded != null && p.beds >= bedsNeeded) score += 15;
      if (maxBudget != null && p.price <= maxBudget) score += 18;
      if (maxBudget != null && p.price > maxBudget) score -= 40;
      if (p.status === "active") score += 5;
      return { p, score };
    })
    .filter((x) => x.score > 10)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
}

export function searchProperties(query: string, properties: Property[]): {
  results: Property[];
  interpretation: string;
} {
  if (!query.trim()) {
    return {
      results: properties.filter((p) => p.status === "active"),
      interpretation: "Showing all active listings.",
    };
  }
  const results = matchProperties(query, properties);
  const top = results.slice(0, 12);
  return {
    results: top.length ? top : properties.filter((p) => p.status === "active").slice(0, 6),
    interpretation: top.length
      ? `Matched ${top.length} properties for “${query.trim()}”. Ranked by AI relevance.`
      : `No strong matches — showing active inventory. Try neighborhoods, beds, budget, or features like ADU.`,
  };
}

export function propertyMatchScore(property: Property, query: string): number {
  if (!query.trim()) return Math.min(99, 70 + Math.round(property.price / 200000));
  const ranked = matchProperties(query, [property]);
  if (!ranked.length) return 42;
  const base = 55 + Math.min(40, property.features.length * 4);
  return Math.min(99, base + (property.status === "active" ? 5 : 0));
}

export function generateAvm(input: {
  address: string;
  type: string;
  sqft: number;
  beds: number;
  baths: number;
  yearBuilt: number;
  condition: number;
}): {
  value: number;
  low: number;
  high: number;
  confidence: number;
  ppsf: number;
  comps: { address: string; price: number; sqft: number; distance: string; days: number }[];
  insight: string;
} {
  const isRsf =
    /rancho|rsf|fairbanks|bridges|covenant|del mar|solana/i.test(input.address);
  const basePpsf = isRsf
    ? 950
    : input.type.toLowerCase().includes("condo")
      ? 620
      : input.type.toLowerCase().includes("town")
        ? 480
        : input.type.toLowerCase().includes("multi")
          ? 550
          : 520;

  const ageAdj = Math.max(0.85, 1 - Math.max(0, 2026 - input.yearBuilt - 20) * 0.003);
  const sizeAdj = input.sqft > 2500 ? 0.97 : input.sqft < 900 ? 1.06 : 1;
  const bedAdj = 1 + (input.beds - 3) * 0.02;
  const bathAdj = 1 + (input.baths - 2) * 0.015;
  const condAdj = 0.9 + input.condition * 0.04;

  const ppsf = Math.round(basePpsf * ageAdj * sizeAdj * bedAdj * bathAdj * condAdj);
  const value = Math.round((ppsf * input.sqft) / 1000) * 1000;
  const confidence = Math.min(
    96,
    72 +
      (input.address.length > 8 ? 8 : 0) +
      (input.sqft > 0 ? 6 : 0) +
      (input.yearBuilt > 1900 ? 4 : 0) +
      input.condition * 2,
  );
  const spread = 0.04 + (100 - confidence) * 0.0015;

  const comps = [
    {
      address: input.address
        ? input.address.replace(/\d+/, (n) => String(parseInt(n, 10) + 12))
        : "6122 El Apajo",
      price: Math.round(value * 0.98),
      sqft: Math.round(input.sqft * 0.96),
      distance: "0.4 mi",
      days: 15,
    },
    {
      address: isRsf ? "Nearby Covenant comparable" : "Nearby comparable B",
      price: Math.round(value * 1.04),
      sqft: Math.round(input.sqft * 1.05),
      distance: "0.7 mi",
      days: 8,
    },
    {
      address: isRsf ? "Fairbanks Ranch estate comp" : "Nearby comparable C",
      price: Math.round(value * 0.95),
      sqft: Math.round(input.sqft * 0.92),
      distance: "1.2 mi",
      days: 22,
    },
  ];

  return {
    value,
    low: Math.round(value * (1 - spread)),
    high: Math.round(value * (1 + spread)),
    confidence,
    ppsf,
    comps,
    insight: isRsf
      ? "RSF corridor: weight lot, association (Covenant vs Bridges vs non-assoc), and guest house quality over raw $/sf."
      : input.condition >= 4
        ? "Condition premium supported by recent renovated sales within 0.3 mi."
        : "Value sensitive to finish quality — renovations could lift mid-band estimate 4–7%.",
  };
}

export function generateListingCopy(opts: {
  address: string;
  type: string;
  audience: string;
  tone: string;
  features: string;
  contentType: string;
}): string {
  const feats = opts.features
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const featLine = feats.length
    ? feats.slice(0, 5).join(" · ")
    : "Thoughtfully designed living spaces";

  const toneOpen: Record<string, string> = {
    Professional: `Presenting ${opts.address || "this exceptional property"} — a ${opts.type.toLowerCase()} tailored for today's market.`,
    Friendly: `You're going to love ${opts.address || "this home"}. It's a ${opts.type.toLowerCase()} that just feels right.`,
    Luxury: `An uncompromising ${opts.type.toLowerCase()} experience awaits at ${opts.address || "this rare address"}.`,
    Urgent: `Just listed: ${opts.address || "a standout opportunity"} — schedule a private showing before it moves.`,
  };

  const audienceClose: Record<string, string> = {
    "First-time Buyers":
      "Low-stress living with room to grow — ideal if you're stepping into ownership with confidence.",
    "Luxury Market":
      "Crafted for discerning buyers who expect privacy, presence, and effortless entertaining.",
    Investors:
      "Strong fundamentals for yield-focused buyers: demand drivers, rental depth, and value-add levers.",
    Families:
      "Space to gather, rooms that work hard, and a location that fits school runs and weekends alike.",
  };

  const body = `${toneOpen[opts.tone] || toneOpen.Professional}

Highlights: ${featLine}.

${audienceClose[opts.audience] || audienceClose.Families}

${
  opts.contentType === "Social Media Post"
    ? `Tap for details · DM to tour · ${opts.address || "Limited availability"}`
    : opts.contentType === "Email Campaign"
      ? `Reply to this email or call to lock in a private showing this week.`
      : opts.contentType === "Flyer Content"
        ? `Open house details inside · Agent contact on reverse · Equal Housing Opportunity`
        : `Contact your agent for a private tour and full feature sheet.`
}`;

  return body.trim();
}

export function generateInstantResponse(
  lead: Lead,
  channel: "sms" | "email" | "voicemail",
  profile?: AgentProfile | null,
): { subject?: string; body: string; tip: string } {
  const first = lead.name.split(" ")[0] ?? lead.name;
  const budget = `${formatCurrency(lead.budgetMin, true)}–${formatCurrency(lead.budgetMax, true)}`;
  const pref = lead.preferences || lead.propertyType;
  const agentFirst = profile?.name?.split(" ")[0];
  const sign = agentFirst ? `— ${agentFirst}` : "";
  const local =
    isRsfCorridor(lead.location) || isRsfCorridor(profile?.areaOfOperations)
      ? " I cover Rancho Santa Fe & the coastal corridor daily."
      : "";

  if (channel === "sms") {
    return {
      body: `Hi ${first} — thanks for reaching out!${local} Free for a quick call today. Looking in ${lead.location} around ${budget} for ${pref.toLowerCase()}. Want 2–3 options that fit by this evening? Reply YES or a better time. ${sign}`.trim(),
      tip: "Keep under 320 chars. Ask one clear next step. Send within 5 minutes of inquiry.",
    };
  }
  if (channel === "voicemail") {
    return {
      body: `Hi ${first}, this is ${agentFirst ?? "your agent"} following up on your interest in ${lead.location} homes around ${budget}. I pulled a short list matching ${pref.toLowerCase()}. Call or text me back and I'll send links — looking forward to helping you move fast.`,
      tip: "Under 25 seconds. Name + value + clear callback.",
    };
  }
  return {
    subject: `${first}, options in ${lead.location} within your range`,
    body: `Hi ${first},

Thanks for connecting — I wanted to get back to you quickly while inventory is moving.${local}

Based on what you shared (${pref}, ${lead.location}, budget ${budget}), I'll curate a short list of fits and any below-market opportunities.

Next step: reply with your preferred tour windows (weekday evening / weekend morning), and whether schools, outdoor space, or privacy matter most.

I'll send 2–3 matches within a few hours.

Best regards${profile?.name ? `,\n${profile.name}` : ""}`,
    tip: "Subject line = neighborhood + outcome. End with one decision question.",
  };
}

export function generateClientBrief(
  lead: Lead,
  properties: Property[],
  deals: Deal[],
): string {
  const matches = properties
    .filter((p) => {
      if (p.price < lead.budgetMin * 0.85 || p.price > lead.budgetMax * 1.1)
        return false;
      if (
        lead.location &&
        p.neighborhood.toLowerCase().includes(lead.location.toLowerCase())
      )
        return true;
      return p.status === "active";
    })
    .slice(0, 3);

  const relatedDeal = deals.find((d) =>
    d.clientName.toLowerCase().includes(lead.name.split(" ")[0].toLowerCase()),
  );

  const kb = searchKnowledge(`${lead.location} ${lead.preferences}`, 2)
    .map((h) => `• ${h.entry.title}: ${h.entry.summary}`)
    .join("\n");

  return `CLIENT BRIEF — ${lead.name}
Score ${lead.score} · ${lead.heat.toUpperCase()} · ${lead.status.replace("_", " ")}

Intent signals
• Budget ${formatCurrency(lead.budgetMin)} – ${formatCurrency(lead.budgetMax)}
• Focus: ${lead.propertyType} in ${lead.location}
• Prefs: ${lead.preferences}
• Source: ${lead.source.replaceAll("_", " ")} · Tags: ${lead.tags.join(", ") || "—"}

Notes
${lead.notes}

Local knowledge
${kb || "• Pull corridor KB entry for schools / association before tour"}

Talk tracks
1. Confirm timeline and financing status in first 2 minutes.
2. Offer 2 concrete homes (not a portal dump) aligned to prefs.
3. Book a specific tour window before ending the call.
${
  relatedDeal
    ? `\nOpen transaction\n• ${relatedDeal.propertyTitle} — ${relatedDeal.stage.replaceAll("_", " ")} (${relatedDeal.progress}%)`
    : ""
}

Inventory to mention
${
  matches.length
    ? matches
        .map(
          (p) =>
            `• ${p.title} — ${formatCurrency(p.price)} · ${p.beds}bd/${p.baths}ba · ${p.neighborhood}`,
        )
        .join("\n")
    : "• Pull fresh matches from Smart Search before the call"
}

Compliance reminder (post-NAR)
Have a signed buyer agreement before touring. Be ready to state your fee and value clearly.`;
}

export function generateNurtureSequence(lead: Lead): {
  day: number;
  channel: string;
  subject: string;
  body: string;
}[] {
  const first = lead.name.split(" ")[0] ?? lead.name;
  return [
    {
      day: 0,
      channel: "SMS",
      subject: "Same-day touch",
      body: `Hi ${first} — still thinking about ${lead.location}? I can send 2 fresh matches tonight.`,
    },
    {
      day: 3,
      channel: "Email",
      subject: `${lead.location} homes in your range`,
      body: `${first}, three options aligned to ${lead.preferences || lead.propertyType}. Want a Saturday tour block?`,
    },
    {
      day: 10,
      channel: "SMS",
      subject: "Check-in",
      body: `${first}, any change in timing or budget? Happy to recalibrate the search.`,
    },
  ];
}

export function generateReactivation(lead: Lead): {
  channel: string;
  subject?: string;
  body: string;
} {
  const first = lead.name.split(" ")[0] ?? lead.name;
  const local = isRsfCorridor(lead.location)
    ? "the Rancho Santa Fe / coastal corridor"
    : lead.location;
  return {
    channel: "Email",
    subject: `${first}, still dreaming about ${local}?`,
    body: `Hi ${first},

It's been a minute since we last connected about ${lead.propertyType.toLowerCase()} in ${lead.location}. The inventory mix has shifted — a few homes in your prior range finally look right.

If timing is better now (or even if it's not), reply with a one-liner and I'll send a tight private list — no portal spam.

Glad to be a resource either way.

Warmly`,
  };
}

export function generateBuyerAgreementOutline(): {
  title: string;
  clauses: { heading: string; text: string }[];
} {
  return {
    title: "Buyer representation agreement — talking outline",
    clauses: [
      {
        heading: "Scope of representation",
        text: "Exclusive buyer-broker relationship for defined area/time; duties of loyalty, confidentiality, and diligence.",
      },
      {
        heading: "Compensation",
        text: "Clear fee structure (flat, %, or hourly). Disclose how cooperating compensation may offset client obligation.",
      },
      {
        heading: "Term & termination",
        text: "Start/end dates, withdrawal rights, protection period for introduced properties.",
      },
      {
        heading: "Conflicts & dual agency",
        text: "How in-house listings and dual representation are handled if applicable.",
      },
    ],
  };
}

export function generateCmaReport(
  subject: Property,
  inventory: Property[],
): {
  headline: string;
  subjectSummary: string;
  suggestedList: number;
  comps: {
    title: string;
    address: string;
    price: number;
    sqft: number;
    ppsf: number;
    beds: number;
    baths: number;
    dom: number;
    adj: string;
  }[];
  strategy: string[];
  buyerValueScript: string;
} {
  const comps = inventory
    .filter((p) => p.id !== subject.id)
    .map((p) => {
      let score = 0;
      if (p.neighborhood === subject.neighborhood) score += 40;
      if (p.type === subject.type) score += 25;
      const sizeDiff = Math.abs(p.sqft - subject.sqft) / Math.max(subject.sqft, 1);
      score += Math.max(0, 25 - sizeDiff * 40);
      if (Math.abs(p.price - subject.price) / subject.price < 0.25) score += 10;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ p }) => {
      const ppsf = Math.round(p.price / p.sqft);
      const subPpsf = Math.round(subject.price / subject.sqft);
      const adj =
        ppsf > subPpsf * 1.05
          ? "Superior finish / location — adjust down for subject"
          : ppsf < subPpsf * 0.95
            ? "Inferior condition/lot — subject premium supported"
            : "In-band comparable";
      return {
        title: p.title,
        address: p.address,
        price: p.price,
        sqft: p.sqft,
        ppsf,
        beds: p.beds,
        baths: p.baths,
        dom: p.daysOnMarket,
        adj,
      };
    });

  const avgPpsf =
    comps.reduce((s, c) => s + c.ppsf, 0) / Math.max(1, comps.length) ||
    subject.pricePerSqft;
  const suggestedList = Math.round((avgPpsf * subject.sqft) / 5000) * 5000;
  const rsf = /rancho|fairbanks|bridges|covenant|del mar/i.test(
    `${subject.neighborhood} ${subject.city}`,
  );

  return {
    headline: `CMA · ${subject.title}`,
    subjectSummary: `${subject.address}, ${subject.neighborhood} · ${subject.beds}bd/${subject.baths}ba · ${subject.sqft.toLocaleString()} sqft · ${subject.daysOnMarket} DOM${subject.mlsNumber ? ` · MLS# ${subject.mlsNumber}` : ""}`,
    suggestedList,
    comps,
    strategy: rsf
      ? [
          "Match association type before sqft (Covenant vs Bridges vs non-assoc).",
          "Lead listing media with lot, trail/golf, and guest house if present.",
          "Use private-tour culture over high-traffic open houses when privacy is the brand.",
          "Weekly seller brief: feedback themes + three-band pricing recommendation.",
        ]
      : [
          "Price at mid-band of adjusted comps for 14–21 day attention window.",
          "Refresh media if DOM > 21 with no offer path.",
          "Pre-list inspection summary reduces renegotiation risk.",
          "Launch social + email to sphere same day as MLS live.",
        ],
    buyerValueScript: rsf
      ? `In the ${RSF_MARKET_META.primary} corridor, portal estimates miss association, lot usability, and guest-house quality. My role is hyper-local comps, off-market access, and a clear fee for a defined marketing + negotiation plan — not a lockbox and a listing link.`
      : `Post-NAR, buyers need clarity: I earn my fee by filtering inventory, running true comps, negotiating repairs/credits, and managing timelines so you don't overpay or miss contingencies.`,
  };
}

function styleWrap(body: string, memory?: AgentMemory | null): string {
  if (!memory) return body;
  if (memory.responseStyle === "concise") {
    const lines = body.split("\n").filter(Boolean);
    return lines.slice(0, 8).join("\n");
  }
  return body;
}

function withPersonalization(
  body: string,
  ctx: {
    profile?: AgentProfile | null;
    memory?: AgentMemory | null;
    knowledgeBlock?: string;
  },
): string {
  const parts: string[] = [];
  if (ctx.memory && ctx.memory.totalInteractions > 3) {
    parts.push(`〔${personalizationPreamble(ctx.memory, ctx.profile)}〕`);
  }
  parts.push(styleWrap(body, ctx.memory));
  if (ctx.knowledgeBlock) {
    parts.push(`\n— Local knowledge (RSF corridor DB) —\n${ctx.knowledgeBlock}`);
  }
  if (ctx.memory?.learnedFacts?.length) {
    const f = ctx.memory.learnedFacts.slice(0, 2);
    parts.push(`\n— About you —\n${f.map((x) => `• ${x.text}`).join("\n")}`);
  }
  return parts.join("\n\n");
}

function mapCategoryFromQuery(q: string): ContractorCategory | null {
  if (/termite|wdo/.test(q)) return "termite";
  if (/inspect/.test(q)) return "home_inspection";
  if (/electric/.test(q)) return "electrician";
  if (/plumb/.test(q)) return "plumber";
  if (/hvac|air condition|furnace/.test(q)) return "hvac";
  if (/roof/.test(q)) return "roofer";
  if (/pest/.test(q)) return "pest_control";
  if (/apprais/.test(q)) return "appraiser";
  if (/title|escrow/.test(q)) return "title_escrow";
  if (/photo|drone/.test(q)) return "photographer";
  if (/stag/.test(q)) return "stager";
  if (/landscape/.test(q)) return "landscaper";
  if (/general contractor|\bgc\b/.test(q)) return "general_contractor";
  if (/pool/.test(q)) return "pool";
  if (/septic/.test(q)) return "septic";
  if (/chimney/.test(q)) return "chimney";
  if (/mold/.test(q)) return "mold";
  if (/foundation|structural/.test(q)) return "foundation";
  if (/handyman|punch/.test(q)) return "handyman";
  if (/clean/.test(q)) return "cleaner";
  return null;
}

export function answerAssistant(
  question: string,
  ctx: {
    leads: Lead[];
    properties: Property[];
    deals: Deal[];
    rentals: RentalUnit[];
    profile?: AgentProfile | null;
    memory?: AgentMemory | null;
    appointments?: CalendarAppointment[];
    contractors?: Contractor[];
  },
): string {
  const q = question.toLowerCase();
  const activeLeads = ctx.leads.filter(
    (l) => !["closed_won", "closed_lost"].includes(l.status),
  );
  const hot = activeLeads.filter((l) => l.heat === "hot");
  const pipelineValue = ctx.deals.reduce((s, d) => s + d.value, 0);
  const activeListings = ctx.properties.filter((p) => p.status === "active");
  const first = ctx.profile?.name?.split(" ")[0];
  const area = ctx.profile?.areaOfOperations ?? "";
  const rsf =
    isRsfCorridor(area) ||
    isRsfCorridor(question) ||
    /rancho|rsf|covenant|fairbanks|bridges|del mar|solana|encinitas|olivenhain|carmel valley/i.test(
      q,
    );
  const appointments = ctx.appointments ?? [];
  const contractors = ctx.contractors ?? [];

  const remember = parseRememberCommand(question);
  if (remember) {
    return withPersonalization(
      `Got it${first ? `, ${first}` : ""} — I'll remember:\n\n“${remember}”\n\nThis shapes future scripts, CMAs, and content tone. Add more anytime with “remember that …”.`,
      { profile: ctx.profile, memory: ctx.memory },
    );
  }

  const kbHits = retrieveMarketKnowledge(question, ctx.profile, ctx.memory);
  const knowledgeBlock =
    rsf || kbHits.length
      ? formatRetrievedKnowledge(kbHits.slice(0, 2))
      : "";

  // Calendar / appointments / reminders
  if (
    /calendar|appointment|schedule|remind|what.?s on|today.?s agenda|showing|inspection day|open house|closing/.test(
      q,
    )
  ) {
    const upcoming = appointmentsNeedingAttention(appointments, 72);
    const rems = flattenReminders(appointments).slice(0, 8);
    if (!upcoming.length) {
      return withPersonalization(
        `No upcoming appointments in the hub yet.\n\nConnect Google, Apple/iOS, Outlook, or CalDAV under Calendar Hub → Connect, then Sync. I’ll import real estate events and extract prep reminders automatically.`,
        { profile: ctx.profile, memory: ctx.memory },
      );
    }
    const lines = upcoming
      .slice(0, 6)
      .map(
        (a) =>
          `• ${formatApptWhen(a.start)} — ${a.title} (${APPOINTMENT_KIND_LABEL[a.kind]}${a.status === "needs_prep" ? ", needs prep" : ""})`,
      )
      .join("\n");
    const remLines = rems
      .map((r) => `• [${formatApptWhen(r.when)}] ${r.reminder}`)
      .join("\n");
    return withPersonalization(
      `Calendar brief${first ? ` for ${first}` : ""}\n\nUpcoming appointments\n${lines}\n\nAI reminders picked up\n${remLines || "• No open prep items"}\n\nOpen Calendar Hub to mark done or re-sync providers.`,
      { profile: ctx.profile, memory: ctx.memory },
    );
  }

  // Contractors
  if (
    /contractor|vendor|termite|electrician|plumb|hvac|roofer|inspector|photographer|stager|title|escrow|handyman|common(ly)? used|referral list/.test(
      q,
    )
  ) {
    const cat = mapCategoryFromQuery(q);
    if (cat) {
      const list = contractors
        .filter((c) => c.active && c.category === cat)
        .sort((a, b) => b.useCount - a.useCount)
        .slice(0, 5);
      const lines = list
        .map(
          (c) =>
            `• ${c.company} (${c.name}) — ${c.phone} · used ${c.useCount}×${c.common ? " · Common" : ""}`,
        )
        .join("\n");
      return withPersonalization(
        `${contractorCategoryLabel(cat)} — your saved vendors\n\n${
          lines || "• None saved yet — add under Calendar Hub → Contractors"
        }\n\nCommonly used list retains favorites across sessions. Log use after each job to keep rankings honest.`,
        { profile: ctx.profile, memory: ctx.memory },
      );
    }
    const common = commonlyUsedContractors(contractors, 10);
    const lines = common
      .map(
        (c) =>
          `• [${contractorCategoryLabel(c.category)}] ${c.company} — ${c.phone} · ${c.useCount}×`,
      )
      .join("\n");
    return withPersonalization(
      `Commonly used contractors\n\n${lines || "• Empty — pin vendors in Calendar Hub"}\n\nCategories available: Termite, Inspection, Electrician, Plumber, HVAC, Roofer, Title/Escrow, Photographer, Stager, GC, and more. Archived vendors stay under their heading.`,
      { profile: ctx.profile, memory: ctx.memory },
    );
  }

  if (
    /knowledge|rancho|rsf|covenant|fairbanks|bridges|what do you know about/.test(
      q,
    ) &&
    rsf
  ) {
    const hits = searchKnowledge(question, 3);
    const body =
      hits.length > 0
        ? `RSF & surrounding knowledge base\n\n${hits
            .map(
              (h) =>
                `• ${h.entry.title}\n  ${h.entry.summary}\n  Tags: ${h.entry.tags.slice(0, 5).join(", ")}`,
            )
            .join("\n\n")}\n\nOpen Market Knowledge in the nav for the full database.`
        : `${RSF_MARKET_META.priceContext2026}\n\n${RSF_MARKET_META.covenantNote}`;
    return withPersonalization(body, {
      profile: ctx.profile,
      memory: ctx.memory,
      knowledgeBlock,
    });
  }

  if (/respond|speed|first.?touch|instant|sms|text back/.test(q)) {
    const newest = [...activeLeads].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
    const body = `Speed-to-lead is the highest-ROI AI use case in 2025–26 surveys (Inman: avg response ~15 hours; sub-5-min wins).\n\nOpen Instant Response to draft SMS/email for ${newest?.name ?? "your newest lead"} in one click${
      newest ? ` (${newest.location})` : ""
    }.`;
    return withPersonalization(body, {
      profile: ctx.profile,
      memory: ctx.memory,
      knowledgeBlock,
    });
  }

  if (/cma|comp(arable)?|list price|pricing strategy/.test(q)) {
    const body = `Open CMA Studio for a one-click comparative market analysis.${
      rsf
        ? " RSF rule: match association type before sqft; adjust for lot, guest house, and view."
        : ""
    }`;
    return withPersonalization(body, {
      profile: ctx.profile,
      memory: ctx.memory,
      knowledgeBlock,
    });
  }

  if (/agreement|nar|commission|buyer.?rep|settlement|compliance/.test(q)) {
    const outline = generateBuyerAgreementOutline();
    return withPersonalization(
      `${outline.title}\n\n${outline.clauses.map((c) => `• ${c.heading}: ${c.text}`).join("\n\n")}`,
      { profile: ctx.profile, memory: ctx.memory },
    );
  }

  if (
    /social|content agent|instagram|tiktok|linkedin|hashtag|reel|campaign|marketing|copy|listing description|ad/.test(
      q,
    )
  ) {
    const listing = activeListings[0];
    const voice = ctx.memory?.preferredVoice;
    const body = `Social Content Agent builds full multi-platform packs.${
      listing
        ? ` Suggested: Just Listed for ${listing.title} in ${listing.neighborhood}.`
        : ""
    }${voice ? ` Voice: ${voice}.` : ""}`;
    return withPersonalization(body, {
      profile: ctx.profile,
      memory: ctx.memory,
      knowledgeBlock,
    });
  }

  if (/lead|nurture|follow.?up|score|conversion/.test(q)) {
    const tops = topLeads(activeLeads, 5);
    const lines = tops
      .map(
        (l) =>
          `• ${l.name} — score ${l.score} (${l.heat}), ${formatCurrency(l.budgetMin)}–${formatCurrency(l.budgetMax)}, ${l.location}`,
      )
      .join("\n");
    return withPersonalization(
      `Lead intelligence\n\n${lines}\n\nOpen Instant Response or Command Center packs.`,
      { profile: ctx.profile, memory: ctx.memory, knowledgeBlock },
    );
  }

  if (
    /propert|listing|home|condo|house|search|find|luxury|investment|adu|estate|acre/.test(
      q,
    )
  ) {
    const results = matchProperties(question, ctx.properties).slice(0, 4);
    if (!results.length) {
      return withPersonalization(
        `No strong inventory matches. Try RSF, Covenant, Fairbanks, beds, or budget. ${activeListings.length} active listings on file.`,
        { profile: ctx.profile, memory: ctx.memory, knowledgeBlock },
      );
    }
    const lines = results
      .map(
        (p) =>
          `• ${p.title} — ${formatCurrency(p.price)} · ${p.beds}bd/${p.baths}ba · ${p.neighborhood}`,
      )
      .join("\n");
    return withPersonalization(`Property matches\n\n${lines}`, {
      profile: ctx.profile,
      memory: ctx.memory,
      knowledgeBlock,
    });
  }

  if (/market|trend|avm|valu|forecast|price|ppsf|comp|inventory/.test(q)) {
    const avgPpsf = Math.round(
      activeListings.reduce((s, p) => s + p.pricePerSqft, 0) /
        Math.max(1, activeListings.length),
    );
    const body = `Market brief${area ? ` · ${area}` : ""}\n\nActive: ${activeListings.length} · PPSF ~${formatCurrency(avgPpsf)} · pipeline ${formatCurrency(pipelineValue, true)}\n\n${
      rsf ? RSF_MARKET_META.priceContext2026 : "Use Market or CMA Studio for client packages."
    }`;
    return withPersonalization(body, {
      profile: ctx.profile,
      memory: ctx.memory,
      knowledgeBlock,
    });
  }

  if (/deal|transaction|contract|escrow|closing|document|signature/.test(q)) {
    const lines = ctx.deals
      .map(
        (d) =>
          `• ${d.propertyTitle} / ${d.clientName} — ${d.stage.replaceAll("_", " ")}, ${d.progress}%`,
      )
      .join("\n");
    return withPersonalization(`Transaction hub\n\n${lines}`, {
      profile: ctx.profile,
      memory: ctx.memory,
    });
  }

  if (/rent|tenant|maintenance|propert(y)? manage|vacanc|lease/.test(q)) {
    const occupied = ctx.rentals.filter((r) => r.occupancy === "occupied").length;
    const vacant = ctx.rentals.filter((r) => r.occupancy === "vacant").length;
    return withPersonalization(
      `Property management\n\nUnits: ${ctx.rentals.length} (${occupied} occupied, ${vacant} vacant)`,
      { profile: ctx.profile, memory: ctx.memory },
    );
  }

  if (/command|priority|queue|today|action pack/.test(q)) {
    const upcoming = appointmentsNeedingAttention(appointments, 24);
    return withPersonalization(
      `Command Center ranks speed-to-lead, follow-ups, deal risk, content, CMA, compliance${
        upcoming.length
          ? `, plus ${upcoming.length} calendar item(s) in the next 24h`
          : ""
      }. Open the home Action Desk for full packs.`,
      { profile: ctx.profile, memory: ctx.memory },
    );
  }

  if (/remember|what do you know about me|my voice|familiarity|learn/.test(q)) {
    const mem = ctx.memory;
    if (!mem || mem.totalInteractions < 1) {
      return `I learn from chats, CMAs, campaigns, calendars, and lead touches. Say “remember that …” anytime.`;
    }
    return withPersonalization(
      `Familiarity ${mem.familiarityScore}/100 · ${mem.totalInteractions} signals · style ${mem.responseStyle} · voice ${mem.preferredVoice}`,
      { profile: ctx.profile, memory: ctx.memory },
    );
  }

  if (/hello|hi\b|hey|help|what can you/.test(q)) {
    return withPersonalization(
      `I'm your RealEstate AI copilot${first ? `, ${first}` : ""}${
        area ? ` for ${area}` : ""
      }.\n\nI can: Command Center packs · Instant response · Calendar + AI reminders · Contractors · RSF knowledge · CMA · Content Agent.\n\nTry: “What’s on my calendar?” or “Who’s my termite guy?”`,
      { profile: ctx.profile, memory: ctx.memory, knowledgeBlock },
    );
  }

  return withPersonalization(
    `Workspace overview\n\n• ${activeLeads.length} active leads (${hot.length} hot)\n• ${activeListings.length} listings · pipeline ${formatCurrency(pipelineValue, true)}\n• ${appointmentsNeedingAttention(appointments, 48).length} appointments (48h)\n• ${commonlyUsedContractors(contractors).length} common vendors\n\nAsk about calendar, termite/electrician, or RSF comps.`,
    { profile: ctx.profile, memory: ctx.memory, knowledgeBlock },
  );
}
