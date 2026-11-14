import { walletSchema } from "@/lib/compliance-ledger/types";
import type {
  IdentityRegistryRow,
  IdentityRegistryState,
  LuxuryAsset,
  LuxuryAssetRow,
  TokenizationRound,
  TokenizationRoundRow,
  UsdAmount,
} from "./types";

/** Database-shaped fixtures used exclusively in the browser walkthrough. */
export const SAMPLE_ASSET_ROW: LuxuryAssetRow = {
  id: "demo-cumbre-estate",
  listing_title: "The Cumbre Estate",
  street_address: "1234 Via De La Cumbre",
  target_locale: "Rancho Santa Fe, California",
  total_valuation: "18500000.00",
  is_off_market_pocket: true,
  concierge_tier: "bespoke",
};

const SAMPLE_ROUND_ROW: TokenizationRoundRow = {
  id: "demo-cumbre-round",
  property_id: SAMPLE_ASSET_ROW.id,
  token_contract_address: null,
  fractional_token_supply: 1850,
  price_per_share: "1000.00",
  min_funding_goal: "925000.00",
  current_funding_pool: "0.00",
  round_status: "compliance_review",
};

const SAMPLE_INVESTOR_ROW: IdentityRegistryRow = {
  id: "demo-investor-identity",
  user_id: "demo-investor",
  wallet_address: "0x0000000000000000000000000000000000000042",
  kyc_status: "verified",
  has_onchain_claim: true,
};

export function assetFromRow(row: LuxuryAssetRow): LuxuryAsset {
  return {
    id: row.id,
    title: row.listing_title,
    address: row.street_address,
    valuation: row.total_valuation,
    isOffMarket: row.is_off_market_pocket,
    tier: row.concierge_tier,
  };
}

function roundFromRow(row: TokenizationRoundRow): TokenizationRound {
  return {
    id: row.id,
    propertyId: row.property_id,
    shareSupply: row.fractional_token_supply,
    pricePerShare: row.price_per_share,
    currentFunding: row.current_funding_pool,
    status: row.round_status,
  };
}

function identityFromRow(row: IdentityRegistryRow): IdentityRegistryState {
  return {
    walletAddress: row.wallet_address,
    kycStatus: row.kyc_status,
    hasOnchainClaim: row.has_onchain_claim,
  };
}

export const SAMPLE_ASSET = assetFromRow(SAMPLE_ASSET_ROW);
export const SAMPLE_ROUND = roundFromRow(SAMPLE_ROUND_ROW);
export const DEMO_WALLET = walletSchema.parse(SAMPLE_INVESTOR_ROW.wallet_address);
export const SCENARIOS = [
  { id: "preapproved", label: "Pre-approved investor" },
  { id: "new_claim", label: "New investor claim" },
  { id: "missing_aml", label: "Missing AML claim" },
] as const;
export type Scenario = (typeof SCENARIOS)[number]["id"];

type ClaimTopic = "KYC" | "AML";
interface DemoClaim {
  readonly walletAddress: string;
  readonly topics: readonly ClaimTopic[];
  readonly preexisting: boolean;
}

export type GateDecision = { allowed: true } | { allowed: false; reason: string };

interface GateInput {
  readonly asset: LuxuryAsset;
  readonly round: TokenizationRound;
  readonly identity: IdentityRegistryState;
  readonly claim: DemoClaim | null;
}

/** Demonstration policy. A browser check has no authority over a live offering. */
export function evaluateGatekeeper({ asset, round, identity, claim }: GateInput): GateDecision {
  if (round.propertyId !== asset.id || !["compliance_review", "open"].includes(round.status)) {
    return { allowed: false, reason: "The linked round must be in compliance review or open." };
  }
  const wallet = walletSchema.safeParse(identity.walletAddress);
  if (!wallet.success || claim?.walletAddress !== wallet.data) {
    return { allowed: false, reason: "A claim must be bound to the connected demo wallet." };
  }
  if (
    identity.kycStatus !== "verified" ||
    !identity.hasOnchainClaim ||
    !claim.topics.includes("KYC")
  ) {
    return { allowed: false, reason: "The investor needs a verified demo KYC claim." };
  }
  if (!claim.topics.includes("AML")) {
    return { allowed: false, reason: "The demo claim is missing the AML topic." };
  }
  if (asset.tier === "bespoke" && !claim.preexisting) {
    return { allowed: false, reason: "Bespoke tier requires a claim that predates this run." };
  }
  return { allowed: true };
}

/** Convert only validated decimal USD strings to exact integer cents. */
function toCents(amount: UsdAmount): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(amount)) {
    throw new RangeError("Enter a nonnegative USD amount with up to two decimal places.");
  }
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

const dollarFormat = new Intl.NumberFormat("en-US");
export function formatUsd(amount: UsdAmount): string {
  const cents = toCents(amount);
  const fraction = cents % 100n;
  return (
    "$" +
    dollarFormat.format(cents / 100n) +
    (fraction ? "." + String(fraction).padStart(2, "0") : "")
  );
}

export interface EscrowPlan {
  readonly fundingCap: UsdAmount;
  readonly minimumFundingGoal: UsdAmount;
  readonly currentFunding: UsdAmount;
  readonly releaseCondition: "goal_and_approval";
  readonly refundCondition: "shortfall_at_close";
  readonly fundingWindowDays: 30;
  readonly targetChainId: 8453;
  readonly simulated: true;
}

export function deriveEscrowPlan(
  round: TokenizationRound,
  minimumFundingGoal: UsdAmount,
): EscrowPlan {
  if (!Number.isSafeInteger(round.shareSupply) || round.shareSupply <= 0) {
    throw new RangeError("Share supply must be a positive safe integer.");
  }
  const cap = BigInt(round.shareSupply) * toCents(round.pricePerShare);
  const goal = toCents(minimumFundingGoal);
  if (goal <= 0n || goal > cap || toCents(round.currentFunding) > cap) {
    throw new RangeError("Funding goal and balance must fit within the round cap.");
  }
  return {
    fundingCap: (cap / 100n).toString() + "." + String(cap % 100n).padStart(2, "0"),
    minimumFundingGoal,
    currentFunding: round.currentFunding,
    releaseCondition: "goal_and_approval",
    refundCondition: "shortfall_at_close",
    fundingWindowDays: 30,
    targetChainId: 8453,
    simulated: true,
  };
}

export const DEMO_ESCROW = deriveEscrowPlan(SAMPLE_ROUND, SAMPLE_ROUND_ROW.min_funding_goal);

export interface DemoRun {
  readonly asset: LuxuryAsset;
  readonly scenario: Scenario;
  readonly round: TokenizationRound;
  readonly identity: IdentityRegistryState;
  readonly claim: DemoClaim | null;
}

export type Pipeline =
  | { stage: "idle" }
  | { stage: "records"; asset: LuxuryAsset; scenario: Scenario }
  | { stage: "wallet" | "claim" | "gate" | "escrow"; run: DemoRun }
  | { stage: "blocked"; run: DemoRun; reason: string }
  | { stage: "complete"; run: DemoRun; escrow: EscrowPlan };

export function startSimulation(asset: LuxuryAsset, scenario: Scenario): Pipeline {
  return { stage: "records", asset: { ...asset }, scenario };
}

/** Each tick commits one local transition. Blocked runs cannot reach escrow. */
export function advanceSimulation(pipeline: Pipeline): Pipeline {
  switch (pipeline.stage) {
    case "records":
      // Create the browser-only record snapshot before binding the investor wallet.
      return {
        stage: "wallet",
        run: {
          asset: pipeline.asset,
          scenario: pipeline.scenario,
          round: SAMPLE_ROUND,
          identity: { walletAddress: null, kycStatus: "pending", hasOnchainClaim: false },
          claim: null,
        },
      };
    case "wallet":
      return {
        stage: "claim",
        run: {
          ...pipeline.run,
          identity: { ...pipeline.run.identity, walletAddress: DEMO_WALLET },
        },
      };
    case "claim": {
      const { run } = pipeline;
      return {
        stage: "gate",
        run: {
          ...run,
          identity: identityFromRow(SAMPLE_INVESTOR_ROW),
          claim: {
            walletAddress: DEMO_WALLET,
            topics: run.scenario === "missing_aml" ? ["KYC"] : ["KYC", "AML"],
            preexisting: run.scenario !== "new_claim",
          },
        },
      };
    }
    case "gate": {
      const { run } = pipeline;
      const result = evaluateGatekeeper(run);
      return result.allowed
        ? { stage: "escrow", run }
        : { stage: "blocked", run, reason: result.reason };
    }
    case "escrow":
      return {
        stage: "complete",
        run: pipeline.run,
        escrow: deriveEscrowPlan(pipeline.run.round, SAMPLE_ROUND_ROW.min_funding_goal),
      };
    default:
      return pipeline;
  }
}
