import { getSql } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  consumeCiteLockScanQuota,
  getLatestCiteLockScan,
  saveCiteLockScan,
} from "@/lib/aieo/repository.server";
import {
  assertRecognitionPanelAvailable,
  reserveRecognitionPanel,
  listRecentRecognitionCaptures,
  saveRecognitionCaptures,
} from "@/lib/aieo/recognition-repository.server";
import type { CiteRecognitionCapture } from "@/lib/aieo/recognition-types";
import type { CiteLockScanRecord } from "@/lib/aieo/scan-types";
import { ensurePersonalWorkspace } from "@/lib/workspaces/repository.server";

function scanAt(
  evaluatedAt: string,
  subjectFingerprint = "a".repeat(64),
): Omit<CiteLockScanRecord, "id"> {
  return {
    subjectFingerprint,
    agentName: "San Diego Pilot Agent",
    website: "https://pilot-agent.example.org",
    jurisdiction: "US-CA",
    evaluatedAt,
    evidence: [],
    profilePatch: { name: "San Diego Pilot Agent" },
    sourceOutcomes: [
      {
        source: "website",
        status: "observed",
        label: "Website audited",
      },
    ],
  };
}

describe("CiteLock scan repository", () => {
  it("keeps append-only history and returns the latest workspace scan", async () => {
    const userId = `citelock-history-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    const first = await saveCiteLockScan(
      userId,
      workspace.id,
      scanAt("2026-08-19T10:00:00.000Z"),
    );
    const second = await saveCiteLockScan(
      userId,
      workspace.id,
      scanAt("2026-08-19T11:00:00.000Z"),
    );

    expect(first.id).not.toBe(second.id);
    await expect(
      getLatestCiteLockScan(userId, workspace.id, second.subjectFingerprint),
    ).resolves.toEqual(second);
  });

  it("isolates profiles that share an origin by subject fingerprint", async () => {
    const userId = `citelock-subject-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    const first = await saveCiteLockScan(
      userId,
      workspace.id,
      scanAt("2026-08-19T10:00:00.000Z", "a".repeat(64)),
    );
    await saveCiteLockScan(
      userId,
      workspace.id,
      scanAt("2026-08-19T11:00:00.000Z", "b".repeat(64)),
    );

    await expect(
      getLatestCiteLockScan(userId, workspace.id, first.subjectFingerprint),
    ).resolves.toEqual(first);
  });

  it("does not reveal another tenant's scan history", async () => {
    const owner = `citelock-owner-${randomUUID()}`;
    const stranger = `citelock-stranger-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(owner);
    await saveCiteLockScan(
      owner,
      workspace.id,
      scanAt("2026-08-19T12:00:00.000Z"),
    );

    await expect(
      getLatestCiteLockScan(stranger, workspace.id, "a".repeat(64)),
    ).rejects.toThrow("Workspace not found");
  });

  it("enforces the database-backed hourly scan limit", async () => {
    const userId = `citelock-quota-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    for (let index = 0; index < 6; index += 1) {
      await consumeCiteLockScanQuota(userId, workspace.id);
    }

    await expect(
      consumeCiteLockScanQuota(userId, workspace.id),
    ).rejects.toThrow("CiteLock scan limit reached");
  });

  it("persists immutable Recognition evidence and isolates it by tenant", async () => {
    const owner = `recognition-owner-${randomUUID()}`;
    const stranger = `recognition-stranger-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(owner);
    const scan = await saveCiteLockScan(
      owner,
      workspace.id,
      scanAt(new Date().toISOString()),
    );
    const observedAt = new Date().toISOString();
    const capture: CiteRecognitionCapture = {
      id: randomUUID(),
      scanId: scan.id,
      subjectFingerprint: scan.subjectFingerprint,
      panelVersion: "test-panel-v1",
      queryId: "identity",
      prompt: "Who is the San Diego Pilot Agent?",
      promptHash: "b".repeat(64),
      provider: "chatgpt",
      model: "test-model",
      location: "San Diego, California, United States",
      runDate: observedAt.slice(0, 10),
      status: "succeeded",
      responseText: "A test response",
      rawResponse: { id: "provider-response" },
      responseHash: "c".repeat(64),
      citations: ["https://agent.example/"],
      mentioned: true,
      cited: true,
      correctIdentity: true,
      correctBrokerage: false,
      observedAt,
    };

    await expect(
      saveRecognitionCaptures(owner, workspace.id, [capture]),
    ).resolves.toEqual([capture]);
    await expect(
      listRecentRecognitionCaptures(owner, workspace.id, scan.subjectFingerprint),
    ).resolves.toEqual([capture]);
    const sql = await getSql();
    await expect(sql.query(
      "update citelock_recognition_runs set response_text='rewritten' where id=$1",
      [capture.id],
    )).rejects.toThrow("cannot be rewritten");
    const otherWorkspace = await ensurePersonalWorkspace(stranger);
    await expect(sql.query(
      `insert into citelock_recognition_runs
       select (jsonb_populate_record(null::citelock_recognition_runs,
         to_jsonb(r) || jsonb_build_object('id', $1::text, 'workspace_id', $2::text))).*
       from citelock_recognition_runs r where id=$3`,
      [randomUUID(), otherWorkspace.id, capture.id],
    )).rejects.toThrow(/foreign key|tenant_fk/i);

    await expect(
      assertRecognitionPanelAvailable(
        owner,
        workspace.id,
        scan.subjectFingerprint,
        capture.panelVersion,
        capture.runDate,
      ),
    ).rejects.toThrow("already been captured today");
    await expect(
      listRecentRecognitionCaptures(
        stranger,
        workspace.id,
        scan.subjectFingerprint,
      ),
    ).rejects.toThrow("Workspace not found");
  });
  it("claims concurrent identical panels once and caps distinct paid work", async () => {
    const userId = "recognition-claim-" + randomUUID();
    const workspace = await ensurePersonalWorkspace(userId);
    const date = "2026-09-08";
    const duplicate = await Promise.allSettled(Array.from({ length: 8 }, () =>
      reserveRecognitionPanel(userId, workspace.id, "a".repeat(64), "claim-test", date),
    ));
    expect(duplicate.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const distinct = await Promise.allSettled(["b", "c", "d", "e"].map((prefix) =>
      reserveRecognitionPanel(userId, workspace.id, prefix.repeat(64), "claim-test", date),
    ));
    expect(distinct.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    const sql = await getSql();
    const quota = await sql.query<{ used_panels: number }>(
      "select used_panels from citelock_panel_daily_quota where workspace_id=$1 and run_date=$2::date",
      [workspace.id, date],
    );
    expect(quota[0].used_panels).toBe(3);
    await expect(reserveRecognitionPanel("stranger", workspace.id, "f".repeat(64), "claim-test", date))
      .rejects.toThrow("Workspace not found");
  });

});
