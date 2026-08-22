import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  evaluateRecognitionResponse,
  extractCitations,
  getRecognitionRuns,
  runControlledRecognitionProbes,
  type RecognitionProviderSpec,
} from "@/lib/aieo/recognition.server";
import { saveCiteLockScan } from "@/lib/aieo/repository.server";
import { citeLockSubjectFingerprint } from "@/lib/aieo/scan.server";
import { scoreAieo } from "@/lib/aieo/score";
import type { CiteLockScanInput } from "@/lib/aieo/scan-types";
import { ensurePersonalWorkspace } from "@/lib/workspaces/repository.server";

const INPUT: CiteLockScanInput = {
  website: "https://pilot-agent.example.org/",
  agentName: "San Diego Pilot Agent",
  license: "01234567",
  jurisdiction: "US-CA",
};

function provider(name: string): RecognitionProviderSpec {
  return {
    provider: name,
    model: `${name}-test-model`,
    kind: "openai",
    url: `https://api.${name}.invalid/v1/chat/completions`,
    key: "test-key",
  };
}

async function seedScan(userId: string, workspaceId: string) {
  return saveCiteLockScan(userId, workspaceId, {
    subjectFingerprint: citeLockSubjectFingerprint(INPUT),
    website: INPUT.website,
    jurisdiction: "US-CA",
    evaluatedAt: new Date().toISOString(),
    evidence: [],
    profilePatch: {
      name: INPUT.agentName,
      brokerageBrand: "Pacific Coast Realty",
      areaOfOperations: "San Diego County",
    },
    sourceOutcomes: [],
  });
}

describe("deterministic response evaluation", () => {
  const subject = {
    agentName: "San Diego Pilot Agent",
    license: "01234567",
    brokerageBrand: "Pacific Coast Realty",
    websiteHost: "pilot-agent.example.org",
  };

  it("detects mention, citation, identity, and brokerage", () => {
    const text =
      "San Diego Pilot Agent (license 01234567) works with Pacific Coast Realty. See https://pilot-agent.example.org/about.";
    expect(evaluateRecognitionResponse(text, subject)).toMatchObject({
      mentioned: true,
      cited: true,
      correctIdentity: true,
      correctBrokerage: true,
    });
  });

  it("reports a miss without inventing recognition", () => {
    const text = "I could not find a well-known agent by that name.";
    expect(evaluateRecognitionResponse(text, subject)).toMatchObject({
      mentioned: false,
      cited: false,
      correctIdentity: false,
      correctBrokerage: false,
    });
  });

  it("does not grant identity on a bare mention", () => {
    const text = "San Diego Pilot Agent may be a realtor somewhere.";
    const result = evaluateRecognitionResponse(text, subject);
    expect(result.mentioned).toBe(true);
    expect(result.correctIdentity).toBe(false);
  });

  it("extracts and dedupes citations", () => {
    expect(
      extractCitations(
        "See https://a.example/x and https://a.example/x plus https://b.example/y.",
      ),
    ).toEqual(["https://a.example/x", "https://b.example/y"]);
  });
});

describe("controlled recognition probe batches", () => {
  it("refuses to probe an unverified subject", async () => {
    const userId = `recog-noscan-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    await expect(
      runControlledRecognitionProbes(userId, workspace.id, INPUT, {
        providers: [provider("grok")],
        callProvider: async () => "answer",
      }),
    ).rejects.toThrow(/verified CiteLock scan/i);
  });

  it("fails closed when no provider keys are configured", async () => {
    const userId = `recog-nokeys-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    await seedScan(userId, workspace.id);
    const batch = await runControlledRecognitionProbes(
      userId,
      workspace.id,
      INPUT,
      { providers: [] },
    );
    expect(batch.ok).toBe(false);
    expect(batch.outcome.code).toBe("recognition_providers_missing");
    expect(batch.stored).toBe(0);
  });

  it("persists reproducible runs and feeds the scoring aggregate", async () => {
    const userId = `recog-run-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    await seedScan(userId, workspace.id);

    const prompts: string[] = [];
    const batch = await runControlledRecognitionProbes(
      userId,
      workspace.id,
      INPUT,
      {
        providers: [provider("grok"), provider("chatgpt")],
        callProvider: async (spec, prompt) => {
          prompts.push(`${spec.provider}:${prompt}`);
          return "San Diego Pilot Agent, license 01234567, of Pacific Coast Realty — https://pilot-agent.example.org/";
        },
        location: "server:test",
      },
    );
    expect(batch.ok).toBe(true);
    expect(batch.providers).toEqual(["chatgpt", "grok"]);
    // 4 deterministic queries × 2 providers.
    expect(batch.stored).toBe(8);
    expect(prompts.some((p) => p.includes("Who is San Diego Pilot Agent"))).toBe(
      true,
    );

    const runs = await getRecognitionRuns(
      userId,
      workspace.id,
      citeLockSubjectFingerprint(INPUT),
    );
    expect(runs).toHaveLength(8);
    expect(new Set(runs.map((run) => run.queryId))).toEqual(
      new Set(["identity", "license-broker", "service-area", "local-discovery"]),
    );
    expect(runs.every((run) => run.location === "server:test")).toBe(true);
    expect(runs.every((run) => run.model?.endsWith("-test-model"))).toBe(true);

    const report = scoreAieo({
      profile: { name: INPUT.agentName } as never,
      recognitionRuns: runs,
    });
    expect(report.recognition).not.toBeNull();
    expect(report.recognition?.runs).toBe(8);
    expect(report.recognition?.state).toBe("insufficient");
    expect(report.recognition?.mentionRate).toBe(100);
  });

  it("skips a provider that errors and records the rest", async () => {
    const userId = `recog-skip-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    await seedScan(userId, workspace.id);
    const batch = await runControlledRecognitionProbes(
      userId,
      workspace.id,
      INPUT,
      {
        providers: [provider("grok"), provider("claude")],
        callProvider: async (spec) => {
          if (spec.provider === "claude") throw new Error("provider_http_500");
          return "No agent found.";
        },
      },
    );
    expect(batch.ok).toBe(true);
    expect(batch.providers).toEqual(["grok"]);
    expect(batch.skippedProviders).toEqual(["claude"]);
    expect(batch.stored).toBe(4);
  });

  it("enforces the hourly probe quota", async () => {
    const userId = `recog-quota-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    await seedScan(userId, workspace.id);
    const dependencies = {
      providers: [provider("grok")],
      callProvider: async () => "answer",
    };
    for (let index = 0; index < 4; index += 1) {
      await runControlledRecognitionProbes(
        userId,
        workspace.id,
        INPUT,
        dependencies,
      );
    }
    await expect(
      runControlledRecognitionProbes(userId, workspace.id, INPUT, dependencies),
    ).rejects.toThrow(/probe limit/i);
  });
});
