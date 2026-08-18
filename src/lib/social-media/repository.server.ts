import { createHash } from "node:crypto";
import type { Sql } from "@/lib/db";
import type {
  SocialMediaEntitlementView,
  SocialMediaJobKind,
  SocialMediaJobStatus,
  SocialMediaJobView,
  SocialMediaListingView,
} from "./types";
import { publicHttpsUrl } from "./url-safety.server";

interface ListingMediaRow {
  id: string;
  title: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  status: string;
  list_price: string | null;
  beds: string | null;
  baths: string | null;
  living_area: number | null;
  description: string | null;
  media_id: string | null;
  source_url: string | null;
  private_storage_key: string | null;
  content_type: string | null;
  width: number | null;
  height: number | null;
  sort_order: number | null;
}

export const SOCIAL_MEDIA_APPROVED_RASTER_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export const SOCIAL_MEDIA_MAX_PHOTO_DIMENSION = 5_000;

interface ListingPhotoEligibilityInput {
  source_url: string | null;
  private_storage_key: string | null;
  content_type: string | null;
  width: number | null;
  height: number | null;
}

export interface ListingPhotoEligibility {
  url: string | null;
  reason: string | null;
}

interface EntitlementRow {
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  included_units: number;
  hard_limit_units: number | null;
  overage_authorized: boolean;
  current_period_start: Date | string | null;
  current_period_end: Date | string | null;
}

interface CountRow {
  used_units: number;
}

interface JobRow {
  id: string;
  listing_id: string;
  kind: SocialMediaJobKind;
  template_key: string;
  provider: "orshot" | "video_setup";
  status: SocialMediaJobStatus;
  error_code: string | null;
  error_message: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  completed_at: Date | string | null;
  asset_id: string | null;
  asset_kind: SocialMediaJobKind | null;
  content_url: string | null;
  content_type: string | null;
  expires_at: Date | string | null;
  media_ids: string[];
}

export interface ResolvedListingMedia {
  listing: {
    id: string;
    title: string;
    address: string;
    status: string;
    listPrice: string | null;
    beds: string | null;
    baths: string | null;
    livingArea: number | null;
    description: string | null;
  };
  photos: Array<{
    id: string;
    url: string;
    contentType: string | null;
  }>;
}

export interface VerifiedSocialMediaEntitlement {
  enabled: boolean;
  status: "active" | "trialing" | "unavailable";
  periodStart: string | null;
  periodEnd: string | null;
  limitUnits: number;
  usedUnits: number;
  message: string;
}

interface SocialMediaJobIntent {
  listingId: string;
  kind: SocialMediaJobKind;
  templateKey: string;
  mediaIds: string[];
}

export function serverSocialMediaIntentKey(
  input: SocialMediaJobIntent,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.listingId,
        input.kind,
        input.templateKey,
        ...input.mediaIds,
      ]),
      "utf8",
    )
    .digest("hex");
}

function asIso(value: Date | string | null): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function fullAddress(row: ListingMediaRow): string {
  return [
    row.address_line1,
    row.address_line2,
    row.city,
    [row.state, row.postal_code].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Fail closed on imported metadata before handing a remote asset to a renderer.
 * The allowlist is intentionally exact: SVG/GIF and unknown MIME types are not
 * eligible even if the filename looks like a photo.
 */
export function listingPhotoEligibility(
  row: ListingPhotoEligibilityInput,
  env: NodeJS.ProcessEnv,
): ListingPhotoEligibility {
  if (!row.source_url) {
    return {
      url: null,
      reason: row.private_storage_key
        ? "Private photo delivery is not configured for rendering yet."
        : "This photo does not have a server-owned source URL.",
    };
  }

  const contentType = row.content_type?.trim().toLowerCase() ?? "";
  if (
    !SOCIAL_MEDIA_APPROVED_RASTER_MIME_TYPES.some(
      (approved) => approved === contentType,
    )
  ) {
    return {
      url: null,
      reason:
        "Photo import must verify JPEG, PNG, WebP, or AVIF content metadata; SVG, GIF, and unknown types are not rendered.",
    };
  }

  const dimensions = [row.width, row.height];
  if (
    dimensions.some(
      (value) =>
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value <= 0 ||
        value > SOCIAL_MEDIA_MAX_PHOTO_DIMENSION,
    )
  ) {
    return {
      url: null,
      reason: `Photo import must verify positive width and height no larger than ${SOCIAL_MEDIA_MAX_PHOTO_DIMENSION.toLocaleString()} pixels.`,
    };
  }

  const url = publicHttpsUrl(row.source_url, env);
  return url
    ? { url, reason: null }
    : {
        url: null,
        reason:
          "This photo is not on a permitted server-owned public HTTPS origin.",
      };
}

export async function listSocialMediaListings(
  sql: Sql,
  workspaceId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SocialMediaListingView[]> {
  const rows = await sql.query<ListingMediaRow>(
    `select l.id, l.title, l.address_line1, l.address_line2, l.city,
            l.state, l.postal_code, l.status, l.list_price, l.beds,
            l.baths, l.living_area, l.description,
            m.id as media_id, m.source_url, m.private_storage_key,
            m.content_type, m.width, m.height, m.sort_order
       from listings l
       left join listing_media m
         on m.listing_id = l.id and m.workspace_id = l.workspace_id
      where l.workspace_id = $1
        and l.id in (
          select id from listings
           where workspace_id = $1
           order by updated_at desc
           limit 50
        )
      order by l.updated_at desc, m.sort_order asc, m.id asc`,
    [workspaceId],
  );

  const listings = new Map<string, SocialMediaListingView>();
  for (const row of rows) {
    let listing = listings.get(row.id);
    if (!listing) {
      listing = {
        id: row.id,
        title: row.title,
        address: fullAddress(row) || row.title,
        status: row.status,
        listPrice: row.list_price,
        beds: row.beds,
        baths: row.baths,
        livingArea: row.living_area,
        media: [],
      };
      listings.set(row.id, listing);
    }
    if (!row.media_id) continue;
    const eligibility = listingPhotoEligibility(row, env);
    listing.media.push({
      id: row.media_id,
      previewUrl: eligibility.url,
      contentType: row.content_type,
      width: row.width,
      height: row.height,
      sortOrder: row.sort_order ?? 0,
      readyForRender: Boolean(eligibility.url),
      unavailableReason: eligibility.reason,
    });
  }
  return [...listings.values()];
}

export async function resolveOwnedListingMedia(
  sql: Sql,
  workspaceId: string,
  listingId: string,
  mediaIds: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<ResolvedListingMedia | null> {
  const listingRows = await sql.query<ListingMediaRow>(
    `select id, title, address_line1, address_line2, city, state,
            postal_code, status, list_price, beds, baths, living_area,
            description, null::text as media_id, null::text as source_url,
            null::text as private_storage_key, null::text as content_type,
            null::integer as width, null::integer as height,
            null::integer as sort_order
       from listings
      where workspace_id = $1 and id = $2
      limit 1`,
    [workspaceId, listingId],
  );
  const listing = listingRows[0];
  if (!listing) return null;

  const placeholders = mediaIds.map((_, index) => `$${index + 3}`).join(",");
  const mediaRows = await sql.query<ListingMediaRow>(
    `select l.id, l.title, l.address_line1, l.address_line2, l.city,
            l.state, l.postal_code, l.status, l.list_price, l.beds,
            l.baths, l.living_area, l.description,
            m.id as media_id, m.source_url, m.private_storage_key,
            m.content_type, m.width, m.height, m.sort_order
       from listing_media m
       join listings l
         on l.id = m.listing_id and l.workspace_id = m.workspace_id
      where m.workspace_id = $1 and m.listing_id = $2
        and m.id in (${placeholders})`,
    [workspaceId, listingId, ...mediaIds],
  );
  if (mediaRows.length !== mediaIds.length) return null;

  const byId = new Map(mediaRows.map((row) => [row.media_id, row]));
  const photos: ResolvedListingMedia["photos"] = [];
  for (const mediaId of mediaIds) {
    const row = byId.get(mediaId);
    if (!row) return null;
    const eligibility = listingPhotoEligibility(row, env);
    if (!eligibility.url) return null;
    photos.push({
      id: mediaId,
      url: eligibility.url,
      contentType: row.content_type,
    });
  }

  return {
    listing: {
      id: listing.id,
      title: listing.title,
      address: fullAddress(listing) || listing.title,
      status: listing.status,
      listPrice: listing.list_price,
      beds: listing.beds,
      baths: listing.baths,
      livingArea: listing.living_area,
      description: listing.description,
    },
    photos,
  };
}

function deploymentRenderLimit(env: NodeJS.ProcessEnv): number {
  const parsed = Number(env.SOCIAL_MEDIA_MAX_RENDERS_PER_PERIOD?.trim());
  return Number.isInteger(parsed) ? Math.max(1, Math.min(1_000, parsed)) : 50;
}

export async function getSocialMediaEntitlement(
  sql: Sql,
  workspaceId: string,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): Promise<VerifiedSocialMediaEntitlement> {
  const rows = await sql.query<EntitlementRow>(
    `select status, stripe_customer_id, stripe_subscription_id,
            stripe_price_id, included_units, hard_limit_units,
            overage_authorized, current_period_start, current_period_end
       from workspace_entitlements
      where workspace_id = $1 and product = 'social_media'
      limit 1`,
    [workspaceId],
  );
  const row = rows[0];
  const periodStart = asIso(row?.current_period_start ?? null);
  const periodEnd = asIso(row?.current_period_end ?? null);
  const verified = Boolean(
    row &&
      (row.status === "active" || row.status === "trialing") &&
      row.stripe_customer_id?.trim() &&
      row.stripe_subscription_id?.trim() &&
      row.stripe_price_id?.trim() &&
      row.included_units > 0 &&
      row.hard_limit_units != null &&
      row.hard_limit_units > 0 &&
      periodStart &&
      periodEnd &&
      now >= new Date(periodStart) &&
      now < new Date(periodEnd),
  );
  if (!verified || !row || !periodStart || !periodEnd) {
    return {
      enabled: false,
      status: "unavailable",
      periodStart: null,
      periodEnd: null,
      limitUnits: 0,
      usedUnits: 0,
      message:
        "Social media rendering requires a verified active premium entitlement.",
    };
  }

  const billingLimit = row.overage_authorized
    ? row.hard_limit_units!
    : Math.min(row.included_units, row.hard_limit_units!);
  const limitUnits = Math.min(billingLimit, deploymentRenderLimit(env));
  const usageRows = await sql.query<CountRow>(
    `select used_units
       from social_media_quota_buckets
      where workspace_id = $1 and period_start = $2`,
    [workspaceId, periodStart],
  );
  const usedUnits = usageRows[0]?.used_units ?? 0;
  return {
    enabled: usedUnits < limitUnits,
    status: row.status as "active" | "trialing",
    periodStart,
    periodEnd,
    limitUnits,
    usedUnits,
    message:
      usedUnits >= limitUnits
        ? "This workspace has reached its social media render limit for the billing period."
        : `${limitUnits - usedUnits} of ${limitUnits} render credits remain this period.`,
  };
}

export function entitlementView(
  entitlement: VerifiedSocialMediaEntitlement,
): SocialMediaEntitlementView {
  return {
    enabled: entitlement.enabled,
    status: entitlement.status,
    usedUnits: entitlement.usedUnits,
    limitUnits: entitlement.limitUnits,
    periodEnd: entitlement.periodEnd,
    message: entitlement.message,
  };
}

export async function reserveSocialMediaQuotaAndChargeJob(
  sql: Sql,
  workspaceId: string,
  jobId: string,
  entitlement: VerifiedSocialMediaEntitlement,
): Promise<boolean> {
  if (
    !entitlement.enabled ||
    !entitlement.periodStart ||
    !entitlement.periodEnd ||
    entitlement.limitUnits < 1
  ) {
    return false;
  }
  const rows = await sql.query<{ reserved: boolean }>(
    `with candidate as materialized (
       select least(
                $4::integer,
                case when e.overage_authorized then e.hard_limit_units
                     else least(e.included_units, e.hard_limit_units) end
              ) as limit_units
         from social_media_jobs j
         join workspace_entitlements e
           on e.workspace_id = j.workspace_id and e.product = 'social_media'
        where j.id = $5 and j.workspace_id = $1
          and j.status = 'processing' and j.unit_count = 0
          and e.status in ('active', 'trialing')
          and nullif(trim(e.stripe_customer_id), '') is not null
          and nullif(trim(e.stripe_subscription_id), '') is not null
          and nullif(trim(e.stripe_price_id), '') is not null
          and e.included_units > 0 and e.hard_limit_units > 0
          and e.current_period_start = $2::timestamptz
          and e.current_period_end = $3::timestamptz
          and now() >= e.current_period_start and now() < e.current_period_end
        for update of j, e
     ), quota as (
       insert into social_media_quota_buckets (
         workspace_id, period_start, period_end, used_units
       )
       select $1, $2, $3, 1
         from candidate
        where limit_units > 0
       on conflict (workspace_id, period_start) do update set
         used_units = social_media_quota_buckets.used_units + 1,
         period_end = excluded.period_end,
         updated_at = now()
       where social_media_quota_buckets.used_units < (
         select limit_units from candidate
       )
       returning 1
     ), charged as (
       update social_media_jobs
          set unit_count = 1, updated_at = now()
        where id = $5 and workspace_id = $1 and status = 'processing'
          and unit_count = 0
          and exists (select 1 from quota)
       returning 1
     )
     select exists(select 1 from quota)
        and exists(select 1 from charged) as reserved`,
    [
      workspaceId,
      entitlement.periodStart,
      entitlement.periodEnd,
      entitlement.limitUnits,
      jobId,
    ],
  );
  return rows[0]?.reserved === true;
}

export async function createSocialMediaJob(
  sql: Sql,
  input: {
    id: string;
    workspaceId: string;
    userId: string;
    listingId: string;
    kind: SocialMediaJobKind;
    templateKey: string;
    provider: "orshot" | "video_setup";
    status: "processing" | "setup_required";
    mediaIds: string[];
    providerJobId?: string;
    errorCode?: string;
    errorMessage?: string;
  },
): Promise<boolean> {
  if (!input.mediaIds.length) throw new Error("A media job requires a photo");
  const intentKey = serverSocialMediaIntentKey(input);
  const params: unknown[] = [
    input.id,
    input.workspaceId,
    input.userId,
    input.listingId,
    input.kind,
    input.templateKey,
    input.provider,
    input.status,
    input.providerJobId ?? null,
    input.errorCode ?? null,
    input.errorMessage ?? null,
    intentKey,
  ];
  const mediaTuples = input.mediaIds.map((mediaId, index) => {
    params.push(mediaId, index);
    const offset = 13 + index * 2;
    return `($${offset}::text,$${offset + 1}::integer)`;
  });
  params.push(input.mediaIds.length);
  const expectedCountParam = `$${params.length}`;
  const rows = await sql.query<{ inserted: boolean }>(
    `with claimed as (
       insert into social_media_jobs (
         id, workspace_id, user_id, listing_id, kind, template_key, provider,
         status, idempotency_key, intent_key, provider_job_id, error_code,
         error_message, completed_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$1,$12,$9,$10,$11,
         case when $8 = 'setup_required' then now() else null end)
       on conflict do nothing
       returning id
     ), attached as (
       insert into social_media_job_media (
         job_id, workspace_id, listing_id, media_id, sort_order
       )
       select claimed.id, $2, $4, selected.media_id, selected.sort_order
         from claimed
         cross join (values ${mediaTuples.join(",")})
           as selected(media_id, sort_order)
       returning 1
     )
     select exists(select 1 from claimed)
        and (select count(*) from attached) = ${expectedCountParam}::integer
        as inserted`,
    params,
  );
  return rows[0]?.inserted === true;
}

export async function getActiveSocialMediaJobForIntent(
  sql: Sql,
  workspaceId: string,
  userId: string,
  input: SocialMediaJobIntent,
): Promise<SocialMediaJobView | null> {
  const rows = await sql.query<{ id: string }>(
    `select id from social_media_jobs
      where workspace_id = $1 and user_id = $2 and kind = 'image'
        and intent_key = $3
        and status in ('processing', 'attention_required')
      order by created_at desc
      limit 1`,
    [workspaceId, userId, serverSocialMediaIntentKey(input)],
  );
  return rows[0]
    ? getSocialMediaJob(sql, workspaceId, userId, rows[0].id)
    : null;
}

export async function mediaJobMatchesInput(
  sql: Sql,
  workspaceId: string,
  userId: string,
  jobId: string,
  input: {
    listingId: string;
    kind: SocialMediaJobKind;
    templateKey: string;
    mediaIds: string[];
  },
): Promise<boolean> {
  const jobs = await sql.query<{ listing_id: string; kind: string; template_key: string }>(
    `select listing_id, kind, template_key
       from social_media_jobs
      where id = $1 and workspace_id = $2 and user_id = $3
      limit 1`,
    [jobId, workspaceId, userId],
  );
  const job = jobs[0];
  if (
    !job ||
    job.listing_id !== input.listingId ||
    job.kind !== input.kind ||
    job.template_key !== input.templateKey
  ) {
    return false;
  }
  const rows = await sql.query<{ media_id: string }>(
    `select media_id from social_media_job_media
      where job_id = $1 and workspace_id = $2
      order by sort_order`,
    [jobId, workspaceId],
  );
  return (
    rows.length === input.mediaIds.length &&
    rows.every((row, index) => row.media_id === input.mediaIds[index])
  );
}

export async function markSocialMediaJob(
  sql: Sql,
  workspaceId: string,
  jobId: string,
  update: {
    status: Exclude<SocialMediaJobStatus, "processing" | "completed">;
    errorCode: string;
    errorMessage: string;
    unitCount?: 0 | 1;
  },
): Promise<void> {
  await sql.query(
    `update social_media_jobs
        set status = $3, error_code = $4, error_message = $5,
            unit_count = coalesce($6::integer, unit_count), updated_at = now(),
            completed_at = now()
      where id = $1 and workspace_id = $2 and status = 'processing'`,
    [
      jobId,
      workspaceId,
      update.status,
      update.errorCode,
      update.errorMessage,
      update.unitCount ?? null,
    ],
  );
}

export async function completeSocialMediaImageJob(
  sql: Sql,
  input: {
    workspaceId: string;
    jobId: string;
    contentUrl: string;
  },
): Promise<boolean> {
  const rows = await sql.query<{ completed: boolean }>(
    `with candidate as materialized (
       select 1 from social_media_jobs
        where id = $1 and workspace_id = $2
          and status = 'processing' and unit_count = 1
        for update
     ), asset as (
       insert into social_media_assets (
         id, job_id, workspace_id, kind, provider, content_url, content_type
       )
       select $1 || ':image', $1, $2, 'image', 'orshot', $3, 'image/png'
         from candidate
       on conflict (job_id, kind) do nothing
       returning id
     ), completed as (
       update social_media_jobs
          set status = 'completed', error_code = null, error_message = null,
              updated_at = now(), completed_at = now()
        where id = $1 and workspace_id = $2 and status = 'processing'
          and unit_count = 1 and exists (select 1 from candidate)
          and (exists (select 1 from asset) or exists (
            select 1 from social_media_assets
             where job_id = $1 and workspace_id = $2 and kind = 'image'
          ))
       returning 1
     )
     select exists(select 1 from completed) as completed`,
    [input.jobId, input.workspaceId, input.contentUrl],
  );
  return rows[0]?.completed === true;
}

export async function getSocialMediaJob(
  sql: Sql,
  workspaceId: string,
  userId: string,
  jobId: string,
): Promise<SocialMediaJobView | null> {
  // A Vercel function can die between durable claim/charge and completion.
  // Never retry such a provider call blindly: after two minutes (well beyond
  // the bounded 50-second Orshot timeout) quarantine it for operator review.
  await sql.query(
    `update social_media_jobs
        set status = 'attention_required',
            error_code = 'provider_timeout',
            error_message = 'This render was interrupted. Support must check the provider outcome before any retry.',
            updated_at = now(), completed_at = now()
      where id = $1 and workspace_id = $2 and user_id = $3
        and status = 'processing'
        and updated_at < now() - interval '2 minutes'`,
    [jobId, workspaceId, userId],
  );
  const rows = await sql.query<JobRow>(
    `select j.id, j.listing_id, j.kind, j.template_key, j.provider,
            j.status, j.error_code, j.error_message, j.created_at,
            j.updated_at, j.completed_at,
            a.id as asset_id, a.kind as asset_kind, a.content_url,
            a.content_type, a.expires_at,
            coalesce((
              select array_agg(jm.media_id order by jm.sort_order)
                from social_media_job_media jm
               where jm.job_id = j.id and jm.workspace_id = j.workspace_id
            ), array[]::text[]) as media_ids
       from social_media_jobs j
       left join social_media_assets a
         on a.job_id = j.id and a.workspace_id = j.workspace_id
      where j.id = $1 and j.workspace_id = $2 and j.user_id = $3
      limit 1`,
    [jobId, workspaceId, userId],
  );
  const row = rows[0];
  if (!row) return null;
  const createdAt = asIso(row.created_at);
  const updatedAt = asIso(row.updated_at);
  if (!createdAt || !updatedAt) throw new Error("Invalid job timestamp");
  return {
    id: row.id,
    listingId: row.listing_id,
    kind: row.kind,
    templateKey: row.template_key,
    mediaIds: row.media_ids,
    provider: row.provider,
    status: row.status,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt,
    updatedAt,
    completedAt: asIso(row.completed_at),
    asset:
      row.status === "completed" &&
      row.asset_id &&
      row.asset_kind &&
      row.content_url &&
      row.content_type
        ? {
            id: row.asset_id,
            kind: row.asset_kind,
            contentUrl: row.content_url,
            contentType: row.content_type,
            expiresAt: asIso(row.expires_at),
          }
        : null,
  };
}

export async function reconcileRecentSocialMediaImageJob(
  sql: Sql,
  workspaceId: string,
  userId: string,
): Promise<SocialMediaJobView | null> {
  await sql.query(
    `update social_media_jobs
        set status = 'attention_required',
            error_code = 'provider_timeout',
            error_message = 'This render was interrupted. Support must check the provider outcome before any retry.',
            updated_at = now(), completed_at = now()
      where workspace_id = $1 and user_id = $2 and kind = 'image'
        and status = 'processing'
        and updated_at < now() - interval '2 minutes'`,
    [workspaceId, userId],
  );
  const rows = await sql.query<{ id: string }>(
    `select id from social_media_jobs
      where workspace_id = $1 and user_id = $2 and kind = 'image'
        and created_at >= now() - interval '7 days'
      order by created_at desc
      limit 1`,
    [workspaceId, userId],
  );
  return rows[0]
    ? getSocialMediaJob(sql, workspaceId, userId, rows[0].id)
    : null;
}
