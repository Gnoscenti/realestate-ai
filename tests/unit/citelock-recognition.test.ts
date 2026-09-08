import { describe, expect, it } from "vitest";
import {
  buildRecognitionPanel,
  runRecognitionPanel,
  type RecognitionProviderAdapter,
} from "@/lib/aieo/recognition.server";
import type { CiteLockScanRecord } from "@/lib/aieo/scan-types";

const NOW = "2026-09-04T19:00:00.000Z";

const scan: CiteLockScanRecord = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  subjectFingerprint: "a".repeat(64),
  agentName: "San Diego Pilot Agent",
  website: "https://agent.example/",
  jurisdiction: "US-CA",
  evaluatedAt: NOW,
  evidence: [
    {
      id: "license",
      subject: "agent",
      field: "license",
      value: "01234567",
      sourceLabel: "State regulator",
      sourceTier: "regulator",
      status: "verified",
    },
    {
      id: "broker",
      subject: "brokerage",
      field: "responsible_broker",
      value: "Pacific Coast Real Estate Inc",
      sourceLabel: "State regulator",
      sourceTier: "regulator",
      status: "verified",
    },
    {
      id: "area",
      subject: "market",
      field: "service_area",
      value: "San Diego County",
      sourceLabel: "Brokerage",
      sourceTier: "brokerage",
      status: "corroborated",
    },
  ],
  profilePatch: {},
  sourceOutcomes: [],
};

function adapter(id: RecognitionProviderAdapter["id"]): RecognitionProviderAdapter {
  return {
    id,
    model: `${id}-frozen-model`,
    async run() {
      return {
        status: "succeeded",
        text:
          "San Diego Pilot Agent is licensed as 01234567 under Pacific Coast Real Estate Inc.",
        raw: {
          authorization: "must-not-persist",
          citations: ["https://agent.example/profile#bio"],
        },
      };
    },
  };
}

describe("CiteLock controlled Recognition runner", () => {
  it("freezes four prompt families and captures three providers reproducibly", async () => {
    const result = await runRecognitionPanel(
      scan,
      [adapter("chatgpt"), adapter("grok"), adapter("perplexity")],
      () => NOW,
    );

    expect(buildRecognitionPanel(scan).map((item) => item.queryId)).toEqual([
      "identity",
      "license-broker",
      "service-area",
      "local-discovery",
    ]);
    expect(result.captures).toHaveLength(12);
    expect(result.configuredProviders).toEqual(["chatgpt", "grok", "perplexity"]);
    expect(result.captures[0]).toMatchObject({
      runDate: "2026-09-04",
      location: "San Diego, California, United States",
      mentioned: true,
      cited: true,
      correctIdentity: true,
      correctBrokerage: true,
      status: "succeeded",
    });
    expect(result.captures[0]!.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.captures[0]!.responseHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result.captures[0]!.rawResponse)).not.toContain(
      "must-not-persist",
    );
    expect(result.captures[0]!.citations).toEqual([
      "https://agent.example/profile",
    ]);
  });

  it("refuses to describe a one- or two-provider sample as multi-model", async () => {
    await expect(
      runRecognitionPanel(scan, [adapter("chatgpt"), adapter("grok")], () => NOW),
    ).rejects.toThrow("requires three configured providers");
  });
});
