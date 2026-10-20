import { SANDBOX_INVESTOR_LIMIT, commandSchema, type SandboxCommand, type SandboxState } from "./types";

export function toMicro(amount: string): bigint {
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}
export function formatMicro(value: string): string {
  const units = BigInt(value);
  return `${units / 1_000_000n}.${(units % 1_000_000n).toString().padStart(6, "0")}`.replace(/\.?0+$/, "");
}
export function identityCurrent(expiresAt: string, now = Date.now()): boolean {
  return Date.parse(expiresAt) > now;
}
/** Pure simulation; no wallet, payment, KYC or blockchain client exists here. */
export function applySandboxCommand(state: SandboxState, raw: SandboxCommand, nowISO: string): SandboxState {
  const command = commandSchema.parse(raw);
  const now = Date.parse(nowISO);
  if (!Number.isFinite(now)) throw new Error("Invalid simulation time.");
  const next: SandboxState = structuredClone(state);
  let investor = next.investors.find(row => row.wallet === command.wallet);
  if (command.kind === "verify_mock_identity") {
    if (!investor) {
      if (next.investors.length >= SANDBOX_INVESTOR_LIMIT) throw new Error("This sandbox supports 25 simulated investors.");
      investor = { wallet: command.wallet, mockIdentity: "approved", claimExpiresAt: "", escrowMicro: "0", allocatedMicro: "0" };
      next.investors.push(investor);
    }
    investor.mockIdentity = "approved";
    investor.claimExpiresAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();
    return next;
  }
  if (!investor) throw new Error("Run the mock identity check first.");
  if (command.kind === "revoke_mock_identity") {
    investor.mockIdentity = "revoked";
    return next;
  }
  if (command.kind !== "refund" && (investor.mockIdentity !== "approved" || !identityCurrent(investor.claimExpiresAt, now))) {
    throw new Error("A current mock identity claim is required.");
  }
  const amount = toMicro(command.amount);
  const balance = BigInt(investor.escrowMicro);
  if (command.kind === "deposit") {
    const total = next.investors.reduce((sum, row) => sum + BigInt(row.escrowMicro) + BigInt(row.allocatedMicro), 0n);
    if (total + amount > 1_000_000_000_000n) throw new Error("The sandbox balance limit is 1,000,000 test USDC.");
    investor.escrowMicro = (balance + amount).toString();
  } else {
    if (balance < amount) throw new Error("Insufficient simulated escrow balance.");
    investor.escrowMicro = (balance - amount).toString();
    if (command.kind === "allocate") investor.allocatedMicro = (BigInt(investor.allocatedMicro) + amount).toString();
  }
  return next;
}
