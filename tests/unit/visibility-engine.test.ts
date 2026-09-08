import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSql } from "@/lib/db";
import { ensurePersonalWorkspace } from "@/lib/workspaces/repository.server";
import { redeemAccessCode } from "@/lib/billing/entitlement.server";
import { saveCiteLockScan } from "@/lib/aieo/repository.server";
import { citeLockSubjectFingerprint } from "@/lib/aieo/scan.server";
import {
  continueVisibilityBatch,
  getVisibilityRuns,
  listVisibilityBatches,
  startVisibilityBatch,
  visibilityTrend,
} from "@/lib/aieo/visibility/engine.server";
import { ProviderError, type ProviderSpec } from "@/lib/aieo/visibility/providers.server";
import {
  applyInterventionCommand,
  draftIntervention,
  listInterventions,
  verificationSignature,
} from "@/lib/aieo/visibility/interventions.server";
import { toCitation } from "@/lib/aieo/visibility/evaluate";

afterEach(() => vi.unstubAllEnvs());

const INPUT = {
  website: "https://jordanrivera.example/",
  agentName: "Jordan Rivera",
  license: "01234567",
  jurisdiction: "US-CA" as const,
  area: "Rancho Santa Fe, CA",
};

const spec: ProviderSpec = { provider: "xai", label: "Grok", model: "grok-test", key: "k", verified: true };

async function entitledWorkspace() {
  const userId = `vis-${randomUUID()}`;
  const workspace = await ensurePersonalWorkspace(userId);
  await redeemAccessCode(userId, workspace.id, "RSF-BETA-01");
  await saveCiteLockScan(userId, workspace.id, {
    subjectFingerprint: citeLockSubjectFingerprint(INPUT),
    website: INPUT.website,
    jurisdiction: "US-CA",
    evaluatedAt: new Date().toISOString(),
    evidence: [],
    profilePatch: { name: INPUT.agentName, brokerageBrand: "Pacific Coast Realty", sameAs: ["https://www.zillow.com/profile/jordan-rivera"] },
    sourceOutcomes: [],
  });
  return { userId, workspace };
}

const answer = (text: string, urls: string[]) => ({
  text,
  citations: urls.map((url) => toCitation(url)!),
  returnedModel: "grok-4.6-real",
  searchCalls: 3,
  costUsdTicks: 500_000_000,
});

describe("visibility batch lifecycle", () => {
  it("refuses without entitlement", async () => {
    const userId = `vis-noent-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    await expect(startVisibilityBatch(userId, workspace.id, INPUT, { providers: [spec] })).rejects.toThrow(/active plan/i);
  });

  it("plans, executes in resumable slices, records failures, and aggregates", async () => {
    vi.stubEnv("CITELOCK_VISIBILITY_RUNS_PER_CALL", "3");
    const { userId, workspace } = await entitledWorkspace();
    const batch = await startVisibilityBatch(userId, workspace.id, INPUT, { providers: [spec] });
    expect(batch.plannedRuns).toBe(7);
    expect(batch.subject.websiteHost).toBe("jordanrivera.example");
    expect(batch.subject.profileUrls).toContain("https://www.zillow.com/profile/jordan-rivera");

    const ask = vi.fn(async (_spec: ProviderSpec, prompt: string) => {
      if (/relocating/.test(prompt)) throw new ProviderError("provider_http_400");
      if (/Jordan Rivera/.test(prompt)) return answer("Jordan Rivera is with Pacific Coast Realty. https://jordanrivera.example/about", ["https://jordanrivera.example/about"]);
      return answer("Consider Alex Chen (Compass) and Jordan Rivera.", ["https://www.zillow.com/profile/alex-chen", "https://www.realtor.com/agent/x"]);
    });
    const extract = vi.fn(async () => ({
      entities: [
        { name: "Alex Chen", kind: "agent" as const, recommended: true, brokerage: "Compass" },
        { name: "Jordan Rivera", kind: "agent" as const, recommended: true },
      ],
      model: "grok-extract",
      costUsdTicks: 10_000_000,
    }));

    let step = await continueVisibilityBatch(userId, workspace.id, batch.id, { providers: [spec], ask, extract });
    expect(step.executed).toBeGreaterThan(0);
    let guard = 0;
    while (step.remaining > 0 && guard < 10) {
      step = await continueVisibilityBatch(userId, workspace.id, batch.id, { providers: [spec], ask, extract });
      guard += 1;
    }
    expect(step.batch.status).toBe("completed");
    expect(step.batch.completedRuns).toBe(6);
    expect(step.batch.failedRuns).toBe(1);

    const detail = await getVisibilityRuns(userId, workspace.id, batch.id);
    const failed = detail.runs.find((run) => run.status === "failed");
    expect(failed?.errorCode).toBe("provider_http_400");
    const branded = detail.runs.filter((run) => run.branded);
    expect(branded.every((run) => run.returnedModel === "grok-4.6-real" && run.cited && run.recommended)).toBe(true);
    expect(detail.report.discovery).toEqual({ numerator: 4, denominator: 4, percent: 100 });
    expect(detail.report.identityAccuracy.percent).toBe(100);
    expect(detail.report.competitors[0]?.name).toBe("Alex Chen");
    // The subject controls one Zillow profile URL, but the cited page is a
    // competitor's, so Zillow is still a source gap.
    expect(detail.report.opportunities.some((item) => item.targetHost === "zillow.com")).toBe(true);
    expect(detail.batch.costUsd).toBeGreaterThan(0);
    // Extraction was not run for branded prompts.
    expect(extract).toHaveBeenCalledTimes(4);

    const list = await listVisibilityBatches(userId, workspace.id, batch.subjectFingerprint);
    expect(list[0]?.id).toBe(batch.id);
    const trend = await visibilityTrend(userId, workspace.id, batch.subjectFingerprint);
    expect(trend.filter((row) => row.batchId === batch.id)).toHaveLength(5);

    // A second continue is idempotent.
    const again = await continueVisibilityBatch(userId, workspace.id, batch.id, { providers: [spec], ask, extract });
    expect(again.executed).toBe(0);
    expect(ask).toHaveBeenCalledTimes(7);
  });

  it("retries transient failures once and then records them", async () => {
    const { userId, workspace } = await entitledWorkspace();
    const batch = await startVisibilityBatch(userId, workspace.id, INPUT, { providers: [spec] });
    const ask = vi.fn(async () => {
      throw new ProviderError("provider_timeout");
    });
    let step = await continueVisibilityBatch(userId, workspace.id, batch.id, { providers: [spec], ask });
    let guard = 0;
    while (step.remaining > 0 && guard < 20) {
      step = await continueVisibilityBatch(userId, workspace.id, batch.id, { providers: [spec], ask });
      guard += 1;
    }
    expect(step.batch.status).toBe("failed");
    expect(step.batch.failedRuns).toBe(7);
    expect(ask).toHaveBeenCalledTimes(14);
  });

  it("enforces the per-workspace daily batch budget and single running batch", async () => {
    vi.stubEnv("CITELOCK_VISIBILITY_BATCHES_PER_DAY", "1");
    const { userId, workspace } = await entitledWorkspace();
    await startVisibilityBatch(userId, workspace.id, INPUT, { providers: [spec] });
    await expect(startVisibilityBatch(userId, workspace.id, INPUT, { providers: [spec] })).rejects.toThrow(/already running/);
  });

  it("does not reveal another tenant's batch", async () => {
    const { userId, workspace } = await entitledWorkspace();
    const batch = await startVisibilityBatch(userId, workspace.id, INPUT, { providers: [spec] });
    await expect(getVisibilityRuns("stranger", workspace.id, batch.id)).rejects.toThrow("Workspace not found");
  });
});

describe("interventions", () => {
  it("builds a checklist without a model, gates approval, and verifies the live page", async () => {
    const { userId, workspace } = await entitledWorkspace();
    const opportunity = {
      key: "profile_claim:zillow.com",
      kind: "profile_claim" as const,
      title: "Claim and complete your Zillow agent profile",
      why: "cited",
      evidenceRunIds: [],
      clusterIds: ["choose_agent"],
      targetHost: "zillow.com",
      targetLabel: "Zillow agent profile",
      factors: { gap: 1, reach: 0.5, actionability: 0.9, fit: 1 },
      priority: 45,
      effort: "low" as const,
    };
    const draft = await draftIntervention(userId, workspace.id, {
      subjectFingerprint: citeLockSubjectFingerprint(INPUT),
      subject: { name: "Jordan Rivera", area: INPUT.area, websiteHost: "jordanrivera.example", profileUrls: [] },
      opportunity,
      kind: "profile_claim",
      declaredFacts: ["Covenant resident since 2012"],
    });
    expect(draft.state).toBe("proposed");
    expect(draft.draftedWith).toBe("checklist");
    expect(draft.content).toContain("Claim the profile for Jordan Rivera");
    expect(draft.facts).toContain("Covenant resident since 2012");

    await expect(
      applyInterventionCommand(userId, workspace.id, draft.id, { action: "deployed", url: "https://jordanrivera.example/zillow" }),
    ).rejects.toThrow(/Approve/);
    const approved = await applyInterventionCommand(userId, workspace.id, draft.id, { action: "approve" });
    expect(approved.state).toBe("approved");

    const signature = verificationSignature(draft.content)[0]!;
    const notLive = await applyInterventionCommand(
      userId,
      workspace.id,
      draft.id,
      { action: "deployed", url: "https://jordanrivera.example/zillow" },
      { fetchPage: async () => "<html><body>Coming soon</body></html>" },
    );
    expect(notLive.state).toBe("deployed");
    expect(notLive.verificationNote).toMatch(/none of/);
    const live = await applyInterventionCommand(
      userId,
      workspace.id,
      draft.id,
      { action: "deployed", url: "https://jordanrivera.example/zillow" },
      { fetchPage: async () => `<html><body><p>${signature}</p></body></html>` },
    );
    expect(live.state).toBe("verified");
    expect(live.verifiedAt).toBeTruthy();
    const listed = await listInterventions(userId, workspace.id, citeLockSubjectFingerprint(INPUT));
    expect(listed[0]?.state).toBe("verified");
    await expect(
      applyInterventionCommand(userId, workspace.id, draft.id, { action: "edit", title: "x", content: "y" }),
    ).rejects.toThrow(/verified/);
  });

  it("fails closed when a page draft needs a model and none is configured", async () => {
    vi.stubEnv("XAI_API_KEY", "");
    vi.stubEnv("GROK_API_KEY", "");
    const { userId, workspace } = await entitledWorkspace();
    await expect(
      draftIntervention(userId, workspace.id, {
        subjectFingerprint: citeLockSubjectFingerprint(INPUT),
        subject: { name: "Jordan Rivera", area: INPUT.area, websiteHost: "jordanrivera.example", profileUrls: [] },
        opportunity: {
          key: "site_page:area_expertise",
          kind: "site_page",
          title: "Publish a page",
          why: "",
          evidenceRunIds: [],
          clusterIds: [],
          factors: { gap: 1, reach: 1, actionability: 1, fit: 1 },
          priority: 100,
          effort: "medium",
        },
        kind: "site_page",
        declaredFacts: [],
      }),
    ).rejects.toThrow(/XAI_API_KEY/);
    const sql = await getSql();
    const rows = await sql.query("select count(*)::int as count from citelock_interventions where workspace_id = $1", [workspace.id]);
    expect((rows[0] as { count: number }).count).toBe(0);
  });
});
