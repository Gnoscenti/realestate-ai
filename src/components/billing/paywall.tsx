import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  CreditCard,
  Gift,
  Loader2,
  Lock,
  Ticket,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PLAN,
  INTRO_DAYS,
  formatMoney,
  INTRO_PRICE_CENTS,
} from "@/lib/billing";
import { useAppStore } from "@/lib/store";
import { confirmCheckout, startCheckout } from "@/lib/checkout";
import { openExternalUrl } from "@/lib/native";

type Props = {
  agentName?: string;
  /** Optional content under the paywall, e.g. the signed-in account and Sign out. */
  footer?: ReactNode;
  /** Called after the SERVER confirmed a grant (checkout or code). */
  onAccessGranted?: () => void;
};

export function Paywall({ agentName, onAccessGranted, footer }: Props) {
  const completeDemoCheckout = useAppStore((s) => s.completeDemoCheckout);
  const completePaidCheckout = useAppStore((s) => s.completePaidCheckout);
  const activateBilling = useAppStore((s) => s.activateBilling);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  // Return from Stripe.
  //
  // The success URL query string is attacker-controlled: anyone can type
  // `?checkout=success` into the address bar. Access is therefore granted only
  // after the server asks Stripe whether the session actually completed and was
  // paid. Never unlock from the query parameter alone.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;

    const sessionId = params.get("session_id");
    let cancelled = false;
    let definitive = false;

    const stripCheckoutParams = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      url.searchParams.delete("demo");
      url.searchParams.delete("session_id");
      window.history.replaceState({}, "", url.pathname + url.search);
    };

    if (!sessionId) {
      toast.error("We couldn't verify that checkout, so access wasn't unlocked.");
      stripCheckoutParams();
      return;
    }

    void (async () => {
      try {
        const verified = await confirmCheckout({ data: { sessionId } });
          // Stripe gave a definitive answer (paid, demo or not paid), so the
          // session id has served its purpose and can leave the URL.
          definitive = true;
        if (cancelled) return;
        if (verified.paid) {
          // A verified purchase, recorded server-side and mirrored here.
          completePaidCheckout(verified.sessionId);
          onAccessGranted?.();
          toast.success(
            `Payment confirmed. You have full access for ${INTRO_DAYS} days.`,
          );
        } else if (verified.demo) {
          completeDemoCheckout(verified.sessionId);
          onAccessGranted?.();
          toast.warning(
            `Demo mode — no payment was taken. ${INTRO_DAYS} days of test access granted.`,
          );
        } else {
          toast.error(
            "Stripe didn't confirm that payment, so access wasn't unlocked.",
          );
        }
      } catch {
        // A transient network or Stripe outage is not a failed payment. Keep
        // session_id in the URL so a reload can retry the confirmation.
        if (!cancelled) {
          toast.error(
            "We couldn't reach Stripe to confirm your payment. Reload this page to try again. Your purchase isn't lost.",
          );
        }
      } finally {
        if (!cancelled && definitive) stripCheckoutParams();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [completeDemoCheckout, completePaidCheckout, onAccessGranted]);

  const onCheckout = async () => {
    setBusy(true);
    try {
      const origin = window.location.origin;
      const result = await startCheckout({
        data: {
          successUrl: `${origin}/?checkout=success`,
          cancelUrl: `${origin}/?checkout=cancel`,
          agentName: agentName,
        },
      });
      if (result.mode === "demo") {
        // Demo sessions are only issued when ALLOW_DEMO_CHECKOUT=1 is set on
        // the server. The server records the grant on confirmation; the
        // mirror is updated here so the UI opens immediately.
        const confirmed = await confirmCheckout({ data: { sessionId: result.sessionId } });
        if (!confirmed.demo) throw new Error("Demo session could not be confirmed");
        completeDemoCheckout(result.sessionId);
        onAccessGranted?.();
        toast.warning(
          `Demo mode — no payment was taken. ${INTRO_DAYS} days of test access granted.`,
        );
        return;
      }
      await openExternalUrl(result.url);
      toast.message("Finish paying in the Stripe window, then come back to this page.");
    } catch (err) {
      console.error(err);
      // A failure here must never unlock the app. Failing open would make every
      // server error a free subscription.
      toast.error(
        "Checkout is unavailable right now. You were not charged and no access was granted. Try again in a few minutes.",
      );
    } finally {
      setBusy(false);
    }
  };

  const onRedeem = async () => {
    if (!code.trim() || codeBusy) return;
    setCodeBusy(true);
    setCodeError(null);
    try {
      // The server validates the code and records the grant; the browser
      // never holds the code list.
      const { redeemMyAccessCode } = await import("@/lib/billing/api");
      const res = await redeemMyAccessCode({ data: { code } });
      activateBilling({
        status: "code",
        source: "free_code",
        introEndsAt: null,
        currentPeriodEnd: res.entitlement.currentPeriodEnd,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        lastCheckoutSessionId: null,
        redeemedCode: res.code,
        activatedAt: new Date().toISOString(),
        isDemo: false,
      });
      onAccessGranted?.();
      toast.success("Code accepted. Your workspace is unlocked.");
      setCode("");
    } catch (error) {
      // Shown beside the field, where the fix happens, instead of in a toast
      // that disappears before the code can be compared with the message.
      setCodeError(
        error instanceof Error && error.message
          ? error.message
          : "Invalid code. Check spelling and try again.",
      );
    } finally {
      setCodeBusy(false);
    }
  };
  return (
    <div className="safe-pad-y gradient-mesh flex min-h-dvh items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-primary)] text-[var(--color-primary-fg)] shadow-[var(--shadow-md)]">
            <Lock aria-hidden="true" className="h-5 w-5" />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Unlock {PLAN.name}
          </h1>
          <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
            {agentName ? `Hi ${agentName.split(" ")[0]}. ` : ""}
            Pay{" "}
            <span className="font-semibold text-[var(--color-fg)]">
              {formatMoney(INTRO_PRICE_CENTS)}
            </span>{" "}
            once for {INTRO_DAYS} days of full access. No subscription, and
            nothing renews on its own.
          </p>
        </div>

        <Link
          to="/aieo"
          className="mb-4 flex min-h-[48px] items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-primary)] bg-[var(--color-primary-soft)] p-4 text-center text-sm font-semibold text-[var(--color-primary)] transition-colors hover:bg-[color-mix(in_oklab,var(--color-primary)_22%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
        >
          Try the free CiteLock visibility guide
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
        <div className="surface-card overflow-hidden shadow-[var(--shadow-lg)]">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-primary-soft)] px-5 py-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-[var(--color-primary)]">
                  One-time price
                </div>
                <div className="mt-1 font-display text-3xl font-semibold tabular text-[var(--color-fg)]">
                  {formatMoney(INTRO_PRICE_CENTS)}
                  <span className="ml-1.5 text-base font-medium text-[var(--color-fg-muted)]">
                    for {INTRO_DAYS} days
                  </span>
                </div>
              </div>
              <div className="rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--color-accent)]">
                No renewal
              </div>
            </div>
          </div>

          <ul className="space-y-2.5 px-5 py-5">
            {PLAN.features.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2.5 text-sm text-[var(--color-fg-muted)]"
              >
                <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent)]" />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <div className="space-y-3 border-t border-[var(--color-border)] px-5 py-5">
            <Button
              className="min-h-[48px] w-full text-base"
              disabled={busy}
              onClick={() => void onCheckout()}
            >
              {busy ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard aria-hidden="true" className="h-4 w-4" />
              )}
              {busy
                ? "Opening checkout…"
                : `Pay ${formatMoney(INTRO_PRICE_CENTS)} for ${INTRO_DAYS} days`}
            </Button>
            <p className="text-center text-xs text-[var(--color-fg-subtle)]">
              Secure checkout by Stripe. Your workspace opens as soon as the
              payment is confirmed.
            </p>
          </div>
        </div>

        <div className="surface-card mt-4 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--color-fg)]">
            <Ticket aria-hidden="true" className="h-4 w-4 text-[var(--color-warning)]" />
            Have a free beta code?
          </div>
          <p className="mb-3 text-xs text-[var(--color-fg-muted)]">
            Enter it to unlock the full workspace at no charge. Beta testers can
            also send us suggestions from any page.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <Label htmlFor="access-code" className="sr-only">
                Beta code
              </Label>
              <Input
                id="access-code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setCodeError(null);
                }}
                placeholder="Enter your code"
                className="h-11 font-mono text-base tracking-wide"
                autoCapitalize="characters"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={codeError ? true : undefined}
                aria-describedby={codeError ? "access-code-error" : undefined}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void onRedeem();
                }}
              />
            </div>
            <Button
              variant="secondary"
              className="min-h-[44px] sm:min-w-[120px]"
              disabled={codeBusy || !code.trim()}
              onClick={() => void onRedeem()}
            >
              {codeBusy ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Gift aria-hidden="true" className="h-4 w-4" />
              )}
              {codeBusy ? "Checking…" : "Redeem code"}
            </Button>
          </div>
          {codeError && (
            <p
              id="access-code-error"
              role="alert"
              className="mt-2 text-sm text-[var(--color-danger)]"
            >
              {codeError}
            </p>
          )}
        </div>

        {footer}
      </div>
    </div>
  );
}
