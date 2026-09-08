import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getSql } from "../../src/lib/db";
import { parseSoldCsv } from "../../src/lib/sold-comps/parser";
import {
  SOLD_DATA_EMPTY_ASSISTANT_MESSAGE,
  isCurrentSoldCsvPreview,
} from "../../src/lib/sold-comps/types";
import {
  deleteSoldSource,
  importSoldCsv,
  listSoldDataLibrary,
} from "../../src/lib/sold-comps/repository.server";
import { ensurePersonalWorkspace } from "../../src/lib/workspaces/repository.server";

const header =
  "Record Key,MLS Number,Status,Full Address,Close Price,Close Date,Living Area,Property Type";

function csv(...rows: string[]): string {
  return [header, ...rows].join("\n");
}

function importInput(contents: string, suffix = "one") {
  return {
    filename: `closed-${suffix}.csv`,
    csv: contents,
    sourceAsOf: "2026-08-17",
    provider: "Licensed test export",
    dataset: "Unit test board",
    licenseConfirmed: true,
  };
}

describe("Closed/Sold CSV validation", () => {
  it("invalidates a preview when the selected file revision changes", () => {
    expect(isCurrentSoldCsvPreview(4, 4)).toBe(true);
    expect(isCurrentSoldCsvPreview(4, 5)).toBe(false);
  });

  it("directs an empty assistant result to the real CMA import flow", () => {
    expect(SOLD_DATA_EMPTY_ASSISTANT_MESSAGE).toContain("/cma");
    expect(SOLD_DATA_EMPTY_ASSISTANT_MESSAGE).toContain("authorized Closed/Sold CSV");
    expect(SOLD_DATA_EMPTY_ASSISTANT_MESSAGE).not.toContain(
      "import is not available",
    );
  });

  it("handles a BOM, quoted commas, doubled quotes, and common aliases", () => {
    const contents = [
      "\uFEFFListingKey,MLS,StandardStatus,Full Address,Sold Price,Sold Date,Sqft,PropertyType,Subdivision Name",
      'key-1,MLS-1,Closed,"123 Main St, Portland, OR 97201","$725,000",08/12/2026,"2,150",Residential,"The ""Garden"" District"',
    ].join("\r\n");

    const result = parseSoldCsv(contents);

    expect(result.errors).toEqual([]);
    expect(result.acceptedCount).toBe(1);
    expect(result.rows[0]).toMatchObject({
      recordKey: "key-1",
      listingKey: "key-1",
      mlsNumber: "MLS-1",
      standardStatus: "Closed",
      addressLine1: "123 Main St",
      city: "Portland",
      state: "OR",
      postalCode: "97201",
      closePrice: 725000,
      closeDate: "2026-08-12",
      livingArea: 2150,
      propertyType: "Residential",
      subdivision: 'The "Garden" District',
    });
  });

  it("accepts a quoted field containing a newline without shifting rows", () => {
    const contents = [
      "Record ID,Status,Street Address,City,State,Sale Price,Sale Date,Square Feet,Property Type,Subdivision",
      'newline-1,Sold,9 River Rd,Salem,OR,500000,2026-07-01,1600,Residential,"River\nDistrict"',
    ].join("\n");

    const result = parseSoldCsv(contents);

    expect(result.totalRows).toBe(1);
    expect(result.acceptedCount).toBe(1);
    expect(result.rows[0]?.subdivision).toBe("River\nDistrict");
  });

  it("rejects active/pending and missing required data with row-specific reasons", () => {
    const result = parseSoldCsv(
      csv(
        'active-1,A1,Active,"1 A St, Portland, OR 97201",600000,2026-08-01,1800,Residential',
        'pending-1,P1,Pending,"2 B St, Portland, OR 97202",610000,2026-08-02,1850,Residential',
        'bad-1,B1,Closed,"3 C St, Portland, OR 97203",0,not-a-date,0,',
      ),
    );

    expect(result.acceptedCount).toBe(0);
    expect(result.rejectedCount).toBe(3);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 2, field: "standardStatus" }),
        expect.objectContaining({ row: 3, field: "standardStatus" }),
        expect.objectContaining({ row: 4, field: "closePrice" }),
        expect.objectContaining({ row: 4, field: "closeDate" }),
        expect.objectContaining({ row: 4, field: "livingArea" }),
        expect.objectContaining({ row: 4, field: "propertyType" }),
      ]),
    );
  });

  it("deduplicates repeated record keys inside one file", () => {
    const result = parseSoldCsv(
      csv(
        'same,S1,Sold,"1 A St, Portland, OR 97201",600000,2026-08-01,1800,Residential',
        'same,S1,Sold,"1 A St, Portland, OR 97201",600000,2026-08-01,1800,Residential',
      ),
    );

    expect(result.acceptedCount).toBe(1);
    expect(result.rejectedCount).toBe(1);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ row: 3, field: "recordKey" }),
    );
  });
});

describe("persisted Closed/Sold library", () => {
  it("persists across reloads and idempotently refreshes an existing record", async () => {
    const userId = `sold-owner-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    const firstCsv = csv(
      'persist-1,MLS-P1,Closed,"10 Oak St, Portland, OR 97205",750000,2026-07-15,2000,Residential',
    );

    const first = await importSoldCsv(
      userId,
      workspace.id,
      importInput(firstCsv, "persist"),
    );
    const firstLoad = await listSoldDataLibrary(userId, workspace.id);
    const secondLoad = await listSoldDataLibrary(userId, workspace.id);
    const repeated = await importSoldCsv(
      userId,
      workspace.id,
      {
        ...importInput(firstCsv, "renamed-copy"),
        provider: "Changed provider label",
      },
    );
    const finalLoad = await listSoldDataLibrary(userId, workspace.id);

    expect(first.createdCount).toBe(1);
    expect(firstLoad.recordCount).toBe(1);
    expect(secondLoad.records).toEqual(firstLoad.records);
    expect(repeated.createdCount).toBe(0);
    expect(repeated.updatedCount).toBe(1);
    expect(repeated.staleSkippedCount).toBe(0);
    expect(repeated.sourceId).toBe(first.sourceId);
    expect(finalLoad.recordCount).toBe(1);
    expect(finalLoad.sources).toHaveLength(1);
    expect(finalLoad.sources[0]).toMatchObject({
      filename: "closed-persist.csv",
      provider: "Licensed test export",
      dataset: "Unit test board",
    });
  });

  it("does not let an older export overwrite a newer persisted record", async () => {
    const userId = `sold-freshness-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    const newer = csv(
      'fresh-1,F1,Sold,"15 Oak St, Portland, OR 97205",900000,2026-07-15,2000,Residential',
    );
    const older = csv(
      'fresh-1,F1,Sold,"15 Oak St, Portland, OR 97205",100000,2026-07-15,2000,Residential',
    );

    await importSoldCsv(userId, workspace.id, {
      ...importInput(newer, "fresh-new"),
      sourceAsOf: "2026-08-17",
    });
    const stale = await importSoldCsv(userId, workspace.id, {
      ...importInput(older, "fresh-old"),
      sourceAsOf: "2026-07-01",
    });
    const library = await listSoldDataLibrary(userId, workspace.id);

    expect(stale.createdCount).toBe(0);
    expect(stale.updatedCount).toBe(0);
    expect(stale.staleSkippedCount).toBe(1);
    expect(Number(library.records[0]?.closePrice)).toBe(900000);
  });

  it("uses row source-updated time before the file as-of date", async () => {
    const userId = `sold-row-freshness-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    const timestampHeader = `${header},Source Updated At`;
    const first = [
      timestampHeader,
      'row-fresh-1,RF1,Sold,"16 Oak St, Portland, OR 97205",910000,2026-07-15,2010,Residential,2026-08-10T12:00:00Z',
    ].join("\n");
    const staleRowInNewerFile = [
      timestampHeader,
      'row-fresh-1,RF1,Sold,"16 Oak St, Portland, OR 97205",110000,2026-07-15,2010,Residential,2026-08-01T12:00:00Z',
    ].join("\n");

    await importSoldCsv(userId, workspace.id, {
      ...importInput(first, "row-fresh-new"),
      sourceAsOf: "2026-08-11",
    });
    const stale = await importSoldCsv(userId, workspace.id, {
      ...importInput(staleRowInNewerFile, "row-fresh-old"),
      sourceAsOf: "2026-08-20",
    });
    const library = await listSoldDataLibrary(userId, workspace.id);

    expect(stale.staleSkippedCount).toBe(1);
    expect(Number(library.records[0]?.closePrice)).toBe(910000);
  });

  it("never persists Active rows in the Closed/Sold pool", async () => {
    const userId = `sold-filter-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    const mixed = csv(
      'closed-only,C1,Closed,"20 Pine St, Portland, OR 97209",900000,2026-08-01,2400,Residential',
      'active-never,A1,Active,"21 Pine St, Portland, OR 97209",910000,2026-08-02,2450,Residential',
    );

    const imported = await importSoldCsv(
      userId,
      workspace.id,
      importInput(mixed, "mixed"),
    );
    const library = await listSoldDataLibrary(userId, workspace.id);
    const sql = await getSql();
    const activeRows = await sql.query<{ count: number }>(
      `select count(*)::bigint as count
         from sold_comps
        where workspace_id = $1 and record_key like '%' || $2`,
      [workspace.id, ":active-never"],
    );

    expect(imported.acceptedCount).toBe(1);
    expect(imported.rejectedCount).toBe(1);
    expect(library.records.map((record) => record.recordKey)).toEqual([
      "closed-only",
    ]);
    expect(activeRows[0]?.count).toBe(0);
  });

  it("does not reveal, list, import into, or delete another tenant's source", async () => {
    const owner = `sold-tenant-owner-${randomUUID()}`;
    const stranger = `sold-tenant-stranger-${randomUUID()}`;
    const ownerWorkspace = await ensurePersonalWorkspace(owner);
    await ensurePersonalWorkspace(stranger);
    const imported = await importSoldCsv(
      owner,
      ownerWorkspace.id,
      importInput(
        csv(
          'tenant-1,T1,Sold,"30 Cedar St, Portland, OR 97210",880000,2026-06-20,2200,Residential',
        ),
        "tenant",
      ),
    );

    await expect(
      listSoldDataLibrary(stranger, ownerWorkspace.id),
    ).rejects.toThrow("Workspace not found");
    await expect(
      importSoldCsv(
        stranger,
        ownerWorkspace.id,
        importInput(
          csv(
            'intruder-1,I1,Sold,"31 Cedar St, Portland, OR 97210",885000,2026-06-21,2210,Residential',
          ),
          "intruder",
        ),
      ),
    ).rejects.toThrow("Workspace not found");
    await expect(
      deleteSoldSource(stranger, ownerWorkspace.id, imported.sourceId),
    ).rejects.toThrow("Workspace not found");

    const stillThere = await listSoldDataLibrary(owner, ownerWorkspace.id);
    expect(stillThere.recordCount).toBe(1);
  });

  it("lets members read but denies source imports and deletion", async () => {
    const owner = `sold-role-owner-${randomUUID()}`;
    const member = `sold-role-member-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(owner);
    const sql = await getSql();
    await sql.query(
      `insert into workspace_memberships (workspace_id, user_id, role)
       values ($1, $2, 'member')`,
      [workspace.id, member],
    );
    const imported = await importSoldCsv(
      owner,
      workspace.id,
      importInput(
        csv(
          'role-1,R1,Sold,"32 Cedar St, Portland, OR 97210",885000,2026-06-21,2210,Residential',
        ),
        "role",
      ),
    );

    await expect(listSoldDataLibrary(member, workspace.id)).resolves.toMatchObject({
      recordCount: 1,
    });
    await expect(
      importSoldCsv(
        member,
        workspace.id,
        importInput(
          csv(
            'role-2,R2,Sold,"33 Cedar St, Portland, OR 97210",890000,2026-06-22,2220,Residential',
          ),
          "role-member",
        ),
      ),
    ).rejects.toThrow("Workspace not found");
    await expect(
      deleteSoldSource(member, workspace.id, imported.sourceId),
    ).rejects.toThrow("Workspace not found");
  });

  it("keeps identical source keys separate across dataset/board namespaces", async () => {
    const userId = `sold-namespace-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    const contents = csv(
      'shared-key,SHARED-1,Sold,"35 Alder St, Portland, OR 97212",800000,2026-06-01,2100,Residential',
    );

    await importSoldCsv(userId, workspace.id, {
      ...importInput(contents, "board-a"),
      dataset: "Board A",
    });
    await importSoldCsv(userId, workspace.id, {
      ...importInput(contents, "board-b"),
      dataset: "Board B",
    });
    const library = await listSoldDataLibrary(userId, workspace.id);

    expect(library.recordCount).toBe(2);
    expect(library.records.map((record) => record.recordKey)).toEqual([
      "shared-key",
      "shared-key",
    ]);
    expect(new Set(library.records.map((record) => record.sourceId)).size).toBe(2);
  });

  it("deleting a source deletes only its currently linked records", async () => {
    const userId = `sold-delete-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    const first = await importSoldCsv(
      userId,
      workspace.id,
      importInput(
        csv(
          'delete-1,D1,Sold,"40 Fir St, Portland, OR 97211",700000,2026-05-01,1900,Residential',
        ),
        "delete-a",
      ),
    );
    await importSoldCsv(
      userId,
      workspace.id,
      importInput(
        csv(
          'keep-1,K1,Closed,"41 Fir St, Portland, OR 97211",710000,2026-05-02,1950,Residential',
        ),
        "delete-b",
      ),
    );

    await expect(
      deleteSoldSource(userId, workspace.id, first.sourceId),
    ).resolves.toEqual({ deleted: true });
    const library = await listSoldDataLibrary(userId, workspace.id);

    expect(library.recordCount).toBe(1);
    expect(library.records[0]?.recordKey).toBe("keep-1");
  });
});
