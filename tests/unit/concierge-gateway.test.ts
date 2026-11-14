import { describe, expect, it } from "vitest";
import {
  advanceSimulation,
  DEMO_WALLET,
  deriveEscrowPlan,
  evaluateGatekeeper,
  formatUsd,
  SAMPLE_ASSET,
  SAMPLE_ROUND,
  startSimulation,
  type Pipeline,
} from "@/lib/concierge-gateway/engine";

function finish(run: Pipeline) {
  return Array.from({ length: 5 }).reduce<Pipeline>(advanceSimulation, run);
}

describe("concierge gateway simulation", () => {
  it("progresses in order and yields a Base target with exact escrow terms", () => {
    let state: Pipeline = startSimulation(SAMPLE_ASSET, "preapproved");
    for (const stage of ["records", "wallet", "claim", "gate", "escrow"]) {
      expect(state.stage).toBe(stage);
      state = advanceSimulation(state);
    }
    expect(state).toMatchObject({
      stage: "complete",
      escrow: {
        targetChainId: 8453,
        simulated: true,
        currentFunding: "0.00",
        fundingCap: "1850000.00",
        minimumFundingGoal: "925000.00",
        fundingWindowDays: 30,
      },
    });
    expect(advanceSimulation(state)).toBe(state);
  });

  it("blocks a missing AML claim and never creates a completed escrow", () => {
    const state = finish(startSimulation(SAMPLE_ASSET, "missing_aml"));
    expect(state).toMatchObject({ stage: "blocked", reason: expect.stringContaining("AML") });
    expect(state).not.toHaveProperty("escrow");
    expect(advanceSimulation(state)).toBe(state);
  });

  it("uses the tier captured at launch to decide whether a new claim qualifies", () => {
    const asset = { ...SAMPLE_ASSET };
    const initialState = startSimulation(asset, "new_claim");
    asset.tier = "standard";
    expect(finish(initialState)).toMatchObject({
      stage: "blocked",
      reason: expect.stringContaining("predates"),
    });
    expect(finish(startSimulation(asset, "new_claim")).stage).toBe("complete");
  });

  it("rejects invalid or mismatched identity state, claims and rounds", () => {
    const input: Parameters<typeof evaluateGatekeeper>[0] = {
      asset: SAMPLE_ASSET,
      round: SAMPLE_ROUND,
      identity: { walletAddress: DEMO_WALLET, kycStatus: "verified", hasOnchainClaim: true },
      claim: { walletAddress: DEMO_WALLET, topics: ["KYC", "AML"], preexisting: true },
    };
    expect(evaluateGatekeeper(input)).toEqual({ allowed: true });
    expect(evaluateGatekeeper({ ...input, claim: null }).allowed).toBe(false);
    expect(
      evaluateGatekeeper({ ...input, identity: { ...input.identity, walletAddress: null } })
        .allowed,
    ).toBe(false);
    expect(
      evaluateGatekeeper({ ...input, identity: { ...input.identity, kycStatus: "revoked" } })
        .allowed,
    ).toBe(false);
    expect(
      evaluateGatekeeper({ ...input, round: { ...SAMPLE_ROUND, status: "closed" } }).allowed,
    ).toBe(false);
    expect(
      evaluateGatekeeper({ ...input, round: { ...SAMPLE_ROUND, propertyId: "different-listing" } })
        .allowed,
    ).toBe(false);
  });

  it("computes exact cents and rejects malformed amounts or impossible escrow terms", () => {
    const round = { ...SAMPLE_ROUND, shareSupply: 3, pricePerShare: "0.10" };
    expect(deriveEscrowPlan(round, "0.20").fundingCap).toBe("0.30");
    expect(formatUsd("9007199254740993.12")).toBe("$9,007,199,254,740,993.12");
    expect(() => deriveEscrowPlan(round, "0.31")).toThrow(RangeError);
    expect(() => deriveEscrowPlan(round, "0")).toThrow(RangeError);
    expect(() => deriveEscrowPlan({ ...round, currentFunding: "0.31" }, "0.20")).toThrow(
      RangeError,
    );
    expect(() => deriveEscrowPlan({ ...round, shareSupply: 1.5 }, "0.20")).toThrow(RangeError);
    expect(() => deriveEscrowPlan({ ...round, pricePerShare: "0.001" }, "0.20")).toThrow(
      RangeError,
    );
  });
});
