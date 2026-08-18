import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";

export type OwnedListingFacts = {
  id: string;
  title: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  listPrice: number | null;
  beds: number | null;
  baths: number | null;
  livingArea: number | null;
};

export type OwnedListingMedia = {
  id: string;
  workspaceId: string;
  listingId: string;
  sourceUrl: string;
  contentType: string;
  provenance: string;
  sortOrder: number;
};

export type OwnedListingMediaSelection = {
  listing: OwnedListingFacts;
  media: OwnedListingMedia[];
};

interface ListingMediaRow {
  media_id: string;
  workspace_id: string;
  listing_id: string;
  source_url: string | null;
  private_storage_key: string | null;
  content_type: string | null;
  provenance: string;
  sort_order: number;
  title: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  list_price: string | number | null;
  beds: string | number | null;
  baths: string | number | null;
  living_area: number | null;
}

function requireOpaqueId(value: string, label: string): string {
  const trimmed = value.trim();
  if (
    value !== trimmed ||
    !trimmed ||
    trimmed.length > 240 ||
    /[\u0000-\u001f]/.test(trimmed)
  ) {
    throw new Error(`Invalid ${label}`);
  }
  return trimmed;
}

function optionalNumber(value: string | number | null): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Resolve renderable media exclusively from the authenticated workspace's
 * server-owned inventory. Callers pass opaque media ids, never fetchable URLs
 * or listing facts.
 */
export async function getOwnedListingMedia(
  userId: string,
  workspaceId: string,
  listingId: string,
  mediaIds: string[],
  sqlOverride?: Sql,
): Promise<OwnedListingMediaSelection> {
  const safeListingId = requireOpaqueId(listingId, "listing id");
  const safeMediaIds = mediaIds.map((id) => requireOpaqueId(id, "media id"));
  if (!safeMediaIds.length || safeMediaIds.length > 3) {
    throw new Error("Select between 1 and 3 listing photos");
  }
  if (new Set(safeMediaIds).size !== safeMediaIds.length) {
    throw new Error("Duplicate listing media ids are not allowed");
  }

  const sql = sqlOverride ?? (await getSql());
  const workspace = await requireWorkspaceAccess(
    userId,
    workspaceId,
    undefined,
    sql,
  );
  const placeholders = safeMediaIds.map((_, index) => `$${index + 3}`).join(", ");
  const rows = await sql.query<ListingMediaRow>(
    `select m.id as media_id, m.workspace_id, m.listing_id, m.source_url,
            m.private_storage_key, m.content_type, m.provenance, m.sort_order,
            l.title, l.address_line1, l.city, l.state, l.postal_code,
            l.list_price, l.beds, l.baths, l.living_area
       from listing_media m
       join listings l
         on l.id = m.listing_id and l.workspace_id = m.workspace_id
      where m.workspace_id = $1
        and m.listing_id = $2
        and m.id in (${placeholders})`,
    [workspace.id, safeListingId, ...safeMediaIds],
  );

  const byId = new Map(rows.map((row) => [row.media_id, row]));
  const ordered = safeMediaIds.map((id) => byId.get(id));
  if (ordered.some((row) => !row)) {
    // Do not reveal whether the missing id belongs to a different listing or
    // tenant.
    throw new Error("Listing media not found");
  }

  const first = ordered[0]!;
  const media = ordered.map((row) => {
    const item = row!;
    if (!item.source_url) {
      const reason = item.private_storage_key
        ? "Private listing media is not ready for rendering"
        : "Listing media has no renderable source";
      throw new Error(reason);
    }
    if (!item.content_type?.toLowerCase().startsWith("image/")) {
      throw new Error("Listing media must have a verified image content type");
    }
    return {
      id: item.media_id,
      workspaceId: item.workspace_id,
      listingId: item.listing_id,
      sourceUrl: item.source_url,
      contentType: item.content_type,
      provenance: item.provenance,
      sortOrder: item.sort_order,
    } satisfies OwnedListingMedia;
  });

  return {
    listing: {
      id: first.listing_id,
      title: first.title,
      addressLine1: first.address_line1,
      city: first.city,
      state: first.state,
      postalCode: first.postal_code,
      listPrice: optionalNumber(first.list_price),
      beds: optionalNumber(first.beds),
      baths: optionalNumber(first.baths),
      livingArea: first.living_area,
    },
    media,
  };
}
