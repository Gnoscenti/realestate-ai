/**
 * Pricing + access codes for RealEstate AI launch.
 *
 * Intro: $9.99 for 30 days → then $49/mo Pro.
 * Five free beta codes unlock full access + feedback board.
 */

export const INTRO_PRICE_CENTS = 999;
export const INTRO_DAYS = 30;
export const MONTHLY_PRICE_CENTS = 4900; // $49 after intro
export const CURRENCY = "usd";

export const PLAN = {
  id: "pro",
  name: "RealEstate AI Pro",
  introLabel: "$9.99",
  introPeriod: "first 30 days",
  monthlyLabel: "$49",
  monthlyPeriod: "per month after",
  features: [
    "Command Center + ranked daily action packs",
    "CMA Studio & RSF market knowledge",
    "Content Agent (social campaigns)",
    "Calendar sync + contractor directory",
    "Adaptive AI that learns your book",
    "Priority support during beta",
    "Persistent Suggest drawer → Beta comments for Grok",
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
  /** ISO — end of $9.99 intro window */
  introEndsAt: string | null;
  /** ISO — next renewal / paid-through */
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

export function startIntroAccess(opts?: {
  source?: AccessSource;
  sessionId?: string;
  isDemo?: boolean;
}): BillingState {
  const now = new Date();
  const end = new Date(now.getTime() + INTRO_DAYS * 24 * 60 * 60 * 1000);
  return {
    status: "trialing",
    source: opts?.source ?? "demo_checkout",
    introEndsAt: end.toISOString(),
    currentPeriodEnd: end.toISOString(),
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    lastCheckoutSessionId: opts?.sessionId ?? null,
    redeemedCode: null,
    activatedAt: now.toISOString(),
    isDemo: opts?.isDemo ?? true,
  };
}

export function activateFreeCode(code: string): BillingState | null {
  const match = findFreeCode(code);
  if (!match) return null;
  const now = new Date();
  // Codes grant 1 year pilot access
  const end = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  return {
    status: "code",
    source: "free_code",
    introEndsAt: null,
    currentPeriodEnd: end.toISOString(),
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
