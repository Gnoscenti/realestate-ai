/**
 * AI-assisted caption drafting from declared facts only.
 *
 * The model receives the facts the agent typed or CiteLock observed, the goal,
 * platform, and voice — and must echo back which facts it used. Output is a
 * draft that still has to pass the fair-housing review and human approval.
 * Spend is bounded by a per-workspace daily quota.
 */
import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import { requireEntitlement } from "@/lib/billing/entitlement.server";
import { completeJson, textGenerationConfigured } from "@/lib/ai-text.server";
import { PLATFORM_LIMITS, platformSchema } from "./types";
import { reviewCaption } from "./fair-housing";

export const draftRequestSchema = z.object({
  platform: platformSchema,
  goal: z.enum([
    "just_listed",
    "open_house",
    "just_sold",
    "market_update",
    "buyer_education",
    "seller_education",
    "personal_brand",
    "community",
    "citelock_intervention",
  ]),
  voice: z.string().trim().max(60).default("Professional & warm"),
  facts: z.array(z.string().trim().min(1).max(400)).min(1).max(20),
  audienceNote: z.string().trim().max(300).default(""),
  linkUrl: z.string().trim().max(1000).default(""),
});
export type DraftRequest = z.infer<typeof draftRequestSchema>;

export type CaptionDraft = {
  caption: string;
  altHooks: string[];
  factsUsed: string[];
  unsupportedClaimsAvoided: string[];
  hashtags: string[];
  model: string;
  review: ReturnType<typeof reviewCaption>;
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    caption: { type: "string" },
    altHooks: { type: "array", items: { type: "string" }, maxItems: 3 },
    factsUsed: { type: "array", items: { type: "string" } },
    unsupportedClaimsAvoided: { type: "array", items: { type: "string" } },
    hashtags: { type: "array", items: { type: "string" }, maxItems: 8 },
  },
  required: ["caption", "altHooks", "factsUsed", "unsupportedClaimsAvoided", "hashtags"],
} as const;

async function consumeDraftQuota(sql: Sql, workspaceId: string): Promise<void> {
  const max = Number(process.env.SOCIAL_DRAFTS_PER_DAY) > 0 ? Number(process.env.SOCIAL_DRAFTS_PER_DAY) : 40;
  const rows = await sql.query<{ count: number }>(
    `insert into citelock_visibility_quota_buckets (scope, window_started_at, count)
     values ($1, date_trunc('day', now()), 1)
     on conflict (scope, window_started_at) do update
       set count = citelock_visibility_quota_buckets.count + 1
       where citelock_visibility_quota_buckets.count < $2
     returning count`,
    [`workspace:${workspaceId}:social-drafts`, max],
  );
  if (!rows.length) throw new Error("Daily AI drafting limit reached for this workspace.");
}

export function draftingConfigured(): boolean {
  return textGenerationConfigured();
}

export async function draftCaption(
  userId: string,
  workspaceId: string,
  request: DraftRequest,
  dependencies: { sql?: Sql; complete?: typeof completeJson } = {},
): Promise<CaptionDraft> {
  const sql = dependencies.sql || (await getSql());
  const workspace = await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  await requireEntitlement(userId, workspace.id, sql);
  if (!draftingConfigured())
    throw new Error("AI drafting needs XAI_API_KEY on the server. You can still write the caption yourself.");
  await consumeDraftQuota(sql, workspace.id);
  const limit = PLATFORM_LIMITS[request.platform];
  const complete = dependencies.complete || completeJson;
  const result = await complete<Omit<CaptionDraft, "model" | "review">>({
    system: [
      "You write social media captions for a licensed real estate agent.",
      "Use ONLY the facts provided. Never invent prices, dates, open-house times, transaction outcomes, awards, rankings, statistics, testimonials, or property features.",
      "If a useful claim is not in the facts, list it under unsupportedClaimsAvoided instead of writing it.",
      "Comply with fair-housing advertising: never describe who should live somewhere; do not reference protected classes; no 'safe neighborhood' or 'perfect for families' language.",
      `Platform: ${request.platform}. Hard limit ${limit} characters INCLUDING hashtags; leave the hashtags out of the caption field.`,
      `Voice: ${request.voice}. Plain, specific, first person. One clear call to action. No emoji walls.`,
      request.linkUrl ? `If you reference a link, use exactly: ${request.linkUrl}` : "Do not include any URL.",
    ].join(" "),
    user: [
      `Goal: ${request.goal.replace(/_/g, " ")}`,
      request.audienceNote ? `Context: ${request.audienceNote}` : "",
      "",
      "FACTS:",
      ...request.facts.map((fact) => `- ${fact}`),
    ]
      .filter(Boolean)
      .join("\n"),
    schemaName: "social_caption",
    schema: SCHEMA,
    maxTokens: 900,
  });
  const caption = result.value.caption.trim();
  if (!caption) throw new Error("The model returned an empty caption. Try again or write it yourself.");
  const hashtags = result.value.hashtags
    .map((tag) => tag.trim().replace(/^#?/, "#").replace(/\s+/g, ""))
    .filter((tag) => tag.length > 1)
    .slice(0, request.platform === "x" ? 3 : 8);
  return {
    caption: Array.from(caption).slice(0, limit).join(""),
    altHooks: result.value.altHooks.map((hook) => hook.trim()).filter(Boolean).slice(0, 3),
    factsUsed: result.value.factsUsed,
    unsupportedClaimsAvoided: result.value.unsupportedClaimsAvoided,
    hashtags,
    model: result.model,
    review: reviewCaption(caption),
  };
}
