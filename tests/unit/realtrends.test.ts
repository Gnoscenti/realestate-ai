import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  fetchRealTrendsProduction,
  parseRealTrendsProduction,
} from "@/lib/aieo/realtrends.server";
import { scoreAieo } from "@/lib/aieo/score";
import type { CiteEvidence } from "@/lib/aieo/types";

const PROFILE_URL =
  "https://www.realtrends.com/agent-profile/julie-pierce-casey-california/";

const PROFILE_HTML = `
<html><body>
  <h1>Julie Pierce Casey</h1>
  <section>
    <h2>2025 Rankings</h2>
    <div><span>Sales Volume</span><span>$33,614,777</span></div>
    <div><span>Transaction Sides</span><span>20</span></div>
  </section>
</body></html>`;

describe("RealTrends production parser", () => {
  it("extracts year-scoped volume and sides deterministically", () => {
    const observations = parseRealTrendsProduction(PROFILE_HTML);
    expect(observations).toEqual([
      {
        claimScope: "sales-sides:2025:full-year",
        field: "transaction_sides",
        value: "20 sides in 2025",
      },
      {
        claimScope: "sales-volume:2025:full-year",
        field: "transaction_volume",
        value: "$33,614,777 in 2025",
      },
    ]);
  });

  it("emits nothing from a page without year-scoped figures", () => {
    expect(
      parseRealTrendsProduction("<html><body>Agent profile</body></html>"),
    ).toEqual([]);
  });

  it("never mistakes an inline year or dollar figure for the sides count", () => {
    const observations = parseRealTrendsProduction(
      "<div>2025 Transaction Sides</div><div>20</div>",
    );
    expect(observations).toEqual([
      {
        claimScope: "sales-sides:2025:full-year",
        field: "transaction_sides",
        value: "20 sides in 2025",
      },
    ]);
  });
});

describe("RealTrends production adapter", () => {
  it("fetches live figures once and then serves the durable cache", async () => {
    const url = `${PROFILE_URL}?case=${randomUUID()}`;
    let fetches = 0;
    const first = await fetchRealTrendsProduction(
      { profileUrl: url, observedAt: "2026-08-21T00:00:00.000Z" },
      {
        now: () => "2026-08-21T00:00:00.000Z",
        fetchText: async () => {
          fetches += 1;
          return PROFILE_HTML;
        },
      },
    );
    expect(first.outcomes[0]).toMatchObject({
      source: "production",
      status: "verified",
    });
    const volume = first.evidence.find(
      (item) => item.field === "transaction_volume",
    );
    expect(volume).toMatchObject({
      sourceTier: "independent",
      status: "verified",
      claimScope: "sales-volume:2025:full-year",
    });

    const second = await fetchRealTrendsProduction(
      { profileUrl: url, observedAt: "2026-08-21T06:00:00.000Z" },
      {
        now: () => "2026-08-21T06:00:00.000Z",
        fetchText: async () => {
          throw new Error("must not refetch inside the TTL");
        },
      },
    );
    expect(fetches).toBe(1);
    expect(second.outcomes[0]?.status).toBe("verified");
    expect(
      second.evidence.find((item) => item.field === "transaction_volume")
        ?.value,
    ).toBe("$33,614,777 in 2025");
  });

  it("fails closed when the source is unavailable", async () => {
    const result = await fetchRealTrendsProduction(
      {
        profileUrl: `${PROFILE_URL}?case=${randomUUID()}`,
        observedAt: "2026-08-21T00:00:00.000Z",
      },
      {
        fetchText: async () => {
          throw new Error("network down");
        },
      },
    );
    expect(result.evidence).toEqual([]);
    expect(result.outcomes[0]).toMatchObject({
      status: "unavailable",
      code: "production_source_unavailable",
    });
  });

  it("rejects non-RealTrends URLs without fetching", async () => {
    const result = await fetchRealTrendsProduction(
      {
        profileUrl: "https://evil.example/agent-profile/x",
        observedAt: "2026-08-21T00:00:00.000Z",
      },
      {
        fetchText: async () => PROFILE_HTML,
      },
    );
    expect(result.evidence).toEqual([]);
    expect(result.outcomes[0]?.code).toBe("production_source_invalid_url");
  });
});

describe("independent production conflict gating", () => {
  it("blocks same-period conflicts between site and RealTrends figures", () => {
    const evaluatedAt = "2026-08-21T00:00:00.000Z";
    const evidence: CiteEvidence[] = [
      {
        id: "site:claim:sales-volume:2025:full-year:0",
        subject: "agent",
        field: "transaction_volume",
        value: "$44M in 2025",
        claimScope: "sales-volume:2025:full-year",
        sourceLabel: "Agent website",
        sourceTier: "first_party",
        status: "published",
        sourceUrl: "https://agent.example/",
        observedAt: evaluatedAt,
      },
      {
        id: "realtrends:sales-volume:2025:full-year",
        subject: "agent",
        field: "transaction_volume",
        value: "$33,614,777 in 2025",
        claimScope: "sales-volume:2025:full-year",
        sourceLabel: "RealTrends Verified",
        sourceTier: "independent",
        status: "verified",
        sourceUrl: PROFILE_URL,
        observedAt: evaluatedAt,
      },
    ];
    const report = scoreAieo({ evidence, evaluatedAt });
    const gate = report.gates.find((item) => item.id === "production-claims");
    expect(gate?.status).toBe("block");
    expect(
      report.conflicts.some(
        (conflict) =>
          conflict.field === "transaction_volume" &&
          conflict.severity === "blocking",
      ),
    ).toBe(true);
  });

  it("passes when the site figure matches the independent figure", () => {
    const evaluatedAt = "2026-08-21T00:00:00.000Z";
    const evidence: CiteEvidence[] = [
      {
        id: "site:claim:sales-volume:2025:full-year:0",
        subject: "agent",
        field: "transaction_volume",
        value: "$33,614,777 in 2025",
        claimScope: "sales-volume:2025:full-year",
        sourceLabel: "Agent website",
        sourceTier: "first_party",
        status: "published",
        sourceUrl: "https://agent.example/",
        observedAt: evaluatedAt,
      },
      {
        id: "realtrends:sales-volume:2025:full-year",
        subject: "agent",
        field: "transaction_volume",
        value: "$33,614,777 in 2025",
        claimScope: "sales-volume:2025:full-year",
        sourceLabel: "RealTrends Verified",
        sourceTier: "independent",
        status: "verified",
        sourceUrl: PROFILE_URL,
        observedAt: evaluatedAt,
      },
    ];
    const report = scoreAieo({ evidence, evaluatedAt });
    const gate = report.gates.find((item) => item.id === "production-claims");
    expect(gate?.status).toBe("pass");
  });
});
