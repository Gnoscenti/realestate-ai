import { createHash } from "node:crypto";
import type { WebsiteScrapeResult } from "@/lib/website-scrape";
import { scrapeRealtorWebsite } from "@/lib/scrape-site.server";
import { verifyCaDreIdentity } from "./ca-dre.server";
import { listingClaimKeys, listingPriceClaimScope } from "./provenance";
import type { CiteEvidence } from "./types";
import type {
  CiteLockScanInput,
  CiteLockScanRecord,
  CiteSourceOutcome,
} from "./scan-types";
import { sanitizeCiteLockPublicUrl } from "./scan-types";

type ScanDependencies = {
  now?: () => string;
  scanWebsite?: typeof scrapeRealtorWebsite;
  verifyCalifornia?: typeof verifyCaDreIdentity;
};

export function citeLockSubjectFingerprint(input: CiteLockScanInput): string {
  const website = new URL(input.website);
  website.hash = "";
  website.hostname = website.hostname.toLowerCase();
  website.searchParams.sort();
  if (website.pathname !== "/")
    website.pathname = website.pathname.replace(/\/+$/, "");
  const name = input.agentName
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
  const subject = JSON.stringify([
    website.toString(),
    name,
    input.license?.replace(/\D/g, "") || "",
    input.responsibleBrokerLicense?.replace(/\D/g, "") || "",
    input.jurisdiction,
  ]);
  return createHash("sha256").update(subject).digest("hex");
}

function siteEvidence(
  scrape: WebsiteScrapeResult,
  observedAt: string,
): CiteEvidence[] {
  const sourceUrl =
    sanitizeCiteLockPublicUrl(scrape.finalUrl || scrape.sourceUrl);
  const identityObserved = Boolean(
    scrape.siteAudit?.homePage.serverRenderedIdentity,
  );
  const items: CiteEvidence[] = [
    {
      id: "site:website",
      subject: "agent",
      field: "website",
      value: sourceUrl,
      sourceLabel: "Agent website",
      sourceTier: "first_party",
      status: "published",
      sourceUrl,
      observedAt,
    },
  ];
  const add = (
    id: string,
    field: string,
    value: string | undefined,
    subject: CiteEvidence["subject"] = "agent",
    evidenceUrl = sourceUrl,
  ) => {
    if (!value) return;
    items.push({
      id,
      subject,
      field,
      value,
      sourceLabel: "Person-bound agent website page",
      sourceTier: "first_party",
      status: "published",
      sourceUrl: evidenceUrl,
      observedAt,
    });
  };

  const observations = scrape.profileObservations?.length
    ? scrape.profileObservations
    : identityObserved
      ? [{ sourceUrl, profile: scrape.profile }]
      : [];
  for (const [observationIndex, observation] of observations.entries()) {
    const observationUrl =
      sanitizeCiteLockPublicUrl(observation.sourceUrl) || sourceUrl;
    const prefix = `site:profile:${observationIndex}`;
    add(`${prefix}:name`, "name", observation.profile.name, "agent", observationUrl);
    add(`${prefix}:phone`, "phone", observation.profile.phone, "agent", observationUrl);
    add(`${prefix}:email`, "email", observation.profile.email, "agent", observationUrl);
    add(
      `${prefix}:brokerage-brand`,
      "brokerage_brand",
      observation.profile.brokerageBrand || observation.profile.brokerage,
      "brokerage",
      observationUrl,
    );
    for (const [index, url] of (observation.profile.sameAs || []).entries()) {
      const publicProfileUrl = sanitizeCiteLockPublicUrl(url);
      if (!publicProfileUrl) continue;
      add(
        `${prefix}:public-profile:${index}`,
        "public_profile",
        publicProfileUrl,
        "agent",
        observationUrl,
      );
    }
  }

  if (observations.length) {
    for (const [index, claim] of (scrape.claims || []).entries()) {
      const claimUrl = sanitizeCiteLockPublicUrl(claim.sourceUrl) || sourceUrl;
      items.push({
        id: `site:claim:${claim.claimScope}:${index}`,
        subject: "agent",
        field: claim.field,
        value: claim.value,
        claimScope: claim.claimScope,
        sourceLabel: "Agent website",
        sourceTier: "first_party",
        status: "published",
        sourceUrl: claimUrl,
        observedAt,
      });
    }
  }

  // Listing cards are status/price observations only. They never prove that
  // the submitted person represents the property.
  for (const [index, listing] of scrape.listings.entries()) {
    const listingUrl = sanitizeCiteLockPublicUrl(listing.url || "");
    const listingKeys = listingClaimKeys({
      mlsNumber: listing.mlsNumber,
      address: listing.address,
      city: listing.city,
      url: listingUrl,
    });
    if (!listingKeys.length) continue;
    const evidenceUrl =
      sanitizeCiteLockPublicUrl(listing.sourceUrl || "") ||
      listingUrl ||
      sourceUrl;
    const transactionType = listing.transactionType || "unknown";
    const pricePeriod = listing.pricePeriod || "unknown";
    for (const [aliasIndex, listingKey] of listingKeys.entries()) {
      items.push({
        id: `site:listing:${index}:status:${aliasIndex}`,
        subject: "listing",
        field: "listing_status",
        value: listing.status,
        claimScope: listingKey,
        sourceLabel: "Agent website listing observation",
        sourceTier: "first_party",
        status: "published",
        sourceUrl: evidenceUrl,
        observedAt,
      });
      items.push({
        id: `site:listing:${index}:transaction:${aliasIndex}`,
        subject: "listing",
        field: "listing_transaction",
        value: `${transactionType}:${pricePeriod}`,
        claimScope: listingKey,
        sourceLabel: "Agent website listing observation",
        sourceTier: "first_party",
        status: "published",
        sourceUrl: evidenceUrl,
        observedAt,
      });
      if (listing.price > 0) {
        items.push({
          id: `site:listing:${index}:price:${aliasIndex}`,
          subject: "listing",
          field: "listing_price",
          value: `${listing.price}:${transactionType}:${pricePeriod}`,
          claimScope: listingPriceClaimScope(
            listingKey,
            transactionType,
            pricePeriod,
          ),
          sourceLabel: "Agent website listing observation",
          sourceTier: "first_party",
          status: "published",
          sourceUrl: evidenceUrl,
          observedAt,
        });
      }
    }
  }
  return items;
}

export async function executeCiteLockScan(
  input: CiteLockScanInput,
  dependencies: ScanDependencies = {},
): Promise<Omit<CiteLockScanRecord, "id">> {
  const evaluatedAt = (dependencies.now || (() => new Date().toISOString()))();
  const scanWebsite = dependencies.scanWebsite || scrapeRealtorWebsite;
  const verifyCalifornia = dependencies.verifyCalifornia || verifyCaDreIdentity;
  const scrape = await scanWebsite({
    website: input.website,
    agentNameHint: input.agentName,
    maxPages: 5,
  });
  const personBoundProfile =
    scrape.profileObservations?.[0]?.profile ||
    (scrape.siteAudit?.homePage.serverRenderedIdentity ? scrape.profile : {});
  const safePhotoUrl = (() => {
    if (!personBoundProfile.photoUrl) return undefined;
    const sanitized = sanitizeCiteLockPublicUrl(personBoundProfile.photoUrl);
    if (!sanitized) return undefined;
    try {
      return new URL(sanitized).search ===
        new URL(personBoundProfile.photoUrl).search
        ? sanitized
        : undefined;
    } catch {
      return undefined;
    }
  })();
  const submittedWebsite = sanitizeCiteLockPublicUrl(input.website);
  const finalWebsite = sanitizeCiteLockPublicUrl(
    scrape.finalUrl || input.website,
  );
  const storedWebsite =
    finalWebsite && finalWebsite.length <= 500
      ? finalWebsite
      : submittedWebsite;
  const storedSiteAudit = scrape.siteAudit
    ? {
        ...scrape.siteAudit,
        homePage: {
          ...scrape.siteAudit.homePage,
          url:
            sanitizeCiteLockPublicUrl(scrape.siteAudit.homePage.url) ||
            storedWebsite,
          canonical:
            sanitizeCiteLockPublicUrl(
              scrape.siteAudit.homePage.canonical || "",
            ) || undefined,
        },
      }
    : undefined;
  const evidence = scrape.ok ? siteEvidence(scrape, evaluatedAt) : [];
  const sourceOutcomes: CiteSourceOutcome[] = [
    {
      source: "website",
      status: scrape.ok ? "observed" : "unavailable",
      label: scrape.ok
        ? `Website audited across ${scrape.pagesFetched.length} page(s)`
        : "Website audit did not produce usable public evidence",
      url:
        sanitizeCiteLockPublicUrl(scrape.finalUrl || scrape.sourceUrl) ||
        undefined,
      code: scrape.ok ? undefined : "website_unavailable",
    },
  ];

  // Prefer the submitted credential. If the site publishes a different one,
  // both evidence items remain in the ledger and the scoring layer blocks the
  // conflict instead of silently switching identities.
  const license = input.license || personBoundProfile.license;
  if (input.jurisdiction === "US-CA" && license) {
    const verified = await verifyCalifornia({
      license,
      expectedName: input.agentName,
      claimedBrokerLicense:
        personBoundProfile.responsibleBrokerLicense ||
        input.responsibleBrokerLicense,
      observedAt: evaluatedAt,
    });
    evidence.push(...verified.evidence);
    sourceOutcomes.push(...verified.outcomes);
  } else if (input.jurisdiction === "US-CA") {
    sourceOutcomes.push({
      source: "regulator",
      status: "unavailable",
      label: "A California DRE license number is required for verification",
      code: "license_missing",
    });
  } else {
    sourceOutcomes.push({
      source: "regulator",
      status: "unsupported",
      label: `${input.jurisdiction} registry verification is not active in the San Diego pilot`,
      code: "jurisdiction_unsupported",
    });
  }

  return {
    subjectFingerprint: citeLockSubjectFingerprint(input),
    website: storedWebsite,
    jurisdiction: input.jurisdiction,
    evaluatedAt,
    evidence,
    siteAudit: storedSiteAudit,
    profilePatch: {
      name: scrape.siteAudit?.homePage.serverRenderedIdentity
        ? input.agentName
        : undefined,
      phone: scrape.siteAudit?.homePage.serverRenderedIdentity
        ? personBoundProfile.phone
        : undefined,
      email: scrape.siteAudit?.homePage.serverRenderedIdentity
        ? personBoundProfile.email
        : undefined,
      photoUrl: scrape.siteAudit?.homePage.serverRenderedIdentity
        ? safePhotoUrl
        : undefined,
      license,
      licenseJurisdiction: input.jurisdiction,
      responsibleBrokerName: scrape.siteAudit?.homePage.serverRenderedIdentity
        ? personBoundProfile.responsibleBrokerName
        : undefined,
      responsibleBrokerLicense:
        scrape.siteAudit?.homePage.serverRenderedIdentity
          ? personBoundProfile.responsibleBrokerLicense
          : undefined,
      brokerageBrand:
        scrape.siteAudit?.homePage.serverRenderedIdentity
          ? personBoundProfile.brokerageBrand || personBoundProfile.brokerage
          : undefined,
      bio: scrape.siteAudit?.homePage.serverRenderedIdentity
        ? personBoundProfile.bio
        : undefined,
      officeAddress: scrape.siteAudit?.homePage.serverRenderedIdentity
        ? personBoundProfile.address
        : undefined,
      sameAs: scrape.siteAudit?.homePage.serverRenderedIdentity
        ? personBoundProfile.sameAs
            ?.map(sanitizeCiteLockPublicUrl)
            .filter(Boolean)
        : undefined,
      canonicalProfileUrl:
        sanitizeCiteLockPublicUrl(
          scrape.siteAudit?.homePage.canonical || scrape.finalUrl || "",
        ) || undefined,
      siteAudit: storedSiteAudit,
    },
    sourceOutcomes,
  };
}
