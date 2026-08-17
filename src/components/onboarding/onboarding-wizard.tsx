import { useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Globe,
  Home,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Phone,
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
import { MLS_OPTIONS, normalizeWebsite } from "@/lib/mls";
import { scrapeAgentWebsite } from "@/lib/scrape-site";
import type { WebsiteScrapeResult } from "@/lib/website-scrape";
import { useAppStore } from "@/lib/store";
import { cn, formatCurrency } from "@/lib/utils";

type Props = {
  mode?: "first" | "edit";
  onDone?: () => void;
  onCancel?: () => void;
  preferredName?: string | null;
  preferredEmail?: string | null;
};

/** Post-login profile — one screen, all fields. Signed-out users see /login first. */
export function OnboardingWizard({
  mode = "first",
  onDone,
  onCancel,
  preferredName,
  preferredEmail,
}: Props) {
  const existing = useAppStore((s) => s.agentProfile);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const updateAgentProfile = useAppStore((s) => s.updateAgentProfile);
  const applyWebsiteScrape = useAppStore((s) => s.applyWebsiteScrape);

  const [name, setName] = useState(
    existing?.name ?? preferredName?.trim() ?? "",
  );
  const [area, setArea] = useState(existing?.areaOfOperations ?? "");
  const [website, setWebsite] = useState(existing?.website ?? "");
  const [brokerage, setBrokerage] = useState(existing?.brokerage ?? "");
  const [mls, setMls] = useState(existing?.mls ?? "sandicor");
  const [syncing, setSyncing] = useState(false);
  const [scrape, setScrape] = useState<WebsiteScrapeResult | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scanFailed, setScanFailed] = useState(false);
  const [skipWebsiteScan, setSkipWebsiteScan] = useState(false);

  const canLaunch =
    name.trim().length >= 2 && area.trim().length >= 2 && Boolean(mls);

  const runWebsiteScrape = async (): Promise<WebsiteScrapeResult | null> => {
    const site = website.trim();
    if (!site) {
      setScrape(null);
      setScrapeError(null);
      setScanFailed(false);
      setSkipWebsiteScan(false);
      return null;
    }
    setSyncing(true);
    setScrapeError(null);
    setScanFailed(false);
    setSkipWebsiteScan(false);
    try {
      const result = await scrapeAgentWebsite({
        data: {
          website: normalizeWebsite(site),
          agentNameHint: name.trim(),
          maxPages: 5,
        },
      });
      setScrape(result);
      const failed = !result.ok && result.listings.length === 0;
      setScanFailed(failed);
      if (!result.ok && result.error) setScrapeError(result.error);
      else if (result.warnings.length) setScrapeError(result.warnings[0] ?? null);
      if (result.profile.brokerage && !brokerage.trim()) {
        setBrokerage(result.profile.brokerage);
      }
      if (result.profile.name && name.trim().length < 2) {
        setName(result.profile.name);
      }
      return result;
    } catch (e) {
      setScrapeError(e instanceof Error ? e.message : "Website scrape failed");
      setScrape(null);
      setScanFailed(true);
      return null;
    } finally {
      setSyncing(false);
    }
  };

  const runFinish = async () => {
    if (!canLaunch) {
      toast.error("Name, market area, and MLS board are required");
      return;
    }

    setSyncing(true);
    let siteResult = scrape;
    try {
      if (website.trim() && !skipWebsiteScan) {
        if (!siteResult) siteResult = await runWebsiteScrape();
        if (
          !siteResult ||
          (!siteResult.ok && siteResult.listings.length === 0)
        ) {
          setScanFailed(true);
          toast.error(
            "Website scan failed. Retry, fix the URL, or continue without scanning.",
          );
          return;
        }
      }
      if (skipWebsiteScan) siteResult = null;

      const payload = {
        name: name.trim(),
        areaOfOperations: area.trim(),
        website: website.trim() ? normalizeWebsite(website) : "",
        mls,
        brokerage:
          brokerage.trim() ||
          siteResult?.profile.brokerage?.trim() ||
          existing?.brokerage ||
          undefined,
        phone: siteResult?.profile.phone || existing?.phone,
        email:
          siteResult?.profile.email ||
          existing?.email ||
          preferredEmail?.trim() ||
          undefined,
        photoUrl: siteResult?.profile.photoUrl || existing?.photoUrl,
        agentMlsId:
          siteResult?.profile.mlsNumber || existing?.agentMlsId,
        license:
          siteResult?.profile.license ||
          siteResult?.profile.mlsNumber ||
          existing?.license,
        bio: siteResult?.profile.bio || existing?.bio,
        title: siteResult?.profile.title || existing?.title,
        dataSource: (siteResult?.ok
          ? "website"
          : existing?.dataSource || "manual") as "website" | "manual",
      };

      if (mode === "edit" && existing) {
        if (siteResult && (siteResult.ok || siteResult.listings.length)) {
          applyWebsiteScrape(siteResult);
        }
        updateAgentProfile(payload);
        toast.success(
          siteResult?.listings.length
            ? `Profile updated · ${siteResult.listings.length} listings from website`
            : skipWebsiteScan
              ? "Profile updated · website scan skipped"
              : "Profile updated",
        );
      } else {
        completeOnboarding(payload, { websiteScrape: siteResult });
        toast.success(
          siteResult?.listings.length
            ? `Welcome — ${siteResult.listings.length} listings from your website`
            : skipWebsiteScan
              ? "Welcome — website saved; scan skipped"
              : website.trim()
                ? "Welcome — profile data checked; no listings found"
                : "Welcome — empty book (your data only)",
        );
      }
      onDone?.();
    } finally {
      setSyncing(false);
    }
  };

  const previewListings = useMemo(
    () => scrape?.listings.slice(0, 5) ?? [],
    [scrape],
  );

  return (
    <div className="gradient-mesh fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-transparent p-4 sm:p-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 20% 0%, color-mix(in oklab, var(--color-primary) 16%, transparent), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 100%, color-mix(in oklab, var(--color-accent) 12%, transparent), transparent 50%)",
        }}
      />
      <div className="relative my-auto w-full max-w-xl">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary)] text-[var(--color-primary-fg)]">
              <Home className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-lg font-semibold tracking-tight text-[var(--color-fg)]">
                {mode === "edit" ? "Update your profile" : "Finish your profile"}
              </h1>
              <p className="text-sm text-[var(--color-fg-muted)]">
                Optional setup for profile, market, website, and MLS.
              </p>
            </div>
          </div>
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              className="min-h-[44px] shrink-0"
              onClick={onCancel}
            >
              {mode === "edit" ? "Cancel" : "Not now"}
            </Button>
          )}
        </div>

        <form
          className="glass-panel surface-shine p-5 sm:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            void runFinish();
          }}
        >
          <div className="mb-5 flex gap-2 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--color-primary)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-primary-soft)_80%,transparent)] px-3 py-2 text-xs leading-relaxed text-[var(--color-fg-muted)]">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
            <span>
              Add only what helps your work. Website and MLS can be connected
              later; nothing here blocks the workspace.
            </span>
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="agent-name" className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-[var(--color-fg-subtle)]" />
                  Full name
                </Label>
                <Input
                  id="agent-name"
                  className="mt-1.5 h-11"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Rivera"
                  autoComplete="name"
                  required
                  aria-required="true"
                />
              </div>
              <div>
                <Label htmlFor="brokerage" className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-[var(--color-fg-subtle)]" />
                  Brokerage
                </Label>
                <Input
                  id="brokerage"
                  className="mt-1.5 h-11"
                  value={brokerage}
                  onChange={(e) => setBrokerage(e.target.value)}
                  placeholder="Optional · often from website"
                />
              </div>
              <div>
                <Label htmlFor="area" className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-[var(--color-fg-subtle)]" />
                  Area of operations
                </Label>
                <Input
                  id="area"
                  className="mt-1.5 h-11"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="Rancho Santa Fe, CA"
                  required
                  aria-required="true"
                />
              </div>
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
                  aria-pressed={area === a}
                  className={cn(
                    "min-h-[44px] rounded-full border px-3 py-2 text-xs",
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
              <Label htmlFor="website" className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-[var(--color-fg-subtle)]" />
                Website
              </Label>
              <div className="relative mt-1.5">
                <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
                <Input
                  id="website"
                  className="h-11 pl-9"
                  value={website}
                  onChange={(e) => {
                    setWebsite(e.target.value);
                    setScrape(null);
                    setScrapeError(null);
                    setScanFailed(false);
                    setSkipWebsiteScan(false);
                  }}
                  placeholder="yourname.com or https://…"
                  inputMode="url"
                  autoCapitalize="off"
                />
              </div>
              <p className="mt-1.5 text-[11px] text-[var(--color-fg-subtle)]">
                Optional. Pulls photo, phone, license/MLS #, and listings when set.
              </p>
            </div>

            <div>
              <Label htmlFor="mls-board" className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-[var(--color-fg-subtle)]" />
                MLS board
              </Label>
              <Select value={mls} onValueChange={setMls}>
                <SelectTrigger id="mls-board" className="mt-1.5 h-11">
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
              <p className="mt-1.5 text-[11px] text-[var(--color-fg-subtle)]">
                Live MLS connect is in MLS Hub after launch.
              </p>
            </div>

            {website.trim() && (
              <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
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
                  <p
                    className="text-center text-xs text-[var(--color-fg-muted)]"
                    role="status"
                    aria-live="polite"
                  >
                    Checking website… this can take up to 12 seconds.
                  </p>
                )}
                {scrapeError && (
                  <p
                    className="text-xs text-[var(--color-warning)]"
                    role={scanFailed ? "alert" : "status"}
                    aria-live="polite"
                  >
                    {scrapeError}
                  </p>
                )}
                {scanFailed && (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-[44px] w-full"
                    onClick={() => {
                      setSkipWebsiteScan(true);
                      setScanFailed(false);
                      setScrape(null);
                      setScrapeError(null);
                      toast.message(
                        "Website will be saved without importing profile data.",
                      );
                    }}
                  >
                    Continue without website scan
                  </Button>
                )}
                {skipWebsiteScan && (
                  <p className="text-xs text-[var(--color-fg-muted)]" role="status">
                    Website will be saved; no website data will be imported.
                  </p>
                )}
                {scrape && !scanFailed && (
                  <div className="flex gap-3">
                    {scrape.profile.photoUrl ? (
                      <img
                        src={scrape.profile.photoUrl}
                        alt=""
                        className="h-14 w-14 rounded-full object-cover ring-2 ring-[var(--color-border)]"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-surface-2)]">
                        <ImageIcon className="h-5 w-5 text-[var(--color-fg-subtle)]" />
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
                      </div>
                      <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                        {scrape.listings.length} listing(s) found
                      </p>
                      {previewListings.length > 0 && (
                        <ul className="mt-2 space-y-1 border-t border-[var(--color-border)] pt-2">
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
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-6">
            <Button
              type="submit"
              className="min-h-[48px] w-full text-base"
              disabled={!canLaunch || syncing}
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {mode === "edit" ? "Save changes" : "Launch workspace"}
              {!syncing && <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>

          <p className="mt-4 text-center text-[11px] text-[var(--color-fg-subtle)]">
            Name + market + MLS required · everything else optional · edit anytime
          </p>
        </form>
      </div>
    </div>
  );
}
