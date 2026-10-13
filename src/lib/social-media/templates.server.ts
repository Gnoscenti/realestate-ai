import { z } from "zod";
import type { SocialMediaTemplateView } from "./types";

const parameterKeySchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.@-]*$/)
  .refine(
    (value) =>
      !/(?:^|[.@_-])(prompt|ai|generate|generation)(?:$|[.@_-])/i.test(
        value,
      ),
    "Generative template parameters are prohibited",
  );

const templateKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);

const outputSizeSchema = z.union([
  z.enum([
    "instagram-post",
    "instagram-post-portrait",
    "instagram-post-landscape",
    "facebook-post",
    "linkedin-post",
  ]),
  z
    .string()
    .regex(/^(?:[1-9][0-9]{1,2}|[1-4][0-9]{3}|5000)x(?:[1-9][0-9]{1,2}|[1-4][0-9]{3}|5000)$/),
]);

const fieldMappingsSchema = z
  .object({
    title: parameterKeySchema.optional(),
    address: parameterKeySchema.optional(),
    price: parameterKeySchema.optional(),
    bedrooms: parameterKeySchema.optional(),
    bathrooms: parameterKeySchema.optional(),
    sqft: parameterKeySchema.optional(),
    description: parameterKeySchema.optional(),
  })
  .strict();

const imageTemplateSchema = z
  .object({
    key: templateKeySchema,
    label: z.string().trim().min(1).max(80),
    templateId: z.number().int().positive(),
    photoKeys: z.array(parameterKeySchema).min(1).max(10),
    allImageLayersUseListingPhotos: z.literal(true),
    fields: fieldMappingsSchema.default({}),
    outputSize: outputSizeSchema.default("instagram-post"),
  })
  .strict()
  .superRefine((template, context) => {
    const keys = [
      ...template.photoKeys,
      ...Object.values(template.fields).filter(
        (value): value is string => Boolean(value),
      ),
    ];
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: "custom",
        message: "Every Orshot parameter may be mapped only once",
      });
    }
  });

const templateConfigSchema = z
  .object({
    defaults: z.array(imageTemplateSchema).max(12).default([]),
    workspaces: z
      .record(z.string().min(1).max(240), z.array(imageTemplateSchema).max(12))
      .default({}),
  })
  .strict();

export type SocialImageTemplate = z.infer<typeof imageTemplateSchema>;

export interface ListingTemplateData {
  title: string;
  address: string;
  listPrice: string | null;
  beds: string | null;
  baths: string | null;
  livingArea: number | null;
  description: string | null;
}

export interface OrshotTemplateConfig {
  templates: SocialImageTemplate[];
  configured: boolean;
  configurationError: boolean;
}

function uniqueTemplates(
  templates: SocialImageTemplate[],
): SocialImageTemplate[] | null {
  const keys = new Set<string>();
  const ids = new Set<number>();
  for (const template of templates) {
    if (keys.has(template.key) || ids.has(template.templateId)) return null;
    keys.add(template.key);
    ids.add(template.templateId);
  }
  return templates;
}

/**
 * Reads the server-only allowlist. A client template key is never interpreted
 * as an Orshot template ID or parameter name.
 */
export function loadOrshotTemplateConfig(
  workspaceId: string,
  env: NodeJS.ProcessEnv = process.env,
): OrshotTemplateConfig {
  const apiKey = env.ORSHOT_API_KEY?.trim();
  const raw = env.ORSHOT_TEMPLATE_MAPPINGS?.trim();
  if (!apiKey || !raw) {
    return { templates: [], configured: false, configurationError: false };
  }
  if (
    !env.SOCIAL_MEDIA_PHOTO_HOST_ALLOWLIST?.trim() ||
    !env.ORSHOT_OUTPUT_HOST_ALLOWLIST?.trim()
  ) {
    return { templates: [], configured: false, configurationError: true };
  }

  try {
    const parsed = templateConfigSchema.parse(JSON.parse(raw));
    const selected = parsed.workspaces[workspaceId] ?? parsed.defaults;
    const templates = uniqueTemplates(selected);
    if (!templates?.length) {
      return { templates: [], configured: false, configurationError: true };
    }
    return { templates, configured: true, configurationError: false };
  } catch {
    return { templates: [], configured: false, configurationError: true };
  }
}

export function publicTemplateView(
  template: SocialImageTemplate,
): SocialMediaTemplateView {
  return {
    key: template.key,
    label: template.label,
    maxPhotos: template.photoKeys.length,
    outputSize: template.outputSize,
  };
}

function formatCurrency(value: string | null): string {
  if (value == null || !value.trim()) return "Price available on request";
  const number = Number(value);
  if (!Number.isFinite(number)) return "Price available on request";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(number);
}

function compactText(value: string, max: number): string {
  return value.replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Creates deterministic text/image substitutions only. Every image value is a
 * server-resolved listing_media URL; this path never accepts prompts, client
 * URLs, or free-form modification keys.
 */
export function buildOrshotModifications(
  template: SocialImageTemplate,
  listing: ListingTemplateData,
  photoUrls: string[],
): Record<string, string> {
  if (!photoUrls.length) throw new Error("At least one listing photo is required");

  const modifications: Record<string, string> = {};
  template.photoKeys.forEach((key, index) => {
    // Fill every parameter so an Orshot template cannot retain a stock/default
    // property image. When fewer photos are selected, repeat the real lead photo.
    modifications[key] = photoUrls[index % photoUrls.length]!;
  });

  const values: Record<keyof SocialImageTemplate["fields"], string> = {
    title: compactText(listing.title, 160),
    address: compactText(listing.address, 240),
    price: formatCurrency(listing.listPrice),
    bedrooms: listing.beds ? `${listing.beds} beds` : "",
    bathrooms: listing.baths ? `${listing.baths} baths` : "",
    sqft: listing.livingArea
      ? `${listing.livingArea.toLocaleString("en-US")} sqft`
      : "",
    description: compactText(listing.description ?? "", 500),
  };

  for (const [field, parameter] of Object.entries(template.fields) as Array<
    [keyof typeof values, string | undefined]
  >) {
    if (parameter) modifications[parameter] = values[field];
  }
  return modifications;
}
