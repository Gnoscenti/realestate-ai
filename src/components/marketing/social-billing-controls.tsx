import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
export function SocialBillingControls() {
  const [state, setState] = useState<{ configured: boolean; hasCustomer: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void import("@/lib/social-media/billing-api")
      .then((m) => m.getSocialBillingStatus())
      .then(setState)
      .catch(() => setError("Paid rendering status could not be loaded."));
  }, []);
  useEffect(() => {
    const reset = () => setBusy(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  async function open(portal: boolean) {
    setBusy(true);
    setError(null);
    try {
      const api = await import("@/lib/social-media/billing-api");
      const result = portal
        ? await api.manageSocialSubscription()
        : await api.startSocialSubscription({ data: { requestId: crypto.randomUUID() } });
      window.location.assign(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Billing could not be opened.");
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2 rounded border p-4" aria-label="Paid social rendering">
      <p className="font-medium">Paid template rendering</p>
      {error && <p role="alert">{error}</p>}
      {!state && !error && <p role="status">Checking paid rendering setup…</p>}
      {state && !state.configured && (
        <p className="text-sm text-muted-foreground">
          Setup required: paid rendering needs an approved template, photo delivery and billing
          configuration. Free built-in image exports are available above.
        </p>
      )}
      {state?.configured && (
        <Button disabled={busy} onClick={() => void open(false)}>
          View subscription in Stripe Checkout
        </Button>
      )}
      {state?.hasCustomer && (
        <Button variant="outline" disabled={busy} onClick={() => void open(true)}>
          Manage paid rendering subscription
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Stripe shows the configured price before payment. Paid render access updates after a
        verified subscription event; returning from checkout does not itself grant access.
      </p>
    </div>
  );
}
