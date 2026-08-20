/**
 * CiteLock™ v2 — verified, real-estate-professional citation readiness.
 *
 * Readiness is deterministic and evidence-based. Recognition is reported only
 * from supplied provider observations; it is never inferred from completeness.
 */
import {
  listingClaimKeys,
  listingPriceClaimScope,
  type CiteAgentProfile,
  type CiteProperty,
} from "./provenance";
import { sanitizeCiteLockPublicUrl } from "./scan-types";
import type {
  AieoFaq,
  AieoInput,
  AieoPillarId,
  AieoScore,
  CiteAction,
  CiteConflict,
  CiteEvidence,
  CiteEvidenceStatus,
  CiteGate,
  CiteQuery,
  CiteRecognition,
  CiteRuleResult,
  CiteSourceTier,
} from "./types";

const DAY = 86_400_000;
const ALGORITHM_VERSION = "2.0" as const;

const PILLAR_MAX: Record<AieoPillarId, number> = {
  identity: 25,
  evidence: 20,
  local: 18,
  answers: 15,
  technical: 12,
  freshness: 10,
};

const STATUS_WEIGHT: Record<CiteEvidenceStatus, number> = {
  verified: 1,
  corroborated: 0.9,
  published: 0.6,
  declared: 0.25,
  unknown: 0,
  conflicted: 0,
  stale: 0.15,
};

const SOURCE_WEIGHT: Record<CiteSourceTier, number> = {
  regulator: 1,
  mls: 1,
  brokerage: 0.9,
  independent: 0.85,
  first_party: 0.6,
  user: 0.25,
};

const CORE_FIELDS = [
  "name",
  "license",
  "responsible_broker",
  "service_area",
  "website",
] as const;

function validUrl(value?: string): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function sanitizeEvidenceItem(item: CiteEvidence): CiteEvidence {
  const sourceUrl = item.sourceUrl
    ? sanitizeCiteLockPublicUrl(item.sourceUrl) || undefined
    : undefined;
  if (item.field !== "website" && item.field !== "public_profile")
    return { ...item, sourceUrl };
  const value = sanitizeCiteLockPublicUrl(item.value);
  return value
    ? { ...item, value, sourceUrl }
    : { ...item, value: "Unknown", sourceUrl, status: "unknown" };
}

function canonicalUrl(profile?: CiteAgentProfile | null): string | undefined {
  const raw = profile?.canonicalProfileUrl || profile?.website;
  const sanitized = raw ? sanitizeCiteLockPublicUrl(raw) : "";
  if (!validUrl(sanitized)) return undefined;
  const url = new URL(sanitized);
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function daysOld(value: string | undefined, evaluatedAt: string): number {
  const then = value ? Date.parse(value) : Number.NaN;
  const now = Date.parse(evaluatedAt);
  if (!Number.isFinite(then) || !Number.isFinite(now)) return Infinity;
  return Math.max(0, (now - then) / DAY);
}

function dateInTimeZone(value: string, timeZone: string): string | undefined {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const part = (type: "year" | "month" | "day") =>
    parts.find((item) => item.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return year && month && day ? `${year}-${month}-${day}` : undefined;
}

function daysUntil(
  value: string | undefined,
  evaluatedAt: string,
  jurisdiction?: string,
): number {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const zone = jurisdiction === "US-CA" ? "America/Los_Angeles" : "UTC";
    const evaluatedDate = dateInTimeZone(evaluatedAt, zone);
    if (!evaluatedDate) return Number.NaN;
    return (Date.parse(`${value}T00:00:00Z`) -
      Date.parse(`${evaluatedDate}T00:00:00Z`)) / DAY;
  }
  const then = value ? Date.parse(value) : Number.NaN;
  const now = Date.parse(evaluatedAt);
  if (!Number.isFinite(then) || !Number.isFinite(now)) return Number.NaN;
  return (then - now) / DAY;
}

function evidenceQuality(item: CiteEvidence): number {
  const hasPublicSource = validUrl(item.sourceUrl);
  const source = hasPublicSource ? SOURCE_WEIGHT[item.sourceTier] : Math.min(0.25, SOURCE_WEIGHT[item.sourceTier]);
  return STATUS_WEIGHT[item.status] * source;
}

function credentialState(
  item: CiteEvidence | undefined,
  evaluatedAt: string,
): "pass" | "warn" | "block" | "unknown" {
  if (!item || item.sourceTier !== "regulator" || evidenceQuality(item) < 0.9)
    return "unknown";
  if (
    item.credentialStatus === "inactive" ||
    item.credentialStatus === "restricted"
  )
    return "block";
  // A regulator result must affirmatively say active. Missing/novel states are
  // never allowed to inherit a future expiry date and pass by implication.
  if (item.credentialStatus !== "active") return "block";
  const observationAge = daysOld(item.observedAt, evaluatedAt);
  const remaining = daysUntil(
    item.validThrough,
    evaluatedAt,
    item.jurisdiction,
  );
  if (!item.validThrough) return "block";
  if (Number.isFinite(remaining) && remaining < 0) return "block";
  if (!Number.isFinite(observationAge) || observationAge > 90) return "block";
  if (
    observationAge > 30 ||
    !Number.isFinite(remaining) ||
    remaining <= 90
  )
    return "warn";
  return "pass";
}

function normalizeFieldValue(field: string, value: string): string {
  const cleaned = value.toLowerCase().replace(/®|™/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  if (field === "license" || field === "responsible_broker_license") {
    return value.match(/\d{6,12}/)?.[0] || cleaned.replace(/\s+/g, "");
  }
  if (field === "phone") return value.replace(/\D/g, "");
  if (field === "listing_price") return value.replace(/[^\d.]/g, "");
  if (field === "transaction_volume") {
    const amount = value.match(
      /\$\s*([\d,.]+)\s*(b|bn|billion|m|mm|million|k|thousand)?\b/i,
    );
    if (amount) {
      const raw = Number(amount[1]!.replace(/,/g, ""));
      const unit = (amount[2] || "").toLowerCase();
      const multiplier = /^(?:b|bn|billion)$/.test(unit)
        ? 1_000_000_000
        : /^(?:m|mm|million)$/.test(unit)
          ? 1_000_000
          : /^(?:k|thousand)$/.test(unit)
            ? 1_000
            : 1;
      if (Number.isFinite(raw)) return String(Math.round(raw * multiplier));
    }
  }
  if (field === "name") return cleaned.split(/\s+/).sort().join(" ");
  return cleaned.replace(/\b(?:incorporated|corporation)\b/g, "inc").replace(/\s+/g, " ").trim();
}

function representationMatchesProfile(
  property: CiteProperty,
  profile?: CiteAgentProfile | null,
): boolean {
  const expectedId = profile?.agentMlsId?.trim().toLowerCase();
  const matchedId = property.representation?.matchedAgentId
    ?.trim()
    .toLowerCase();
  if (expectedId) return Boolean(matchedId && matchedId === expectedId);
  const expectedName = profile?.name
    ? normalizeFieldValue("name", profile.name)
    : "";
  const matchedName = property.representation?.matchedAgentName
    ? normalizeFieldValue("name", property.representation.matchedAgentName)
    : "";
  return Boolean(expectedName && matchedName && expectedName === matchedName);
}

function autoEvidence(profile: CiteAgentProfile | null | undefined, properties: CiteProperty[], evaluatedAt: string): CiteEvidence[] {
  const items: CiteEvidence[] = [];
  const site = canonicalUrl(profile);
  const siteObservedAt = profile?.lastWebsiteScrapeAt;
  const declaredAt = profile?.onboardedAt;

  const addProfile = (
    field: string,
    value: string | undefined,
    label: string,
    subject: CiteEvidence["subject"] = "agent",
    publishedOnSite = false,
  ) => {
    const siteBacked = Boolean(site && publishedOnSite);
    items.push({
      id: `profile:${field}`,
      subject,
      field,
      value: value?.trim() || "Unknown",
      sourceLabel: siteBacked
        ? `${label} observed on agent website`
        : `${label} declared in workspace profile`,
      sourceTier: siteBacked ? "first_party" : "user",
      status: value ? (siteBacked ? "published" : "declared") : "unknown",
      sourceUrl: siteBacked ? site : undefined,
      observedAt: siteBacked ? siteObservedAt : declaredAt,
    });
  };

  addProfile(
    "name",
    profile?.name,
    "Name",
    "agent",
    Boolean(profile?.siteAudit?.homePage.serverRenderedIdentity),
  );
  addProfile("license", profile?.license, "License");
  addProfile("responsible_broker", profile?.responsibleBrokerName, "Responsible broker", "brokerage");
  addProfile("responsible_broker_license", profile?.responsibleBrokerLicense, "Responsible broker license", "brokerage");
  addProfile("brokerage_brand", profile?.brokerageBrand || profile?.brokerage, "Brokerage brand", "brokerage");
  addProfile("service_area", profile?.areaOfOperations, "Service area", "market");
  // Merely entering a URL does not prove it is published or reachable. A
  // verified scan emits the first-party website evidence separately.
  addProfile("website", site, "Canonical website");
  addProfile("phone", profile?.phone, "Phone");
  addProfile("email", profile?.email, "Email");

  for (const [index, sameAs] of (profile?.sameAs || []).entries()) {
    if (!validUrl(sameAs)) continue;
    items.push({
      id: `profile:public_profile:${index}`,
      subject: "agent",
      field: "public_profile",
      value: sameAs,
      sourceLabel: "Workspace-linked public profile",
      sourceTier: "user",
      status: "declared",
      sourceUrl: sameAs,
      observedAt: declaredAt,
    });
  }

  for (const property of properties) {
    const source = property.source;
    const level = source?.evidenceLevel;
    const serverAttested =
      source?.trust === "server_attested" && Boolean(source.attestationId);
    const statusForListing: CiteEvidenceStatus =
      level === "provider_verified" && serverAttested
        ? "verified"
        : level === "site_published"
          ? "published"
          : level === "user_declared"
            ? "declared"
            : "unknown";
    const tier: CiteSourceTier =
      source?.kind === "mls" && serverAttested
        ? "mls"
        : source?.kind === "website"
          ? "first_party"
          : "user";
    const listingKeys = listingClaimKeys(property);
    const transactionType = property.transactionType || "unknown";
    const pricePeriod = property.pricePeriod || "unknown";
    items.push({
      id: `listing:${property.id}:facts`,
      subject: "listing",
      field: "listing",
      value: `${property.title} · ${property.status} · ${transactionType}`,
      sourceLabel: source?.provider || (source?.kind === "website" ? "Agent website" : "Workspace listing"),
      sourceTier: tier,
      status: statusForListing,
      sourceUrl: source?.url,
      observedAt: source?.modifiedAt || source?.observedAt,
    });
    for (const [aliasIndex, listingKey] of listingKeys.entries()) {
      items.push({
        id: `listing:${property.id}:status:${aliasIndex}`,
        subject: "listing",
        field: "listing_status",
        value: property.status,
        claimScope: listingKey,
        sourceLabel: source?.provider || "Listing status",
        sourceTier: tier,
        status: statusForListing,
        sourceUrl: source?.url,
        observedAt: source?.modifiedAt || source?.observedAt,
      });
      items.push({
        id: `listing:${property.id}:transaction:${aliasIndex}`,
        subject: "listing",
        field: "listing_transaction",
        value: `${transactionType}:${pricePeriod}`,
        claimScope: listingKey,
        sourceLabel: source?.provider || "Listing transaction type",
        sourceTier: tier,
        status: statusForListing,
        sourceUrl: source?.url,
        observedAt: source?.modifiedAt || source?.observedAt,
      });
      if (property.price > 0) {
        items.push({
          id: `listing:${property.id}:price:${aliasIndex}`,
          subject: "listing",
          field: "listing_price",
          value: `${property.price}:${transactionType}:${pricePeriod}`,
          claimScope: listingPriceClaimScope(
            listingKey,
            transactionType,
            pricePeriod,
          ),
          sourceLabel: source?.provider || "Listing price",
          sourceTier: tier,
          status: statusForListing,
          sourceUrl: source?.url,
          observedAt: source?.modifiedAt || source?.observedAt,
        });
      }
    }
    const role = property.representation?.role ||
      (property.listingSide === "mine" ? "listing" : "unknown");
    const roleVerified =
      level === "provider_verified" &&
      serverAttested &&
      (role === "listing" || role === "co_listing") &&
      representationMatchesProfile(property, profile);
    items.push({
      id: `listing:${property.id}:role`,
      subject: "listing",
      field: "listing_role",
      value: `${property.id}:${role}`,
      sourceLabel: source?.provider || "Listing representation",
      sourceTier: tier,
      status: roleVerified ? "verified" : role === "unknown" ? "unknown" : "declared",
      sourceUrl: source?.url,
      observedAt: property.representation?.verifiedAt || source?.observedAt || evaluatedAt,
    });
  }
  return items;
}

function dedupeEvidence(items: CiteEvidence[]): CiteEvidence[] {
  const byId = new Map<string, CiteEvidence>();
  for (const item of items) {
    const current = byId.get(item.id);
    if (!current || evidenceQuality(item) > evidenceQuality(current)) byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function fieldEvidence(items: CiteEvidence[], field: string): CiteEvidence[] {
  return items.filter((item) => item.field === field).sort((a, b) => evidenceQuality(b) - evidenceQuality(a));
}

function bestEvidence(items: CiteEvidence[], field: string): CiteEvidence | undefined {
  return fieldEvidence(items, field)[0];
}

function inferredClaimScope(item: CiteEvidence): string {
  if (item.claimScope) return item.claimScope.trim().toLowerCase();
  if (item.field !== "transaction_volume") return "default";
  const value = item.value.toLowerCase();
  const year = value.match(/\b(20\d{2})\b/)?.[1] || "unspecified";
  const period = /\b(?:h1|first half)\b/.test(value)
    ? "h1"
    : /\b(?:h2|second half)\b/.test(value)
      ? "h2"
      : value.match(/\bq([1-4])\b/)?.[0] || "full-year";
  return `sales-volume:${year}:${period}`;
}

function findConflicts(items: CiteEvidence[]): CiteConflict[] {
  const critical = new Set([
    "name",
    "license",
    "responsible_broker",
    "responsible_broker_license",
    "brokerage_brand",
    "listing_status",
    "listing_price",
    "listing_transaction",
  ]);
  const conflictFields = [
    "name",
    "license",
    "responsible_broker",
    "responsible_broker_license",
    "brokerage_brand",
    "transaction_volume",
    "phone",
    "listing_status",
    "listing_price",
    "listing_transaction",
  ];
  const conflicts: CiteConflict[] = [];
  for (const field of conflictFields) {
    const candidates = fieldEvidence(items, field).filter(
      (item) => validUrl(item.sourceUrl) && evidenceQuality(item) >= 0.3 && item.value !== "Unknown",
    );
    const byScope = new Map<string, CiteEvidence[]>();
    for (const item of candidates) {
      const scope = inferredClaimScope(item);
      byScope.set(scope, [...(byScope.get(scope) || []), item]);
    }
    for (const [scope, scoped] of byScope) {
      const grouped = new Map<string, CiteEvidence[]>();
      for (const item of scoped) {
        const key = normalizeFieldValue(field, item.value);
        if (!key) continue;
        grouped.set(key, [...(grouped.get(key) || []), item]);
      }
      if (grouped.size <= 1) continue;
      const all = [...grouped.values()].flat();
      conflicts.push({
        id: `conflict:${field}:${scope}`,
        field,
        claimScope: scope === "default" ? undefined : scope,
        values: [...grouped.values()].map((group) => group[0]!.value),
        evidenceIds: all.map((item) => item.id),
        severity:
          critical.has(field) || field === "transaction_volume"
            ? "blocking"
            : "warning",
        message:
          field === "transaction_volume"
            ? `Published production figures disagree for ${scope.replace(/:/g, " ")}. Keep methodologies separate until a human verifies them.`
            : `Public sources disagree about ${field.replace(/_/g, " ")}${scope === "default" ? "" : ` for ${scope}`}.`,
      });
    }
  }
  return conflicts;
}

function representedInventory(
  properties: CiteProperty[],
  evaluatedAt: string,
  profile?: CiteAgentProfile | null,
) {
  const claimed = properties.filter(
    (property) =>
      (property.status === "active" || property.status === "coming_soon") &&
      property.listingSide === "mine",
  );
  const verified = claimed.filter((property) => {
    const role = property.representation?.role;
    const providerVerified =
      property.source?.evidenceLevel === "provider_verified" &&
      property.source.trust === "server_attested" &&
      Boolean(property.source.attestationId);
    const roleVerified = role === "listing" || role === "co_listing";
    const matched = representationMatchesProfile(property, profile);
    const current = daysOld(
      property.representation?.verifiedAt || property.source?.modifiedAt || property.source?.observedAt,
      evaluatedAt,
    ) <= 30;
    return providerVerified && roleVerified && matched && current;
  });
  const publishable = verified.filter(
    (property) => property.visibility !== "private" && property.visibility !== "suppressed" && validUrl(property.source?.url),
  );
  const needsVerification = properties.filter(
    (property) =>
      (property.status === "active" || property.status === "coming_soon") &&
      !verified.includes(property) &&
      (property.source?.kind === "website" ||
        property.source?.kind === "csv" ||
        property.listingSide === "mine"),
  );
  return { claimed, verified, publishable, needsVerification };
}

function rule(
  id: string,
  pillar: AieoPillarId,
  label: string,
  earned: number,
  max: number,
  reason: string,
  evidenceIds: string[] = [],
): CiteRuleResult {
  const bounded = Math.max(0, Math.min(max, Math.round(earned)));
  const status = bounded === max ? "pass" : bounded > 0 ? "partial" : evidenceIds.length ? "fail" : "unknown";
  return { id, pillar, label, earned: bounded, max, status, reason, evidenceIds };
}

function evidenceCoverage(items: CiteEvidence[], inventoryClaimed: boolean): number {
  const fields = [...CORE_FIELDS, ...(inventoryClaimed ? (["listing_role"] as const) : [])];
  const score = fields.reduce((sum, field) => sum + evidenceQuality(bestEvidence(items, field) || ({ status: "unknown", sourceTier: "user" } as CiteEvidence)), 0);
  return Math.round((score / fields.length) * 100);
}

function buildQueries(
  profile: CiteAgentProfile | null | undefined,
  evidence: CiteEvidence[],
  inventory: ReturnType<typeof representedInventory>,
  conflicts: CiteConflict[],
  evaluatedAt: string,
): CiteQuery[] {
  const name = profile?.name || "this real estate professional";
  const supportedArea = fieldEvidence(evidence, "service_area").find(
    (item) => evidenceQuality(item) >= 0.5,
  );
  const area = supportedArea?.value || profile?.areaOfOperations || "their market";
  const identityIds = [bestEvidence(evidence, "name")?.id, bestEvidence(evidence, "license")?.id].filter(Boolean) as string[];
  const brokerIds = [bestEvidence(evidence, "responsible_broker")?.id, bestEvidence(evidence, "responsible_broker_license")?.id].filter(Boolean) as string[];
  const areaIds = fieldEvidence(evidence, "service_area").map((item) => item.id);
  const license = bestEvidence(evidence, "license");
  const brokerLicense = bestEvidence(evidence, "responsible_broker_license");
  const identityReady =
    !conflicts.some((item) => item.field === "license" || item.field === "name") &&
    ["pass", "warn"].includes(credentialState(license, evaluatedAt));
  const brokerReady =
    !conflicts.some(
      (item) =>
        item.field === "responsible_broker" ||
        item.field === "responsible_broker_license",
    ) &&
    evidenceQuality(
      bestEvidence(evidence, "responsible_broker") ||
        ({ status: "unknown", sourceTier: "user" } as CiteEvidence),
    ) >= 0.8 &&
    ["pass", "warn"].includes(credentialState(brokerLicense, evaluatedAt));
  const queries: CiteQuery[] = [
    {
      id: "identity",
      category: "identity",
      prompt: `Who is ${name}, and what real estate services do they provide?`,
      mode: "publish_support",
      readiness: identityReady ? "ready" : identityIds.length ? "partial" : "blocked",
      evidenceIds: identityIds,
    },
    {
      id: "license-broker",
      category: "verification",
      prompt: `Is ${name} licensed, and who is their responsible broker?`,
      mode: "publish_support",
      readiness: identityReady && brokerReady ? "ready" : identityIds.length || brokerIds.length ? "partial" : "blocked",
      evidenceIds: [...identityIds, ...brokerIds],
    },
    {
      id: "service-area",
      category: "local",
      prompt: `What areas does ${name} serve around ${area}?`,
      mode: "publish_support",
      readiness: areaIds.some((id) => evidenceQuality(evidence.find((item) => item.id === id)!) >= 0.5) ? "ready" : areaIds.length ? "partial" : "blocked",
      evidenceIds: areaIds,
    },
    {
      id: "local-discovery",
      category: "competitive",
      prompt: `Which real estate agents have verifiable experience in ${area}?`,
      mode: "measurement_only",
      readiness: identityReady ? "partial" : "blocked",
      evidenceIds: [...identityIds, ...areaIds],
    },
  ];
  for (const property of inventory.publishable.slice(0, 3)) {
    queries.push({
      id: `listing:${property.id}`,
      category: "listing",
      prompt: `Who represents ${property.address || property.title}?`,
      mode: "publish_support",
      readiness: "ready",
      evidenceIds: [`listing:${property.id}:facts`, `listing:${property.id}:role`],
    });
  }
  return queries;
}

function buildAnswers(
  profile: CiteAgentProfile | null | undefined,
  evidence: CiteEvidence[],
  inventory: ReturnType<typeof representedInventory>,
  conflicts: CiteConflict[],
  evaluatedAt: string,
): AieoFaq[] {
  const name = profile?.name || "This real estate professional";
  const license = bestEvidence(evidence, "license");
  const broker = bestEvidence(evidence, "responsible_broker");
  const brokerLicense = bestEvidence(evidence, "responsible_broker_license");
  const areaEvidence = bestEvidence(evidence, "service_area");
  const area = areaEvidence?.value || profile?.areaOfOperations || "the stated service area";
  const licenseVerified = Boolean(
    license &&
      ["pass", "warn"].includes(credentialState(license, evaluatedAt)) &&
      !conflicts.some(
        (item) => item.field === "license" || item.field === "name",
      ),
  );
  const brokerVerified = Boolean(
    broker &&
      evidenceQuality(broker) >= 0.8 &&
      ["pass", "warn"].includes(
        credentialState(brokerLicense, evaluatedAt),
      ) &&
      !conflicts.some(
        (item) =>
          item.field === "responsible_broker" ||
          item.field === "responsible_broker_license",
      ),
  );
  const areaSupported = Boolean(areaEvidence && evidenceQuality(areaEvidence) >= 0.5);
  const identityEvidence = [license?.id, broker?.id, brokerLicense?.id].filter(
    Boolean,
  ) as string[];
  const answers: AieoFaq[] = [
    {
      question: `How can ${name}'s license and affiliation be verified?`,
      answer:
        licenseVerified && brokerVerified
          ? `${name} is listed by the cited licensing source under ${license!.value}, with ${broker!.value} identified as the responsible broker. Check the source links and verification dates before publishing.`
          : `CiteLock has not yet independently verified both ${name}'s license and responsible broker. Keep this answer in draft until regulator or brokerage evidence is attached.`,
      evidenceIds: identityEvidence,
      publishable: licenseVerified && brokerVerified,
      reviewStatus: licenseVerified && brokerVerified ? "needs_human_review" : "needs_sources",
    },
    {
      question: `What areas does ${name} serve?`,
      answer: areaSupported
        ? `${name}'s public materials identify ${area} as a service area. This describes the published claim; it does not establish market rank or exclusive expertise.`
        : `The workspace lists ${area}, but CiteLock has not found a sufficiently supported public source for that service-area claim.`,
      evidenceIds: areaEvidence ? [areaEvidence.id] : [],
      publishable: areaSupported,
      reviewStatus: areaSupported ? "needs_human_review" : "needs_sources",
    },
  ];
  if (inventory.publishable.length) {
    const propertyIds = inventory.publishable.flatMap((property) => [
      `listing:${property.id}:facts`,
      `listing:${property.id}:role`,
    ]);
    const sales = inventory.publishable.filter(
      (property) => property.transactionType === "sale",
    ).length;
    const leases = inventory.publishable.filter(
      (property) => property.transactionType === "lease",
    ).length;
    const unknown = inventory.publishable.length - sales - leases;
    const inventorySummary = [
      sales ? `${sales} for sale` : "",
      leases ? `${leases} for lease` : "",
      unknown ? `${unknown} with an unclassified transaction type` : "",
    ]
      .filter(Boolean)
      .join(" and ");
    answers.push({
      question: `Which active listings does ${name} represent?`,
      answer: `${inventorySummary} ${inventory.publishable.length === 1 ? "is" : "are"} supported by current provider evidence. Cite each source and re-check status before publishing.`,
      evidenceIds: propertyIds,
      publishable: true,
      reviewStatus: "needs_human_review",
    });
  }
  return answers;
}

function cleanObject<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cleanObject).filter((item) => item !== undefined) as T;
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item === undefined || item === "") continue;
    out[key] = cleanObject(item);
  }
  return out as T;
}

function buildJsonLd(
  profile: CiteAgentProfile | null | undefined,
  evidence: CiteEvidence[],
  conflicts: CiteConflict[],
  evaluatedAt: string,
): Record<string, unknown> {
  const conflicted = (field: string) =>
    conflicts.some((item) => item.field === field);
  const usable = (field: string, minimum = 0.3) => {
    const item = bestEvidence(evidence, field);
    return item &&
      item.value !== "Unknown" &&
      !conflicted(field) &&
      evidenceQuality(item) >= minimum
      ? item
      : undefined;
  };
  const nameEvidence = usable("name");
  const websiteEvidence = usable("website", 0.3);
  const license = usable("license", 0.9);
  const broker = usable("responsible_broker", 0.8);
  const brokerLicense = usable("responsible_broker_license", 0.9);
  const phone = usable("phone");
  const email = usable("email");
  const serviceArea = usable("service_area", 0.5);
  const brand = usable("brokerage_brand", 0.5);
  const licenseCurrent =
    license && ["pass", "warn"].includes(credentialState(license, evaluatedAt));
  const brokerCurrent =
    brokerLicense &&
    ["pass", "warn"].includes(
      credentialState(brokerLicense, evaluatedAt),
    );
  const brokerName = brokerCurrent ? broker?.value : undefined;
  const evidenceUrl = validUrl(websiteEvidence?.value)
    ? websiteEvidence.value.replace(/\/$/, "")
    : undefined;
  const url = evidenceUrl || canonicalUrl(profile);
  if (
    !url ||
    !profile ||
    !nameEvidence ||
    !websiteEvidence ||
    !licenseCurrent ||
    !brokerName
  )
    return { "@context": "https://schema.org", "@graph": [] };
  const personId = `${url}#person`;
  const brokerId = `${url}#responsible-broker`;
  const sameAs = fieldEvidence(evidence, "public_profile")
    .filter(
      (item) =>
        validUrl(item.value) &&
        !conflicted("public_profile") &&
        evidenceQuality(item) >= 0.3,
    )
    .map((item) => item.value);
  const graph: Record<string, unknown>[] = [
    {
      "@type": "ProfilePage",
      "@id": `${url}#profile-page`,
      url,
      mainEntity: { "@id": personId },
      isPartOf: { "@id": `${url}#website` },
    },
    {
      "@type": "Person",
      "@id": personId,
      name: nameEvidence.value,
      url,
      telephone: phone?.value,
      email: email?.value,
      sameAs,
      worksFor: brokerName ? { "@id": brokerId } : undefined,
      hasCredential: licenseCurrent
        ? {
            "@type": "EducationalOccupationalCredential",
            identifier: license!.value,
            credentialCategory: `${license!.jurisdiction || "Real estate"} license`,
          }
        : undefined,
      knowsAbout: serviceArea
        ? serviceArea.value
        : undefined,
    },
    {
      "@type": "WebSite",
      "@id": `${url}#website`,
      url,
      name: `${nameEvidence.value} website`,
      about: { "@id": personId },
    },
  ];
  if (brokerName) {
    graph.push({
      "@type": "Organization",
      "@id": brokerId,
      name: brokerName,
      alternateName: brand?.value,
      identifier: brokerLicense?.value,
      employee: { "@id": personId },
    });
  }
  return cleanObject({ "@context": "https://schema.org", "@graph": graph });
}

function canonicalProvider(value: string): string {
  const provider = value.trim().toLowerCase();
  if (/openai|chatgpt|\bgpt\b/.test(provider)) return "chatgpt";
  if (/google|gemini/.test(provider)) return "gemini";
  if (/microsoft|copilot/.test(provider)) return "copilot";
  if (/anthropic|claude/.test(provider)) return "claude";
  if (/xai|grok/.test(provider)) return "grok";
  return provider;
}

function aggregateRecognition(
  runs: AieoInput["recognitionRuns"],
  validQueryIds: Set<string>,
  evaluatedAt: string,
): CiteRecognition | null {
  if (!runs?.length) return null;
  const evaluated = Date.parse(evaluatedAt);
  const earliest = evaluated - 30 * DAY;
  const latest = evaluated + 5 * 60_000;
  const byId = new Map<
    string,
    NonNullable<AieoInput["recognitionRuns"]>[number]
  >();
  for (const run of runs) {
    const observed = Date.parse(run.observedAt);
    if (
      !run.id.trim() ||
      !validQueryIds.has(run.queryId) ||
      !Number.isFinite(observed) ||
      observed < earliest ||
      observed > latest
    )
      continue;
    const normalized = { ...run, provider: canonicalProvider(run.provider) };
    const current = byId.get(run.id);
    if (!current || normalized.observedAt > current.observedAt)
      byId.set(run.id, normalized);
  }
  const uniqueRuns = [...byId.values()];
  if (!uniqueRuns.length) return null;
  const pct = (count: number) =>
    Math.round((count / uniqueRuns.length) * 100);
  const providers = [...new Set(uniqueRuns.map((run) => run.provider))].sort();
  const queries = new Set(uniqueRuns.map((run) => run.queryId));
  return {
    state:
      uniqueRuns.length >= 18 && providers.length >= 3 && queries.size >= 3
        ? "measured"
        : "insufficient",
    runs: uniqueRuns.length,
    providers,
    mentionRate: pct(uniqueRuns.filter((run) => run.mentioned).length),
    citationRate: pct(uniqueRuns.filter((run) => run.cited).length),
    identityAccuracy: pct(
      uniqueRuns.filter((run) => run.correctIdentity).length,
    ),
    brokerageAccuracy: pct(
      uniqueRuns.filter((run) => run.correctBrokerage).length,
    ),
    observedAt: [...uniqueRuns].sort((a, b) =>
      b.observedAt.localeCompare(a.observedAt),
    )[0]!.observedAt,
  };
}

function numericGrade(total: number): AieoScore["grade"] {
  if (total >= 85) return "A";
  if (total >= 70) return "B";
  if (total >= 55) return "C";
  if (total >= 40) return "D";
  return "F";
}

function gatedGrade(total: number, status: AieoScore["readiness"]["status"]): AieoScore["grade"] {
  const raw = numericGrade(total);
  if (status === "blocked" && (raw === "A" || raw === "B")) return "C";
  if (status === "unverified" && raw === "A") return "B";
  return raw;
}

export function scoreAieo(input: AieoInput): AieoScore {
  const evaluatedAt = input.evaluatedAt || new Date().toISOString();
  const properties = [...(input.properties || [])].sort((a, b) => a.id.localeCompare(b.id));
  const evidence = dedupeEvidence([
    ...autoEvidence(input.profile, properties, evaluatedAt),
    ...(input.evidence || []),
  ].map(sanitizeEvidenceItem));
  const conflicts = findConflicts(evidence);
  const baseInventory = representedInventory(
    properties,
    evaluatedAt,
    input.profile,
  );
  const trustedListingScopes = new Set(
    baseInventory.publishable.flatMap((property) => listingClaimKeys(property)),
  );
  const activeSiteListingGroups = new Map<string, CiteEvidence[]>();
  for (const item of evidence) {
    if (
      item.subject !== "listing" ||
      item.field !== "listing_status" ||
      item.sourceTier !== "first_party" ||
      item.status !== "published" ||
      !/^(?:active|coming_soon)$/i.test(item.value)
    )
      continue;
    const groupId = item.id.replace(/:status:\d+$/, "");
    activeSiteListingGroups.set(groupId, [
      ...(activeSiteListingGroups.get(groupId) || []),
      item,
    ]);
  }
  const unverifiedSiteListingGroups = [
    ...activeSiteListingGroups.values(),
  ].filter(
    (group) =>
      !group.some(
        (item) => item.claimScope && trustedListingScopes.has(item.claimScope),
      ),
  );
  const unverifiedSiteListingEvidence = unverifiedSiteListingGroups.flat();
  const conflictedListingScopes = new Set(
    conflicts
      .filter(
        (conflict) =>
          conflict.field === "listing_status" ||
          conflict.field === "listing_price" ||
          conflict.field === "listing_transaction",
      )
      .map((conflict) => conflict.claimScope)
      .filter(Boolean),
  );
  const inventory = {
    ...baseInventory,
    // Never emit an answer from one side of a public status/price conflict.
    publishable: baseInventory.publishable.filter(
      (property) => {
        const keys = listingClaimKeys(property);
        return keys.every(
          (key) =>
            !conflictedListingScopes.has(key) &&
            !conflictedListingScopes.has(
              listingPriceClaimScope(
                key,
                property.transactionType,
                property.pricePeriod,
              ),
            ),
        );
      },
    ),
  };
  const coverage = evidenceCoverage(
    evidence,
    inventory.claimed.length > 0 || activeSiteListingGroups.size > 0,
  );
  const queryPlan = buildQueries(
    input.profile,
    evidence,
    inventory,
    conflicts,
    evaluatedAt,
  );
  const faqs = buildAnswers(
    input.profile,
    evidence,
    inventory,
    conflicts,
    evaluatedAt,
  );
  const audit = input.profile?.siteAudit;
  const auditAge = daysOld(audit?.observedAt, evaluatedAt);
  const licenseEvidence = bestEvidence(evidence, "license");
  const brokerEvidence = bestEvidence(evidence, "responsible_broker");
  const brokerLicenseEvidence = bestEvidence(
    evidence,
    "responsible_broker_license",
  );
  const licenseState = credentialState(licenseEvidence, evaluatedAt);
  const brokerLicenseState = credentialState(
    brokerLicenseEvidence,
    evaluatedAt,
  );
  const nameEvidence = bestEvidence(evidence, "name");
  const serviceEvidence = bestEvidence(evidence, "service_area");
  const authoritative = evidence.filter(
    (item) => validUrl(item.sourceUrl) && evidenceQuality(item) >= 0.75,
  );
  const publicSourceCount = new Set(authoritative.map((item) => item.sourceUrl)).size;
  const identitySourceCount = new Set(
    authoritative
      .filter((item) =>
        [
          "name",
          "license",
          "responsible_broker",
          "responsible_broker_license",
        ].includes(item.field),
      )
      .map((item) => item.sourceUrl),
  ).size;
  const localSources = evidence.filter(
    (item) => (item.field === "service_area" || item.field === "local_expertise") && evidenceQuality(item) >= 0.5,
  );
  const productionEvidence = fieldEvidence(evidence, "transaction_volume");
  const productionConflicts = conflicts.filter(
    (conflict) => conflict.field === "transaction_volume",
  );
  const unsupportedProductionClaims = productionEvidence.filter(
    (claim) =>
      claim.sourceTier === "first_party" &&
      !productionEvidence.some(
        (candidate) =>
          candidate.id !== claim.id &&
          inferredClaimScope(candidate) === inferredClaimScope(claim) &&
          evidenceQuality(candidate) >= 0.7 &&
          normalizeFieldValue(candidate.field, candidate.value) ===
            normalizeFieldValue(claim.field, claim.value),
      ),
  );
  const verifiedNeighborhoods = new Set(
    inventory.publishable.map((property) => property.neighborhood || property.city).filter(Boolean),
  );
  const structuredAreas = input.profile?.serviceAreas || [];
  const rules: CiteRuleResult[] = [
    rule("identity.canonical", "identity", "Canonical person page", canonicalUrl(input.profile) ? 5 : 0, 5, canonicalUrl(input.profile) ? "A stable public profile URL is present." : "Add a canonical public profile URL.", nameEvidence ? [nameEvidence.id] : []),
    rule("identity.license", "identity", "Current regulator-backed license", licenseState === "pass" || licenseState === "warn" ? 8 : licenseEvidence && evidenceQuality(licenseEvidence) >= 0.5 ? 3 : 0, 8, licenseState === "pass" ? "License is regulator-backed, recently checked, and current." : licenseState === "warn" ? "License evidence needs a 30-day refresh or renewal-date review." : licenseState === "block" ? "The regulator record is inactive, restricted, expired, missing its observation date, or older than 90 days." : "The license is not yet regulator-verified.", licenseEvidence ? [licenseEvidence.id] : []),
    rule("identity.broker", "identity", "Current responsible broker relationship", brokerEvidence && evidenceQuality(brokerEvidence) >= 0.8 && (brokerLicenseState === "pass" || brokerLicenseState === "warn") ? 7 : brokerEvidence && evidenceQuality(brokerEvidence) >= 0.5 ? 3 : 0, 7, brokerEvidence && evidenceQuality(brokerEvidence) >= 0.8 && (brokerLicenseState === "pass" || brokerLicenseState === "warn") ? "Legal broker name and current license are supported by strong public evidence." : "Verify the responsible broker legal name and current license.", [brokerEvidence?.id, brokerLicenseEvidence?.id].filter(Boolean) as string[]),
    rule("identity.corroboration", "identity", "Identity corroboration", Math.min(5, identitySourceCount * 2), 5, `${identitySourceCount} authoritative public source${identitySourceCount === 1 ? "" : "s"} support the identity graph.`, authoritative.filter((item) => ["name", "license", "responsible_broker", "responsible_broker_license"].includes(item.field)).map((item) => item.id)),

    rule("evidence.coverage", "evidence", "Core claim provenance", Math.round(coverage * 0.1), 10, `${coverage}% of core claims are supported at their current evidence quality.`, CORE_FIELDS.flatMap((field) => fieldEvidence(evidence, field).map((item) => item.id))),
    rule("evidence.authority", "evidence", "Authoritative source diversity", Math.min(6, publicSourceCount * 2), 6, `${publicSourceCount} distinct authoritative source${publicSourceCount === 1 ? "" : "s"} found.`, authoritative.map((item) => item.id)),
    rule("evidence.listing_truth", "evidence", "Representation truth", unverifiedSiteListingGroups.length || inventory.needsVerification.length ? 0 : inventory.claimed.length === 0 && evidence.some((item) => item.status !== "unknown") ? 4 : inventory.claimed.length ? Math.round((inventory.verified.length / inventory.claimed.length) * 4) : 0, 4, unverifiedSiteListingGroups.length ? `${unverifiedSiteListingGroups.length} active website/IDX listing observation${unverifiedSiteListingGroups.length === 1 ? " needs" : "s need"} current provider role classification.` : inventory.needsVerification.length ? `${inventory.needsVerification.length} active website, CSV, or user listing claim${inventory.needsVerification.length === 1 ? " needs" : "s need"} provider role verification.` : inventory.claimed.length ? `${inventory.verified.length}/${inventory.claimed.length} claimed active listings have current provider-backed role evidence.` : "No represented-inventory claim is being made.", [...inventory.claimed, ...inventory.needsVerification].flatMap((property) => [`listing:${property.id}:facts`, `listing:${property.id}:role`]).concat(unverifiedSiteListingEvidence.map((item) => item.id))),

    rule("local.structure", "local", "Structured service area", structuredAreas.length ? Math.min(6, 3 + structuredAreas.length) : input.profile?.areaOfOperations ? 3 : 0, 6, structuredAreas.length ? `${structuredAreas.length} structured place entit${structuredAreas.length === 1 ? "y" : "ies"} supplied.` : "Convert the free-text market into city, county, state, and neighborhood entities.", serviceEvidence ? [serviceEvidence.id] : []),
    rule("local.public", "local", "Public local evidence", Math.min(6, localSources.length * 3), 6, `${localSources.length} public local-evidence source${localSources.length === 1 ? "" : "s"} found.`, localSources.map((item) => item.id)),
    rule("local.footprint", "local", "Verified public market footprint", verifiedNeighborhoods.size >= 3 ? 6 : verifiedNeighborhoods.size ? 3 : 0, 6, `${verifiedNeighborhoods.size} public place entit${verifiedNeighborhoods.size === 1 ? "y is" : "ies are"} tied to provider-verified representation.`, inventory.publishable.map((property) => `listing:${property.id}:role`)),

    rule("answers.bio", "answers", "Visible expert profile", input.profile?.bio && input.profile.bio.length >= 160 && canonicalUrl(input.profile) ? 4 : input.profile?.bio && input.profile.bio.length >= 80 ? 2 : 0, 4, input.profile?.bio ? "Profile copy is present; keep factual claims source-linked." : "Publish a factual, first-hand profile with visible disclosures.", nameEvidence ? [nameEvidence.id] : []),
    rule("answers.pack", "answers", "Source-backed answer pack", Math.round((faqs.filter((faq) => faq.publishable).length / Math.max(3, faqs.length)) * 6), 6, `${faqs.filter((faq) => faq.publishable).length}/${faqs.length} generated answers currently have sufficient source support.`, faqs.flatMap((faq) => faq.evidenceIds)),
    rule("answers.intent", "answers", "Intent coverage", Math.round((queryPlan.filter((query) => query.readiness === "ready").length / queryPlan.length) * 5), 5, `${queryPlan.filter((query) => query.readiness === "ready").length}/${queryPlan.length} pilot prompts are evidence-ready.`, queryPlan.flatMap((query) => query.evidenceIds)),

    rule("technical.reachable", "technical", "Public and server-visible", audit?.homePage.httpOk && audit.homePage.serverRenderedIdentity ? 3 : audit?.homePage.httpOk ? 1 : 0, 3, audit ? "Homepage reachability and server-visible identity were audited." : "Run a live site audit; workspace fields do not prove public retrievability.", []),
    rule("technical.indexable", "technical", "Canonical and indexable", audit?.homePage.canonical && audit.homePage.indexable ? 3 : audit?.homePage.indexable ? 1 : 0, 3, audit?.homePage.indexable === false ? "The public profile is marked noindex or otherwise blocked." : audit ? "Canonical/indexability signals were inspected." : "Indexability is not measured.", []),
    rule("technical.schema", "technical", "Person–brokerage schema graph", audit?.homePage.schemaTypes.includes("Person") && (audit.homePage.schemaTypes.includes("Organization") || audit.homePage.schemaTypes.includes("RealEstateAgent")) ? 3 : 0, 3, audit?.homePage.schemaTypes.length ? `Observed schema types: ${audit.homePage.schemaTypes.join(", ")}.` : "No deployed Person + brokerage graph has been observed.", []),
    rule("technical.crawlers", "technical", "Sitemap and search crawler access", audit?.sitemap === "present" && audit.botAccess.oaiSearchBot === "allowed" && audit.botAccess.perplexityBot === "allowed" ? 3 : audit?.sitemap === "present" ? 1 : 0, 3, audit ? "Search-bot access is scored separately from model-training crawlers." : "Sitemap and search-bot access are not measured.", []),

    rule("freshness.audit", "freshness", "Recent live audit", auditAge <= 7 ? 3 : auditAge <= 30 ? 2 : 0, 3, Number.isFinite(auditAge) ? `Last live audit was ${Math.floor(auditAge)} day(s) ago.` : "No dated live audit exists.", []),
    rule("freshness.sources", "freshness", "Current authoritative evidence", authoritative.length ? Math.round((authoritative.filter((item) => daysOld(item.observedAt, evaluatedAt) <= 90).length / authoritative.length) * 4) : 0, 4, authoritative.length ? "Authoritative evidence is evaluated against its observation date." : "No dated authoritative evidence exists.", authoritative.map((item) => item.id)),
    rule("freshness.consistency", "freshness", "Conflict and credential renewal watch", conflicts.some((conflict) => conflict.severity === "blocking") || licenseState === "block" || brokerLicenseState === "block" ? 0 : conflicts.length || licenseState === "warn" || brokerLicenseState === "warn" ? 1 : evidence.some((item) => item.status !== "unknown") ? 3 : 0, 3, conflicts.length ? `${conflicts.length} public conflict${conflicts.length === 1 ? " requires" : "s require"} review.` : licenseState === "warn" || brokerLicenseState === "warn" ? "A regulator-backed credential needs a 30-day refresh or is within 90 days of expiry." : "No public conflict or credential renewal warning is currently detected.", [...conflicts.flatMap((conflict) => conflict.evidenceIds), ...[licenseEvidence?.id, brokerLicenseEvidence?.id].filter(Boolean) as string[]]),
  ];

  const unsupportedListings = inventory.claimed.filter((property) => !inventory.verified.includes(property));
  const gates: CiteGate[] = [
    { id: "canonical", label: "Canonical public profile", status: canonicalUrl(input.profile) ? "pass" : "block", reason: canonicalUrl(input.profile) ? "A stable public URL is available." : "No valid canonical public profile URL.", evidenceIds: nameEvidence ? [nameEvidence.id] : [] },
    { id: "identity-conflict", label: "Identity and claim conflicts", status: conflicts.some((conflict) => conflict.severity === "blocking") ? "block" : conflicts.length ? "warn" : "pass", reason: conflicts.length ? `${conflicts.length} conflict${conflicts.length === 1 ? " requires" : "s require"} human resolution.` : "No conflicting high-quality sources detected.", evidenceIds: conflicts.flatMap((conflict) => conflict.evidenceIds) },
    { id: "license", label: "Agent license currency", status: licenseState === "pass" ? "pass" : licenseState === "warn" ? "warn" : "block", reason: licenseState === "pass" ? "The regulator-backed license was checked within 30 days and is current beyond the renewal window." : licenseState === "warn" ? "The regulator evidence needs a 30-day refresh or is within 90 days of expiry." : licenseState === "block" ? "The regulator record is inactive, restricted, expired, status-unknown, expiry-unknown, undated, or more than 90 days old." : "A regulator-backed agent license is required before professional claims can be exported.", evidenceIds: licenseEvidence ? [licenseEvidence.id] : [] },
    { id: "broker-license", label: "Responsible broker license currency", status: brokerLicenseState === "block" || !brokerEvidence || evidenceQuality(brokerEvidence) < 0.8 || brokerLicenseState === "unknown" ? "block" : brokerLicenseState === "pass" ? "pass" : "warn", reason: brokerLicenseState === "pass" && brokerEvidence && evidenceQuality(brokerEvidence) >= 0.8 ? "The legal responsible broker and regulator-backed license were recently checked and are current." : brokerLicenseState === "warn" && brokerEvidence && evidenceQuality(brokerEvidence) >= 0.8 ? "The responsible broker evidence needs a 30-day refresh or is within 90 days of expiry." : brokerLicenseState === "block" ? "The responsible broker record is inactive, restricted, expired, status-unknown, expiry-unknown, undated, or more than 90 days old." : "A regulator-linked legal responsible broker and current license are required; a marketing brokerage name is not a substitute.", evidenceIds: [brokerEvidence?.id, brokerLicenseEvidence?.id].filter(Boolean) as string[] },
    { id: "listing-role", label: "Listing representation", status: unsupportedListings.length || unverifiedSiteListingGroups.length ? "block" : inventory.needsVerification.length ? "warn" : "pass", reason: unsupportedListings.length ? `${unsupportedListings.length} active represented-listing claim${unsupportedListings.length === 1 ? " lacks" : "s lack"} current provider role evidence.` : unverifiedSiteListingGroups.length ? `${unverifiedSiteListingGroups.length} active website/IDX listing observation${unverifiedSiteListingGroups.length === 1 ? " lacks" : "s lack"} current provider role classification and ${unverifiedSiteListingGroups.length === 1 ? "is" : "are"} excluded from agent representation answers.` : inventory.needsVerification.length ? `${inventory.needsVerification.length} website, CSV, or user-claimed active listing${inventory.needsVerification.length === 1 ? " is" : "s are"} excluded until current provider role evidence is attached.` : "No unsupported active representation claim is publishable.", evidenceIds: [...unsupportedListings, ...inventory.needsVerification].map((property) => `listing:${property.id}:role`).concat(unverifiedSiteListingEvidence.map((item) => item.id)) },
    { id: "production-claims", label: "Production claim support", status: productionConflicts.length ? "block" : unsupportedProductionClaims.length ? "warn" : "pass", reason: productionConflicts.length ? `${productionConflicts.length} same-period production conflict${productionConflicts.length === 1 ? " requires" : "s require"} methodology review.` : unsupportedProductionClaims.length ? `${unsupportedProductionClaims.length} website production claim${unsupportedProductionClaims.length === 1 ? " needs" : "s need"} independent, period-matched corroboration before reuse.` : productionEvidence.length ? "Published production claims have period-matched independent support." : "CiteLock is not publishing a quantified production claim.", evidenceIds: productionEvidence.map((item) => item.id) },
    { id: "indexability", label: "Indexability", status: audit?.homePage.indexable === false ? "block" : audit ? "pass" : "unknown", reason: audit?.homePage.indexable === false ? "The public profile is not indexable." : audit ? "The audited homepage is indexable." : "A live site audit has not measured indexability.", evidenceIds: [] },
    { id: "site-audit-freshness", label: "Site audit freshness", status: !audit ? "unknown" : auditAge > 30 ? "block" : auditAge > 7 ? "warn" : "pass", reason: !audit ? "No live site audit exists." : auditAge > 30 ? "The last live crawl is more than 30 days old; recheck reachability, canonical, indexability, and visible identity." : auditAge > 7 ? "The last live crawl is more than 7 days old; refresh before a high-stakes publishing update." : "The live site audit is no more than 7 days old.", evidenceIds: [] },
    { id: "coverage", label: "Evidence coverage", status: coverage >= 70 ? "pass" : coverage >= 45 ? "warn" : "unknown", reason: `${coverage}% weighted evidence coverage.`, evidenceIds: CORE_FIELDS.flatMap((field) => fieldEvidence(evidence, field).map((item) => item.id)) },
  ];

  const pillars = Object.fromEntries(
    (Object.keys(PILLAR_MAX) as AieoPillarId[]).map((pillar) => {
      const pillarRules = rules.filter((item) => item.pillar === pillar);
      return [pillar, { score: pillarRules.reduce((sum, item) => sum + item.earned, 0), max: PILLAR_MAX[pillar], note: pillarRules.map((item) => item.label).join(" · ") }];
    }),
  ) as AieoScore["pillars"];
  const total = Object.values(pillars).reduce((sum, pillar) => sum + pillar.score, 0);
  const blocked = gates.some((gate) => gate.status === "block");
  const publishReady =
    !blocked &&
    coverage >= 70 &&
    Boolean(
      audit?.homePage.httpOk &&
        audit.homePage.indexable &&
        audit.homePage.serverRenderedIdentity,
    );
  const status: AieoScore["readiness"]["status"] = blocked ? "blocked" : publishReady ? "publish_ready" : "unverified";
  const grade = gatedGrade(total, status);
  const confidence = Math.round(
    evidence.length
      ? (evidence.reduce((sum, item) => sum + evidenceQuality(item), 0) / evidence.length) * 100
      : 0,
  );

  const blockingGateByRule: Record<string, string[]> = {
    "identity.license": ["license"],
    "identity.broker": ["broker-license"],
    "evidence.listing_truth": ["listing-role"],
    "technical.indexable": ["indexability"],
    "freshness.audit": ["site-audit-freshness"],
    "freshness.consistency": [
      "identity-conflict",
      "license",
      "broker-license",
      "production-claims",
    ],
  };
  const actions: CiteAction[] = rules
    .filter((item) => item.earned < item.max)
    .map<CiteAction>((item) => ({
      id: `action:${item.id}`,
      pillar: item.pillar,
      severity: (blockingGateByRule[item.id] || []).some((id) =>
        gates.some((gate) => gate.id === id && gate.status === "block"),
      ) ? "blocking" : item.max - item.earned >= 5 ? "high" : item.max - item.earned >= 3 ? "medium" : "low",
      issue: item.label,
      fix: item.reason,
      pointsAvailable: item.max - item.earned,
      evidenceRequired: item.evidenceIds.length ? item.evidenceIds : [`${item.pillar} source`],
    }))
    .sort((a, b) => {
      const rank = { blocking: 0, high: 1, medium: 2, low: 3 } as const;
      return rank[a.severity] - rank[b.severity] || b.pointsAvailable - a.pointsAvailable;
    });

  const listingBlurbs = inventory.publishable.slice(0, 6).map((property) => {
    const role = property.representation?.role === "co_listing" ? "co-listing" : "listing";
    const verifiedAt = property.representation?.verifiedAt || property.source!.observedAt;
    const location = [property.neighborhood, property.city].filter(Boolean).join(", ");
    const statusCopy =
      property.status === "coming_soon" ? "coming-soon" : "active";
    const priceCopy = property.price
      ? property.transactionType === "lease"
        ? ` offered for lease at $${property.price.toLocaleString()}${property.pricePeriod === "month" ? " per month" : ""}`
        : property.transactionType === "sale"
          ? ` offered for sale at $${property.price.toLocaleString()}`
          : ` with a provider-reported price of $${property.price.toLocaleString()} whose sale/lease period still needs classification`
      : "";
    return {
      id: property.id,
      title: property.title,
      blurb: `${property.title} is a ${statusCopy} property${location ? ` in ${location}` : ""}${priceCopy}. Provider evidence identifies ${input.profile?.name || "the agent"} in a ${role} role as of ${verifiedAt.slice(0, 10)}. Verify current status at the cited source.`,
      sourceUrl: property.source!.url!,
      evidenceIds: [`listing:${property.id}:facts`, `listing:${property.id}:role`],
      verifiedAt,
    };
  });
  const recognition = aggregateRecognition(
    input.recognitionRuns,
    new Set(queryPlan.map((query) => query.id)),
    evaluatedAt,
  );
  const summary = `CiteLock v${ALGORITHM_VERSION} readiness: ${total}/100 (${grade}), ${status.replace(/_/g, " ")}; ${coverage}% weighted evidence coverage. Recognition: ${recognition ? `${recognition.mentionRate}% mention rate across ${recognition.runs} controlled runs` : "not measured"}.`;

  return {
    algorithmVersion: ALGORITHM_VERSION,
    evaluatedAt,
    total,
    grade,
    readiness: { score: total, grade, status, confidence, evidenceCoverage: coverage },
    recognition,
    pillars,
    rules,
    gates,
    gaps: actions,
    actions,
    evidence,
    conflicts,
    queryPlan,
    faqs,
    jsonLd: publishReady
      ? buildJsonLd(input.profile, evidence, conflicts, evaluatedAt)
      : { "@context": "https://schema.org", "@graph": [] },
    listingBlurbs,
    brandVoiceCard: [
      `Voice: ${input.voice || "not trained"}`,
      `Agent: ${input.profile?.name || "not verified"}`,
      `Market: ${input.profile?.areaOfOperations || "not structured"}`,
      "Human review required before publication. Never invent credentials, rankings, listing roles, or property imagery.",
    ].join("\n"),
    summary,
  };
}

export const AIEO_PILLAR_LABEL: Record<AieoPillarId, string> = {
  identity: "Identity & affiliation",
  evidence: "Evidence & provenance",
  local: "Local authority",
  answers: "Answer usefulness",
  technical: "Technical retrievability",
  freshness: "Freshness & consistency",
};
