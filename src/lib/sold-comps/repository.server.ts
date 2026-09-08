import { createHash } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import { parseSoldCsv } from "./parser";
import type {
  SoldCompSourceRecord,
  SoldDataLibrary,
  SoldDataRecord,
  SoldRecordInput,
} from "./types";

export interface SoldCsvImportInput {
  filename: string;
  csv: string;
  sourceAsOf: string;
  provider?: string;
  dataset: string;
  licenseConfirmed: boolean;
}

export interface SoldCsvImportResult {
  sourceId: string;
  acceptedCount: number;
  rejectedCount: number;
  createdCount: number;
  updatedCount: number;
  staleSkippedCount: number;
  errors: ReturnType<typeof parseSoldCsv>["errors"];
}

interface SourceRow {
  id: string;
  kind: "mls_csv" | "reso_api";
  provider: string | null;
  dataset: string | null;
  filename: string | null;
  source_as_of: string | null;
  row_count: number;
  rejected_count: number;
  linked_record_count: number;
  created_at: string;
}

interface RecordRow {
  id: string;
  source_id: string;
  record_key: string;
  listing_key: string | null;
  mls_number: string | null;
  standard_status: "Closed" | "Sold";
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string | null;
  close_price: string;
  close_date: string;
  living_area: number;
  property_type: string;
  source_as_of: string | null;
  source_filename: string | null;
  source_provider: string | null;
  source_dataset: string | null;
}

const RECORD_LIST_LIMIT = 500;

function safeText(value: string | undefined, max: number): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.length > max || /[\u0000-\u001f]/.test(trimmed)) {
    throw new Error("Invalid source metadata");
  }
  return trimmed;
}

function isoSourceAsOf(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) throw new Error("Source as-of date must use YYYY-MM-DD");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Source as-of date is invalid");
  }
  return date.toISOString();
}

function digest(...values: string[]): string {
  const hash = createHash("sha256");
  for (const value of values) hash.update(value).update("\0");
  return hash.digest("hex");
}

function normalizedNamespace(dataset: string): string {
  return dataset
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
}

function canonicalRecordKey(dataset: string, sourceRecordKey: string): string {
  const namespaceHash = digest(normalizedNamespace(dataset)).slice(0, 16);
  return `ns:${namespaceHash}:${sourceRecordKey}`;
}

function sourceRecordKey(storedRecordKey: string): string {
  const match = /^ns:[0-9a-f]{16}:(.*)$/s.exec(storedRecordKey);
  return match?.[1] ?? storedRecordKey;
}

function sourceRecord(row: SourceRow): SoldCompSourceRecord {
  return {
    id: row.id,
    kind: row.kind,
    provider: row.provider,
    dataset: row.dataset,
    filename: row.filename,
    sourceAsOf: row.source_as_of,
    rowCount: row.row_count,
    rejectedCount: row.rejected_count,
    linkedRecordCount: row.linked_record_count,
    createdAt: row.created_at,
  };
}

function soldRecord(row: RecordRow): SoldDataRecord {
  return {
    id: row.id,
    sourceId: row.source_id,
    recordKey: sourceRecordKey(row.record_key),
    listingKey: row.listing_key,
    mlsNumber: row.mls_number,
    standardStatus: row.standard_status,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    closePrice: row.close_price,
    closeDate: row.close_date,
    livingArea: row.living_area,
    propertyType: row.property_type,
    sourceAsOf: row.source_as_of,
    sourceFilename: row.source_filename,
    sourceProvider: row.source_provider,
    sourceDataset: row.source_dataset,
  };
}

export async function listSoldDataLibrary(
  userId: string,
  workspaceId: string,
  sqlOverride?: Sql,
): Promise<SoldDataLibrary> {
  const sql = sqlOverride ?? (await getSql());
  const workspace = await requireWorkspaceAccess(
    userId,
    workspaceId,
    undefined,
    sql,
  );
  const [sourceRows, recordRows, countRows] = await Promise.all([
    sql.query<SourceRow>(
      `select s.id, s.kind, s.provider, s.dataset, s.filename,
              s.source_as_of::text, s.row_count, s.rejected_count,
              count(c.id)::bigint as linked_record_count,
              s.created_at::text
         from sold_comp_sources s
         left join sold_comps c
           on c.workspace_id = s.workspace_id and c.source_id = s.id
        where s.workspace_id = $1
        group by s.id
        order by s.created_at desc, s.id desc`,
      [workspace.id],
    ),
    sql.query<RecordRow>(
      `select c.id, c.source_id, c.record_key, c.listing_key, c.mls_number,
              c.standard_status, c.address_line1, c.address_line2, c.city,
              c.state, c.postal_code, c.close_price::text, c.close_date::text,
              c.living_area, c.property_type, s.source_as_of::text,
              s.filename as source_filename, s.provider as source_provider,
              s.dataset as source_dataset
         from sold_comps c
         join sold_comp_sources s
           on s.workspace_id = c.workspace_id and s.id = c.source_id
        where c.workspace_id = $1
        order by c.close_date desc, c.record_key
        limit $2`,
      [workspace.id, RECORD_LIST_LIMIT],
    ),
    sql.query<{ count: number }>(
      `select count(*)::bigint as count
         from sold_comps
        where workspace_id = $1`,
      [workspace.id],
    ),
  ]);
  const recordCount = countRows[0]?.count ?? 0;
  return {
    sources: sourceRows.map(sourceRecord),
    records: recordRows.map(soldRecord),
    recordCount,
    recordsTruncated: recordCount > recordRows.length,
  };
}

function databaseRow(
  workspaceId: string,
  dataset: string,
  row: SoldRecordInput,
) {
  const recordKey = canonicalRecordKey(dataset, row.recordKey);
  return {
    id: `sold:${digest(workspaceId, recordKey).slice(0, 40)}`,
    record_key: recordKey,
    listing_key: row.listingKey,
    mls_number: row.mlsNumber,
    standard_status: row.standardStatus,
    address_line1: row.addressLine1,
    address_line2: row.addressLine2,
    city: row.city,
    state: row.state,
    postal_code: row.postalCode,
    subdivision: row.subdivision,
    close_price: row.closePrice,
    close_date: row.closeDate,
    list_price: row.listPrice,
    original_list_price: row.originalListPrice,
    beds: row.beds,
    baths: row.baths,
    living_area: row.livingArea,
    year_built: row.yearBuilt,
    property_type: row.propertyType,
    property_subtype: row.propertySubtype,
    latitude: row.latitude,
    longitude: row.longitude,
    days_on_market: row.daysOnMarket,
    source_updated_at: row.sourceUpdatedAt,
  };
}

export async function importSoldCsv(
  userId: string,
  workspaceId: string,
  input: SoldCsvImportInput,
  sqlOverride?: Sql,
): Promise<SoldCsvImportResult> {
  const sql = sqlOverride ?? (await getSql());
  const workspace = await requireWorkspaceAccess(
    userId,
    workspaceId,
    ["owner", "admin"],
    sql,
  );
  const filename = safeText(input.filename, 180);
  if (!filename || !filename.toLowerCase().endsWith(".csv")) {
    throw new Error("Choose a .csv file");
  }
  const provider = safeText(input.provider, 160);
  const dataset = safeText(input.dataset, 160);
  if (input.licenseConfirmed !== true) {
    throw new Error("Confirm authorization to use this export");
  }
  if (!dataset) {
    throw new Error("Dataset/board namespace is required");
  }
  const sourceAsOf = isoSourceAsOf(input.sourceAsOf);
  const parsed = parseSoldCsv(input.csv);
  if (parsed.acceptedCount === 0) {
    throw new Error("No valid Closed/Sold rows to import");
  }

  const sourceId = `sold-source:${digest(
    workspace.id,
    normalizedNamespace(dataset),
    sourceAsOf,
    input.csv,
  ).slice(0, 40)}`;
  const keys = parsed.rows.map((row) => canonicalRecordKey(dataset, row.recordKey));
  const keyParams = keys.map((_, index) => `$${index + 2}`).join(",");
  const existingRows = await sql.query<{ record_key: string }>(
    `select record_key
       from sold_comps
      where workspace_id = $1 and record_key in (${keyParams})`,
    [workspace.id, ...keys],
  );
  const existingKeys = new Set(existingRows.map((row) => row.record_key));

  const payload = parsed.rows.map((row) =>
    databaseRow(workspace.id, dataset, row),
  );
  const savedRows = await sql.query<{ record_key: string }>(
    `with source_upsert as (
       insert into sold_comp_sources (
         id, workspace_id, kind, provider, dataset, filename, source_as_of,
         imported_by_user_id, row_count, rejected_count
       ) values ($1,$2,'mls_csv',$3,$4,$5,$6,$7,$8,$9)
       on conflict (id) do update set
         id = excluded.id
       where sold_comp_sources.workspace_id = excluded.workspace_id
       returning id, workspace_id
     ), incoming as (
       select *
         from jsonb_to_recordset($10::jsonb) as r(
           id text, record_key text, listing_key text, mls_number text,
           standard_status text, address_line1 text, address_line2 text,
           city text, state text, postal_code text, subdivision text,
           close_price numeric, close_date date, list_price numeric,
           original_list_price numeric, beds numeric, baths numeric,
           living_area integer, year_built integer, property_type text,
           property_subtype text, latitude numeric, longitude numeric,
           days_on_market integer, source_updated_at timestamptz
         )
     )
     insert into sold_comps (
       id, workspace_id, source_id, record_key, listing_key, mls_number,
       standard_status, address_line1, address_line2, city, state, postal_code,
       subdivision, close_price, close_date, list_price, original_list_price,
       beds, baths, living_area, year_built, property_type, property_subtype,
       latitude, longitude, days_on_market, source_updated_at
     )
     select r.id, s.workspace_id, s.id, r.record_key, r.listing_key, r.mls_number,
            r.standard_status, r.address_line1, r.address_line2, r.city,
            r.state, r.postal_code, r.subdivision, r.close_price, r.close_date,
            r.list_price, r.original_list_price, r.beds, r.baths,
            r.living_area, r.year_built, r.property_type, r.property_subtype,
            r.latitude, r.longitude, r.days_on_market, r.source_updated_at
       from incoming r
       cross join source_upsert s
     on conflict (workspace_id, record_key) do update set
       source_id = excluded.source_id,
       listing_key = excluded.listing_key,
       mls_number = excluded.mls_number,
       standard_status = excluded.standard_status,
       address_line1 = excluded.address_line1,
       address_line2 = excluded.address_line2,
       city = excluded.city,
       state = excluded.state,
       postal_code = excluded.postal_code,
       subdivision = excluded.subdivision,
       close_price = excluded.close_price,
       close_date = excluded.close_date,
       list_price = excluded.list_price,
       original_list_price = excluded.original_list_price,
       beds = excluded.beds,
       baths = excluded.baths,
       living_area = excluded.living_area,
       year_built = excluded.year_built,
       property_type = excluded.property_type,
       property_subtype = excluded.property_subtype,
       latitude = excluded.latitude,
       longitude = excluded.longitude,
       days_on_market = excluded.days_on_market,
       source_updated_at = excluded.source_updated_at
     where
       coalesce(excluded.source_updated_at, $6::timestamptz) >
       coalesce(
         sold_comps.source_updated_at,
         (
           select existing_source.source_as_of
             from sold_comp_sources existing_source
            where existing_source.workspace_id = sold_comps.workspace_id
              and existing_source.id = sold_comps.source_id
         ),
         '-infinity'::timestamptz
       )
       or (
         coalesce(excluded.source_updated_at, $6::timestamptz) =
         coalesce(
           sold_comps.source_updated_at,
           (
             select existing_source.source_as_of
               from sold_comp_sources existing_source
              where existing_source.workspace_id = sold_comps.workspace_id
                and existing_source.id = sold_comps.source_id
           ),
           '-infinity'::timestamptz
         )
         and excluded.source_id >= sold_comps.source_id
       )
     returning record_key`,
    [
      sourceId,
      workspace.id,
      provider,
      dataset,
      filename,
      sourceAsOf,
      userId,
      parsed.acceptedCount,
      parsed.rejectedCount,
      JSON.stringify(payload),
    ],
  );
  const savedKeys = new Set(savedRows.map((row) => row.record_key));
  const updatedCount = keys.filter(
    (key) => savedKeys.has(key) && existingKeys.has(key),
  ).length;
  const createdCount = savedRows.length - updatedCount;
  return {
    sourceId,
    acceptedCount: parsed.acceptedCount,
    rejectedCount: parsed.rejectedCount,
    createdCount,
    updatedCount,
    staleSkippedCount: parsed.acceptedCount - savedRows.length,
    errors: parsed.errors,
  };
}

export async function deleteSoldSource(
  userId: string,
  workspaceId: string,
  sourceId: string,
  sqlOverride?: Sql,
): Promise<{ deleted: boolean }> {
  const sql = sqlOverride ?? (await getSql());
  const workspace = await requireWorkspaceAccess(
    userId,
    workspaceId,
    ["owner", "admin"],
    sql,
  );
  const rows = await sql.query<{ id: string }>(
    `delete from sold_comp_sources
      where id = $1 and workspace_id = $2
      returning id`,
    [sourceId, workspace.id],
  );
  return { deleted: rows.length === 1 };
}
