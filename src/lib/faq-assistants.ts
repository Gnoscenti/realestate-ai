/**
 * Buyer & seller FAQ assistants — deterministic, Fair Housing–safe answers.
 * Live Grok can refine; these never invent MLS numbers or valuations.
 */
import type { AgentProfile, Property } from "@/data/seed";

export type FaqSide = "buyer" | "seller";

export type FaqItem = {
  id: string;
  side: FaqSide;
  question: string;
  answer: string;
  tags: string[];
};

export type FaqAnswer = {
  side: FaqSide;
  matched: FaqItem | null;
  answer: string;
  related: FaqItem[];
  disclaimer: string;
};

const DISCLAIMER =
  "General guidance only — not legal, tax, or lending advice. Confirm with your broker, lender, and local forms.";

const BUYER_FAQS: FaqItem[] = [
  {
    id: "b-preapproval",
    side: "buyer",
    question: "Do I need a pre-approval before touring?",
    answer:
      "Yes for most competitive markets. A current pre-approval (or proof of funds for cash) shows sellers you can close and lets us target the right price band. Bring the letter to showings when possible.",
    tags: ["preapproval", "tour", "finance", "lender"],
  },
  {
    id: "b-agreement",
    side: "buyer",
    question: "Why do I need a buyer representation agreement?",
    answer:
      "Post-settlement practice expects a written agreement before touring in many markets. It clarifies scope, compensation, and duties so there are no surprises. We will walk fee options in plain language before you sign.",
    tags: ["agreement", "nar", "commission", "representation"],
  },
  {
    id: "b-offer",
    side: "buyer",
    question: "How do we write a strong offer without overpaying?",
    answer:
      "We anchor on recent nearby sales, property condition, and days on market—not portal estimates. Strategy covers price, contingencies, deposit, and timing. I never guarantee an appraisal or winning bid.",
    tags: ["offer", "negotiation", "price", "comps"],
  },
  {
    id: "b-inspection",
    side: "buyer",
    question: "What happens after inspections?",
    answer:
      "We review the report together, prioritize health/safety and big-ticket items, then request repairs or credits within your contingency window. Cosmetic items are usually leverage, not deal-breakers.",
    tags: ["inspection", "contingency", "repairs"],
  },
  {
    id: "b-timeline",
    side: "buyer",
    question: "How long from accepted offer to keys?",
    answer:
      "Typical financed deals run about 21–45 days (loan, appraisal, title, final walkthrough). Cash can be faster. Your contract dates control; I will keep a shared timeline so nothing slips.",
    tags: ["timeline", "escrow", "closing"],
  },
  {
    id: "b-firsttime",
    side: "buyer",
    question: "I am a first-time buyer—what should I prepare?",
    answer:
      "Get pre-approved, list must-haves vs nice-to-haves, and plan for earnest money, inspection, and moving costs. I will demystify each step and only schedule tours that fit your real budget and timeline.",
    tags: ["first-time", "process", "budget"],
  },
];

const SELLER_FAQS: FaqItem[] = [
  {
    id: "s-pricing",
    side: "seller",
    question: "How do you price my home?",
    answer:
      "With a CMA from recent nearby sales, active competition, and your home's condition—not a Zestimate. We set a go-to-market range and a negotiation plan. Any number we discuss is a planning estimate until you approve list price.",
    tags: ["price", "cma", "list", "comps"],
  },
  {
    id: "s-prep",
    side: "seller",
    question: "What should I fix before photos and showings?",
    answer:
      "Prioritize safety, cleanliness, and curb appeal. Small repairs and declutter usually return more than major remodels. I will give a punch list tailored to your property and buyer pool.",
    tags: ["staging", "repairs", "photos", "prep"],
  },
  {
    id: "s-showings",
    side: "seller",
    question: "How do showings work?",
    answer:
      "We set showing windows, lockbox/access rules, and pet/security notes. After each tour I collect agent feedback and share themes with you—no sugarcoating, so we can adjust price or presentation if needed.",
    tags: ["showing", "feedback", "access"],
  },
  {
    id: "s-offers",
    side: "seller",
    question: "How do we handle multiple offers?",
    answer:
      "We compare net proceeds, contingencies, deposit strength, timeline, and buyer qualifications—not just headline price. You decide; I present a clear comparison sheet and recommended response options.",
    tags: ["offers", "negotiation", "multiple"],
  },
  {
    id: "s-disclosures",
    side: "seller",
    question: "What do I have to disclose?",
    answer:
      "State and local forms require honesty about known material facts. Incomplete disclosures create legal risk. We will complete required packets carefully; I am not a substitute for legal counsel on edge cases.",
    tags: ["disclosure", "legal", "forms"],
  },
  {
    id: "s-dom",
    side: "seller",
    question: "What if the home sits on the market?",
    answer:
      "We review showing feedback, online engagement, and comparable new listings weekly. Options include presentation tweaks, targeted outreach, or a price adjustment. Long DOM is data—not failure—if we act on it.",
    tags: ["dom", "stale", "price reduction", "marketing"],
  },
];

export const ALL_FAQS: FaqItem[] = [...BUYER_FAQS, ...SELLER_FAQS];

export function listFaqs(side?: FaqSide): FaqItem[] {
  if (!side) return ALL_FAQS;
  return ALL_FAQS.filter((f) => f.side === side);
}

function scoreFaq(item: FaqItem, q: string): number {
  const qLower = q.trim().toLowerCase();
  if (!/[a-z0-9]{3}/.test(qLower)) return 0;
  const words = qLower.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const qText = item.question.toLowerCase();
  const tagText = item.tags.join(" ").toLowerCase();
  let s = 0;
  for (const w of words) {
    if (qText.includes(w)) s += 4;
    if (item.tags.some((t) => t === w || t.includes(w) || w.includes(t))) s += 5;
    else if (tagText.includes(w)) s += 2;
    if (item.answer.toLowerCase().includes(w)) s += 0.5;
  }
  if (qText.includes(qLower.slice(0, 40))) s += 6;
  return s;
}

export function answerFaq(
  question: string,
  side: FaqSide = "buyer",
  profile?: AgentProfile | null,
): FaqAnswer {
  const pool = listFaqs(side);
  const ranked = [...pool]
    .map((item) => ({ item, s: scoreFaq(item, question) }))
    .sort((a, b) => b.s - a.s);
  const best = ranked[0]?.s ? ranked[0].item : null;
  const agent = profile?.name ? ` — ${profile.name}` : "";
  if (!best) {
    return {
      side,
      matched: null,
      answer: `I do not have a canned answer for that yet${agent}. Ask about pre-approval, offers, inspections, pricing, showings, or disclosures—or rephrase in one sentence.`,
      related: pool.slice(0, 3),
      disclaimer: DISCLAIMER,
    };
  }
  return {
    side,
    matched: best,
    answer: best.answer,
    related: ranked.slice(1, 4).map((r) => r.item),
    disclaimer: DISCLAIMER,
  };
}

export function listingFaqBlurb(property: Property, side: FaqSide): string {
  const loc = [property.neighborhood, property.city].filter(Boolean).join(", ");
  if (side === "buyer") {
    return `${property.title}${loc ? ` in ${loc}` : ""} — ask about tour logistics, HOA/covenants, and offer timing. Bring pre-approval if financing.`;
  }
  return `${property.title}${loc ? ` in ${loc}` : ""} — feedback themes and next marketing moves after each showing block.`;
}
