import type { Sql } from "@/lib/db";
import type {
  AssistantListingContext,
  VerifiedSoldCompContext,
} from "./policy";

interface ListingRow {
  title: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  status: string;
  list_price: string | null;
  beds: string | null;
  baths: string | null;
  living_area: number | null;
  days_on_market: number | null;
  provenance: string;
}

interface SoldCompRow {
  address_line1: string;
  city: string;
  state: string;
  postal_code: string | null;
  close_price: string;
  close_date: string;
  list_price: string | null;
  beds: string | null;
  baths: string | null;
  living_area: number;
  property_type: string;
  days_on_market: number | null;
  source_kind: "mls_csv" | "reso_api";
  provider: string | null;
  dataset: string | null;
  source_as_of: string | null;
}

interface CountRow {
  count: number;
}

export interface QuotaLimits {
  minuteRequests: number;
  dailyRequests: number;
  dailyInputChars: number;
}

interface QuotaRow {
  daily_ok: boolean;
  minute_ok: boolean;
}

interface InsertedRow {
  inserted: number;
}

export interface QuotaReservation {
  allowed: boolean;
  reason: "minute" | "day" | null;
}

export function assistantQuotaLimitsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): QuotaLimits {
  const integer = (name: string, fallback: number, min: number, max: number) => {
    const raw = env[name]?.trim();
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isInteger(parsed)
      ? Math.max(min, Math.min(max, parsed))
      : fallback;
  };
  return {
    minuteRequests: integer("ASSISTANT_REQUESTS_PER_MINUTE", 10, 1, 60),
    dailyRequests: integer("ASSISTANT_REQUESTS_PER_DAY", 100, 1, 2_000),
    dailyInputChars: integer(
      "ASSISTANT_INPUT_CHARS_PER_DAY",
      250_000,
      10_000,
      5_000_000,
    ),
  };
}

function utcMinuteStart(now: Date): Date {
  const value = new Date(now);
  value.setUTCSeconds(0, 0);
  return value;
}

function utcDayStart(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Atomically reserves durable day + minute quota buckets. If the minute bucket
 * rejects after the daily bucket reserves, that attempt remains counted. This
 * conservative behavior prevents rapid retries from bypassing the daily cap.
 */
export async function reserveAssistantQuota(
  sql: Sql,
  userId: string,
  inputChars: number,
  limits: QuotaLimits,
  now = new Date(),
): Promise<QuotaReservation> {
  const dayStart = utcDayStart(now).toISOString();
  const minuteStart = utcMinuteStart(now).toISOString();
  const rows = await sql.query<QuotaRow>(
    `with daily as (
       insert into assistant_quota_buckets (
         user_id, bucket_kind, bucket_start, request_count, input_chars
       ) values ($1, 'day', $2, 1, $3)
       on conflict (user_id, bucket_kind, bucket_start) do update set
         request_count = assistant_quota_buckets.request_count + 1,
         input_chars = assistant_quota_buckets.input_chars + excluded.input_chars,
         updated_at = now()
       where assistant_quota_buckets.request_count < $4
         and assistant_quota_buckets.input_chars + excluded.input_chars <= $5
       returning 1
     ), minute as (
       insert into assistant_quota_buckets (
         user_id, bucket_kind, bucket_start, request_count, input_chars
       )
       select $1, 'minute', $6, 1, $3 where exists (select 1 from daily)
       on conflict (user_id, bucket_kind, bucket_start) do update set
         request_count = assistant_quota_buckets.request_count + 1,
         input_chars = assistant_quota_buckets.input_chars + excluded.input_chars,
         updated_at = now()
       where assistant_quota_buckets.request_count < $7
       returning 1
     )
     select exists(select 1 from daily) as daily_ok,
            exists(select 1 from minute) as minute_ok`,
    [
      userId,
      dayStart,
      Math.max(0, Math.floor(inputChars)),
      limits.dailyRequests,
      limits.dailyInputChars,
      minuteStart,
      limits.minuteRequests,
    ],
  );
  const row = rows[0];
  if (!row?.daily_ok) return { allowed: false, reason: "day" };
  if (!row.minute_ok) return { allowed: false, reason: "minute" };
  return { allowed: true, reason: null };
}

export async function listAssistantListings(
  sql: Sql,
  workspaceId: string,
): Promise<AssistantListingContext[]> {
  const rows = await sql.query<ListingRow>(
    `select title, address_line1, city, state, neighborhood, status,
            list_price, beds, baths, living_area, days_on_market, provenance
       from listings
      where workspace_id = $1
      order by case status
        when 'active' then 0
        when 'coming_soon' then 1
        when 'pending' then 2
        else 3 end,
        updated_at desc
      limit 12`,
    [workspaceId],
  );
  return rows.map((row) => ({
    title: row.title,
    address: row.address_line1,
    city: row.city,
    state: row.state,
    neighborhood: row.neighborhood,
    status: row.status,
    listPrice: row.list_price,
    beds: row.beds,
    baths: row.baths,
    livingArea: row.living_area,
    daysOnMarket: row.days_on_market,
    provenance: row.provenance,
  }));
}

export async function countVerifiedSoldComps(
  sql: Sql,
  workspaceId: string,
): Promise<number> {
  const rows = await sql.query<CountRow>(
    `select count(*)::int as count
       from sold_comps
      where workspace_id = $1
        and standard_status in ('Closed', 'Sold')`,
    [workspaceId],
  );
  return rows[0]?.count ?? 0;
}

export async function listVerifiedSoldComps(
  sql: Sql,
  workspaceId: string,
): Promise<VerifiedSoldCompContext[]> {
  const rows = await sql.query<SoldCompRow>(
    `select c.address_line1, c.city, c.state, c.postal_code,
            c.close_price, c.close_date::text, c.list_price, c.beds, c.baths,
            c.living_area, c.property_type, c.days_on_market,
            s.kind as source_kind, s.provider, s.dataset,
            s.source_as_of::text
       from sold_comps c
       join sold_comp_sources s
         on s.id = c.source_id and s.workspace_id = c.workspace_id
      where c.workspace_id = $1
        and c.standard_status in ('Closed', 'Sold')
        and s.kind in ('mls_csv', 'reso_api')
      order by c.close_date desc
      limit 12`,
    [workspaceId],
  );
  return rows.map((row) => ({
    address: row.address_line1,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    closePrice: row.close_price,
    closeDate: row.close_date,
    listPrice: row.list_price,
    beds: row.beds,
    baths: row.baths,
    livingArea: row.living_area,
    propertyType: row.property_type,
    daysOnMarket: row.days_on_market,
    sourceKind: row.source_kind,
    provider: row.provider,
    dataset: row.dataset,
    sourceAsOf: row.source_as_of,
  }));
}

export async function createAssistantGeneration(
  sql: Sql,
  input: {
    id: string;
    workspaceId: string;
    userId: string;
    model: string;
    status: "started" | "blocked";
    inputChars: number;
    errorCode?: string;
  },
): Promise<boolean> {
  const rows = await sql.query<InsertedRow>(
    `insert into assistant_generations (
       id, workspace_id, user_id, model, status, input_chars, error_code,
       completed_at
     ) values ($1,$2,$3,$4,$5,$6,$7,
       case when $5 = 'blocked' then now() else null end)
     on conflict (id) do nothing
     returning 1 as inserted`,
    [
      input.id,
      input.workspaceId,
      input.userId,
      input.model,
      input.status,
      input.inputChars,
      input.errorCode ?? null,
    ],
  );
  return rows[0]?.inserted === 1;
}

export async function blockAssistantGeneration(
  sql: Sql,
  input: {
    id: string;
    errorCode: "minute_limit" | "daily_limit";
  },
): Promise<void> {
  await sql.query(
    `update assistant_generations
        set status = 'blocked',
            error_code = $2,
            completed_at = now()
      where id = $1 and status = 'started'`,
    [input.id, input.errorCode],
  );
}

export async function finishAssistantGeneration(
  sql: Sql,
  input: {
    id: string;
    status: "completed" | "failed";
    inputTokens?: number | null;
    outputTokens?: number | null;
    estimatedCostUsd?: number | null;
    errorCode?: string;
  },
): Promise<void> {
  await sql.query(
    `update assistant_generations
        set status = $2,
            input_tokens = $3,
            output_tokens = $4,
            estimated_cost_usd = $5,
            error_code = $6,
            completed_at = now()
      where id = $1 and status = 'started'`,
    [
      input.id,
      input.status,
      input.inputTokens ?? null,
      input.outputTokens ?? null,
      input.estimatedCostUsd ?? null,
      input.errorCode ?? null,
    ],
  );
}
