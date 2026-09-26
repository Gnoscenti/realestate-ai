import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  listOpenCiteLockDisputes,
  recordProductionDisputes,
  resolveCiteLockDispute,
} from "@/lib/aieo/repository.server";
import type { CiteLockScanRecord } from "@/lib/aieo/scan-types";
import type { CiteEvidence } from "@/lib/aieo/types";
import { ensurePersonalWorkspace } from "@/lib/workspaces/repository.server";

const FINGERPRINT = "b".repeat(64);

function volumeEvidence(
  id: string,
  value: string,
  sourceUrl: string,
): CiteEvidence {
  return {
    id,
    subject: "agent",
    field: "transaction_volume",
    value,
    claimScope: "sales-volume:2025:full-year",
    sourceLabel: id.startsWith("realtrends") ? "RealTrends Verified" : "Agent website",
    sourceTier: id.startsWith("realtrends") ? "independent" : "first_party",
    status: id.startsWith("realtrends") ? "verified" : "published",
    sourceUrl,
    observedAt: "2026-08-21T00:00:00.000Z",
  };
}

function scanWith(evidence: CiteEvidence[]): Omit<CiteLockScanRecord, "id"> {
  return {
    subjectFingerprint: FINGERPRINT,
    agentName: "Test Agent",
    website: "https://agent.example/",
    jurisdiction: "US-CA",
    evaluatedAt: "2026-08-21T00:00:00.000Z",
    evidence,
    profilePatch: {},
    sourceOutcomes: [],
  };
}

describe("production dispute governance", () => {
  it("routes same-period conflicts into the open dispute queue", async () => {
    const userId = `dispute-open-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    const recorded = await recordProductionDisputes(
      userId,
      workspace.id,
      scanWith([
        volumeEvidence("site:volume:2025", "$44M in 2025", "https://agent.example/"),
        volumeEvidence(
          "realtrends:sales-volume:2025:full-year",
          "$33,614,777 in 2025",
          "https://www.realtrends.com/agent-profile/x/",
        ),
      ]),
    );
    expect(recorded).toBe(1);
    const disputes = await listOpenCiteLockDisputes(
      userId,
      workspace.id,
      FINGERPRINT,
    );
    expect(disputes).toHaveLength(1);
    expect(disputes[0]).toMatchObject({
      field: "transaction_volume",
      claimScope: "sales-volume:2025:full-year",
      status: "open",
    });
    expect(disputes[0]!.values).toContain("$44M in 2025");
    expect(disputes[0]!.values).toContain("$33,614,777 in 2025");
  });

  it("does not open disputes for agreeing or single-source claims", async () => {
    const userId = `dispute-agree-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    // "$33.61M" and "$33,610,000" normalize to the same dollar figure.
    const agreeing = await recordProductionDisputes(
      userId,
      workspace.id,
      scanWith([
        volumeEvidence("site:volume:2025", "$33.61M in 2025", "https://agent.example/"),
        volumeEvidence(
          "realtrends:sales-volume:2025:full-year",
          "$33,610,000 in 2025",
          "https://www.realtrends.com/agent-profile/x/",
        ),
      ]),
    );
    expect(agreeing).toBe(0);

    const single = await recordProductionDisputes(
      userId,
      workspace.id,
      scanWith([
        volumeEvidence("site:volume:2025", "$44M in 2025", "https://agent.example/"),
      ]),
    );
    expect(single).toBe(0);
    await expect(
      listOpenCiteLockDisputes(userId, workspace.id, FINGERPRINT),
    ).resolves.toEqual([]);
  });

  it("refreshes an open dispute instead of duplicating it", async () => {
    const userId = `dispute-refresh-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    const conflicting = scanWith([
      volumeEvidence("site:volume:2025", "$44M in 2025", "https://agent.example/"),
      volumeEvidence(
        "realtrends:sales-volume:2025:full-year",
        "$33,614,777 in 2025",
        "https://www.realtrends.com/agent-profile/x/",
      ),
    ]);
    await recordProductionDisputes(userId, workspace.id, conflicting);
    await recordProductionDisputes(userId, workspace.id, conflicting);
    const disputes = await listOpenCiteLockDisputes(
      userId,
      workspace.id,
      FINGERPRINT,
    );
    expect(disputes).toHaveLength(1);
  });

  it("resolves a dispute and clears it from the open queue", async () => {
    const userId = `dispute-resolve-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    await recordProductionDisputes(
      userId,
      workspace.id,
      scanWith([
        volumeEvidence("site:volume:2025", "$44M in 2025", "https://agent.example/"),
        volumeEvidence(
          "realtrends:sales-volume:2025:full-year",
          "$33,614,777 in 2025",
          "https://www.realtrends.com/agent-profile/x/",
        ),
      ]),
    );
    const [dispute] = await listOpenCiteLockDisputes(
      userId,
      workspace.id,
      FINGERPRINT,
    );
    await resolveCiteLockDispute(userId, workspace.id, dispute!.id, {
      status: "resolved",
      note: "Site figure corrected to the RealTrends methodology.",
    });
    await expect(
      listOpenCiteLockDisputes(userId, workspace.id, FINGERPRINT),
    ).resolves.toEqual([]);
    await expect(
      resolveCiteLockDispute(userId, workspace.id, dispute!.id, {
        status: "resolved",
      }),
    ).rejects.toThrow(/not found/i);
  });
});
