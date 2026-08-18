import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getSql } from "../../src/lib/db";
import { getOwnedListingMedia } from "../../src/lib/listing-media/repository.server";
import { ensurePersonalWorkspace } from "../../src/lib/workspaces/repository.server";

async function seedListing(userId: string, label: string) {
  const workspace = await ensurePersonalWorkspace(userId);
  const sql = await getSql();
  const sourceId = `source-${randomUUID()}`;
  const listingId = `listing-${randomUUID()}`;
  const mediaIds = [`media-${randomUUID()}`, `media-${randomUUID()}`];

  await sql.query(
    `insert into data_sources
       (id, workspace_id, kind, display_name)
     values ($1, $2, 'manual', $3)`,
    [sourceId, workspace.id, `${label} source`],
  );
  await sql.query(
    `insert into listings (
       id, workspace_id, source_id, title, address_line1, city, state,
       postal_code, list_price, beds, baths, living_area, provenance,
       created_by_user_id
     ) values ($1,$2,$3,$4,'123 Main St','San Diego','CA','92101',
               850000,2,2,1200,'unit_test',$5)`,
    [listingId, workspace.id, sourceId, label, userId],
  );
  for (const [index, mediaId] of mediaIds.entries()) {
    await sql.query(
      `insert into listing_media (
         id, workspace_id, listing_id, source_url, content_type,
         sort_order, provenance
       ) values ($1,$2,$3,$4,'image/jpeg',$5,'unit_test')`,
      [
        mediaId,
        workspace.id,
        listingId,
        `https://photos-${index}.example.invalid/${mediaId}.jpg`,
        index,
      ],
    );
  }
  return { workspace, listingId, mediaIds };
}

describe("server-owned listing media", () => {
  it("resolves ids in caller order and takes listing facts from the database", async () => {
    const userId = `media-owner-${randomUUID()}`;
    const seeded = await seedListing(userId, "Server-owned listing");

    const result = await getOwnedListingMedia(
      userId,
      seeded.workspace.id,
      seeded.listingId,
      [seeded.mediaIds[1]!, seeded.mediaIds[0]!],
    );

    expect(result.media.map((item) => item.id)).toEqual([
      seeded.mediaIds[1],
      seeded.mediaIds[0],
    ]);
    expect(result.listing).toMatchObject({
      id: seeded.listingId,
      title: "Server-owned listing",
      addressLine1: "123 Main St",
      listPrice: 850000,
      beds: 2,
      baths: 2,
      livingArea: 1200,
    });
  });

  it("does not let another user discover a workspace's listing media", async () => {
    const owner = `media-owner-${randomUUID()}`;
    const stranger = `media-stranger-${randomUUID()}`;
    const seeded = await seedListing(owner, "Private listing");

    await expect(
      getOwnedListingMedia(
        stranger,
        seeded.workspace.id,
        seeded.listingId,
        [seeded.mediaIds[0]!],
      ),
    ).rejects.toThrow("Workspace not found");
  });

  it("rejects a media id from a different listing without disclosing it", async () => {
    const userId = `media-mix-${randomUUID()}`;
    const first = await seedListing(userId, "First listing");
    const second = await seedListing(userId, "Second listing");

    await expect(
      getOwnedListingMedia(
        userId,
        first.workspace.id,
        first.listingId,
        [second.mediaIds[0]!],
      ),
    ).rejects.toThrow("Listing media not found");
  });

  it("rejects duplicate ids and unverified non-image media", async () => {
    const userId = `media-validate-${randomUUID()}`;
    const seeded = await seedListing(userId, "Validation listing");

    await expect(
      getOwnedListingMedia(
        userId,
        seeded.workspace.id,
        seeded.listingId,
        [seeded.mediaIds[0]!, seeded.mediaIds[0]!],
      ),
    ).rejects.toThrow("Duplicate listing media ids");

    const sql = await getSql();
    await sql.query(
      `update listing_media set content_type = 'text/html' where id = $1`,
      [seeded.mediaIds[0]],
    );
    await expect(
      getOwnedListingMedia(
        userId,
        seeded.workspace.id,
        seeded.listingId,
        [seeded.mediaIds[0]!],
      ),
    ).rejects.toThrow("verified image content type");
  });
});
