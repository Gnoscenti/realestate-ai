import type { CiteAgentProfile, CiteProperty } from "@/lib/aieo/provenance";
import type { CiteEvidence } from "@/lib/aieo/types";

/**
 * Public-source acceptance snapshot for the San Diego pilot.
 *
 * The listing pages say "Listed by ... Julie Pierce", so listingSide records
 * that first-party claim. Representation intentionally stays unknown: a public
 * website/IDX page is not a server-owned MLS attestation and cannot mint trust.
 */
export const PILOT_AUDIT_AT = "2026-08-23T18:30:00.000-07:00";

const JULIE_SITE = "https://juliepiercecasey.com/";
const JULIE_DRE =
  "https://www2.dre.ca.gov/publicasp/pplinfo.asp?License_id=01224815";
const RESPONSIBLE_BROKER_DRE =
  "https://www2.dre.ca.gov/publicasp/pplinfo.asp?License_id=01767484";
const REALTRENDS =
  "https://www.realtrends.com/agent-profile/julie-pierce-casey-california/";

export const pilotProfile: CiteAgentProfile = {
  name: "Julie Pierce Casey",
  areaOfOperations: "Rancho Santa Fe and San Diego County",
  website: JULIE_SITE,
  canonicalProfileUrl: JULIE_SITE,
  mls: "SDMLS",
  brokerage: "Pacific Sotheby's International Realty",
  brokerageBrand: "Pacific Sotheby's International Realty",
  responsibleBrokerName: "Real Estate of the Pacific Inc",
  responsibleBrokerLicense: "01767484",
  officeAddress: "16915 Avenida de Acacias, Rancho Santa Fe, CA 92067",
  onboardedAt: "2026-08-19T00:00:00.000-07:00",
  lastWebsiteScrapeAt: PILOT_AUDIT_AT,
  dataSource: "website",
  phone: "858-382-6728",
  email: "Julie@RanchoSantaFeCA.com",
  license: "01224815",
  licenseJurisdiction: "California DRE",
  title: "Luxury Real Estate Advisor",
  bio: "Julie Pierce Casey is a Rancho Santa Fe luxury real estate advisor whose public profile describes more than 30 years in real estate, a California license issued in 1997, and work across San Diego County. CiteLock treats those first-party biography claims separately from regulator and independent evidence.",
  serviceAreas: [
    {
      name: "San Diego County",
      kind: "county",
      regionCode: "CA",
      countryCode: "US",
    },
    {
      name: "Rancho Santa Fe",
      kind: "community",
      regionCode: "CA",
      countryCode: "US",
    },
    {
      name: "Solana Beach",
      kind: "city",
      regionCode: "CA",
      countryCode: "US",
    },
    {
      name: "Escondido",
      kind: "city",
      regionCode: "CA",
      countryCode: "US",
    },
    {
      name: "Encinitas",
      kind: "city",
      regionCode: "CA",
      countryCode: "US",
    },
  ],
  sameAs: [
    REALTRENDS,
    "https://www.zillow.com/profile/Julie%20Pierce1",
  ],
  siteAudit: {
    observedAt: PILOT_AUDIT_AT,
    homePage: {
      url: JULIE_SITE,
      httpOk: true,
      canonical: JULIE_SITE,
      indexable: true,
      serverRenderedIdentity: true,
      schemaTypes: [],
    },
    sitemap: "unmeasured",
    robots: "unmeasured",
    botAccess: {
      oaiSearchBot: "unmeasured",
      perplexityBot: "unmeasured",
    },
  },
};

export const pilotEvidence: CiteEvidence[] = [
  {
    id: "site:website",
    subject: "agent",
    field: "website",
    value: JULIE_SITE,
    sourceLabel: "Julie Pierce Casey website",
    sourceTier: "first_party",
    status: "published",
    sourceUrl: JULIE_SITE,
    observedAt: PILOT_AUDIT_AT,
  },
  {
    id: "regulator:agent:name",
    subject: "agent",
    field: "name",
    value: "Casey, Julie Pierce",
    sourceLabel: "California Department of Real Estate",
    sourceTier: "regulator",
    status: "verified",
    sourceUrl: JULIE_DRE,
    observedAt: PILOT_AUDIT_AT,
  },
  {
    id: "regulator:agent:license",
    subject: "agent",
    field: "license",
    value: "01224815",
    sourceLabel: "California Department of Real Estate",
    sourceTier: "regulator",
    status: "verified",
    sourceUrl: JULIE_DRE,
    observedAt: PILOT_AUDIT_AT,
    validThrough: "2029-10-06",
    credentialStatus: "active",
    jurisdiction: "US-CA",
  },
  {
    id: "regulator:broker:name",
    subject: "brokerage",
    field: "responsible_broker",
    value: "Real Estate of the Pacific Inc",
    sourceLabel: "California Department of Real Estate",
    sourceTier: "regulator",
    status: "verified",
    sourceUrl: RESPONSIBLE_BROKER_DRE,
    observedAt: PILOT_AUDIT_AT,
  },
  {
    id: "regulator:broker:license",
    subject: "brokerage",
    field: "responsible_broker_license",
    value: "01767484",
    sourceLabel: "California Department of Real Estate",
    sourceTier: "regulator",
    status: "verified",
    sourceUrl: RESPONSIBLE_BROKER_DRE,
    observedAt: PILOT_AUDIT_AT,
    validThrough: "2026-10-14",
    credentialStatus: "active",
    jurisdiction: "US-CA",
    note: "Current LICENSED status; inside CiteLock's 90-day renewal window.",
  },
  {
    id: "site:brokerage-brand",
    subject: "brokerage",
    field: "brokerage_brand",
    value: "Pacific Sotheby's International Realty",
    sourceLabel: "Julie Pierce Casey website footer",
    sourceTier: "first_party",
    status: "published",
    sourceUrl: JULIE_SITE,
    observedAt: PILOT_AUDIT_AT,
    note: "Marketing brokerage/DBA; distinct from the legal responsible broker.",
  },
  {
    id: "independent:service-area",
    subject: "market",
    field: "service_area",
    value: "Rancho Santa Fe, California",
    sourceLabel: "RealTrends Verified",
    sourceTier: "independent",
    status: "verified",
    sourceUrl: REALTRENDS,
    observedAt: PILOT_AUDIT_AT,
  },
  {
    id: "site:volume:2025",
    subject: "agent",
    field: "transaction_volume",
    claimScope: "sales-volume:2025:full-year",
    value: "$44M in 2025",
    sourceLabel: "Julie Pierce Casey website",
    sourceTier: "first_party",
    status: "published",
    sourceUrl: "https://juliepiercecasey.com/about",
    observedAt: PILOT_AUDIT_AT,
  },
  {
    id: "site:volume:h1-2026",
    subject: "agent",
    field: "transaction_volume",
    claimScope: "sales-volume:2026:h1",
    value: "$56M in the first half of 2026",
    sourceLabel: "Julie Pierce Casey website",
    sourceTier: "first_party",
    status: "published",
    sourceUrl: "https://juliepiercecasey.com/about",
    observedAt: PILOT_AUDIT_AT,
  },
  {
    id: "independent:volume:2025",
    subject: "agent",
    field: "transaction_volume",
    claimScope: "sales-volume:2025:full-year",
    value: "$33.61M and 20 sides in 2025",
    sourceLabel: "RealTrends Verified",
    sourceTier: "independent",
    status: "verified",
    sourceUrl: REALTRENDS,
    observedAt: PILOT_AUDIT_AT,
    note: "Curated public-page acceptance input, not an automatic production adapter.",
  },
];

function websiteListing(input: {
  id: string;
  title: string;
  address: string;
  neighborhood: string;
  city: string;
  mlsNumber: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  yearBuilt: number;
  transactionType: "sale" | "lease";
  url: string;
}): CiteProperty {
  return {
    id: input.id,
    title: input.title,
    address: input.address,
    neighborhood: input.neighborhood,
    city: input.city,
    price: input.price,
    beds: input.beds,
    baths: input.baths,
    sqft: input.sqft,
    yearBuilt: input.yearBuilt,
    type: "house",
    status: "active",
    daysOnMarket: 0,
    features: [],
    description: "Website-observed listing for " + input.title + ".",
    // Mapping/presentation fields are neutral because the acceptance crawl did
    // not capture authoritative values for them.
    lat: 0,
    lng: 0,
    pricePerSqft: 0,
    estimatedValue: input.price,
    accent: "#5b8def",
    pattern: 1,
    mlsNumber: input.mlsNumber,
    listingSide: "mine",
    listAgentName: "Julie Pierce",
    source: {
      kind: "website",
      provider: "Julie Pierce Casey website",
      url: input.url,
      observedAt: PILOT_AUDIT_AT,
      evidenceLevel: "site_published",
    },
    representation: { role: "unknown" },
    visibility: "public",
    transactionType: input.transactionType,
    pricePeriod: input.transactionType === "lease" ? "month" : "total",
  };
}

export const pilotProperties: CiteProperty[] = [
  websiteListing({
    id: "779-barbara-ave",
    title: "779 Barbara Ave",
    address: "779 Barbara Ave, Solana Beach, CA 92075",
    neighborhood: "Solana Beach - Ocean View",
    city: "Solana Beach",
    mlsNumber: "250034643",
    price: 7_295_000,
    beds: 4,
    baths: 5,
    sqft: 4_570,
    yearBuilt: 2003,
    transactionType: "sale",
    url: "https://juliepiercecasey.com/properties/779-barbara-ave-solana-beach-ca-92075-250034643",
  }),
  websiteListing({
    id: "25950-kaywood-dr",
    title: "25950 Kaywood Dr",
    address: "25950 Kaywood Dr, Escondido, CA 92026",
    neighborhood: "North Escondido",
    city: "Escondido",
    mlsNumber: "260015992",
    price: 1_195_000,
    beds: 4,
    baths: 3,
    sqft: 2_422,
    yearBuilt: 1979,
    transactionType: "sale",
    url: "https://juliepiercecasey.com/properties/25950-kaywood-dr-escondido-ca-us-92026-260015992",
  }),
  websiteListing({
    id: "227-neptune-ave",
    title: "227 Neptune Ave",
    address: "227 Neptune Ave, Encinitas, CA 92024",
    neighborhood: "Leucadia",
    city: "Encinitas",
    mlsNumber: "260014528",
    price: 25_000,
    beds: 4,
    baths: 3,
    sqft: 2_734,
    yearBuilt: 2003,
    transactionType: "lease",
    url: "https://juliepiercecasey.com/properties/227-neptune-ave-encinitas-ca-us-92024-260014528",
  }),
];
