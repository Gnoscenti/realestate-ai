import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  getLatestAttestedListings,
  getMlsConnectionSummary,
  runServerMlsAttestation,
  saveMlsConnection,
} from "@/lib/aieo/attestation.server";
import { resoToProperty } from "@/lib/mls-sync";
import { scoreAieo } from "@/lib/aieo/score";
import type { CiteAgentProfile, CiteProperty } from "@/lib/aieo/provenance";
import { ensurePersonalWorkspace } from "@/lib/workspaces/repository.server";

const CONNECTION = {
  platform: "reso_web" as const,
  baseUrl: "https://api.example-mls.org/odata",
  agentMlsId: "PILOT123",
  agentName: "San Diego Pilot Agent",
  accessToken: "server-held-token",
};

function resoRow(overrides: Record<string, unknown> = {}) {
  return {
    ListingId: "TEST2001",
    UnparsedAddress: "1 Attested Test Way",
    City: "San Diego",
    ListPrice: 1_500_000,
    StandardStatus: "Active",
    PropertyType: "Residential",
    BedroomsTotal: 4,
    BathroomsTotalInteger: 3,
    LivingArea: 2400,
    ListAgentMlsId: "PILOT123",
    ListAgentFullName: "San Diego Pilot Agent",
    InternetEntireListingDisplayYN: "Y",
    InternetAddressDisplayYN: "Y",
    ListingURL: "https://listings.example-mls.org/TEST2001",
    ModificationTimestamp: new Date().toISOString(),
    ...overrides,
  };
}

function syncedListings(): CiteProperty[] {
  const listing = resoToProperty(resoRow(), {
    agentMlsId: "PILOT123",
    agentName: "San Diego Pilot Agent",
    platform: "reso_web",
  });
  expect(listing).not.toBeNull();
  return [listing as CiteProperty];
}

describe("server-owned MLS connection", () => {
  it("stores credentials server-side and never returns them", async () => {
    const userId = `attest-conn-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    const summary = await saveMlsConnection(userId, workspace.id, CONNECTION);
    expect(summary.platform).toBe("reso_web");
    expect(summary.hasCredentials).toBe(true);
    expect(JSON.stringify(summary)).not.toContain("server-held-token");

    const fetched = await getMlsConnectionSummary(userId, workspace.id);
    expect(fetched?.id).toBe(summary.id);
    expect(JSON.stringify(fetched)).not.toContain("server-held-token");
  });

  it("rejects a connection without credentials", async () => {
    const userId = `attest-nocred-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    await expect(
      saveMlsConnection(userId, workspace.id, {
        platform: "reso_web",
        baseUrl: CONNECTION.baseUrl,
      }),
    ).rejects.toThrow(/access token or client credentials/i);
  });
});

describe("server MLS attestation runner", () => {
  it("fails closed when no server connection exists", async () => {
    const userId = `attest-missing-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    const result = await runServerMlsAttestation(userId, workspace.id, {
      sync: async () => {
        throw new Error("must not sync without a connection");
      },
    });
    expect(result.ok).toBe(false);
    expect(result.outcome.code).toBe("provider_connection_missing");
    expect(result.listings).toEqual([]);
  });

  it("mints durable attestations the scoring layer accepts", async () => {
    const userId = `attest-run-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    await saveMlsConnection(userId, workspace.id, CONNECTION);

    const result = await runServerMlsAttestation(userId, workspace.id, {
      sync: async (request) => {
        expect(request.accessToken).toBe("server-held-token");
        expect(request.agentMlsId).toBe("PILOT123");
        return {
          ok: true,
          platform: "reso_web",
          listings: syncedListings(),
          rawCount: 1,
          warnings: [],
        };
      },
    });
    expect(result.ok).toBe(true);
    const attested = result.listings[0]!;
    expect(attested.source?.trust).toBe("server_attested");
    expect(attested.source?.attestationId).toBeTruthy();
    expect(attested.representation?.role).toBe("listing");

    const restored = await getLatestAttestedListings(userId, workspace.id);
    expect(restored).toHaveLength(1);
    expect(restored[0]!.source?.attestationId).toBe(
      attested.source?.attestationId,
    );

    const profile = {
      name: "San Diego Pilot Agent",
      agentMlsId: "PILOT123",
    } as CiteAgentProfile;
    const report = scoreAieo({ profile, properties: restored });
    const gate = report.gates.find((item) => item.id === "listing-role");
    expect(gate?.status).toBe("pass");
    const roleEvidence = report.evidence.find(
      (item) => item.field === "listing_role",
    );
    expect(roleEvidence?.status).toBe("verified");
    expect(roleEvidence?.sourceTier).toBe("mls");
  });

  it("keeps the latest batch as the authoritative inventory", async () => {
    const userId = `attest-batch-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    await saveMlsConnection(userId, workspace.id, CONNECTION);
    const sync = async () => ({
      ok: true,
      platform: "reso_web" as const,
      listings: syncedListings(),
      rawCount: 1,
      warnings: [],
    });
    const first = await runServerMlsAttestation(userId, workspace.id, {
      sync,
      now: () => "2026-08-20T00:00:00.000Z",
    });
    const second = await runServerMlsAttestation(userId, workspace.id, {
      sync,
      now: () => "2026-08-21T00:00:00.000Z",
    });
    expect(first.batchId).not.toBe(second.batchId);
    const restored = await getLatestAttestedListings(userId, workspace.id);
    expect(restored).toHaveLength(1);
    expect(restored[0]!.source?.attestationId).toBe(
      second.listings[0]!.source?.attestationId,
    );
  });

  it("propagates a failed provider sync as an unavailable outcome", async () => {
    const userId = `attest-fail-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    await saveMlsConnection(userId, workspace.id, CONNECTION);
    const result = await runServerMlsAttestation(userId, workspace.id, {
      sync: async () => ({
        ok: false,
        platform: "reso_web" as const,
        listings: [],
        rawCount: 0,
        warnings: [],
        error: "HTTP 401",
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.outcome.code).toBe("provider_sync_failed");
    await expect(
      getLatestAttestedListings(userId, workspace.id),
    ).resolves.toEqual([]);
  });
});
