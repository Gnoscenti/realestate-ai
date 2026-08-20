import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  consumeCiteLockScanQuota,
  getLatestCiteLockScan,
  saveCiteLockScan,
} from "@/lib/aieo/repository.server";
import type { CiteLockScanRecord } from "@/lib/aieo/scan-types";
import { ensurePersonalWorkspace } from "@/lib/workspaces/repository.server";

function scanAt(
  evaluatedAt: string,
  subjectFingerprint = "a".repeat(64),
): Omit<CiteLockScanRecord, "id"> {
  return {
    subjectFingerprint,
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
});
