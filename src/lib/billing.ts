/**
 * Pricing + access codes for RealEstate AI launch.
 *
 * Pricing: a single one-time $9.99 charge that unlocks lifetime access.
 * There is no subscription, nothing renews, and a customer who has paid or
 * redeemed a beta code is never asked to pay for app access again. Everyone
 * who paid under the earlier 30-day terms keeps access for life as well.
 * Five free beta codes unlock full access + feedback board.
 */

export const ACCESS_PRICE_CENTS = 999;
/** Demo checkout (never production) is the only time-limited grant. */
export const DEMO_ACCESS_DAYS = 30;
export const CURRENCY = "usd";

export const PLAN = {
  id: "pro",
  name: "RealEstate AI Pro",
  priceLabel: "$9.99",
  accessLabel: "one-time payment, lifetime access",
  features: [
    "CiteLock visibility batches across configured answer engines",
    "Ranked fixes with drafted pages, FAQs, and profile checklists",
    "Social Desk: facts-first drafts, fair-housing review, Postiz publishing or handoff",
    "Command Center, instant-response scripts, CMA notes, calendar and vendors",
    "Priority support during beta",
    "Suggest drawer → engineering feedback",
  ],
} as const;

/** Exactly 5 free codes for pre-launch feedback testers */
export const FREE_ACCESS_CODES = [
  {
    code: "RSF-BETA-01",
    label: "Rancho Santa Fe pilot #1",
    unlocks: ["app", "feedback"] as const,
  },
  {
    code: "RSF-BETA-02",
    label: "Rancho Santa Fe pilot #2",
    unlocks: ["app", "feedback"] as const,
  },
  {
    code: "COVENANT-AI",
    label: "Covenant corridor advisor",
    unlocks: ["app", "feedback"] as const,
  },
  {
    code: "LISTINGPRO",
    label: "Listing content specialist",
    unlocks: ["app", "feedback"] as const,
  },
  {
    code: "AGENTOS-X",
    label: "Agent OS early access",
    unlocks: ["app", "feedback"] as const,
  },
] as const;

export type FreeCode = (typeof FREE_ACCESS_CODES)[number]["code"];

export type AccessSource =
  | "none"
  | "stripe_intro"
  | "stripe_active"
  | "demo_checkout"
  | "free_code";

export type SubscriptionStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "code";

export type BillingState = {
  status: SubscriptionStatus;
  source: AccessSource;
  /** ISO — end of a time-limited demo window; null for paid and code access. */
  introEndsAt: string | null;
  /** ISO — end of time-limited access; null means lifetime access. */
  currentPeriodEnd: string | null;
  /** Stripe session / sub ids when available */
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  lastCheckoutSessionId: string | null;
  /** Free code redeemed (normalized uppercase) */
  redeemedCode: string | null;
  /** When access was granted */
  activatedAt: string | null;
  /** Demo mode flag */
  isDemo: boolean;
};

export function emptyBilling(): BillingState {
  return {
    status: "none",
    source: "none",
    introEndsAt: null,
    currentPeriodEnd: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    lastCheckoutSessionId: null,
    redeemedCode: null,
    activatedAt: null,
    isDemo: false,
  };
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function findFreeCode(raw: string) {
  const n = normalizeCode(raw);
  return FREE_ACCESS_CODES.find((c) => c.code === n) ?? null;
}

/** Has paid / code access to the product */
export function hasAppAccess(b: BillingState | null | undefined): boolean {
  if (!b) return false;
  if (b.status === "code") return true;
  if (b.status === "trialing" || b.status === "active") {
    if (b.currentPeriodEnd) {
      return new Date(b.currentPeriodEnd).getTime() > Date.now();
    }
    return true;
  }
  return false;
}

/** Feedback board + comments (codes always; paid also during beta) */
export function hasFeedbackAccess(b: BillingState | null | undefined): boolean {
  if (!b) return false;
  if (b.redeemedCode) return true;
  return hasAppAccess(b);
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

/** Browser mirror of a verified one-time payment: access never ends. */
export function startLifetimeAccess(opts?: { sessionId?: string }): BillingState {
  return {
    status: "active",
    source: "stripe_active",
    introEndsAt: null,
    currentPeriodEnd: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    lastCheckoutSessionId: opts?.sessionId ?? null,
    redeemedCode: null,
    activatedAt: new Date().toISOString(),
    isDemo: false,
  };
}

/** Browser mirror of a demo checkout: time-limited test access, no payment. */
export function startDemoAccess(opts?: { sessionId?: string }): BillingState {
  const now = new Date();
  const end = new Date(now.getTime() + DEMO_ACCESS_DAYS * 24 * 60 * 60 * 1000);
  return {
    status: "trialing",
    source: "demo_checkout",
    introEndsAt: end.toISOString(),
    currentPeriodEnd: end.toISOString(),
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    lastCheckoutSessionId: opts?.sessionId ?? null,
    redeemedCode: null,
    activatedAt: now.toISOString(),
    isDemo: true,
  };
}

export function activateFreeCode(code: string): BillingState | null {
  const match = findFreeCode(code);
  if (!match) return null;
  const now = new Date();
  // Beta codes grant lifetime access.
  return {
    status: "code",
    source: "free_code",
    introEndsAt: null,
    currentPeriodEnd: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    lastCheckoutSessionId: null,
    redeemedCode: match.code,
    activatedAt: now.toISOString(),
    isDemo: false,
  };
}

export function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
