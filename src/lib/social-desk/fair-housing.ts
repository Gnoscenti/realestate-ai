/**
 * Deterministic fair-housing and claims review for social captions.
 *
 * This is a reviewer's checklist, not legal advice and not a model. It flags
 * phrases HUD guidance and industry compliance training commonly identify as
 * risky, so the human approver sees them before approving. Every finding says
 * which phrase, why, and what to do instead.
 */

export type FairHousingSeverity = "block" | "review";

export type FairHousingFinding = {
  severity: FairHousingSeverity;
  phrase: string;
  reason: string;
  suggestion: string;
};

type Rule = {
  pattern: RegExp;
  severity: FairHousingSeverity;
  reason: string;
  suggestion: string;
};

const RULES: Rule[] = [
  {
    pattern: /\b(no|not accepting|without|don'?t (accept|take)|not for) (section 8|section eight|housing (vouchers?|assistance|choice vouchers?)|hcv|vouchers?)\b/i,
    severity: "block",
    reason: "Refuses a source of income (housing vouchers). Source of income is a protected class in California and many other states.",
    suggestion: "Remove the restriction; state that all lawful sources of income are considered, or say nothing about income.",
  },
  {
    pattern: /\b(no|without|not for) (kids|children|families|students|pets? allowed except)\b/i,
    severity: "block",
    reason: "Excludes families with children (familial status is a protected class).",
    suggestion: "Describe the property, not who should live in it.",
  },
  {
    pattern: /\b(adults? only|mature (adults|persons|tenants)|seniors? only|empty[- ]nesters? only|singles? only|bachelor pad)\b/i,
    severity: "block",
    reason: "Targets or excludes by familial status or age.",
    suggestion: "Remove the audience restriction.",
  },
  {
    pattern: /\b(christian|jewish|muslim|catholic|hindu|buddhist|church[- ]?goers?|near (the )?(church|temple|mosque|synagogue))\b/i,
    severity: "block",
    reason: "References religion or proximity to religious institutions.",
    suggestion: "Describe amenities without religious framing.",
  },
  {
    pattern: /\b(white|black|asian|hispanic|latino|african[- ]american|chinese|indian|ethnic|integrated|exclusive (community|neighborhood|enclave)|restricted (community|neighborhood))\b/i,
    severity: "block",
    reason: "References race, color, or national origin, or uses exclusionary community language.",
    suggestion: "Remove the demographic descriptor.",
  },
  {
    pattern: /\b(handicap(ped)?|crippled|able[- ]bodied|no wheelchairs?|not (suitable|for) (the )?(disabled|handicapped))\b/i,
    severity: "block",
    reason: "References disability in an excluding way.",
    suggestion: "Describe accessibility features factually (e.g., step-free entry).",
  },
  {
    pattern: /\b(perfect|ideal|great|made) for (families|couples|young professionals|retirees|single (men|women)|newlyweds|empty[- ]nesters)\b/i,
    severity: "review",
    reason: "Steers toward a protected class by suggesting who the home is for.",
    suggestion: "Describe features (bedrooms, yard, commute) instead of an ideal buyer.",
  },
  {
    pattern: /\b(safe|low[- ]crime|good|bad|desirable|quiet) (neighborhood|area|community|schools?)\b/i,
    severity: "review",
    reason: "Subjective neighborhood or school quality claims can act as coded steering.",
    suggestion: "Cite objective, sourced facts or omit.",
  },
  {
    pattern: /\b(walking distance|close) to (church|temple|mosque|synagogue)\b/i,
    severity: "block",
    reason: "Religious proximity claim.",
    suggestion: "Remove.",
  },
  {
    pattern: /\b(master (bedroom|suite|bath))\b/i,
    severity: "review",
    reason: "Many MLSs and brokerages now avoid this term.",
    suggestion: "Use primary bedroom/suite.",
  },
  {
    pattern: /(?:^|[^\w])(#1|number one|top[- ]rated|best|award[- ]winning|top producer|top \d+%?) (agent|realtor|broker|team)\b/i,
    severity: "review",
    reason: "Superlative professional claim needs a documented source.",
    suggestion: "Name the ranking source and year, or remove.",
  },
  {
    pattern: /\bguarantee(d|s)?\b/i,
    severity: "review",
    reason: "Guarantees about outcomes or value are regulated advertising claims.",
    suggestion: "Describe the process, not a guaranteed result.",
  },
  {
    pattern: /(\$[\d,.]+\s?(m|million|b|billion|k)?\s+(in )?(sales|volume|closed|sold))\b/i,
    severity: "review",
    reason: "Production figure — confirm the number, period, and source before publishing.",
    suggestion: "Attach the source in Facts, or remove the figure.",
  },
];

export function reviewCaption(caption: string): FairHousingFinding[] {
  const findings: FairHousingFinding[] = [];
  for (const rule of RULES) {
    const match = caption.match(rule.pattern);
    if (!match) continue;
    findings.push({
      severity: rule.severity,
      phrase: match[0],
      reason: rule.reason,
      suggestion: rule.suggestion,
    });
  }
  return findings;
}

export function hasBlockingFinding(findings: FairHousingFinding[]): boolean {
  return findings.some((finding) => finding.severity === "block");
}
