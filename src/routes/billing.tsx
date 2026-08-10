import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  CreditCard,
  MessageSquare,
  Ticket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  PLAN,
  daysLeft,
  formatMoney,
  INTRO_PRICE_CENTS,
  INTRO_DAYS,
  FREE_ACCESS_CODES,
  hasAppAccess,
  hasFeedbackAccess,
} from "@/lib/billing";
import { useAppStore } from "@/lib/store";
import { Paywall } from "@/components/billing/paywall";

/**
 * Enough to recognise a code you were already given, never enough to use one.
 * This page renders for every account that has access, paying customers
 * included, so printing all five codes here handed them out.
 */
function maskCode(code: string): string {
  return code.slice(0, 3) + "\u2022".repeat(Math.max(3, code.length - 3));
}

export const Route = createFileRoute("/billing")({
  component: BillingPage,
});

function BillingPage() {
  const billing = useAppStore((s) => s.billing);
  const profile = useAppStore((s) => s.agentProfile);
  const clearBilling = useAppStore((s) => s.clearBilling);

  if (!hasAppAccess(billing)) {
    return <Paywall agentName={profile?.name} />;
  }

  const left = daysLeft(billing.currentPeriodEnd);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Billing & access
        </h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          One-time {formatMoney(INTRO_PRICE_CENTS)} for {INTRO_DAYS} days of{" "}
          {PLAN.name}. Nothing renews automatically.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />
                Access active
              </CardTitle>
              <CardDescription className="mt-1">
                Status: {billing.status}
                {billing.isDemo ? " · demo checkout" : ""}
                {billing.redeemedCode
                  ? ` · code ${billing.redeemedCode}`
                  : ""}
              </CardDescription>
            </div>
            <Badge variant="secondary">
              {left != null ? `${left}d remaining` : "Active"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-[var(--color-fg-muted)]">
          {billing.introEndsAt && (
            <p>
              Access ends{" "}
              <span className="text-[var(--color-fg)]">
                {new Date(billing.introEndsAt).toLocaleDateString()}
              </span>
              . Access does not renew automatically — purchase another{" "}
                {INTRO_DAYS} days when it expires.
            </p>
          )}
          {billing.redeemedCode && (
            <p className="flex items-start gap-2">
              <Ticket className="mt-0.5 h-4 w-4 text-[var(--color-warning)]" />
              Free pilot code grants full access + feedback board for
              pre-launch optimization.
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            {hasFeedbackAccess(billing) && (
              <Button asChild variant="secondary" className="min-h-[44px]">
                <Link to="/feedback">
                  <MessageSquare className="h-4 w-4" />
                  Open feedback board
                </Link>
              </Button>
            )}
            <Button asChild className="min-h-[44px]">
              <Link to="/">
                <CreditCard className="h-4 w-4" />
                Back to Command
              </Link>
            </Button>
            {billing.isDemo && (
              <Button
                variant="outline"
                className="min-h-[44px]"
                onClick={() => clearBilling()}
              >
                Reset access (demo)
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Pilot codes ({FREE_ACCESS_CODES.length})
          </CardTitle>
          <CardDescription>
            Masked on purpose — this page renders for every account with
            access, paying customers included. Read the full values from{" "}
            <span className="font-mono text-[var(--color-fg)]">
              src/lib/billing.ts
            </span>{" "}
            when you need to issue one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {FREE_ACCESS_CODES.map((c) => {
              const mine = billing.redeemedCode === c.code;
              return (
                <li
                  key={c.code}
                  className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm"
                >
                  <span
                    className={
                      mine
                        ? "font-mono text-[var(--color-primary)]"
                        : "font-mono text-[var(--color-fg-subtle)]"
                    }
                  >
                    {mine ? c.code : maskCode(c.code)}
                  </span>
                  <span className="text-xs text-[var(--color-fg-subtle)]">
                    {mine ? "redeemed on this device" : c.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
