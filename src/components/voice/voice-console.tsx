import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  CreditCard,
  ExternalLink,
  Headphones,
  Loader2,
  Phone,
  PhoneCall,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  getMyVoiceConsole,
  listMyVoiceCalls,
  progressMyVoiceProvisioning,
  provisionMyVoiceAssistant,
  saveMyVoicePrompt,
  saveMyVoiceSetupChecklist,
} from "@/lib/voice/api";
import {
  startVoiceBillingPortal,
  startVoiceSubscriptionCheckout,
} from "@/lib/voice/billing-api";
import {
  FORWARDING_GUIDES,
  formatVoicePhone,
  safeRecordingUrl,
  voiceReadinessLabel,
} from "@/lib/voice/console";
import type {
  VoiceCallRecord,
  VoiceConsoleState,
  VoiceSetup,
  VoiceSetupChecklist,
} from "@/lib/voice/types";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The request could not be completed. Try again, then contact support if it continues.";
}

async function advanceVoiceJobs(
  workspaceId: string,
  target: "activation" | "prompt",
): Promise<VoiceSetup | null> {
  let latest: VoiceSetup | null = null;
  // Each authenticated request advances one durable provider step. The loop is
  // bounded; cron can safely continue the same idempotent job if the user
  // closes the page or a retry is not ready yet.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await progressMyVoiceProvisioning({ data: { workspaceId } });
    latest = result.setup;
    if (
      target === "activation" &&
      latest.assistant.status === "active" &&
      latest.phoneNumber
    ) {
      break;
    }
    if (
      target === "prompt" &&
      (latest.promptSyncState === "synced" || latest.promptSyncState === "failed")
    ) {
      break;
    }
    if (
      latest.provisioningState === "blocked" ||
      latest.provisioningState === "setup_required" ||
      latest.provisioningState === "dead_letter" ||
      result.worker.claimed === 0
    ) {
      break;
    }
  }
  return latest;
}

function statusVariant(
  state: VoiceConsoleState,
): "success" | "warning" | "danger" | "secondary" {
  if (state.readyForMissedCalls) return "success";
  if (state.setup.assistant.status === "failed") return "danger";
  if (
    state.setup.assistant.status === "provisioning" ||
    state.setup.assistant.status === "active"
  ) {
    return "warning";
  }
  return "secondary";
}

function CopyNumberButton({ number }: { number: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-[44px]"
      onClick={() => {
        if (!navigator.clipboard) {
          toast.error("Copy is unavailable here. Select the number manually.");
          return;
        }
        void navigator.clipboard
          .writeText(number)
          .then(() => toast.success("AI number copied"))
          .catch(() => toast.error("Copy failed. Select the number manually."));
      }}
    >
      <Copy className="h-4 w-4" />
      Copy number
    </Button>
  );
}

function SetupSummary({ state }: { state: VoiceConsoleState }) {
  const entitlementLabel =
    state.entitlement.state === "active"
      ? "Premium add-on active"
      : state.entitlement.state === "setup_required"
        ? "Billing setup required"
        : state.entitlement.state === "allowance_exhausted"
          ? "Monthly allowance used"
          : "Premium add-on inactive";

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Service status</CardDescription>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant(state)}>
              {voiceReadinessLabel(state)}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs leading-relaxed text-[var(--color-fg-muted)]">
          A provider-active number is not field-ready until conditional
          forwarding and the consent test are confirmed below.
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Dedicated AI number</CardDescription>
          <CardTitle className="text-lg">
            {formatVoicePhone(state.setup.phoneNumber)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {state.setup.phoneNumber ? (
            <CopyNumberButton number={state.setup.phoneNumber} />
          ) : (
            <p className="text-xs text-[var(--color-fg-muted)]">
              No number has been purchased for this workspace.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Entitlement</CardDescription>
          <CardTitle className="text-base">{entitlementLabel}</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-[var(--color-fg-muted)]">
          {state.entitlement.state === "active"
            ? `${Math.floor(state.entitlement.remainingSeconds / 60)} of ${Math.floor(state.entitlement.allowanceSeconds / 60)} included minutes remain${state.entitlement.periodEnd ? ` through ${new Date(state.entitlement.periodEnd).toLocaleDateString()}` : ""}.`
            : state.entitlement.state === "setup_required"
              ? "The Voice Assistant billing connection has not been verified for this workspace."
              : state.entitlement.state === "allowance_exhausted"
                ? "Provisioning and field-ready status are paused until the next verified billing period."
                : "No current, verified Voice Assistant billing period was found."}
        </CardContent>
      </Card>
    </div>
  );
}

function VoiceBillingPanel({
  state,
}: {
  state: VoiceConsoleState;
}) {
  const [busy, setBusy] = useState<"checkout" | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkout() {
    setBusy("checkout");
    setError(null);
    try {
      const baseUrl = new URL("/voice", window.location.origin);
      const successUrl = new URL(baseUrl);
      successUrl.searchParams.set("voice_checkout", "returned");
      const cancelUrl = new URL(baseUrl);
      cancelUrl.searchParams.set("voice_checkout", "canceled");
      const result = await startVoiceSubscriptionCheckout({
        data: {
          workspaceId: state.workspaceId,
          successUrl: successUrl.toString(),
          cancelUrl: cancelUrl.toString(),
        },
      });
      window.location.assign(result.url);
    } catch (error) {
      setBusy(null);
      setError(errorMessage(error));
    }
  }

  async function manage() {
    setBusy("portal");
    setError(null);
    try {
      const result = await startVoiceBillingPortal({
        data: {
          workspaceId: state.workspaceId,
          returnUrl: new URL("/voice", window.location.origin).toString(),
        },
      });
      window.location.assign(result.url);
    } catch (error) {
      setBusy(null);
      setError(errorMessage(error));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-[var(--color-primary)]" />
          Voice Assistant billing
        </CardTitle>
        <CardDescription>
          $79 USD each month includes {state.billing.includedMinutes} completed
          inbound AI minutes for this workspace. New calls pause after that
          completed-call usage threshold; calls already in progress may finish.
          No metered overage is charged.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-[var(--color-fg-muted)]">
          {state.billing.message}
        </p>
        {state.entitlement.state === "setup_required" ? (
          <p className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-xs leading-relaxed text-[var(--color-fg-muted)]">
            Returning from Stripe does not unlock setup by itself. Activation
            stays locked until this app receives and stores a verified Stripe
            subscription or paid-invoice webhook for your workspace.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          {state.billing.checkoutAvailable ? (
            <Button
              type="button"
              className="min-h-[44px] w-full sm:w-auto"
              disabled={busy !== null}
              onClick={() => void checkout()}
            >
              {busy === "checkout" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              {busy === "checkout"
                ? "Opening secure checkout…"
                : "Subscribe — $79/month"}
            </Button>
          ) : null}
          {state.billing.portalAvailable ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] w-full sm:w-auto"
              disabled={busy !== null}
              onClick={() => void manage()}
            >
              {busy === "portal" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              {busy === "portal" ? "Opening Stripe…" : "Manage billing"}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ProvisioningPanel({
  state,
  onReload,
}: {
  state: VoiceConsoleState;
  onReload: () => Promise<void>;
}) {
  const [areaCode, setAreaCode] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const activationComplete =
    state.setup.assistant.status === "active" && Boolean(state.setup.phoneNumber);

  async function provision() {
    if (!confirmed || !state.entitlement.canProvision || activationComplete) return;
    setBusy(true);
    setError(null);
    const stableKey =
      requestKey ?? `voice-ui:${crypto.randomUUID().replaceAll("-", "")}`;
    setRequestKey(stableKey);
    try {
      const result = await provisionMyVoiceAssistant({
        data: {
          workspaceId: state.workspaceId,
          idempotencyKey: stableKey,
          areaCode: areaCode || undefined,
          confirmation: "PROVISION_NUMBER",
        },
      });
      const progressed =
        result.state === "queued" || result.state === "in_progress"
          ? await advanceVoiceJobs(state.workspaceId, "activation")
          : result.setup;
      if (
        result.state === "active" ||
        (progressed?.assistant.status === "active" && progressed.phoneNumber)
      ) {
        toast.success("AI number provisioned. Finish forwarding and test it.");
      } else if (result.state === "setup_required") {
        toast.error("Billing setup is incomplete. No number was purchased.");
      } else if (result.state === "blocked") {
        toast.error("Voice activation is blocked by billing or allowance policy.");
      } else {
        toast.message(
          "Setup is queued. The durable worker will continue; no second number was requested.",
        );
      }
      await onReload();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-[var(--color-primary)]" />
          1. Activate a dedicated number
        </CardTitle>
        <CardDescription>
          Retell answers inbound calls through a customer-controlled Twilio
          number. This does not change your existing phone until you configure
          conditional forwarding with your carrier.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!state.profile.ready ? (
          <div className="rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--color-warning)_35%,var(--color-border))] bg-[var(--color-warning-soft)] p-3 text-sm">
            Add your agent or business name before activation so callers hear
            the correct identity.
            <Button
              type="button"
              variant="outline"
              className="mt-3 min-h-[44px] w-full sm:w-auto"
              onClick={() =>
                window.dispatchEvent(
                  new Event("realestate-ai:open-profile-setup"),
                )
              }
            >
              Open profile setup
            </Button>
          </div>
        ) : null}
        {!state.entitlement.canProvision ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-sm text-[var(--color-fg-muted)]">
            {state.entitlement.state === "setup_required"
              ? "Voice billing is not fully connected yet. Number purchase remains locked until a verified Stripe event activates this workspace."
              : state.entitlement.state === "allowance_exhausted"
                ? "This workspace has reached 200 completed inbound minutes for the verified billing period, so new calls are paused."
                : "The premium add-on must be active and current before a number can be purchased."}
            <p className="mt-2 text-xs text-[var(--color-fg-subtle)]">
              Use the billing panel above. A completed checkout never unlocks
              provisioning until its signed Stripe webhook is processed.
            </p>
          </div>
        ) : null}
        {!activationComplete ? (
          <>
            <div className="max-w-xs">
              <Label htmlFor="voice-area-code">Preferred US area code (optional)</Label>
              <Input
                id="voice-area-code"
                className="mt-1.5 h-11"
                value={areaCode}
                onChange={(event) =>
                  setAreaCode(event.target.value.replace(/\D/g, "").slice(0, 3))
                }
                inputMode="numeric"
                autoComplete="tel-area-code"
                placeholder="503"
                aria-describedby="voice-area-code-help"
              />
              <p id="voice-area-code-help" className="mt-1 text-xs text-[var(--color-fg-subtle)]">
                Availability is not guaranteed. Leave blank for any available US number.
              </p>
            </div>
            <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary)]"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                I am authorized to activate this paid add-on and purchase a
                dedicated inbound number or safely resume this workspace's
                existing setup. I understand forwarding is a separate carrier
                step and this feature never places outbound AI calls or sends SMS.
              </span>
            </label>
            {error ? (
              <p role="alert" className="flex items-start gap-2 text-sm text-[var(--color-danger)]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </p>
            ) : null}
            <Button
              type="button"
              className="min-h-[44px] w-full sm:w-auto"
              disabled={
                busy ||
                !confirmed ||
                !state.entitlement.canProvision ||
                !state.profile.ready ||
                (areaCode.length > 0 && areaCode.length !== 3)
              }
              onClick={() => void provision()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
              {busy
                ? "Provisioning…"
                : state.setup.phoneNumber
                  ? "Resume provider setup"
                  : "Provision my AI number"}
            </Button>
          </>
        ) : (
          <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Number active at provider</p>
              <p className="text-xs text-[var(--color-fg-muted)]">
                {formatVoicePhone(state.setup.phoneNumber)} · prompt {state.setup.promptSyncState ?? "not synced"}
              </p>
            </div>
            {state.setup.phoneNumber ? <CopyNumberButton number={state.setup.phoneNumber} /> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PromptPanel({
  state,
  onReload,
}: {
  state: VoiceConsoleState;
  onReload: () => Promise<void>;
}) {
  const [greeting, setGreeting] = useState(state.customization.greeting);
  const [additionalInstructions, setAdditionalInstructions] = useState(
    state.customization.additionalInstructions,
  );
  const [collectLead, setCollectLead] = useState(state.customization.collectLead);
  const [requestAppointment, setRequestAppointment] = useState(
    state.customization.requestAppointment,
  );
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!approved) return;
    setBusy(true);
    setError(null);
    try {
      const result = await saveMyVoicePrompt({
        data: {
          workspaceId: state.workspaceId,
          customization: {
            greeting,
            additionalInstructions,
            collectLead,
            requestAppointment,
            brokerApprovalConfirmed: true,
          },
        },
      });
      const progressed = result.jobState
        ? await advanceVoiceJobs(state.workspaceId, "prompt")
        : null;
      toast.success(
        result.providerSynced || progressed?.promptSyncState === "synced"
          ? "Prompt saved and synced to the inbound assistant"
          : result.jobState
            ? "Prompt saved. Secure provider sync is queued and can continue in the background."
            : "Prompt saved. It will sync when the number is activated.",
      );
      setApproved(false);
      await onReload();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-[var(--color-primary)]" />
          2. Set the broker-approved call context
        </CardTitle>
        <CardDescription>
          Your verified profile is injected by the server. These fields tune
          the greeting and intake only; they cannot enable outbound calls,
          texting, transfers, pricing advice, negotiation, or MLS claims.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="voice-greeting">Opening greeting</Label>
          <Textarea
            id="voice-greeting"
            className="mt-1.5 min-h-24"
            value={greeting}
            onChange={(event) => setGreeting(event.target.value.slice(0, 500))}
            maxLength={500}
            aria-describedby="voice-greeting-count"
          />
          <p id="voice-greeting-count" className="mt-1 text-right text-xs text-[var(--color-fg-subtle)]">
            {greeting.length}/500
          </p>
        </div>
        <div>
          <Label htmlFor="voice-context">Business-specific intake preferences</Label>
          <Textarea
            id="voice-context"
            className="mt-1.5 min-h-32"
            value={additionalInstructions}
            onChange={(event) =>
              setAdditionalInstructions(event.target.value.slice(0, 4_000))
            }
            maxLength={4_000}
            placeholder="Example: Ask whether the caller is buying or selling. Do not promise an appointment."
            aria-describedby="voice-context-help"
          />
          <p id="voice-context-help" className="mt-1 text-xs text-[var(--color-fg-subtle)]">
            Do not enter confidential client facts, lockbox details, access codes, legal advice, or fair-housing preferences.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--color-primary)]"
              checked={collectLead}
              onChange={(event) => setCollectLead(event.target.checked)}
            />
            Collect name, callback number, reason, and property address
          </label>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--color-primary)]"
              checked={requestAppointment}
              onChange={(event) => setRequestAppointment(event.target.checked)}
            />
            Take appointment requests pending human confirmation
          </label>
        </div>
        <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--color-warning)_35%,var(--color-border))] bg-[var(--color-warning-soft)] p-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary)]"
            checked={approved}
            onChange={(event) => setApproved(event.target.checked)}
          />
          <span>
            I confirm the greeting and preferences are approved for use by my
            broker/compliance team and appropriate for applicable recording and
            consent laws. The assistant will still request affirmative consent.
          </span>
        </label>
        {error ? <p role="alert" className="text-sm text-[var(--color-danger)]">{error}</p> : null}
        <Button
          type="button"
          className="min-h-[44px] w-full sm:w-auto"
          disabled={busy || !approved || greeting.trim().length < 10}
          onClick={() => void save()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {busy ? "Saving…" : "Save approved prompt"}
        </Button>
      </CardContent>
    </Card>
  );
}

type ChecklistBooleanKey = Exclude<
  keyof VoiceSetupChecklist,
  "carrier" | "devicePlatform"
>;

const CHECKLIST_ITEMS: Array<{
  key: ChecklistBooleanKey;
  title: string;
  detail: string;
}> = [
  {
    key: "brokerApprovalConfirmed",
    title: "Broker/compliance approval recorded",
    detail: "The disclosure, consent flow, and call-handling rules were reviewed for this business and jurisdiction.",
  },
  {
    key: "conditionalForwardingConfigured",
    title: "Conditional forwarding configured",
    detail: "Only missed, busy, or unanswered calls route to the AI number; normal answered calls still reach the agent.",
  },
  {
    key: "disclosureVerified",
    title: "AI disclosure and consent heard",
    detail: "A test caller heard the AI identity and affirmative recording/transcription consent request before intake.",
  },
  {
    key: "declinedConsentVerified",
    title: "Declined-consent path verified",
    detail: "The test caller declined and the assistant ended without collecting details.",
  },
  {
    key: "testCallCompleted",
    title: "External missed-call test completed",
    detail: "From a different phone, the agent intentionally did not answer and the call reached this assistant after the expected delay.",
  },
  {
    key: "callLogVerified",
    title: "Call Log result verified",
    detail: "A consented test produced the expected caller fields and transcript. Recording availability was checked without assuming the signed link is permanent.",
  },
  {
    key: "rollbackUnderstood",
    title: "Rollback procedure saved and understood",
    detail: "The carrier or administrator confirmed how to disable forwarding and restore the original routing immediately.",
  },
];

function ForwardingPanel({
  state,
  onReload,
}: {
  state: VoiceConsoleState;
  onReload: () => Promise<void>;
}) {
  const [checklist, setChecklist] = useState<VoiceSetupChecklist>(state.checklist);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const carrierGuide = FORWARDING_GUIDES[checklist.carrier];
  const deviceGuide = FORWARDING_GUIDES[checklist.devicePlatform];

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await saveMyVoiceSetupChecklist({
        data: { workspaceId: state.workspaceId, checklist },
      });
      toast.success("Setup checklist saved");
      await onReload();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PhoneCall className="h-4 w-4 text-[var(--color-primary)]" />
            3. Configure conditional forwarding
          </CardTitle>
          <CardDescription>
            Use the procedure confirmed for the exact carrier, plan, and phone
            system. The app does not provide generic dial codes because they
            are not universal and can redirect every call if used incorrectly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!state.setup.phoneNumber ? (
            <p className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-sm text-[var(--color-fg-muted)]">
              Provision the AI number first. You can review the guidance now,
              but there is no destination number to enter yet.
            </p>
          ) : (
            <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs text-[var(--color-fg-muted)]">Forward missed calls to</p>
                <p className="font-display text-xl font-semibold">
                  {formatVoicePhone(state.setup.phoneNumber)}
                </p>
              </div>
              <CopyNumberButton number={state.setup.phoneNumber} />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Carrier or phone system</Label>
              <Select
                value={checklist.carrier}
                onValueChange={(carrier) =>
                  setChecklist((current) => ({
                    ...current,
                    carrier: carrier as VoiceSetupChecklist["carrier"],
                  }))
                }
              >
                <SelectTrigger className="mt-1.5 h-11" aria-label="Carrier or phone system">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="att">AT&amp;T</SelectItem>
                  <SelectItem value="tmobile">T-Mobile</SelectItem>
                  <SelectItem value="verizon">Verizon</SelectItem>
                  <SelectItem value="business_pbx">Business VoIP / PBX</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Device</Label>
              <Select
                value={checklist.devicePlatform}
                onValueChange={(devicePlatform) =>
                  setChecklist((current) => ({
                    ...current,
                    devicePlatform:
                      devicePlatform as VoiceSetupChecklist["devicePlatform"],
                  }))
                }
              >
                <SelectTrigger className="mt-1.5 h-11" aria-label="Device platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="iphone">iPhone</SelectItem>
                  <SelectItem value="android">Android</SelectItem>
                  <SelectItem value="desk_phone">Desk phone</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {[
            { kind: "Carrier/system", guide: carrierGuide },
            ...(checklist.devicePlatform === "other"
              ? []
              : [{ kind: "Device", guide: deviceGuide }]),
          ].map(({ kind, guide }) => (
            <section key={kind} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
              <h3 className="font-semibold">{guide.title}</h3>
              <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-[var(--color-fg-muted)]">
                {guide.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
              <p className="mt-3 text-xs font-medium text-[var(--color-warning)]">
                {guide.caution}
              </p>
            </section>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-[var(--color-primary)]" />
            4. Mandatory test and rollback checklist
          </CardTitle>
          <CardDescription>
            Check an item only after verifying it. A provider-active number is
            shown as field-ready only when every item is saved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {CHECKLIST_ITEMS.map((item) => (
            <label
              key={item.key}
              className="flex min-h-[56px] cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3"
            >
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary)]"
                checked={Boolean(checklist[item.key])}
                onChange={(event) =>
                  setChecklist((current) => ({
                    ...current,
                    [item.key]: event.target.checked,
                  }))
                }
              />
              <span>
                <span className="block text-sm font-semibold">{item.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-[var(--color-fg-muted)]">
                  {item.detail}
                </span>
              </span>
            </label>
          ))}
          <div className="rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--color-danger)_30%,var(--color-border))] bg-[var(--color-danger-soft)] p-3 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <RotateCcw className="h-4 w-4" /> Rollback before leaving setup
            </p>
            <p className="mt-1 text-xs leading-relaxed">
              Keep the carrier or PBX disable instructions with your team. If
              routing, consent, or call logs fail, disable conditional forwarding
              immediately; do not wait for an app change.
            </p>
          </div>
          {error ? <p role="alert" className="text-sm text-[var(--color-danger)]">{error}</p> : null}
          <Button
            type="button"
            className="min-h-[44px] w-full sm:w-auto"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {busy ? "Saving…" : "Save verified checklist"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function urgencyVariant(
  urgency: VoiceCallRecord["urgency"],
): "danger" | "warning" | "secondary" | "success" {
  if (urgency === "urgent") return "danger";
  if (urgency === "high") return "warning";
  if (urgency === "low") return "success";
  return "secondary";
}

function CallCard({ call }: { call: VoiceCallRecord }) {
  const consented = call.consentState === "accepted";
  const recordingUrl = consented ? safeRecordingUrl(call.recordingUrl) : null;
  const occurredAt = call.endedAt ?? call.startedAt ?? call.createdAt;
  const callerLabel = consented
    ? call.callerName || call.callbackNumber || call.fromNumber || "Unknown caller"
    : call.fromNumber || "Caller—intake hidden";
  return (
    <details className="group rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <summary className="flex min-h-[64px] cursor-pointer list-none items-center justify-between gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold">
              {callerLabel}
            </span>
            {consented ? (
              <Badge variant={urgencyVariant(call.urgency)}>
                {call.urgency
                  ? `${call.urgency} urgency`
                  : "urgency not captured"}
              </Badge>
            ) : null}
            <Badge
              variant={
                consented
                  ? "success"
                  : call.consentState === "declined"
                    ? "warning"
                    : "secondary"
              }
            >
              consent {call.consentState.replace("_", " ")}
            </Badge>
          </div>
          <p className="mt-1 truncate text-xs text-[var(--color-fg-muted)]">
            {new Date(occurredAt).toLocaleString()} · {call.status}
            {call.durationSeconds != null ? ` · ${Math.ceil(call.durationSeconds / 60)} min` : ""}
          </p>
        </div>
        <span className="text-xs font-medium text-[var(--color-primary)] group-open:hidden">Open</span>
        <span className="hidden text-xs font-medium text-[var(--color-primary)] group-open:inline">Close</span>
      </summary>
      <div className="space-y-4 border-t border-[var(--color-border)] p-4">
        {consented ? (
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-[var(--color-fg-subtle)]">
                Callback number
              </p>
              <p className="font-medium">
                {call.callbackNumber || call.fromNumber || "Not captured"}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-fg-subtle)]">
                Appointment request
              </p>
              <p className="font-medium">
                {call.appointmentTime
                  ? new Date(call.appointmentTime).toLocaleString()
                  : call.appointmentTimeRaw || "None captured"}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-[var(--color-fg-subtle)]">Summary</p>
              <p className="font-medium">
                {call.summary || "No structured summary received"}
              </p>
            </div>
          </div>
        ) : (
          <p className="rounded-[var(--radius-md)] bg-[var(--color-warning-soft)] p-3 text-sm">
            Intake details are hidden because affirmative recording/transcription
            consent was not recorded for this call.
          </p>
        )}
        <section>
          <h4 className="text-sm font-semibold">Transcript</h4>
          <div className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] p-3 text-sm leading-relaxed">
            {consented
              ? call.transcript || "No transcript was received for this call."
              : "Hidden until affirmative consent is present in the verified call record."}
          </div>
        </section>
        <section>
          <h4 className="text-sm font-semibold">Recording</h4>
          {recordingUrl ? (
            <>
              <audio
                controls
                preload="none"
                className="mt-2 min-h-[44px] w-full"
                src={recordingUrl}
              >
                Your browser does not support audio playback.
              </audio>
              <p className="mt-2 text-xs text-[var(--color-warning)]">
                Retell recording links are signed and expire in roughly 10
                minutes. Long-term private recording storage is not available
                in this release.
              </p>
              <Button
                asChild
                variant="outline"
                className="mt-3 min-h-[44px]"
              >
                <a href={recordingUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Open signed recording
                </a>
              </Button>
            </>
          ) : (
            <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
              {consented
                ? "No valid HTTPS recording link is available. It may not have been returned or the signed link may have expired."
                : "Recording playback is disabled because affirmative consent is not present in the verified call record."}
            </p>
          )}
        </section>
      </div>
    </details>
  );
}

function CallLogs({ state }: { state: VoiceConsoleState }) {
  const [calls, setCalls] = useState<VoiceCallRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (before?: string) => {
      const append = Boolean(before);
      append ? setLoadingMore(true) : setLoading(true);
      setError(null);
      try {
        const result = await listMyVoiceCalls({
          data: { workspaceId: state.workspaceId, limit: 25, before },
        });
        setCalls((current) =>
          append ? [...current, ...result.calls] : result.calls,
        );
        setNextCursor(result.nextCursor);
      } catch (error) {
        setError(errorMessage(error));
      } finally {
        append ? setLoadingMore(false) : setLoading(false);
      }
    },
    [state.workspaceId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Headphones className="h-4 w-4 text-[var(--color-primary)]" />
              Inbound call records
            </CardTitle>
            <CardDescription className="mt-1">
              Caller details, requested appointment time, urgency, transcript,
              and consented recording link received from Retell.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px] shrink-0"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> Notification delivery
          </CardTitle>
          <CardDescription>{state.push.message}</CardDescription>
        </CardHeader>
        <CardContent className="text-xs text-[var(--color-fg-muted)]">
          No push alert is claimed until a delivery worker and device permission
          flow are deployed and verified. Use this Call Logs page as the source
          of truth for now.
        </CardContent>
      </Card>
      {loading ? (
        <div
          role="status"
          className="flex min-h-48 items-center justify-center gap-2 text-sm text-[var(--color-fg-muted)]"
        >
          <Loader2 className="h-5 w-5 animate-spin" /> Loading call logs…
        </div>
      ) : error ? (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              {error}
            </p>
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px]"
              onClick={() => void load()}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : calls.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <PhoneCall className="mx-auto h-8 w-8 text-[var(--color-fg-subtle)]" />
            <h3 className="mt-3 font-semibold">No call records yet</h3>
            <p className="mx-auto mt-1 max-w-lg text-sm text-[var(--color-fg-muted)]">
              After the number is active and conditional forwarding is tested,
              verified Retell webhook results will appear here. This screen does
              not create sample callers or demo transcripts.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3" aria-live="polite">
          {calls.map((call) => <CallCard key={call.id} call={call} />)}
          {nextCursor ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] w-full"
              disabled={loadingMore}
              onClick={() => void load(nextCursor)}
            >
              {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loadingMore ? "Loading…" : "Load older calls"}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function VoiceConsole() {
  const [state, setState] = useState<VoiceConsoleState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setState(await getMyVoiceConsole());
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("voice_checkout");
    if (!result) return;
    url.searchParams.delete("voice_checkout");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    if (result === "returned") {
      toast.message(
        "Payment was submitted. Voice setup remains locked until the verified Stripe webhook arrives; refresh if confirmation takes a moment.",
      );
      void load();
    } else if (result === "canceled") {
      toast.message(
        "Voice Assistant checkout was canceled. No access was granted.",
      );
    }
  }, [load]);

  if (loading && !state) {
    return (
      <div role="status" className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-[var(--color-fg-muted)]">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading Voice Assistant…
      </div>
    );
  }

  if (error && !state) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="space-y-4 pt-5">
          <p role="alert" className="flex gap-2 text-sm text-[var(--color-danger)]">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </p>
          <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => void load()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!state) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 pb-24 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Missed-call assistant
            </h1>
            <Badge variant="accent">Premium add-on</Badge>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--color-fg-muted)]">
            A disclosed inbound AI receptionist for busy, missed, or unanswered
            calls. It takes a message and appointment request for human follow-up;
            it never calls out, sends SMS, transfers calls, or confirms appointments.
          </p>
        </div>
        {state.readyForMissedCalls ? (
          <div className="flex min-h-[44px] items-center gap-2 rounded-full bg-[var(--color-success-soft)] px-4 text-sm font-semibold text-[var(--color-success)]">
            <CheckCircle2 className="h-4 w-4" /> Field ready
          </div>
        ) : null}
      </header>

      <SetupSummary state={state} />

      <VoiceBillingPanel state={state} />

      {error ? (
        <p role="alert" className="rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]">
          The last refresh failed: {error}. Existing data remains on screen.
        </p>
      ) : null}

      <Tabs defaultValue="setup">
        <TabsList className="grid h-auto min-h-[44px] grid-cols-3">
          <TabsTrigger className="min-h-[44px]" value="setup">Activation</TabsTrigger>
          <TabsTrigger className="min-h-[44px]" value="forwarding">Forward & test</TabsTrigger>
          <TabsTrigger className="min-h-[44px]" value="calls">Call Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="setup" className="space-y-4">
          <ProvisioningPanel state={state} onReload={load} />
          <PromptPanel
            key={`${state.workspaceId}:${state.setup.promptVersion ?? 0}`}
            state={state}
            onReload={load}
          />
        </TabsContent>
        <TabsContent value="forwarding">
          <ForwardingPanel
            key={`${state.workspaceId}:${state.readyForMissedCalls}`}
            state={state}
            onReload={load}
          />
        </TabsContent>
        <TabsContent value="calls">
          <CallLogs state={state} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
