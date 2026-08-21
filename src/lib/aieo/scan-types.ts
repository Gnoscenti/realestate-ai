import { z } from "zod";
import type { CiteAgentProfile, SiteAuditSnapshot } from "./provenance";
import type { CiteEvidence } from "./types";

export const US_JURISDICTIONS = [
  "US-AL", "US-AK", "US-AZ", "US-AR", "US-CA", "US-CO", "US-CT",
  "US-DE", "US-DC", "US-FL", "US-GA", "US-HI", "US-ID", "US-IL",
  "US-IN", "US-IA", "US-KS", "US-KY", "US-LA", "US-ME", "US-MD",
  "US-MA", "US-MI", "US-MN", "US-MS", "US-MO", "US-MT", "US-NE",
  "US-NV", "US-NH", "US-NJ", "US-NM", "US-NY", "US-NC", "US-ND",
  "US-OH", "US-OK", "US-OR", "US-PA", "US-RI", "US-SC", "US-SD",
  "US-TN", "US-TX", "US-UT", "US-VT", "US-VA", "US-WA", "US-WV",
  "US-WI", "US-WY",
] as const;

export type CiteJurisdiction = (typeof US_JURISDICTIONS)[number];

const JURISDICTION_NAMES: Record<CiteJurisdiction, string> = {
  "US-AL": "Alabama", "US-AK": "Alaska", "US-AZ": "Arizona",
  "US-AR": "Arkansas", "US-CA": "California", "US-CO": "Colorado",
  "US-CT": "Connecticut", "US-DE": "Delaware",
  "US-DC": "District of Columbia", "US-FL": "Florida",
  "US-GA": "Georgia", "US-HI": "Hawaii", "US-ID": "Idaho",
  "US-IL": "Illinois", "US-IN": "Indiana", "US-IA": "Iowa",
  "US-KS": "Kansas", "US-KY": "Kentucky", "US-LA": "Louisiana",
  "US-ME": "Maine", "US-MD": "Maryland", "US-MA": "Massachusetts",
  "US-MI": "Michigan", "US-MN": "Minnesota", "US-MS": "Mississippi",
  "US-MO": "Missouri", "US-MT": "Montana", "US-NE": "Nebraska",
  "US-NV": "Nevada", "US-NH": "New Hampshire", "US-NJ": "New Jersey",
  "US-NM": "New Mexico", "US-NY": "New York",
  "US-NC": "North Carolina", "US-ND": "North Dakota", "US-OH": "Ohio",
  "US-OK": "Oklahoma", "US-OR": "Oregon", "US-PA": "Pennsylvania",
  "US-RI": "Rhode Island", "US-SC": "South Carolina",
  "US-SD": "South Dakota", "US-TN": "Tennessee", "US-TX": "Texas",
  "US-UT": "Utah", "US-VT": "Vermont", "US-VA": "Virginia",
  "US-WA": "Washington", "US-WV": "West Virginia",
  "US-WI": "Wisconsin", "US-WY": "Wyoming",
};

function isSensitiveQueryKey(key: string): boolean {
  const compact = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    /token|secret|signature|credential|password|passwd|authorization|session|jwt/.test(
      compact,
    ) ||
    /^(?:api|access|private)?key(?:id)?$/.test(compact) ||
    /^(?:auth|code|sig)$/.test(compact) ||
    /^(?:xamz|xgoog)/.test(compact)
  );
}

export function sanitizeCiteLockPublicUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.username = "";
    url.password = "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (isSensitiveQueryKey(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return "";
  }
}

const citeLockWebsiteSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .superRefine((value, context) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      context.addIssue({
        code: "custom",
        message: "Website must be a valid public URL",
      });
      return;
    }
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password
    ) {
      context.addIssue({
        code: "custom",
        message: "Website must use http or https without credentials",
      });
    }
    if ([...url.searchParams.keys()].some(isSensitiveQueryKey)) {
      context.addIssue({
        code: "custom",
        message: "Remove tokens, credentials, and signatures from the website URL",
      });
    }
  });

export const citeLockScanInputSchema = z.object({
  website: citeLockWebsiteSchema,
  agentName: z.string().trim().min(2).max(120),
  license: z.string().trim().regex(/^\d{6,12}$/).optional(),
  responsibleBrokerLicense: z
    .string()
    .trim()
    .regex(/^\d{6,12}$/)
    .optional(),
  jurisdiction: z.enum(US_JURISDICTIONS),
});

export type CiteLockScanInput = z.infer<typeof citeLockScanInputSchema>;

export type CiteSourceOutcome = {
  source: "website" | "regulator";
  status: "verified" | "observed" | "unsupported" | "unavailable" | "mismatch";
  label: string;
  url?: string;
  code?: string;
};

export type CiteLockScanRecord = {
  id: string;
  subjectFingerprint: string;
  website: string;
  jurisdiction: CiteJurisdiction;
  evaluatedAt: string;
  evidence: CiteEvidence[];
  siteAudit?: SiteAuditSnapshot;
  profilePatch: Partial<CiteAgentProfile>;
  sourceOutcomes: CiteSourceOutcome[];
};

export const JURISDICTION_LABELS: Record<CiteJurisdiction, string> =
  Object.fromEntries(
    US_JURISDICTIONS.map((code) => [
      code,
      code === "US-CA"
        ? "California (CA) — verified pilot adapter"
        : `${JURISDICTION_NAMES[code]} (${code.slice(3)}) — registry adapter pending`,
    ]),
  ) as Record<CiteJurisdiction, string>;
