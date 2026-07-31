import { useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Globe,
  Home,
  Loader2,
  MapPin,
  Sparkles,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MLS_OPTIONS,
  normalizeWebsite,
  pullActiveListingsFromMls,
} from "@/lib/mls";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "profile", label: "You", icon: User },
  { id: "market", label: "Market", icon: MapPin },
  { id: "mls", label: "MLS", icon: Building2 },
  { id: "sync", label: "Sync", icon: Sparkles },
] as const;

type Props = {
  mode?: "first" | "edit";
  onDone?: () => void;
};

export function OnboardingWizard({ mode = "first", onDone }: Props) {
  const existing = useAppStore((s) => s.agentProfile);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const updateAgentProfile = useAppStore((s) => s.updateAgentProfile);

  const [step, setStep] = useState(0);
  const [name, setName] = useState(existing?.name ?? "");
  const [area, setArea] = useState(existing?.areaOfOperations ?? "");
  const [website, setWebsite] = useState(existing?.website ?? "");
  const [brokerage, setBrokerage] = useState(existing?.brokerage ?? "");
  const [mls, setMls] = useState(existing?.mls ?? "sandicor");
  const [syncing, setSyncing] = useState(false);
  const [syncPhase, setSyncPhase] = useState(0);

  const previewCount = useMemo(() => {
    if (!name.trim() || !area.trim()) return 0;
    return pullActiveListingsFromMls({
      name: name.trim(),
      areaOfOperations: area.trim(),
      mls,
    }).filter((p) => p.status === "active").length;
  }, [name, area, mls]);

  const canNext =
    step === 0
      ? name.trim().length >= 2
      : step === 1
        ? area.trim().length >= 2
        : step === 2
          ? Boolean(mls)
          : true;

  const runFinish = async () => {
    setSyncing(true);
    setSyncPhase(0);
    const phases = 4;
    for (let i = 0; i < phases; i++) {
      setSyncPhase(i);
      await new Promise((r) => setTimeout(r, 380 + i * 90));
    }
    const payload = {
      name: name.trim(),
      areaOfOperations: area.trim(),
      website: normalizeWebsite(website),
      mls,
      brokerage: brokerage.trim() || undefined,
    };
    if (mode === "edit" && existing) {
      updateAgentProfile(payload);
      toast.success("Profile updated · MLS re-synced");
    } else {
      completeOnboarding(payload);
      toast.success("Welcome — MLS listings loaded");
    }
    setSyncing(false);
    onDone?.();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[var(--color-bg)] p-4 sm:p-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 20% 0%, color-mix(in oklab, var(--color-primary) 16%, transparent), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 100%, color-mix(in oklab, var(--color-accent) 12%, transparent), transparent 50%)",
        }}
      />
      <div className="relative w-full max-w-lg">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary)] text-[var(--color-primary-fg)]">
            <Home className="h-5 w-5" />
          </div>
          <div>
            <div className="font-display text-lg font-semibold tracking-tight text-[var(--color-fg)]">
              {mode === "edit" ? "Update your workspace" : "Set up your Agent OS"}
            </div>
            <p className="text-sm text-[var(--color-fg-muted)]">
              Name, market, website, MLS — then we pull active listings
            </p>
          </div>
        </div>

        <div className="mb-5 flex gap-1.5">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = i === step;
            const done = i < step;
            return (
              <div
                key={s.id}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-full border px-2 py-1.5 text-[11px] font-medium sm:text-xs",
                  active
                    ? "border-[color-mix(in_oklab,var(--color-primary)_40%,var(--color-border))] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                    : done
                      ? "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg-muted)]"
                      : "border-[var(--color-border)] text-[var(--color-fg-subtle)]",
                )}
              >
                {done ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
            );
          })}
        </div>

        <div className="rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-lg)] sm:p-7">
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-xl font-semibold text-[var(--color-fg)]">
                  What’s your name?
                </h2>
                <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
                  Used on content packs, CMAs, and client-facing scripts
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="agent-name">Full name</Label>
                <Input
                  id="agent-name"
                  autoFocus
                  placeholder="Alex Rivera"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brokerage">Brokerage (optional)</Label>
                <Input
                  id="brokerage"
                  placeholder="e.g. Compass, KW, independent"
                  value={brokerage}
                  onChange={(e) => setBrokerage(e.target.value)}
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-xl font-semibold text-[var(--color-fg)]">
                  Where do you work?
                </h2>
                <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
                  City or neighborhoods — we localize inventory, leads, and comps
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="area">Area of operations</Label>
                <Input
                  id="area"
                  autoFocus
                  placeholder="e.g. La Jolla, Pacific Beach, San Diego"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="website">Website</Label>
                <div className="relative">
                  <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
                  <Input
                    id="website"
                    className="pl-9"
                    placeholder="yourname.com or team site"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>
                <p className="text-[11px] text-[var(--color-fg-subtle)]">
                  Linked in social CTAs and lead magnets
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  "Rancho Santa Fe, Del Mar, Solana Beach",
                  "San Diego coastal",
                  "Los Angeles",
                  "Austin",
                  "Seattle",
                ].map((hint) => (
                  <button
                    key={hint}
                    type="button"
                    onClick={() => {
                      setArea(hint);
                      if (/rancho|del mar|solana/i.test(hint)) setMls("sandicor");
                    }}
                    className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[11px] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-elevated)]"
                  >
                    {hint}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-xl font-semibold text-[var(--color-fg)]">
                  Which MLS?
                </h2>
                <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
                  We’ll pull active listings for content and comparative comps
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>MLS system</Label>
                <Select value={mls} onValueChange={setMls}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MLS_OPTIONS.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 text-xs leading-relaxed text-[var(--color-fg-muted)]">
                Demo sync simulates an MLS feed for your market (no live
                credentials in this environment). Listings include MLS numbers,
                your listings vs market comps, ready for CMA and Content Agent.
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-xl font-semibold text-[var(--color-fg)]">
                  Pull active listings
                </h2>
                <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
                  Confirm and sync — then create content and comps on your book
                </p>
              </div>
              <div className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
                <Row label="Agent" value={name} />
                <Row label="Market" value={area} />
                <Row
                  label="Website"
                  value={website.trim() ? normalizeWebsite(website) : "—"}
                />
                <Row
                  label="MLS"
                  value={
                    MLS_OPTIONS.find((m) => m.id === mls)?.label ?? mls
                  }
                />
                {brokerage.trim() && <Row label="Brokerage" value={brokerage} />}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="accent">~{previewCount || 5} active</Badge>
                <Badge variant="secondary">Comps ready</Badge>
                <Badge variant="secondary">Content packs</Badge>
              </div>
              {syncing && (
                <div className="space-y-2">
                  {[
                    "Connecting to MLS gateway…",
                    `Querying active listings in ${area}…`,
                    "Building comp set for your book…",
                    "Wiring Content Agent + CMA…",
                  ].map((label, i) => (
                    <div
                      key={label}
                      className="flex items-center gap-2 text-sm text-[var(--color-fg-muted)]"
                    >
                      {syncPhase > i ? (
                        <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />
                      ) : syncPhase === i ? (
                        <Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary)]" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border border-[var(--color-border)]" />
                      )}
                      {label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="ghost"
              disabled={step === 0 || syncing}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button
                disabled={!canNext}
                onClick={() => setStep((s) => s + 1)}
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button disabled={syncing || !canNext} onClick={() => void runFinish()}>
                {syncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {syncing
                  ? "Syncing MLS…"
                  : mode === "edit"
                    ? "Save & re-sync"
                    : "Launch workspace"}
              </Button>
            )}
          </div>
        </div>

        {mode === "edit" && (
          <div className="mt-3 text-center">
            <Button variant="ghost" size="sm" onClick={() => onDone?.()}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-[var(--color-fg-subtle)]">{label}</span>
      <span className="text-right font-medium text-[var(--color-fg)]">
        {value}
      </span>
    </div>
  );
}
