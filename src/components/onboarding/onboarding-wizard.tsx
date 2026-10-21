import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Globe, Loader2, RefreshCw, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  getOnboardingProfile,
  scanOnboardingSource,
  confirmOnboardingProfile,
} from "@/lib/onboarding/api";
import {
  buildOnboardingPreview,
  onboardingNamesMatch,
  onboardingProfileFieldsSchema,
  type OnboardingProfileFields,
  type OnboardingSnapshot,
  type OnboardingSource,
} from "@/lib/onboarding/types";
import { normalizeSiteUrl } from "@/lib/website-scrape";
import { useAppStore } from "@/lib/store";
import { OnboardingProfileReview } from "./onboarding-profile-review";

type Props = {
  mode?: "first" | "edit";
  embedded?: boolean;
  onDone?: () => void;
  onCancel?: () => void;
  preferredName?: string | null;
  preferredEmail?: string | null;
};
type SourceKind = "website" | "brokerage_bio";
type Progress = Record<SourceKind, "waiting" | "reading" | "done" | "failed" | "skipped">;
type ReadFailure = { kind: SourceKind; sourceUrl: string; error: string };
const sourceLabel = (kind: SourceKind) =>
  kind === "website" ? "Your real-estate website" : "Your brokerage biography page";
const emptyProgress = (): Progress => ({ website: "waiting", brokerage_bio: "waiting" });
const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

/** Two explicit sources, a person confirmation, then a durable shared profile. */
export function OnboardingWizard({
  mode = "first",
  embedded = false,
  onDone,
  onCancel,
  preferredName,
  preferredEmail,
}: Props) {
  const existing = useAppStore((state) => state.agentProfile);
  const hydrateConfirmedProfile = useAppStore((state) => state.hydrateConfirmedProfile);
  const [snapshot, setSnapshot] = useState<OnboardingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [website, setWebsite] = useState(existing?.website ?? "");
  const [brokerageBio, setBrokerageBio] = useState(existing?.brokerageBioUrl ?? "");
  const [phase, setPhase] = useState<"sources" | "people" | "review">("sources");
  const [sources, setSources] = useState<OnboardingSource[]>([]);
  const [failures, setFailures] = useState<ReadFailure[]>([]);
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedName, setConfirmedName] = useState("");
  const [draft, setDraft] = useState<OnboardingProfileFields>({
    name: "",
    website: "",
    areaOfOperations: "",
    mls: "",
  });
  const [overrides, setOverrides] = useState<Partial<OnboardingProfileFields>>({});
  const request = useRef(0);
  const mounted = useRef(true);
  const editedFields = useRef(new Set<keyof OnboardingProfileFields>());
  const stepHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current += 1;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    void getOnboardingProfile()
      .then((saved) => {
        if (!active) return;
        setSnapshot(saved);
        if (saved) {
          setWebsite(saved.profile.website);
          setBrokerageBio(saved.profile.brokerageBioUrl ?? "");
          if (saved.revision > 0) hydrateConfirmedProfile(saved.profile);
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setLoadError(
            errorMessage(
              cause,
              "Your saved profile could not be loaded. Retry to keep your changes in sync.",
            ),
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [hydrateConfirmedProfile, loadAttempt]);

  useEffect(() => {
    if (phase !== "sources") stepHeading.current?.focus();
  }, [phase]);

  const cancel = useCallback(() => {
    if (saving || !onCancel) return;
    request.current += 1;
    onCancel?.();
  }, [onCancel, saving]);

  // The embedded first-use card is optional. Its container-level key handler
  // cannot receive Escape while focus is on the document after a scroll, so
  // listen at the window only for this initial, cancellable source step.
  useEffect(() => {
    if (!embedded || !onCancel || phase !== "sources") return;
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || saving) return;
      event.preventDefault();
      cancel();
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [embedded, onCancel, phase, saving, cancel]);

  const updateUrl = (kind: SourceKind, value: string) => {
    request.current += 1;
    if (kind === "website") setWebsite(value);
    else setBrokerageBio(value);
    // Keep deliberate URL edits authoritative when returning from profile review.
    setOverrides((current) => ({
      ...current,
      [kind === "website" ? "website" : "brokerageBioUrl"]: normalizeSiteUrl(value),
    }));
    setScanning(false);
    setSources([]);
    setFailures([]);
    setProgress(emptyProgress());
    setError(null);
  };

  const runBuild = async () => {
    if (scanning || loading || loadError || saving) return;
    const urls = {
      website: normalizeSiteUrl(website),
      brokerage_bio: normalizeSiteUrl(brokerageBio),
    };
    if ((website.trim() && !urls.website) || (brokerageBio.trim() && !urls.brokerage_bio)) {
      setError(
        "Enter a public web address, such as yourname.com or https://brokerage.com/agents/your-name.",
      );
      return;
    }
    if (!urls.website && !urls.brokerage_bio) {
      setError("Add either page to build your profile, or choose Continue without a page.");
      return;
    }
    const version = ++request.current;
    const active = () => mounted.current && version === request.current;
    setWebsite(urls.website);
    setBrokerageBio(urls.brokerage_bio);
    setScanning(true);
    setError(null);
    setSources([]);
    setFailures([]);
    setProgress(emptyProgress());
    const found: OnboardingSource[] = [];
    for (const kind of ["website", "brokerage_bio"] as const) {
      if (!active()) return;
      if (!urls[kind]) {
        setProgress((value) => ({ ...value, [kind]: "skipped" }));
        continue;
      }
      setProgress((value) => ({ ...value, [kind]: "reading" }));
      try {
        const result = await scanOnboardingSource({
          data: {
            kind,
            url: urls[kind],
            agentNameHint:
              snapshot?.profile.name || existing?.name || preferredName?.trim() || undefined,
          },
        });
        if (!active()) return;
        found.push(result);
        setSources([...found]);
        setProgress((value) => ({ ...value, [kind]: result.ok ? "done" : "failed" }));
      } catch (cause) {
        if (!active()) return;
        setFailures((value) => [
          ...value,
          {
            kind,
            sourceUrl: urls[kind],
            error: errorMessage(
              cause,
              "This page could not be read. You can retry or continue with the other page.",
            ),
          },
        ]);
        setProgress((value) => ({ ...value, [kind]: "failed" }));
      }
    }
    if (!active()) return;
    setScanning(false);
    setPhase("people");
  };

  const candidates = useMemo(() => {
    const seen = new Set<string>();
    return sources
      .flatMap((source) => source.candidates.map((candidate) => ({ ...candidate, source })))
      .filter((candidate) => {
        const name = candidate.profile.name.trim().toLocaleLowerCase();
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
      });
  }, [sources]);

  const currentProfile = snapshot?.profile ?? existing;
  const preview = useMemo(
    () => buildOnboardingPreview(sources, confirmedName, currentProfile),
    [sources, confirmedName, currentProfile],
  );

  const reviewPerson = (name: string, useSources: boolean) => {
    request.current += 1;
    setScanning(false);
    setError(null);
    const selectedSources = useSources ? sources : [];
    if (!useSources) setSources([]);
    const personName = name.trim();
    const previousName = confirmedName || currentProfile?.name;
    const changedPerson = !!previousName && !onboardingNamesMatch(previousName, personName);
    if (changedPerson) editedFields.current.clear();
    const retainedOverrides = changedPerson
      ? { website: overrides.website, brokerageBioUrl: overrides.brokerageBioUrl }
      : overrides;
    const prepared = buildOnboardingPreview(selectedSources, personName, currentProfile).profile;
    // Existing browser-only profiles are deliberately carried into the first durable save.
    const legacy =
      !snapshot && existing && onboardingNamesMatch(existing.name, personName)
        ? Object.fromEntries(
            Object.entries(existing).filter(([key]) =>
              [
                "name",
                "website",
                "areaOfOperations",
                "mls",
                "brokerage",
                "phone",
                "email",
                "photoUrl",
                "agentMlsId",
                "license",
                "licenseJurisdiction",
                "bio",
                "title",
                "sameAs",
                "brokerageBioUrl",
              ].includes(key),
            ),
          )
        : {};
    const fallback = {
      ...legacy,
      ...(prepared.name ? {} : { name: personName }),
      ...(prepared.email || !preferredEmail?.trim() ? {} : { email: preferredEmail.trim() }),
      ...retainedOverrides,
      website: normalizeSiteUrl(website),
      brokerageBioUrl: normalizeSiteUrl(brokerageBio),
    };
    setConfirmedName(personName);
    setOverrides(fallback);
    setDraft({ ...prepared, ...fallback });
    setPhase("review");
  };

  const editField = (field: keyof OnboardingProfileFields, value: string | string[]) => {
    editedFields.current.add(field);
    let nextOverrides = { ...overrides, [field]: value };
    if (field === "name" && typeof value === "string") {
      // Rebind source evidence as the name changes. User-typed corrections remain
      // explicit; inherited values must not move from one person's profile to another.
      if (currentProfile && !onboardingNamesMatch(currentProfile.name, value)) {
        nextOverrides = Object.fromEntries(
          Object.entries(nextOverrides).filter(
            ([key]) =>
              key === "website" ||
              key === "brokerageBioUrl" ||
              editedFields.current.has(key as keyof OnboardingProfileFields),
          ),
        );
      }
      setConfirmedName(value.trim());
      setDraft({
        ...buildOnboardingPreview(sources, value, currentProfile).profile,
        ...nextOverrides,
      });
    } else {
      setDraft((current) => ({ ...current, [field]: value }));
    }
    setOverrides(nextOverrides);
  };

  const save = async () => {
    if (saving || loading || loadError || draft.name.trim().length < 2) return;
    const validated = onboardingProfileFieldsSchema.partial().safeParse({
      ...overrides,
      ...(overrides.sameAs ? { sameAs: overrides.sameAs.filter((url) => url.trim()) } : {}),
    });
    if (!validated.success) {
      setError(validated.error.issues[0]?.message || "Check the profile details before saving.");
      return;
    }
    const version = ++request.current;
    setSaving(true);
    setError(null);
    try {
      const saved = await confirmOnboardingProfile({
        data: {
          expectedRevision: snapshot?.revision ?? 0,
          scanIds: sources.map((source) => source.id),
          confirmedName: confirmedName || draft.name.trim(),
          overrides: validated.data,
        },
      });
      if (!mounted.current || version !== request.current) return;
      setSnapshot(saved);
      hydrateConfirmedProfile(saved.profile);
      toast.success("Your business profile is ready");
      onDone?.();
    } catch (cause) {
      if (!mounted.current || version !== request.current) return;
      setError(
        errorMessage(
          cause,
          "Your profile could not be saved. Your edits are still here; please retry.",
        ),
      );
    } finally {
      if (mounted.current && version === request.current) setSaving(false);
    }
  };

  const refreshSavedProfile = async () => {
    const version = ++request.current;
    setLoading(true);
    try {
      const latest = await getOnboardingProfile();
      if (!mounted.current || version !== request.current) return;
      setSnapshot(latest);
      setDraft({
        ...buildOnboardingPreview(sources, confirmedName, latest?.profile).profile,
        ...overrides,
      });
      setError(null);
      toast.message("Latest saved profile loaded. Review your edits before confirming.");
    } catch (cause) {
      if (mounted.current && version === request.current)
        setError(errorMessage(cause, "The saved profile could not be reloaded. Please retry."));
    } finally {
      if (mounted.current && version === request.current) setLoading(false);
    }
  };

  const heading =
    mode === "edit"
      ? "Update your business profile"
      : "Build your workspace from your existing pages";
  const description =
    "Bring your business information into marketing, your assistant, and CiteLock. Review everything before it is saved.";
  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          {embedded ? (
            <h1 className="font-display text-2xl font-semibold tracking-tight">{heading}</h1>
          ) : (
            <DialogTitle className="pr-6 text-2xl">{heading}</DialogTitle>
          )}
          {embedded ? (
            <p className="max-w-xl text-sm leading-relaxed text-[var(--color-fg-muted)]">
              {description}
            </p>
          ) : (
            <DialogDescription>{description}</DialogDescription>
          )}
        </div>
        {embedded && onCancel && (
          <Button variant="ghost" className="min-h-11 shrink-0" disabled={saving} onClick={cancel}>
            Skip for now
          </Button>
        )}
      </div>
      {loading && (
        <p className="flex items-center gap-2 text-sm text-[var(--color-fg-muted)]" role="status">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          Loading your saved profile…
        </p>
      )}
      {loadError && (
        <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
          <p role="alert" className="text-sm">
            {loadError}
          </p>
          <Button variant="outline" onClick={() => setLoadAttempt((value) => value + 1)}>
            Retry loading profile
          </Button>
        </div>
      )}
      {error && (
        <div>
          <p
            role="alert"
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-sm text-[var(--color-warning)]"
          >
            {error}
          </p>
          {phase === "review" && (
            <Button
              variant="ghost"
              className="mt-2 min-h-11"
              disabled={loading || saving}
              onClick={() => void refreshSavedProfile()}
            >
              Reload saved profile and keep my edits
            </Button>
          )}
        </div>
      )}

      {phase === "sources" && (
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void runBuild();
          }}
        >
          <div className="space-y-4">
            {(["website", "brokerage_bio"] as const).map((kind) => (
              <div key={kind}>
                <Label htmlFor={kind === "website" ? "website" : "brokerage-bio"}>
                  {sourceLabel(kind)}
                </Label>
                <div className="relative mt-2">
                  <Globe
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--color-fg-subtle)]"
                  />
                  <Input
                    id={kind === "website" ? "website" : "brokerage-bio"}
                    className="h-11 pl-9"
                    value={kind === "website" ? website : brokerageBio}
                    onChange={(event) => updateUrl(kind, event.target.value)}
                    placeholder={
                      kind === "website" ? "yourname.com" : "brokerage.com/agents/your-name"
                    }
                    inputMode="url"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={loading || !!loadError}
                  />
                </div>
              </div>
            ))}
            <p className="text-sm text-[var(--color-fg-muted)]">
              One page is enough to start. You can add the other later.
            </p>
          </div>
          {scanning && (
            <ol
              className="space-y-2 rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] p-4 text-sm"
              aria-label="Workspace preparation"
              aria-live="polite"
            >
              {(["website", "brokerage_bio"] as const).map((kind) => (
                <li key={kind} className="flex items-center gap-2">
                  {progress[kind] === "reading" ? (
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                  ) : progress[kind] === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-[var(--color-primary)]" />
                  ) : (
                    <span className="h-4 w-4 text-center" aria-hidden="true">
                      –
                    </span>
                  )}
                  <span>
                    {kind === "website" ? "Reading website" : "Matching brokerage profile"}
                    {progress[kind] === "done"
                      ? " — ready"
                      : progress[kind] === "skipped"
                        ? " — not supplied"
                        : progress[kind] === "failed"
                          ? " — unavailable; continuing"
                          : progress[kind] === "reading"
                            ? "…"
                            : " — waiting"}
                  </span>
                </li>
              ))}
              <li className="pl-6 text-[var(--color-fg-subtle)]">
                Preparing workspace — after your confirmation
              </li>
            </ol>
          )}
          <Button
            type="submit"
            className="min-h-12 w-full text-base"
            disabled={scanning || loading || !!loadError}
          >
            {scanning ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Globe className="h-4 w-4" />
            )}
            {scanning ? "Reading your pages…" : "Build my workspace"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 w-full"
            disabled={loading || !!loadError}
            onClick={() => reviewPerson(currentProfile?.name || preferredName || "", false)}
          >
            Continue without a page
          </Button>
        </form>
      )}

      {phase !== "sources" && (
        <div className="space-y-3">
          {(sources.length > 0 || failures.length > 0) && (
            <div
              className="space-y-2 border-y border-[var(--color-border)] py-3 text-xs text-[var(--color-fg-muted)]"
              aria-label="Source results"
            >
              {sources.map((source) => (
                <div key={source.id}>
                  <a
                    className="font-medium underline underline-offset-2"
                    href={source.finalUrl || source.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {sourceLabel(source.kind)}
                  </a>
                  <span>
                    {" "}
                    —{" "}
                    {source.ok
                      ? `${source.candidates.length} profile${source.candidates.length === 1 ? "" : "s"} found`
                      : "could not be read"}
                  </span>
                  <p className="mt-1">
                    {source.error ||
                      source.warnings[0] ||
                      `Observed ${new Date(source.observedAt).toLocaleString()}`}
                  </p>
                  {phase === "review" &&
                    source.ok &&
                    !source.candidates.some((candidate) =>
                      onboardingNamesMatch(candidate.profile.name, confirmedName),
                    ) && (
                      <p className="mt-1">
                        No matching person on this page. Its profile details will not be used.
                      </p>
                    )}
                </div>
              ))}
              {failures.map((failure) => (
                <div key={`${failure.kind}-${failure.sourceUrl}`}>
                  <a
                    className="font-medium underline underline-offset-2"
                    href={failure.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {sourceLabel(failure.kind)}
                  </a>
                  <p className="mt-1">{failure.error}</p>
                </div>
              ))}
            </div>
          )}
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={saving || loading}
            onClick={() => {
              request.current += 1;
              setPhase("sources");
              setError(null);
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Edit URLs or retry
          </Button>
        </div>
      )}

      {phase === "people" && (
        <div className="space-y-4">
          <div>
            <h2
              ref={stepHeading}
              tabIndex={-1}
              className="font-display text-xl font-semibold focus:outline-none"
            >
              {candidates.length ? "Which profile is yours?" : "Your profile can still start here"}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
              {candidates.length
                ? "Confirm the person before we use any public contact or credential information."
                : "We could not identify a person on these pages. Use your signed-in details and add anything else later."}
            </p>
          </div>
          {candidates.map(({ profile, identityMatch, source }) => (
            <div
              key={profile.name}
              className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-4"
            >
              <div className="flex gap-3">
                {profile.photoUrl ? (
                  <img
                    src={profile.photoUrl}
                    referrerPolicy="no-referrer"
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-elevated)]">
                    <UserRound className="h-6 w-6 text-[var(--color-fg-subtle)]" />
                  </div>
                )}
                <div className="min-w-0 break-words">
                  <h3 className="font-medium">{profile.name}</h3>
                  {profile.brokerage && (
                    <p className="text-sm text-[var(--color-fg-muted)]">{profile.brokerage}</p>
                  )}
                  {profile.email && <p className="text-sm">{profile.email}</p>}
                  {profile.phone && <p className="text-sm">{profile.phone}</p>}
                  <a
                    href={source.finalUrl || source.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--color-primary)] underline underline-offset-2"
                  >
                    View source
                  </a>
                </div>
              </div>
              {identityMatch === "different_person" && (
                <p className="text-xs text-[var(--color-warning)]">
                  This name differs from your signed-in profile. Only continue if this is you.
                </p>
              )}
              <Button className="min-h-11 w-full" onClick={() => reviewPerson(profile.name, true)}>
                This is me<span className="sr-only">, {profile.name}</span>
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            className="min-h-11 w-full"
            onClick={() => reviewPerson(currentProfile?.name || preferredName || "", false)}
          >
            {candidates.length ? "None of these — use my details" : "Continue with my details"}
          </Button>
        </div>
      )}

      {phase === "review" && (
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div>
            <h2
              ref={stepHeading}
              tabIndex={-1}
              className="font-display text-xl font-semibold focus:outline-none"
            >
              Confirm your business profile
            </h2>
            <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
              Keep what is right and correct anything that needs updating. Only your name is
              required.
            </p>
          </div>
          <OnboardingProfileReview
            profile={draft}
            conflicts={preview.conflicts}
            onChange={editField}
            disabled={saving || loading}
          />
          <Button
            type="submit"
            className="min-h-12 w-full text-base"
            disabled={saving || loading || draft.name.trim().length < 2 || !!loadError}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {saving ? "Preparing workspace…" : "Confirm profile and open workspace"}
          </Button>
          <p className="text-center text-xs text-[var(--color-fg-muted)]">
            Your confirmed profile is saved to your workspace. You can edit it later.
          </p>
        </form>
      )}
      {!embedded && onCancel && (
        <Button variant="ghost" className="min-h-11" disabled={saving} onClick={cancel}>
          {mode === "edit" ? "Cancel" : "Skip for now"}
        </Button>
      )}
    </>
  );

  if (embedded)
    return (
      <section
        className="space-y-6 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-7"
        aria-label="Business profile setup"
        onKeyDown={(event) => {
          if (event.key === "Escape" && onCancel) {
            event.stopPropagation();
            cancel();
          }
        }}
      >
        {content}
      </section>
    );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) cancel();
      }}
    >
      <DialogContent
        className="max-w-2xl gap-6"
        onEscapeKeyDown={(event) => {
          if (saving || !onCancel) event.preventDefault();
        }}
        onInteractOutside={(event) => event.preventDefault()}
      >
        {content}
      </DialogContent>
    </Dialog>
  );
}
