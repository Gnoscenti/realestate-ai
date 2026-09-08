import { z } from "zod";

export const PLATFORM_LIMITS = {
  linkedin: 3000,
  instagram: 2200,
  facebook: 3000,
  x: 280,
} as const;
export const platformSchema = z.enum(["linkedin", "instagram", "facebook", "x"]);
export type SocialPlatform = z.infer<typeof platformSchema>;

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
};

const publicUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use an HTTPS URL without credentials");

export const socialContentSchema = z
  .object({
    title: z.string().trim().min(1, "Give the draft a title").max(120),
    platform: platformSchema,
    caption: z.string().trim().min(1, "Write a caption").max(3000),
    facts: z
      .string()
      .trim()
      .min(1, "Record the facts or personal perspective behind this post")
      .max(3000),
    sourceUrl: publicUrl.default(""),
    attribution: z.string().trim().max(500).default(""),
    /** Public HTTPS image URLs the agent has rights to use (listing photos, own media). */
    mediaUrls: z.array(publicUrl.refine(Boolean)).max(4).default([]),
    /** Where this draft came from, for traceability (e.g. citelock:profile_claim:zillow.com). */
    origin: z.string().trim().max(200).default(""),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (Array.from(value.caption).length > PLATFORM_LIMITS[value.platform]) {
      ctx.addIssue({
        code: "custom",
        path: ["caption"],
        message: `Caption exceeds ${PLATFORM_LIMITS[value.platform]} characters`,
      });
    }
  });
export type SocialContent = z.infer<typeof socialContentSchema>;

export type SocialDraftState =
  | "draft"
  | "approved"
  | "handed_off"
  | "reported_posted"
  | "scheduled"
  | "published"
  | "failed";

export type SocialDraft = {
  id: string;
  revision: number;
  content: SocialContent;
  state: SocialDraftState;
  approvedBy: string | null;
  approvedAt: string | null;
  postUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SocialPublication = {
  id: string;
  draftId: string;
  revision: number;
  provider: "postiz";
  channelId: string;
  channelName: string | null;
  channelPlatform: string | null;
  providerPostId: string | null;
  status: "scheduled" | "published" | "failed";
  scheduledFor: string | null;
  releaseUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export const socialCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), content: socialContentSchema }),
  z.object({ action: z.literal("approve"), reviewedFactsAndRights: z.literal(true) }),
  z.object({ action: z.literal("handoff") }),
  z.object({
    action: z.literal("receipt"),
    postUrl: publicUrl.refine(Boolean, "Enter the published post URL"),
  }),
]);
export type SocialCommand = z.infer<typeof socialCommandSchema>;

export function validatePostUrl(platform: SocialContent["platform"], raw: string): string {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const valid =
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    ((platform === "linkedin" &&
      host === "linkedin.com" &&
      /^\/(posts\/[^/]+|feed\/update\/[^/]+)/.test(url.pathname)) ||
      (platform === "instagram" &&
        host === "instagram.com" &&
        /^\/(p|reel)\/[^/]+/.test(url.pathname)) ||
      (platform === "facebook" &&
        host === "facebook.com" &&
        /\/(posts\/|permalink\.php|reel\/|share\/)/.test(url.pathname)) ||
      (platform === "x" &&
        ["x.com", "twitter.com"].includes(host) &&
        /^\/[^/]+\/status\/\d+\/?$/.test(url.pathname)));
  if (!valid)
    throw new Error("Enter a post URL on the selected platform, not a profile or unrelated website");
  url.hash = "";
  return url.href;
}

/** The exact text handed off or published. Nothing is appended after validation. */
export function exportSocialDraft(draft: SocialDraft): string {
  if (draft.state === "draft") throw new Error("Approve this revision before exporting");
  return draft.content.caption;
}

/** Postiz provider identifiers that map to our platform enum. */
export const POSTIZ_PLATFORM_MAP: Record<string, SocialPlatform> = {
  linkedin: "linkedin",
  "linkedin-page": "linkedin",
  instagram: "instagram",
  "instagram-standalone": "instagram",
  facebook: "facebook",
  x: "x",
  twitter: "x",
};
