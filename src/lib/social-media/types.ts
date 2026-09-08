import { z } from "zod";

const recordIdSchema = z
  .string()
  .min(1)
  .max(240)
  .refine(
    (value) => value === value.trim() && !/[\u0000-\u001f]/.test(value),
    "Invalid record ID",
  );

export const templateKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "Invalid template key");

const selectedMediaIdsSchema = z
  .array(recordIdSchema)
  .min(1, "Select at least one listing photo")
  .max(20, "Select no more than 20 listing photos")
  .superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "Each listing photo can be selected only once",
      });
    }
  });

export const generateSocialMediaSchema = z.object({
  requestId: z.uuid(),
  listingId: recordIdSchema,
  templateKey: templateKeySchema,
  mediaIds: selectedMediaIdsSchema,
});

export const socialMediaJobLookupSchema = z.object({
  jobId: z.uuid(),
});

export type GenerateSocialMediaInput = z.infer<
  typeof generateSocialMediaSchema
>;

export type SocialMediaJobKind = "image" | "video";
export type SocialMediaJobStatus =
  | "processing"
  | "completed"
  | "failed"
  | "blocked"
  | "setup_required"
  | "attention_required";

export interface SocialMediaPhotoView {
  id: string;
  previewUrl: string | null;
  contentType: string | null;
  width: number | null;
  height: number | null;
  sortOrder: number;
  readyForRender: boolean;
  unavailableReason: string | null;
}

export interface SocialMediaListingView {
  id: string;
  title: string;
  address: string;
  status: string;
  listPrice: string | null;
  beds: string | null;
  baths: string | null;
  livingArea: number | null;
  media: SocialMediaPhotoView[];
}

export interface SocialMediaTemplateView {
  key: string;
  label: string;
  maxPhotos: number;
  outputSize: string;
}

export interface SocialMediaEntitlementView {
  enabled: boolean;
  status: "active" | "trialing" | "unavailable";
  usedUnits: number;
  limitUnits: number;
  periodEnd: string | null;
  message: string;
}

export interface SocialMediaSetupResult {
  listings: SocialMediaListingView[];
  imageTemplates: SocialMediaTemplateView[];
  videoTemplates: SocialMediaTemplateView[];
  imageProviderConfigured: boolean;
  videoProviderStatus: "setup_required";
  entitlement: SocialMediaEntitlementView;
  recentJob: SocialMediaJobView | null;
}

export interface SocialMediaAssetView {
  id: string;
  kind: SocialMediaJobKind;
  contentUrl: string;
  contentType: string;
  expiresAt: string | null;
}

export interface SocialMediaJobView {
  id: string;
  listingId: string;
  kind: SocialMediaJobKind;
  templateKey: string;
  mediaIds: string[];
  provider: "orshot" | "video_setup";
  status: SocialMediaJobStatus;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  asset: SocialMediaAssetView | null;
}

export type SocialMediaErrorCode =
  | "not_entitled"
  | "quota_exhausted"
  | "setup_required"
  | "listing_or_photos_not_found"
  | "invalid_template"
  | "duplicate_request"
  | "provider_rate_limit"
  | "provider_timeout"
  | "provider_rejected"
  | "provider_unavailable"
  | "provider_response_invalid";

export type SocialMediaGenerateResult =
  | { ok: true; job: SocialMediaJobView }
  | {
      ok: false;
      code: SocialMediaErrorCode;
      error: string;
      job?: SocialMediaJobView;
      retryAfterSeconds?: number;
    };
