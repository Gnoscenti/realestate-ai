import { z } from "zod";

export const SANDBOX_ACTION_LIMIT = 1000;
export const SANDBOX_INVESTOR_LIMIT = 25;

export const SANDBOX_NOTICE = "Simulation only. No identity verification, SDAR certification, blockchain transaction, real USDC, or property ownership is created.";
export const walletSchema = z.string().trim().regex(/^0x[0-9a-fA-F]{40}$/, "Enter a 20-byte wallet address.")
  .transform(value => value.toLowerCase())
  .refine(value => !/^0x0{40}$/.test(value), "The zero address cannot be an investor.");
export const amountSchema = z.string().trim().regex(/^(?:0|[1-9]\d{0,6})(?:\.\d{1,6})?$/, "Use a positive decimal with up to six decimal places.")
  .pipe(z.string().refine(value => {
    const [whole, fraction = ""] = value.split(".");
    const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
    return units > 0n && units <= 1_000_000_000_000n;
  }, "Enter more than zero and at most 1,000,000 test USDC."));
export const listingReferenceSchema = z.object({ listingId: z.string().min(1).max(240) }).strict();
const reference = { caseId: z.string().uuid(), operationId: z.string().uuid(), expectedRevision: z.number().int().positive() };
export const commandSchema = z.discriminatedUnion("kind", [
  z.object({ ...reference, kind: z.literal("verify_mock_identity"), wallet: walletSchema }).strict(),
  z.object({ ...reference, kind: z.literal("revoke_mock_identity"), wallet: walletSchema }).strict(),
  z.object({ ...reference, kind: z.literal("deposit"), wallet: walletSchema, amount: amountSchema }).strict(),
  z.object({ ...reference, kind: z.literal("allocate"), wallet: walletSchema, amount: amountSchema }).strict(),
  z.object({ ...reference, kind: z.literal("refund"), wallet: walletSchema, amount: amountSchema }).strict(),
]);
export type SandboxCommand = z.infer<typeof commandSchema>;
export interface SandboxInvestor {
  wallet: string;
  mockIdentity: "approved" | "revoked";
  claimExpiresAt: string;
  escrowMicro: string;
  allocatedMicro: string;
}
export interface SandboxState {
  version: 1;
  investors: SandboxInvestor[];
}
export interface SandboxCase {
  id: string;
  listingId: string;
  listingTitle: string;
  listingStatus: string;
  revision: number;
  state: SandboxState;
  mode: "simulation";
  contractAddress: null;
  chainId: 31337;
}
export interface SandboxEvent {
  operationId: string;
  revision: number;
  kind: SandboxCommand["kind"];
  wallet: string;
  amount?: string;
  createdAt: string;
}
export interface SandboxWorkspace {
  ownerId: string;
  enabled: boolean;
  listings: { id: string; title: string; status: string }[];
  cases: SandboxCase[];
}
export const eligibleListingStatus = (status: string) =>
  ["active", "pending", "coming_soon", "unknown"].includes(status);
