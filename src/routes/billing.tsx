import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  LayoutDashboard,
  MessageSquare,
  Phone,
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
  hasAppAccess,
  hasFeedbackAccess,
  hasLifetimeAccess,
  type BillingState,
} from "@/lib/billing";
import { useAppStore } from "@/lib/store";
import { Paywall } from "@/components/billing/paywall";

export const Route = createFileRoute("/billing")({
  component: BillingPage,
});

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * A code grant restored from the server arrives without the code itself (the
 * server stores only its hash), so the grant type is read from the status and
 * source, never from whether this browser happens to remember the code.
 */
function usesBetaCode(billing: BillingState): boolean {
  return (
    billing.status === "code" ||
    billing.source === "free_code" ||
    Boolean(billing.redeemedCode)
  );
}

/** How this workspace got its access, in the customer's words. */
function accessSummary(billing: BillingState): string {
  if (usesBetaCode(billing)) {
    return billing.redeemedCode
      ? `Unlocked with beta code ${billing.redeemedCode}.`
      : "Unlocked with a beta code.";
  }
  if (billing.isDemo) return "Test access from a demo checkout. No payment was taken.";
  return `Paid access to ${PLAN.name}.`;
}

function BillingPage() {
  const billing = useAppStore((s) => s.billing);
  const profile = useAppStore((s) => s.agentProfile);
  const clearBilling = useAppStore((s) => s.clearBilling);

  if (!hasAppAccess(billing)) {
    return <Paywall agentName={profile?.name} />;
  }

  const left = daysLeft(billing.currentPeriodEnd);
  const endsOn = billing.introEndsAt ?? billing.currentPeriodEnd;
  const betaCode = usesBetaCode(billing);
  // Beta-round customers have no end date and are never charged for access again.
  const lifetime = hasLifetimeAccess(billing);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Billing & Access
        </h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          {lifetime
            ? `Your ${PLAN.name} access is for life. You will not be charged for it again.`
            : `${PLAN.name} is a one-time ${formatMoney(INTRO_PRICE_CENTS)} for ${INTRO_DAYS} days. Nothing renews on its own.`}
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2
                  aria-hidden="true"
                  className="h-4 w-4 text-[var(--color-success)]"
                />
                Access active
              </CardTitle>
              <CardDescription className="mt-1">
                {accessSummary(billing)}
              </CardDescription>
            </div>
            <Badge variant="secondary" className="shrink-0">
              {lifetime
                ? "Lifetime access"
                : left != null
                  ? `${left} ${left === 1 ? "day" : "days"} left`
                  : "Active"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-[var(--color-fg-muted)]">
          {lifetime && (
            <p data-testid="lifetime-access-note">
              You joined during the beta, so your access has no end date. There
              is nothing to renew.
            </p>
          )}
          {!lifetime && endsOn && (
            <p>
              Access ends on{" "}
              <span className="text-[var(--color-fg)]">{formatDate(endsOn)}</span>
              .{" "}
              {betaCode
                ? "Beta access does not renew on its own."
                : `It does not renew on its own. You can buy another ${INTRO_DAYS} days when it ends.`}
            </p>
          )}
          {betaCode && (
            <p className="flex items-start gap-2">
              <Ticket
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]"
              />
              Your beta code includes the full workspace and the Feedback Board.
              Thank you for testing with us.
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild className="min-h-[44px]">
              <Link to="/">
                <LayoutDashboard aria-hidden="true" className="h-4 w-4" />
                Go to Command Center
              </Link>
            </Button>
            {hasFeedbackAccess(billing) && (
              <Button asChild variant="secondary" className="min-h-[44px]">
                <Link to="/feedback">
                  <MessageSquare aria-hidden="true" className="h-4 w-4" />
                  Open Feedback Board
                </Link>
              </Button>
            )}
            {billing.isDemo && (
              <Button
                variant="outline"
                className="min-h-[44px]"
                onClick={() => clearBilling()}
              >
                Reset test access
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* The workspace price above never renews, but the optional phone
          add-on does. Saying so here keeps "nothing renews" accurate. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone aria-hidden="true" className="h-4 w-4 text-[var(--color-primary)]" />
            Voice Assistant add-on
          </CardTitle>
          <CardDescription>
            Optional and billed separately each month. Its price, usage and
            setup are on the Voice Assistant page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="min-h-[44px]">
            <Link to="/voice">Open Voice Assistant</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
