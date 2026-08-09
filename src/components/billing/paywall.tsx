import { useEffect, useState } from "react";
import {
  Check,
  CreditCard,
  Gift,
  Loader2,
  Lock,
  Sparkles,
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
  MONTHLY_PRICE_CENTS,
  FREE_ACCESS_CODES,
} from "@/lib/billing";
import { useAppStore } from "@/lib/store";
import { confirmCheckout, startCheckout } from "@/lib/checkout";
import { openExternalUrl } from "@/lib/native";
import { cn } from "@/lib/utils";

type Props = {
  agentName?: string;
};

export function Paywall({ agentName }: Props) {
  const completeDemoCheckout = useAppStore((s) => s.completeDemoCheckout);
  const redeemAccessCode = useAppStore((s) => s.redeemAccessCode);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const [showCodes, setShowCodes] = useState(false);

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

    const stripCheckoutParams = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      url.searchParams.delete("demo");
      url.searchParams.delete("session_id");
      window.history.replaceState({}, "", url.pathname + url.search);
    };

    if (!sessionId) {
      toast.error("That checkout could not be verified — no access granted.");
      stripCheckoutParams();
      return;
    }

    void (async () => {
      try {
        const verified = await confirmCheckout({ data: { sessionId } });
        if (cancelled) return;
        if (verified.paid) {
          // TODO: completeDemoCheckout() flags billing as isDemo. Replace with
          // a store action that records a verified Stripe purchase.
          completeDemoCheckout(verified.sessionId);
          toast.success(
            `Payment confirmed — ${INTRO_DAYS}-day intro access is active`,
          );
        } else if (verified.demo) {
          completeDemoCheckout(verified.sessionId);
          toast.warning(
            `Demo mode — no payment was taken. ${INTRO_DAYS} days of test access granted.`,
          );
        } else {
          toast.error(
            "We could not confirm that payment with Stripe — no access granted.",
          );
        }
      } catch {
        if (!cancelled) {
          toast.error(
            "We could not confirm that payment with Stripe — no access granted.",
          );
        }
      } finally {
        if (!cancelled) stripCheckoutParams();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [completeDemoCheckout]);

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
        // the server. Say plainly that no money changed hands.
        completeDemoCheckout(result.sessionId);
        toast.warning(
          `Demo mode — no payment was taken. ${INTRO_DAYS} days of test access granted.`,
        );
        return;
      }
      await openExternalUrl(result.url);
      toast.message("Complete payment in the secure Stripe window");
    } catch (err) {
      console.error(err);
      // A failure here must never unlock the app. Failing open would make every
      // server error a free subscription.
      toast.error(
        "Checkout is unavailable right now. You were not charged and no access was granted.",
      );
    } finally {
      setBusy(false);
    }
  };

  const onRedeem = () => {
    setCodeBusy(true);
    try {
      const res = redeemAccessCode(code);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Code ${res.code} unlocked — feedback board open`);
      setCode("");
    } finally {
      setCodeBusy(false);
    }
  };
  return (
    <div className="safe-pad-y gradient-mesh flex min-h-dvh items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-primary)] text-[var(--color-primary-fg)] shadow-[var(--shadow-md)]">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Unlock {PLAN.name}
          </h1>
          <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
            {agentName ? `Hi ${agentName.split(" ")[0]} — ` : ""}
            Start with a {INTRO_DAYS}-day intro at{" "}
            <span className="font-semibold text-[var(--color-fg)]">
              {formatMoney(INTRO_PRICE_CENTS)}
            </span>
            , then {formatMoney(MONTHLY_PRICE_CENTS)}/mo.
          </p>
        </div>

        <div className="surface-card overflow-hidden shadow-[var(--shadow-lg)]">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-primary-soft)] px-5 py-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-[var(--color-primary)]">
                  Intro offer
                </div>
                <div className="mt-1 font-display text-3xl font-semibold tabular text-[var(--color-fg)]">
                  {formatMoney(INTRO_PRICE_CENTS)}
                  <span className="ml-1 text-base font-medium text-[var(--color-fg-muted)]">
                    / {INTRO_DAYS} days
                  </span>
                </div>
              </div>
              <div className="rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-accent)]">
                Then {formatMoney(MONTHLY_PRICE_CENTS)}/mo
              </div>
            </div>
          </div>

          <ul className="space-y-2.5 px-5 py-5">
            {PLAN.features.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2.5 text-sm text-[var(--color-fg-muted)]"
              >
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent)]" />
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
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              Start {INTRO_DAYS}-day intro · {formatMoney(INTRO_PRICE_CENTS)}
            </Button>
            <p className="text-center text-[11px] text-[var(--color-fg-subtle)]">
              Payment is processed by Stripe and verified before access is
              granted.
            </p>
          </div>
        </div>

        <div className="surface-card mt-4 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--color-fg)]">
            <Ticket className="h-4 w-4 text-[var(--color-warning)]" />
            Have a free beta code?
          </div>
          <p className="mb-3 text-xs text-[var(--color-fg-muted)]">
            Free codes unlock full app access{" "}
            <strong className="text-[var(--color-fg)]">and</strong> the
            feedback + comment board so we can optimize before public launch.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <Label htmlFor="access-code" className="sr-only">
                Access code
              </Label>
              <Input
                id="access-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. RSF-BETA-01"
                className="h-11 font-mono text-base tracking-wide"
                autoCapitalize="characters"
                autoCorrect="off"
                onKeyDown={(e) => {
                  if (e.key === "Enter") onRedeem();
                }}
              />
            </div>
            <Button
              variant="secondary"
              className="min-h-[44px] sm:min-w-[120px]"
              disabled={codeBusy || !code.trim()}
              onClick={onRedeem}
            >
              <Gift className="h-4 w-4" />
              Redeem
            </Button>
          </div>

          <button
            type="button"
            className="mt-3 text-xs text-[var(--color-primary)] underline-offset-2 hover:underline"
            onClick={() => setShowCodes((v) => !v)}
          >
            {showCodes ? "Hide" : "Show"} the 5 pilot codes (pre-launch)
          </button>
          {showCodes && (
            <ul className="mt-2 space-y-1.5 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] p-3">
              {FREE_ACCESS_CODES.map((c) => (
                <li
                  key={c.code}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <button
                    type="button"
                    className={cn(
                      "font-mono font-medium text-[var(--color-primary)] hover:underline",
                    )}
                    onClick={() => {
                      setCode(c.code);
                      toast.message(`Filled ${c.code}`);
                    }}
                  >
                    {c.code}
                  </button>
                  <span className="truncate text-[var(--color-fg-subtle)]">
                    {c.label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[11px] text-[var(--color-fg-subtle)]">
          <Sparkles className="h-3 w-3" />
          Cancel anytime after intro · No long-term contract
        </p>
      </div>
    </div>
  );
}
