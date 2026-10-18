import { z } from "zod";
import type { AgentProfile } from "@/data/seed";
import { normalizeSiteUrl, realtorNamesMatch, type AgentPageDiscovery } from "@/lib/website-scrape";

export type OnboardingSourceKind = "website" | "brokerage_bio";
export interface OnboardingSource extends AgentPageDiscovery {
  id: string;
  kind: OnboardingSourceKind;
}

const text = (max: number) => z.string().trim().max(max);
const publicUrl = text(500)
  .refine((value) => !value || !!normalizeSiteUrl(value), "Enter a valid HTTP or HTTPS URL")
  .transform((value) => (value ? normalizeSiteUrl(value) : ""));

/** Only editable profile values may cross the browser-to-server save boundary. */
export const onboardingProfileFieldsSchema = z
  .object({
    name: text(120),
    website: publicUrl,
    areaOfOperations: text(240),
    mls: text(160),
    phone: text(40).optional(),
    email: text(320)
      .refine(
        (value) => !value || z.email().safeParse(value).success,
        "Enter a valid email address",
      )
      .optional(),
    photoUrl: publicUrl.optional(),
    brokerage: text(160).optional(),
    bio: text(8000).optional(),
    title: text(160).optional(),
    agentMlsId: text(120).optional(),
    license: text(120).optional(),
    licenseJurisdiction: text(120).optional(),
    sameAs: z.array(publicUrl).max(30).optional(),
    brokerageBioUrl: publicUrl.optional(),
  })
  .strict();
export type OnboardingProfileFields = z.infer<typeof onboardingProfileFieldsSchema>;
export type OnboardingProfile = AgentProfile &
  Pick<OnboardingProfileFields, "brokerageBioUrl" | "licenseJurisdiction" | "sameAs">;
export type OnboardingField = keyof OnboardingProfileFields;
export interface OnboardingConflict {
  field: OnboardingField;
  values: Array<{ value: string | string[]; sourceId: string; sourceUrl: string }>;
  keptValue?: string | string[];
}
export interface OnboardingSnapshot {
  workspaceId: string;
  /** Zero is a visible legacy core profile awaiting its first onboarding confirmation. */
  revision: number;
  profile: OnboardingProfile;
  sources: OnboardingSource[];
  conflicts: OnboardingConflict[];
  correctedFields: OnboardingField[];
}

export const onboardingScanInputSchema = z
  .object({
    kind: z.enum(["website", "brokerage_bio"]),
    url: publicUrl.refine(Boolean, "Enter a website or biography URL"),
    agentNameHint: text(120).optional(),
  })
  .strict();
export const onboardingConfirmationSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    scanIds: z
      .array(z.string().uuid())
      .max(2)
      .refine((ids) => new Set(ids).size === ids.length, "Select each scan once"),
    confirmedName: text(120).min(1, "Confirm your name"),
    overrides: onboardingProfileFieldsSchema.partial().optional(),
  })
  .strict();
export type OnboardingConfirmation = z.infer<typeof onboardingConfirmationSchema>;

/** Deliberately does not conflate initials, partial names, or different people. */
export function onboardingNamesMatch(left: string, right: string): boolean {
  const normalize = (name: string) =>
    name.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
  return realtorNamesMatch(left, right) || (!!left.trim() && normalize(left) === normalize(right));
}

const limits: Partial<Record<OnboardingField, number>> = {
  phone: 40,
  email: 320,
  photoUrl: 500,
  brokerage: 160,
  bio: 8000,
  title: 160,
  agentMlsId: 120,
  license: 120,
  licenseJurisdiction: 120,
  areaOfOperations: 240,
};

/** Shared preview/reconciliation; server repeats it over its own staged evidence.
 * Saved values (including deliberate blanks) always win until explicitly edited. */
export function buildOnboardingPreview(
  sources: OnboardingSource[],
  confirmedName: string,
  current?: OnboardingProfile | null,
): { profile: OnboardingProfileFields; conflicts: OnboardingConflict[] } {
  const profile: OnboardingProfileFields = {
    name: confirmedName.trim(),
    website: "",
    areaOfOperations: "",
    mls: "",
  };
  const preserved = new Set<OnboardingField>();
  // Old browser profiles predate the validated server contract. Keep each valid
  // field without allowing one malformed legacy link to break the review UI.
  if (current && onboardingNamesMatch(current.name, confirmedName)) {
    for (const key of Object.keys(onboardingProfileFieldsSchema.shape)) {
      const field = key as OnboardingField;
      const valid = onboardingProfileFieldsSchema.shape[field].safeParse(current[field]);
      // The older core contract stores empty strings as NULL. Its revision-zero
      // preview therefore has missing fields, not recorded intentional clears.
      if (
        valid.success &&
        valid.data !== undefined &&
        !(current.onboardingRevision === 0 && valid.data === "")
      ) {
        Object.assign(profile, { [field]: valid.data });
        preserved.add(field);
      }
    }
  }
  const observations = new Map<OnboardingField, OnboardingConflict["values"]>();
  const ordered = [...sources].sort(
    (a, b) =>
      (a.kind === "website" ? 0 : 1) - (b.kind === "website" ? 0 : 1) || a.id.localeCompare(b.id),
  );
  for (const source of ordered) {
    if (!source.ok) continue;
    for (const candidate of source.candidates.filter((item) =>
      onboardingNamesMatch(item.profile.name, confirmedName),
    )) {
      const p = candidate.profile;
      const proposed: Partial<OnboardingProfileFields> = {
        name: p.name,
        phone: p.phone,
        email: p.email,
        photoUrl: p.photoUrl,
        brokerage: p.brokerage,
        bio: p.bio,
        title: p.title,
        agentMlsId: p.mlsNumber,
        license: p.license,
        licenseJurisdiction: p.licenseJurisdiction,
        sameAs: p.sameAs,
        areaOfOperations: p.market,
        ...(source.kind === "website"
          ? { website: source.sourceUrl }
          : { brokerageBioUrl: source.sourceUrl }),
      };
      for (const [key, value] of Object.entries(proposed)) {
        const field = key as OnboardingField;
        if (!value || (Array.isArray(value) && !value.length)) continue;
        const bounded =
          typeof value === "string" ? value.slice(0, limits[field] ?? 500) : value.slice(0, 30);
        const valid = onboardingProfileFieldsSchema.shape[field].safeParse(bounded);
        if (!valid.success || valid.data === undefined) continue;
        const observationsForField = observations.get(field) ?? [];
        observationsForField.push({
          value: valid.data,
          sourceId: source.id,
          sourceUrl: source.sourceUrl,
        });
        observations.set(field, observationsForField);
        if (!preserved.has(field) && !profile[field])
          Object.assign(profile, { [field]: valid.data });
      }
    }
  }
  const conflicts: OnboardingConflict[] = [];
  for (const [field, values] of observations) {
    const distinct = new Set(values.map(({ value }) => JSON.stringify(value)));
    const keptValue = profile[field];
    if (keptValue !== undefined && (keptValue !== "" || preserved.has(field)))
      distinct.add(JSON.stringify(keptValue));
    if (distinct.size > 1) conflicts.push({ field, values, keptValue });
  }
  return { profile, conflicts };
}
