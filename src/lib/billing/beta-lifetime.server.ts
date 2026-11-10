/**
 * The beta-round lifetime offer, as the server applies it.
 *
 * Everyone who paid or redeemed a beta code before the cutoff keeps access for
 * life and is never charged for it again. From the cutoff on, a payment buys
 * INTRO_DAYS of access and a code grants one year, as before.
 *
 * The cutoff is a code constant shared with the browser. Outside production a
 * test server may move it with BETA_LIFETIME_CUTOFF so both sides of the
 * cutoff can be exercised on any date; production always uses the constant.
 */
import { BETA_LIFETIME_CUTOFF_ISO } from "@/lib/billing";

export function betaLifetimeCutoffMs(): number {
  const override =
    process.env.NODE_ENV === "production" ? "" : (process.env.BETA_LIFETIME_CUTOFF || "").trim();
  const parsed = override ? Date.parse(override) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Date.parse(BETA_LIFETIME_CUTOFF_ISO);
}

/** True while a new payment or code redemption still earns lifetime access. */
export function betaLifetimeOpen(atMs: number = Date.now()): boolean {
  return atMs < betaLifetimeCutoffMs();
}
