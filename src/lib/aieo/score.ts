/**
 * CiteLock™ v2 — verified, Realtor-specific citation readiness.
 *
 * Readiness is deterministic and evidence-based. Recognition is reported only
 * from supplied provider observations; it is never inferred from completeness.
 */
import type { CiteAgentProfile, CiteProperty } from "./provenance";
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

function canonicalUrl(profile?: CiteAgentProfile | null): string | undefined {
  const raw = profile?.canonicalProfileUrl || profile?.website;
  if (!validUrl(raw)) return undefined;
  const url = new URL(raw);
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function daysOld(value: string | undefined, evaluatedAt: string): number {
  const then = value ? Date.parse(value) : Number.NaN;
  const now = Date.parse(evaluatedAt);
  if (!Number.isFinite(then) || !Number.isFinite(now)) return Infinity;
  return Math.max(0, (now - then) / DAY);
}

function evidenceQuality(item: CiteEvidence): number {
  const hasPublicSource = validUrl(item.sourceUrl);
  const source = hasPublicSource ? SOURCE_WEIGHT[item.sourceTier] : Math.min(0.25, SOURCE_WEIGHT[item.sourceTier]);
  return STATUS_WEIGHT[item.status] * source;
}

function normalizeFieldValue(field: string, value: string): string {
  const cleaned = value.toLowerCase().replace(/®|™/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  if (field === "license" || field === "responsible_broker_license") {
    return cleaned.replace(/\s+/g, "");
  }
  if (field === "name") return cleaned.split(/\s+/).sort().join(" ");
  return cleaned.replace(/\b(?:incorporated|corporation)\b/g, "inc").replace(/\s+/g, " ").trim();
}

function sourceStatus(profile?: CiteAgentProfile | null): CiteEvidenceStatus {
  return profile?.dataSource === "website" && validUrl(profile.website)
    ? "published"
    : "declared";
}

function autoEvidence(profile: CiteAgentProfile | null | undefined, properties: CiteProperty[], evaluatedAt: string): CiteEvidence[] {
  const items: CiteEvidence[] = [];
  const site = canonicalUrl(profile);
  const status = sourceStatus(profile);
  const observedAt = profile?.lastWebsiteScrapeAt || profile?.onboardedAt;

  const addProfile = (field: string, value: string | undefined, label: string, subject: CiteEvidence["subject"] = "agent") => {
    items.push({
      id: `profile:${field}`,
      subject,
      field,
      value: value?.trim() || "Unknown",
      sourceLabel: site ? `${label} on agent website` : `${label} in workspace profile`,
      sourceTier: site ? "first_party" : "user",
      status: value ? status : "unknown",
      sourceUrl: site,
      observedAt,
    });
  };

  addProfile("name", profile?.name, "Name");
  addProfile("license", profile?.license, "License");
  addProfile("responsible_broker", profile?.responsibleBrokerName || profile?.brokerage, "Responsible broker", "brokerage");
  addProfile("responsible_broker_license", profile?.responsibleBrokerLicense, "Responsible broker license", "brokerage");
  addProfile("brokerage_brand", profile?.brokerageBrand || profile?.brokerage, "Brokerage brand", "brokerage");
  addProfile("service_area", profile?.areaOfOperations, "Service area", "market");
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
      sourceLabel: "Linked public profile",
      sourceTier: "first_party",
      status: "published",
      sourceUrl: sameAs,
      observedAt,
    });
  }

  for (const property of properties) {
    const source = property.source;
    const level = source?.evidenceLevel;
    const statusForListing: CiteEvidenceStatus =
      level === "provider_verified"
        ? "verified"
        : level === "site_published"
          ? "published"
          : level === "user_declared"
            ? "declared"
            : "unknown";
    const tier: CiteSourceTier = source?.kind === "mls" ? "mls" : source?.kind === "website" ? "first_party" : "user";
    items.push({
      id: `listing:${property.id}:facts`,
      subject: "listing",
      field: "listing",
      value: `${property.title} · ${property.status}`,
      sourceLabel: source?.provider || (source?.kind === "website" ? "Agent website" : "Workspace listing"),
      sourceTier: tier,
      status: statusForListing,
      sourceUrl: source?.url,
      observedAt: source?.modifiedAt || source?.observedAt,
    });
    const role = property.representation?.role ||
      (property.listingSide === "mine" ? "listing" : "unknown");
    const roleVerified =
      level === "provider_verified" &&
      (role === "listing" || role === "co_listing") &&
      Boolean(property.representation?.matchedAgentId || property.representation?.matchedAgentName);
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

function findConflicts(items: CiteEvidence[]): CiteConflict[] {
  const critical = new Set(["name", "license", "responsible_broker", "responsible_broker_license"]);
  const conflictFields = [
    "name",
    "license",
    "responsible_broker",
    "responsible_broker_license",
    "transaction_volume",
    "phone",
  ];
  const conflicts: CiteConflict[] = [];
  for (const field of conflictFields) {
    const candidates = fieldEvidence(items, field).filter(
      (item) => validUrl(item.sourceUrl) && evidenceQuality(item) >= 0.3 && item.value !== "Unknown",
    );
    const grouped = new Map<string, CiteEvidence[]>();
    for (const item of candidates) {
      const key = normalizeFieldValue(field, item.value);
      if (!key) continue;
      grouped.set(key, [...(grouped.get(key) || []), item]);
    }
    if (grouped.size <= 1) continue;
    const all = [...grouped.values()].flat();
    conflicts.push({
      id: `conflict:${field}`,
      field,
      values: [...grouped.values()].map((group) => group[0]!.value),
      evidenceIds: all.map((item) => item.id),
      severity: critical.has(field) || field === "transaction_volume" ? "blocking" : "warning",
      message:
        field === "transaction_volume"
          ? "Published production figures disagree. Keep the periods and methodologies separate until a human verifies them."
          : `Public sources disagree about ${field.replace(/_/g, " ")}.`,
    });
  }
  return conflicts;
}

function representedInventory(properties: CiteProperty[], evaluatedAt: string) {
  const claimed = properties.filter(
    (property) =>
      (property.status === "active" || property.status === "coming_soon") &&
      property.listingSide === "mine",
  );
  const verified = claimed.filter((property) => {
    const role = property.representation?.role;
    const providerVerified = property.source?.evidenceLevel === "provider_verified";
    const roleVerified = role === "listing" || role === "co_listing";
    const matched = Boolean(property.representation?.matchedAgentId || property.representation?.matchedAgentName);
    const current = daysOld(
      property.representation?.verifiedAt || property.source?.modifiedAt || property.source?.observedAt,
      evaluatedAt,
    ) <= 30;
    return providerVerified && roleVerified && matched && current;
  });
  const publishable = verified.filter(
    (property) => property.visibility !== "private" && property.visibility !== "suppressed" && validUrl(property.source?.url),
  );
  return { claimed, verified, publishable };
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

function buildQueries(profile: CiteAgentProfile | null | undefined, evidence: CiteEvidence[], inventory: ReturnType<typeof representedInventory>): CiteQuery[] {
  const name = profile?.name || "this real estate professional";
  const area = profile?.areaOfOperations || "their market";
  const identityIds = [bestEvidence(evidence, "name")?.id, bestEvidence(evidence, "license")?.id].filter(Boolean) as string[];
  const brokerIds = [bestEvidence(evidence, "responsible_broker")?.id, bestEvidence(evidence, "responsible_broker_license")?.id].filter(Boolean) as string[];
  const areaIds = fieldEvidence(evidence, "service_area").map((item) => item.id);
  const identityReady = evidenceQuality(bestEvidence(evidence, "license") || ({ status: "unknown", sourceTier: "user" } as CiteEvidence)) >= 0.8;
  const brokerReady = evidenceQuality(bestEvidence(evidence, "responsible_broker") || ({ status: "unknown", sourceTier: "user" } as CiteEvidence)) >= 0.8;
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

function buildAnswers(profile: CiteAgentProfile | null | undefined, evidence: CiteEvidence[], inventory: ReturnType<typeof representedInventory>): AieoFaq[] {
  const name = profile?.name || "This real estate professional";
  const area = profile?.areaOfOperations || "the stated service area";
  const license = bestEvidence(evidence, "license");
  const broker = bestEvidence(evidence, "responsible_broker");
  const areaEvidence = bestEvidence(evidence, "service_area");
  const licenseVerified = Boolean(license && evidenceQuality(license) >= 0.8);
  const brokerVerified = Boolean(broker && evidenceQuality(broker) >= 0.8);
  const areaSupported = Boolean(areaEvidence && evidenceQuality(areaEvidence) >= 0.5);
  const identityEvidence = [license?.id, broker?.id].filter(Boolean) as string[];
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
    answers.push({
      question: `Which active listings does ${name} represent?`,
      answer: `${inventory.publishable.length} active listing${inventory.publishable.length === 1 ? " is" : "s are"} supported by current provider evidence. Cite each source and re-check status before publishing.`,
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

function buildJsonLd(profile: CiteAgentProfile | null | undefined): Record<string, unknown> {
  const url = canonicalUrl(profile);
  if (!url || !profile?.name) return { "@context": "https://schema.org", "@graph": [] };
  const personId = `${url}#person`;
  const brokerId = `${url}#responsible-broker`;
  const brokerName = profile.responsibleBrokerName || profile.brokerage;
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
      name: profile.name,
      url,
      jobTitle: profile.title,
      image: profile.photoUrl,
      telephone: profile.phone,
      email: profile.email,
      sameAs: (profile.sameAs || []).filter(validUrl),
      worksFor: brokerName ? { "@id": brokerId } : undefined,
      hasCredential: profile.license
        ? {
            "@type": "EducationalOccupationalCredential",
            identifier: profile.license,
            credentialCategory: `${profile.licenseJurisdiction || "Real estate"} license`,
          }
        : undefined,
      knowsAbout: profile.serviceAreas?.length ? profile.serviceAreas.map((area) => area.name) : profile.areaOfOperations,
    },
    {
      "@type": "WebSite",
      "@id": `${url}#website`,
      url,
      name: `${profile.name} website`,
      about: { "@id": personId },
    },
  ];
  if (brokerName) {
    graph.push({
      "@type": "Organization",
      "@id": brokerId,
      name: brokerName,
      alternateName: profile.brokerageBrand || profile.brokerage,
      url: profile.brokerageUrl,
      identifier: profile.responsibleBrokerLicense,
      employee: { "@id": personId },
    });
  }
  return cleanObject({ "@context": "https://schema.org", "@graph": graph });
}

function aggregateRecognition(runs: AieoInput["recognitionRuns"]): CiteRecognition | null {
  if (!runs?.length) return null;
  const pct = (count: number) => Math.round((count / runs.length) * 100);
  const providers = [...new Set(runs.map((run) => run.provider))].sort();
  const queries = new Set(runs.map((run) => run.queryId));
  return {
    state:
      runs.length >= 18 && providers.length >= 3 && queries.size >= 3
        ? "measured"
        : "insufficient",
    runs: runs.length,
    providers,
    mentionRate: pct(runs.filter((run) => run.mentioned).length),
    citationRate: pct(runs.filter((run) => run.cited).length),
    identityAccuracy: pct(runs.filter((run) => run.correctIdentity).length),
    brokerageAccuracy: pct(runs.filter((run) => run.correctBrokerage).length),
    observedAt: [...runs].sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0]!.observedAt,
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
  ]);
  const conflicts = findConflicts(evidence);
  const inventory = representedInventory(properties, evaluatedAt);
  const coverage = evidenceCoverage(evidence, inventory.claimed.length > 0);
  const queryPlan = buildQueries(input.profile, evidence, inventory);
  const faqs = buildAnswers(input.profile, evidence, inventory);
  const audit = input.profile?.siteAudit;
  const auditAge = daysOld(audit?.observedAt, evaluatedAt);
  const licenseEvidence = bestEvidence(evidence, "license");
  const brokerEvidence = bestEvidence(evidence, "responsible_broker");
  const nameEvidence = bestEvidence(evidence, "name");
  const serviceEvidence = bestEvidence(evidence, "service_area");
  const publicProfiles = fieldEvidence(evidence, "public_profile");
  const authoritative = evidence.filter(
    (item) => validUrl(item.sourceUrl) && evidenceQuality(item) >= 0.75,
  );
  const publicSourceCount = new Set(authoritative.map((item) => item.sourceUrl)).size;
  const localSources = evidence.filter(
    (item) => (item.field === "service_area" || item.field === "local_expertise") && evidenceQuality(item) >= 0.5,
  );
  const verifiedNeighborhoods = new Set(
    inventory.verified.map((property) => property.neighborhood || property.city).filter(Boolean),
  );
  const structuredAreas = input.profile?.serviceAreas || [];
  const rules: CiteRuleResult[] = [
    rule("identity.canonical", "identity", "Canonical person page", canonicalUrl(input.profile) ? 5 : 0, 5, canonicalUrl(input.profile) ? "A stable public profile URL is present." : "Add a canonical public profile URL.", nameEvidence ? [nameEvidence.id] : []),
    rule("identity.license", "identity", "Regulator-backed license", licenseEvidence?.sourceTier === "regulator" && evidenceQuality(licenseEvidence) >= 0.9 ? 8 : licenseEvidence && evidenceQuality(licenseEvidence) >= 0.5 ? 3 : 0, 8, licenseEvidence?.sourceTier === "regulator" ? "License is linked to a regulator source." : "The license is not yet regulator-verified.", licenseEvidence ? [licenseEvidence.id] : []),
    rule("identity.broker", "identity", "Responsible broker relationship", brokerEvidence && evidenceQuality(brokerEvidence) >= 0.8 ? 7 : brokerEvidence && evidenceQuality(brokerEvidence) >= 0.5 ? 3 : 0, 7, brokerEvidence && evidenceQuality(brokerEvidence) >= 0.8 ? "Affiliation is supported by a strong public source." : "Verify the responsible broker, legal name, and license.", brokerEvidence ? [brokerEvidence.id] : []),
    rule("identity.corroboration", "identity", "Identity corroboration", Math.min(5, Math.max(publicSourceCount, publicProfiles.length) * 2), 5, `${publicSourceCount} authoritative public source${publicSourceCount === 1 ? "" : "s"} support the identity graph.`, authoritative.map((item) => item.id)),

    rule("evidence.coverage", "evidence", "Core claim provenance", Math.round(coverage * 0.1), 10, `${coverage}% of core claims are supported at their current evidence quality.`, CORE_FIELDS.flatMap((field) => fieldEvidence(evidence, field).map((item) => item.id))),
    rule("evidence.authority", "evidence", "Authoritative source diversity", Math.min(6, publicSourceCount * 2), 6, `${publicSourceCount} distinct authoritative source${publicSourceCount === 1 ? "" : "s"} found.`, authoritative.map((item) => item.id)),
    rule("evidence.listing_truth", "evidence", "Representation truth", inventory.claimed.length === 0 && evidence.some((item) => item.status !== "unknown") ? 4 : inventory.claimed.length ? Math.round((inventory.verified.length / inventory.claimed.length) * 4) : 0, 4, inventory.claimed.length ? `${inventory.verified.length}/${inventory.claimed.length} claimed active listings have current provider-backed role evidence.` : "No represented-inventory claim is being made.", inventory.claimed.flatMap((property) => [`listing:${property.id}:facts`, `listing:${property.id}:role`])),

    rule("local.structure", "local", "Structured service area", structuredAreas.length ? Math.min(6, 3 + structuredAreas.length) : input.profile?.areaOfOperations ? 3 : 0, 6, structuredAreas.length ? `${structuredAreas.length} structured place entit${structuredAreas.length === 1 ? "y" : "ies"} supplied.` : "Convert the free-text market into city, county, state, and neighborhood entities.", serviceEvidence ? [serviceEvidence.id] : []),
    rule("local.public", "local", "Public local evidence", Math.min(6, localSources.length * 3), 6, `${localSources.length} public local-evidence source${localSources.length === 1 ? "" : "s"} found.`, localSources.map((item) => item.id)),
    rule("local.footprint", "local", "Verified market footprint", verifiedNeighborhoods.size >= 3 ? 6 : verifiedNeighborhoods.size ? 3 : 0, 6, `${verifiedNeighborhoods.size} place entit${verifiedNeighborhoods.size === 1 ? "y is" : "ies are"} tied to provider-verified representation.`, inventory.verified.map((property) => `listing:${property.id}:role`)),

    rule("answers.bio", "answers", "Visible expert profile", input.profile?.bio && input.profile.bio.length >= 160 && canonicalUrl(input.profile) ? 4 : input.profile?.bio && input.profile.bio.length >= 80 ? 2 : 0, 4, input.profile?.bio ? "Profile copy is present; keep factual claims source-linked." : "Publish a factual, first-hand profile with visible disclosures.", nameEvidence ? [nameEvidence.id] : []),
    rule("answers.pack", "answers", "Source-backed answer pack", Math.round((faqs.filter((faq) => faq.publishable).length / Math.max(3, faqs.length)) * 6), 6, `${faqs.filter((faq) => faq.publishable).length}/${faqs.length} generated answers currently have sufficient source support.`, faqs.flatMap((faq) => faq.evidenceIds)),
    rule("answers.intent", "answers", "Intent coverage", Math.round((queryPlan.filter((query) => query.readiness === "ready").length / queryPlan.length) * 5), 5, `${queryPlan.filter((query) => query.readiness === "ready").length}/${queryPlan.length} pilot prompts are evidence-ready.`, queryPlan.flatMap((query) => query.evidenceIds)),

    rule("technical.reachable", "technical", "Public and server-visible", audit?.homePage.httpOk && audit.homePage.serverRenderedIdentity ? 3 : audit?.homePage.httpOk ? 1 : 0, 3, audit ? "Homepage reachability and server-visible identity were audited." : "Run a live site audit; workspace fields do not prove public retrievability.", []),
    rule("technical.indexable", "technical", "Canonical and indexable", audit?.homePage.canonical && audit.homePage.indexable ? 3 : audit?.homePage.indexable ? 1 : 0, 3, audit?.homePage.indexable === false ? "The public profile is marked noindex or otherwise blocked." : audit ? "Canonical/indexability signals were inspected." : "Indexability is not measured.", []),
    rule("technical.schema", "technical", "Person–brokerage schema graph", audit?.homePage.schemaTypes.includes("Person") && (audit.homePage.schemaTypes.includes("Organization") || audit.homePage.schemaTypes.includes("RealEstateAgent")) ? 3 : 0, 3, audit?.homePage.schemaTypes.length ? `Observed schema types: ${audit.homePage.schemaTypes.join(", ")}.` : "No deployed Person + brokerage graph has been observed.", []),
    rule("technical.crawlers", "technical", "Sitemap and search crawler access", audit?.sitemap === "present" && audit.botAccess.oaiSearchBot === "allowed" && audit.botAccess.perplexityBot === "allowed" ? 3 : audit?.sitemap === "present" ? 1 : 0, 3, audit ? "Search-bot access is scored separately from model-training crawlers." : "Sitemap and search-bot access are not measured.", []),

    rule("freshness.audit", "freshness", "Recent live audit", auditAge <= 7 ? 3 : auditAge <= 30 ? 2 : 0, 3, Number.isFinite(auditAge) ? `Last live audit was ${Math.floor(auditAge)} day(s) ago.` : "No dated live audit exists.", []),
    rule("freshness.sources", "freshness", "Current authoritative evidence", authoritative.length ? Math.round((authoritative.filter((item) => daysOld(item.observedAt, evaluatedAt) <= 90).length / authoritative.length) * 4) : 0, 4, authoritative.length ? "Authoritative evidence is evaluated against its observation date." : "No dated authoritative evidence exists.", authoritative.map((item) => item.id)),
    rule("freshness.consistency", "freshness", "Conflict and renewal watch", evidence.some((item) => item.status !== "unknown") && conflicts.length === 0 ? 3 : conflicts.some((conflict) => conflict.severity === "blocking") ? 0 : conflicts.length ? 1 : 0, 3, conflicts.length ? `${conflicts.length} public conflict${conflicts.length === 1 ? "" : "s"} need review.` : "No public-source conflict is currently detected.", conflicts.flatMap((conflict) => conflict.evidenceIds)),
  ];

  const unsupportedListings = inventory.claimed.filter((property) => !inventory.verified.includes(property));
  const gates: CiteGate[] = [
    { id: "canonical", label: "Canonical public profile", status: canonicalUrl(input.profile) ? "pass" : "block", reason: canonicalUrl(input.profile) ? "A stable public URL is available." : "No valid canonical public profile URL.", evidenceIds: nameEvidence ? [nameEvidence.id] : [] },
    { id: "identity-conflict", label: "Identity and claim conflicts", status: conflicts.some((conflict) => conflict.severity === "blocking") ? "block" : conflicts.length ? "warn" : "pass", reason: conflicts.length ? `${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"} require human resolution.` : "No conflicting high-quality sources detected.", evidenceIds: conflicts.flatMap((conflict) => conflict.evidenceIds) },
    { id: "license", label: "License verification", status: licenseEvidence?.sourceTier === "regulator" && evidenceQuality(licenseEvidence) >= 0.9 ? "pass" : "warn", reason: licenseEvidence?.sourceTier === "regulator" ? "License is regulator-backed." : "License remains self-published or unverified.", evidenceIds: licenseEvidence ? [licenseEvidence.id] : [] },
    { id: "listing-role", label: "Listing representation", status: unsupportedListings.length ? "block" : "pass", reason: unsupportedListings.length ? `${unsupportedListings.length} active represented-listing claim${unsupportedListings.length === 1 ? " lacks" : "s lack"} current provider role evidence.` : "No unsupported active representation claim is publishable.", evidenceIds: unsupportedListings.map((property) => `listing:${property.id}:role`) },
    { id: "indexability", label: "Indexability", status: audit?.homePage.indexable === false ? "block" : audit ? "pass" : "unknown", reason: audit?.homePage.indexable === false ? "The public profile is not indexable." : audit ? "The audited homepage is indexable." : "A live site audit has not measured indexability.", evidenceIds: [] },
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
  const publishReady = !blocked && coverage >= 70 && Boolean(audit?.homePage.httpOk && audit.homePage.indexable);
  const status: AieoScore["readiness"]["status"] = blocked ? "blocked" : publishReady ? "publish_ready" : "unverified";
  const grade = gatedGrade(total, status);
  const confidence = Math.round(
    evidence.length
      ? (evidence.reduce((sum, item) => sum + evidenceQuality(item), 0) / evidence.length) * 100
      : 0,
  );

  const actions: CiteAction[] = rules
    .filter((item) => item.earned < item.max)
    .map<CiteAction>((item) => ({
      id: `action:${item.id}`,
      pillar: item.pillar,
      severity: gates.some((gate) => gate.status === "block" && gate.id.includes(item.pillar)) ? "blocking" : item.max - item.earned >= 5 ? "high" : item.max - item.earned >= 3 ? "medium" : "low",
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
    return {
      id: property.id,
      title: property.title,
      blurb: `${property.title} is an active property${location ? ` in ${location}` : ""}${property.price ? ` offered at $${property.price.toLocaleString()}` : ""}. Provider evidence identifies ${input.profile?.name || "the agent"} in a ${role} role as of ${verifiedAt.slice(0, 10)}. Verify current status at the cited source.`,
      sourceUrl: property.source!.url!,
      evidenceIds: [`listing:${property.id}:facts`, `listing:${property.id}:role`],
      verifiedAt,
    };
  });
  const recognition = aggregateRecognition(input.recognitionRuns);
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
    jsonLd: buildJsonLd(input.profile),
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
