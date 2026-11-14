/**
 * Concierge view models. Amounts are decimal USD strings at the database boundary
 * so Postgres NUMERIC values can round-trip without floating-point conversion.
 */
export type UsdAmount = string;
export type ConciergeTier = "standard" | "bespoke";
export type RoundStatus = "draft" | "compliance_review" | "open" | "closed" | "cancelled";
export type KycStatus = "pending" | "verified" | "rejected" | "revoked";

/** View of properties_luxury. The locale is stored separately in the row. */
export interface LuxuryAsset {
  readonly id: string;
  readonly title: string;
  readonly address: string;
  readonly valuation: UsdAmount;
  readonly isOffMarket: boolean;
  readonly tier: ConciergeTier;
}

/** View of property_tokenization_rounds. Share supply is a safe whole number. */
export interface TokenizationRound {
  readonly id: string;
  readonly propertyId: LuxuryAsset["id"];
  readonly shareSupply: number;
  readonly pricePerShare: UsdAmount;
  readonly currentFunding: UsdAmount;
  readonly status: RoundStatus;
}

/** View of compliance_identity_registry. A claim flag alone never grants eligibility. */
export interface IdentityRegistryState {
  readonly walletAddress: string | null;
  readonly kycStatus: KycStatus;
  readonly hasOnchainClaim: boolean;
}

/**
 * Adapter inputs for the supplied schema. SQL adapters should project numeric
 * amounts as text and validate rows and enum values before crossing into the UI.
 */
export interface LuxuryAssetRow {
  readonly id: string;
  readonly listing_title: string;
  readonly street_address: string;
  readonly target_locale: string;
  readonly total_valuation: UsdAmount;
  readonly is_off_market_pocket: boolean;
  readonly concierge_tier: ConciergeTier;
}

export interface TokenizationRoundRow {
  readonly id: string;
  readonly property_id: LuxuryAsset["id"];
  readonly token_contract_address: string | null;
  readonly fractional_token_supply: number;
  readonly price_per_share: UsdAmount;
  readonly min_funding_goal: UsdAmount;
  readonly current_funding_pool: UsdAmount;
  readonly round_status: RoundStatus;
}

export interface IdentityRegistryRow {
  readonly id: string;
  readonly user_id: string;
  readonly wallet_address: string | null;
  readonly kyc_status: KycStatus;
  readonly has_onchain_claim: boolean;
}
