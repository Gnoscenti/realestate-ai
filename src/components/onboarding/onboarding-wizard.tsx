import { useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Globe,
  Home,
  Loader2,
  MapPin,
  Phone,
  Sparkles,
  User,
  Image as ImageIcon,
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
import { MLS_OPTIONS, normalizeWebsite } from "@/lib/mls";
import { scrapeAgentWebsite } from "@/lib/scrape-site";
import type { WebsiteScrapeResult } from "@/lib/website-scrape";
import { useAppStore } from "@/lib/store";
import { cn, formatCurrency } from "@/lib/utils";

const STEPS = [
  { id: "profile", label: "You", icon: User },
  { id: "market", label: "Market", icon: MapPin },
  { id: "mls", label: "MLS", icon: Building2 },
  { id: "sync", label: "Website", icon: Globe },
] as const;

type Props = {
  mode?: "first" | "edit";
  onDone?: () => void;
};

export function OnboardingWizard({ mode = "first", onDone }: Props) {
  const existing = useAppStore((s) => s.agentProfile);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const updateAgentProfile = useAppStore((s) => s.updateAgentProfile);
  const applyWebsiteScrape = useAppStore((s) => s.applyWebsiteScrape);

  const [step, setStep] = useState(0);
  const [name, setName] = useState(existing?.name ?? "");
  const [area, setArea] = useState(existing?.areaOfOperations ?? "");
  const [website, setWebsite] = useState(existing?.website ?? "");
  const [brokerage, setBrokerage] = useState(existing?.brokerage ?? "");
  const [mls, setMls] = useState(existing?.mls ?? "sandicor");
  const [syncing, setSyncing] = useState(false);
  const [syncPhase, setSyncPhase] = useState(0);
  const [scrape, setScrape] = useState<WebsiteScrapeResult | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);

  const canNext =
    step === 0
      ? name.trim().length >= 2
      : step === 1
        ? area.trim().length >= 2
        : step === 2
          ? Boolean(mls)
          : true;

  const runWebsiteScrape = async (): Promise<WebsiteScrapeResult | null> => {
    const site = website.trim();
    if (!site) {
      setScrape(null);
      setScrapeError(null);
      return null;
    }
    setSyncing(true);
    setSyncPhase(0);
    setScrapeError(null);
    let phaseTimer: ReturnType<typeof setInterval> | undefined;
    let i = 0;
    phaseTimer = setInterval(() => {
      i = Math.min(i + 1, 3);
      setSyncPhase(i);
    }, 700);
    try {
      const result = await scrapeAgentWebsite({
        data: {
          website: normalizeWebsite(site),
          agentNameHint: name.trim(),
          maxPages: 5,
        },
      });
      setScrape(result);
      if (!result.ok && result.error) {
        setScrapeError(result.error);
      } else if (result.warnings.length) {
        setScrapeError(result.warnings[0] ?? null);
      }
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Website scrape failed";
      setScrapeError(msg);
      setScrape(null);
      return null;
    } finally {
      if (phaseTimer) clearInterval(phaseTimer);
      setSyncPhase(3);
      setSyncing(false);
    }
  };

  const runFinish = async () => {
    setSyncing(true);
    let siteResult = scrape;
    if (website.trim() && !siteResult) {
      siteResult = await runWebsiteScrape();
    }
    setSyncing(true);

    const payload = {
      name: name.trim(),
      areaOfOperations: area.trim(),
      website: website.trim() ? normalizeWebsite(website) : "",
      mls,
      brokerage:
        scrape?.profile.brokerage?.trim() || brokerage.trim() || undefined,
      phone: scrape?.profile.phone,
      email: scrape?.profile.email,
      photoUrl: scrape?.profile.photoUrl,
      agentMlsId: scrape?.profile.mlsNumber,
      license: scrape?.profile.license || scrape?.profile.mlsNumber,
      bio: scrape?.profile.bio,
      title: scrape?.profile.title,
      dataSource: (siteResult?.ok ? "website" : "manual") as
        | "website"
        | "manual",
    };

    if (mode === "edit" && existing) {
      updateAgentProfile(payload);
      if (siteResult && (siteResult.ok || siteResult.listings.length)) {
        applyWebsiteScrape(siteResult);
      }
      toast.success(
        siteResult?.listings.length
          ? `Profile updated · ${siteResult.listings.length} listings from website`
          : "Profile updated",
      );
    } else {
      completeOnboarding(payload, { websiteScrape: siteResult });
      toast.success(
        siteResult?.listings.length
          ? `Welcome — ${siteResult.listings.length} listings from your website`
          : website.trim()
            ? "Welcome — website checked; add listings if none found"
            : "Welcome — empty book (your data only)",
      );
    }
    setSyncing(false);
    onDone?.();
  };

  const previewListings = useMemo(
    () => scrape?.listings.slice(0, 5) ?? [],
    [scrape],
  );

  return (
    <div className="gradient-mesh fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-transparent p-4 sm:p-6">
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
              Your website is the source of truth when MLS isn't connected —
              photo, phone, MLS #, listings.
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
                  "flex flex-1 items-center justify-center gap-1.5 glass-chip rounded-full border px-2 py-1.5 text-[11px] font-medium sm:text-xs",
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

        <div className="glass-panel surface-shine p-5 sm:p-6">
          <div className="mb-4 flex gap-2 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--color-primary)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-primary-soft)_80%,transparent)] px-3 py-2 text-xs leading-relaxed text-[var(--color-fg-muted)]">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
            <span>
              {step === 0 && "Use your real name — content and CMAs sign as you."}
              {step === 1 && "Website is optional but powerful: we pull photo, phone, and listings (never fake clients)."}
              {step === 2 && "Your board labels the market. Live MLS connect happens later in MLS Hub."}
              {step === 3 && "Scan your site if you can. Empty book beats fake sample data."}
            </span>
          </div>
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="agent-name">Full name</Label>
                <Input
                  id="agent-name"
                  className="mt-1.5 h-11"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Rivera"
                  autoComplete="name"
                />
              </div>
              <div>
                <Label htmlFor="brokerage">Brokerage (optional)</Label>
                <Input
                  id="brokerage"
                  className="mt-1.5 h-11"
                  value={brokerage}
                  onChange={(e) => setBrokerage(e.target.value)}
                  placeholder="Filled from your website if found"
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="area">Area of operations</Label>
                <Input
                  id="area"
                  className="mt-1.5 h-11"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="Rancho Santa Fe, CA"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  "Rancho Santa Fe, CA",
                  "Del Mar, CA",
                  "Solana Beach, CA",
                  "Encinitas, CA",
                ].map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setArea(a)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs",
                      area === a
                        ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                        : "border-[var(--color-border)] text-[var(--color-fg-muted)]",
                    )}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <div>
                <Label htmlFor="website">Website</Label>
                <div className="relative mt-1.5">
                  <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
                  <Input
                    id="website"
                    className="h-11 pl-9"
                    value={website}
                    onChange={(e) => {
                      setWebsite(e.target.value);
                      setScrape(null);
                    }}
                    placeholder="yourname.com or https://…"
                    inputMode="url"
                    autoCapitalize="off"
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-[var(--color-fg-subtle)]">
                  When MLS isn't connected we scrape your site for photo, phone,
                  license/MLS #, and current listings — never demo clients.
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <Label>MLS board (market context)</Label>
                <Select value={mls} onValueChange={setMls}>
                  <SelectTrigger className="mt-1.5 h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MLS_OPTIONS.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-2 text-xs text-[var(--color-fg-muted)]">
                  After setup, open <strong className="text-[var(--color-fg)]">MLS Hub</strong> to
                  connect Bridge, Trestle, Spark, MLS Grid, or RESO for this board.
                  Until then we use your website — never fake listings.
                </p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
                <div className="text-xs font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
                  Confirm
                </div>
                <dl className="mt-3 space-y-2 text-sm">
                  <Row label="Name" value={name} />
                  <Row label="Market" value={area} />
                  <Row
                    label="Website"
                    value={website.trim() ? normalizeWebsite(website) : "— not set —"}
                  />
                  <Row
                    label="MLS board"
                    value={MLS_OPTIONS.find((o) => o.id === mls)?.label ?? mls}
                  />
                </dl>
              </div>

              {website.trim() ? (
                <div className="space-y-3">
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-[44px] w-full"
                    disabled={syncing}
                    onClick={() => void runWebsiteScrape()}
                  >
                    {syncing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {scrape ? "Re-scan website" : "Scan website for my data"}
                  </Button>
                  {syncing && (
                    <p className="text-center text-xs text-[var(--color-fg-muted)]">
                      {
                        [
                          "Connecting to your site…",
                          "Reading agent profile…",
                          "Pulling listings pages…",
                          "Extracting MLS # / phone / photo…",
                        ][syncPhase]
                      }
                    </p>
                  )}
                  {scrapeError && (
                    <p className="text-xs text-[var(--color-warning)]">{scrapeError}</p>
                  )}
                  {scrape && (
                    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
                      <div className="flex gap-3">
                        {scrape.profile.photoUrl ? (
                          <img
                            src={scrape.profile.photoUrl}
                            alt=""
                            className="h-16 w-16 rounded-full object-cover ring-2 ring-[var(--color-border)]"
                          />
                        ) : (
                          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-surface-2)]">
                            <ImageIcon className="h-6 w-6 text-[var(--color-fg-subtle)]" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-[var(--color-fg)]">
                            {scrape.profile.name || name}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {scrape.profile.phone && (
                              <Badge variant="secondary">
                                <Phone className="h-3 w-3" />
                                {scrape.profile.phone}
                              </Badge>
                            )}
                            {scrape.profile.mlsNumber && (
                              <Badge variant="secondary">
                                MLS/Lic {scrape.profile.mlsNumber}
                              </Badge>
                            )}
                            {scrape.profile.email && (
                              <Badge variant="outline">{scrape.profile.email}</Badge>
                            )}
                          </div>
                          <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                            {scrape.listings.length} listing(s) ·{" "}
                            {scrape.pagesFetched.length} page(s) scanned
                          </p>
                        </div>
                      </div>
                      {previewListings.length > 0 && (
                        <ul className="mt-3 space-y-1.5 border-t border-[var(--color-border)] pt-3">
                          {previewListings.map((l, idx) => (
                            <li
                              key={`${l.address}-${idx}`}
                              className="flex justify-between gap-2 text-xs text-[var(--color-fg-muted)]"
                            >
                              <span className="truncate">{l.address || l.title}</span>
                              <span className="shrink-0 tabular text-[var(--color-fg)]">
                                {l.price ? formatCurrency(l.price) : "—"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[var(--color-warning)]">
                  No website — workspace starts empty. Import CSV later. We never invent
                  listings.
                </p>
              )}
            </div>
          )}

          <div className="mt-6 flex gap-2">
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px]"
                disabled={syncing}
                onClick={() => setStep((s) => s - 1)}
              >
                Back
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button
                type="button"
                className="min-h-[44px] flex-1"
                disabled={!canNext}
                onClick={() => setStep((s) => s + 1)}
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                className="min-h-[44px] flex-1"
                disabled={syncing}
                onClick={() => void runFinish()}
              >
                {syncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {mode === "edit" ? "Save changes" : "Launch workspace"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--color-fg-subtle)]">{label}</dt>
      <dd className="truncate text-right font-medium text-[var(--color-fg)]">
        {value}
      </dd>
    </div>
  );
}
