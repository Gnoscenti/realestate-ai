import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Image as ImageIcon,
  Loader2,
  LockKeyhole,
  Video,
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  SocialMediaJobView,
  SocialMediaSetupResult,
} from "@/lib/social-media/types";
import {
  clearSocialImageRequestIdentity,
  persistSocialImageRequestIdentity,
  readSocialImageRequestIdentity,
  requestIdentityForSocialImage,
  socialImageIntentKey,
  type SocialImageRequestIdentity,
} from "@/lib/social-media/request-id";
import { cn } from "@/lib/utils";

function formatPrice(value: string | null): string {
  if (value == null || !value.trim()) return "Price not saved";
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(number)
    : "Price not saved";
}

function initialMediaIds(
  setup: SocialMediaSetupResult,
  listingId: string,
  maxPhotos: number,
): string[] {
  const listing = setup.listings.find((candidate) => candidate.id === listingId);
  return (listing?.media ?? [])
    .filter((photo) => photo.readyForRender)
    .slice(0, maxPhotos)
    .map((photo) => photo.id);
}

export function SocialMediaGenerator() {
  const [setup, setSetup] = useState<SocialMediaSetupResult | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [listingId, setListingId] = useState("");
  const [imageTemplateKey, setImageTemplateKey] = useState("");
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<"image" | "video" | null>(null);
  const [job, setJob] = useState<SocialMediaJobView | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [recoveredRecentJob, setRecoveredRecentJob] = useState(false);
  const imageRequestRef = useRef<SocialImageRequestIdentity | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("@/lib/social-media/api")
      .then(({ getSocialMediaSetup }) => getSocialMediaSetup())
      .then((data) => {
        if (cancelled) return;
        setSetup(data);
        imageRequestRef.current = readSocialImageRequestIdentity(
          window.sessionStorage,
        );
        const recovered =
          data.recentJob?.kind === "image" ? data.recentJob : null;
        const firstListing =
          data.listings.find(
            (candidate) => candidate.id === recovered?.listingId,
          ) ??
          data.listings[0];
        const firstTemplate =
          data.imageTemplates.find(
            (candidate) => candidate.key === recovered?.templateKey,
          ) ?? data.imageTemplates[0];
        setListingId(firstListing?.id ?? "");
        setImageTemplateKey(firstTemplate?.key ?? "");
        if (firstListing) {
          const readyIds = new Set(
            firstListing.media
              .filter((photo) => photo.readyForRender)
              .map((photo) => photo.id),
          );
          const recoveredIds = (recovered?.mediaIds ?? []).filter((id) =>
            readyIds.has(id),
          );
          setSelectedMediaIds(
            recoveredIds.length === recovered?.mediaIds.length
              ? recoveredIds
              : initialMediaIds(
                  data,
                  firstListing.id,
                  firstTemplate?.maxPhotos ?? 1,
                ),
          );
        }
        if (recovered) {
          setJob(recovered);
          setRecoveredRecentJob(true);
          setResultMessage(
            recovered.errorMessage ??
              (recovered.status === "completed"
                ? "Your most recent social image is ready."
                : recovered.status === "processing"
                  ? "Your most recent social image is still processing."
                  : "Your most recent social image job was restored."),
          );
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSetupError(
          error instanceof Error && error.message === "Unauthorized"
            ? "Sign in again to load your social media workspace."
            : "The secure social media workspace could not be loaded.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!job || job.status !== "processing") return;
    let cancelled = false;
    const poll = window.setInterval(() => {
      void import("@/lib/social-media/api")
        .then(({ getSocialMediaJobStatus }) =>
          getSocialMediaJobStatus({ data: { jobId: job.id } }),
        )
        .then((next) => {
          if (cancelled || !next || next.status === "processing") return;
          setJob(next);
          setResultMessage(
            next.status === "completed"
              ? "Your social image is ready to review and download."
              : next.errorMessage ?? "The image job needs your attention.",
          );
        })
        .catch(() => {
          // Keep the durable job visible. A later poll or refresh can reconcile
          // it without issuing another provider request.
        });
    }, 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [job]);

  const listing = useMemo(
    () => setup?.listings.find((candidate) => candidate.id === listingId) ?? null,
    [listingId, setup],
  );
  const imageTemplate = useMemo(
    () =>
      setup?.imageTemplates.find(
        (candidate) => candidate.key === imageTemplateKey,
      ) ?? null,
    [imageTemplateKey, setup],
  );
  const imageMaxPhotos = imageTemplate?.maxPhotos ?? 1;
  const videoMaxPhotos = setup?.videoTemplates[0]?.maxPhotos ?? 1;
  const maxSelectedPhotos = Math.max(imageMaxPhotos, videoMaxPhotos);

  const chooseListing = (nextListingId: string) => {
    setListingId(nextListingId);
    setSelectedMediaIds(
      setup ? initialMediaIds(setup, nextListingId, imageMaxPhotos) : [],
    );
    setJob(null);
    setResultMessage(null);
  };

  const chooseImageTemplate = (templateKey: string) => {
    setImageTemplateKey(templateKey);
    const maxPhotos =
      setup?.imageTemplates.find((template) => template.key === templateKey)
        ?.maxPhotos ?? 1;
    const combinedMax = Math.max(
      maxPhotos,
      setup?.videoTemplates[0]?.maxPhotos ?? 1,
    );
    setSelectedMediaIds((current) => {
      const ready = new Set(
        (listing?.media ?? [])
          .filter((photo) => photo.readyForRender)
          .map((photo) => photo.id),
      );
      const retained = current
        .filter((id) => ready.has(id))
        .slice(0, combinedMax);
      return retained.length
        ? retained
        : initialMediaIds(setup!, listingId, maxPhotos);
    });
    setJob(null);
    setResultMessage(null);
  };

  const togglePhoto = (mediaId: string, checked: boolean) => {
    setSelectedMediaIds((current) => {
      if (!checked) return current.filter((id) => id !== mediaId);
      if (current.includes(mediaId)) return current;
      if (current.length >= maxSelectedPhotos) {
        toast.error(`Select no more than ${maxSelectedPhotos} photos.`);
        return current;
      }
      return [...current, mediaId];
    });
    setJob(null);
    setResultMessage(null);
  };

  const generate = async (kind: "image" | "video") => {
    if (kind === "video" && setup?.videoProviderStatus === "setup_required") {
      const message =
        "Social video setup is still required. No video will be queued or charged.";
      setJob(null);
      setResultMessage(message);
      toast.message(message);
      return;
    }
    if (!listingId || !selectedMediaIds.length) {
      toast.error("Select a server-saved listing and at least one ready photo.");
      return;
    }
    if (kind === "image" && selectedMediaIds.length > imageMaxPhotos) {
      toast.error(
        `This image style supports ${imageMaxPhotos} photos. Deselect ${selectedMediaIds.length - imageMaxPhotos} or choose video.`,
      );
      return;
    }
    const templateKey =
      kind === "image"
        ? imageTemplateKey
        : setup?.videoTemplates[0]?.key ?? "";
    if (!templateKey) {
      toast.error(
        kind === "image"
          ? "No approved Orshot template is configured."
          : "The video template is unavailable.",
      );
      return;
    }
    setBusy(kind);
    setJob(null);
    setResultMessage(null);
    try {
      const api = await import("@/lib/social-media/api");
      const imageRequest =
        kind === "image"
          ? requestIdentityForSocialImage(
              imageRequestRef.current,
              {
                listingId,
                templateKey,
                mediaIds: selectedMediaIds,
              },
              () => crypto.randomUUID(),
            )
          : null;
      if (imageRequest) imageRequestRef.current = imageRequest;
      if (imageRequest) {
        persistSocialImageRequestIdentity(window.sessionStorage, imageRequest);
      }
      setRecoveredRecentJob(false);
      const result = await (kind === "image"
        ? api.generateSocialImage({
            data: {
              requestId: imageRequest!.requestId,
              listingId,
              templateKey,
              mediaIds: selectedMediaIds,
            },
          })
        : api.generateSocialVideo({
            data: {
              requestId: crypto.randomUUID(),
              listingId,
              templateKey,
              mediaIds: selectedMediaIds,
            },
          }));
      setJob(result.job ?? null);
      const message = result.ok
        ? "Your social image is ready to review and download."
        : result.error;
      setResultMessage(message);
      if (result.ok) toast.success(message);
      else if (result.code === "setup_required") toast.message(message);
      else toast.error(message);
    } catch (error) {
      const message =
        error instanceof Error && error.message === "Unauthorized"
          ? "Sign in again before generating social media."
          : "The render request could not be completed. No automatic retry was sent.";
      setResultMessage(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  const startNewImageRender = () => {
    imageRequestRef.current = null;
    clearSocialImageRequestIdentity(window.sessionStorage);
    setRecoveredRecentJob(false);
    setJob(null);
    setResultMessage(null);
    toast.message("A new image render will use one additional render credit.");
  };

  if (setupError) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 py-6 text-sm text-[var(--color-danger)]">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          {setupError}
        </CardContent>
      </Card>
    );
  }

  if (!setup) {
    return (
      <Card>
        <CardContent className="flex min-h-32 items-center justify-center gap-2 text-sm text-[var(--color-fg-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading secure listing media…
        </CardContent>
      </Card>
    );
  }

  if (!setup.listings.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="h-5 w-5 text-[var(--color-primary)]" />
            Generate listing media
          </CardTitle>
          <CardDescription>
            No server-saved listings are available yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 text-sm leading-relaxed text-[var(--color-fg-muted)]">
            This tool intentionally ignores sample listings, browser-only data,
            and pasted image URLs. A listing and its actual photos must first be
            saved to your secure workspace. The current listing setup screens may
            still contain local-only records; an administrator must complete the
            server import before they appear here.
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary" className="min-h-11">
              <Link to="/properties">Open listing setup</Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/mls">Open MLS connections</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const readyPhotos = listing?.media.filter((photo) => photo.readyForRender) ?? [];
  const canGenerate =
    setup.entitlement.enabled &&
    readyPhotos.length > 0 &&
    selectedMediaIds.length > 0;
  const imageSelectionFits = selectedMediaIds.length <= imageMaxPhotos;
  const currentImageIntentKey = socialImageIntentKey({
    listingId,
    templateKey: imageTemplateKey,
    mediaIds: selectedMediaIds,
  });
  const recoveredJobBlocksCurrentIntent = Boolean(
    recoveredRecentJob &&
      job?.kind === "image" &&
      socialImageIntentKey({
        listingId: job.listingId,
        templateKey: job.templateKey,
        mediaIds: job.mediaIds,
      }) === currentImageIntentKey,
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ImageIcon className="h-5 w-5 text-[var(--color-primary)]" />
              Ready-to-post listing media
            </CardTitle>
            <CardDescription className="mt-1">
              Select a listing and its actual saved photos. The server handles the
              render without accepting photo URLs from this page.
            </CardDescription>
          </div>
          <Badge variant={setup.entitlement.enabled ? "success" : "secondary"}>
            <LockKeyhole className="h-3 w-3" />
            {setup.entitlement.enabled ? "Premium active" : "Premium required"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div
          className={cn(
            "rounded-[var(--radius-md)] border p-3 text-sm",
            setup.entitlement.enabled
              ? "border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg-muted)]"
              : "border-[color-mix(in_oklab,var(--color-warning)_35%,var(--color-border))] bg-[var(--color-warning-soft)] text-[var(--color-fg)]",
          )}
        >
          {setup.entitlement.message}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="social-listing">Server-saved listing</Label>
            <Select
              value={listingId}
              onValueChange={chooseListing}
              disabled={busy !== null}
            >
              <SelectTrigger id="social-listing" className="min-h-11">
                <SelectValue placeholder="Select a listing" />
              </SelectTrigger>
              <SelectContent>
                {setup.listings.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.address || candidate.title} · {candidate.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {listing && (
              <p className="text-xs text-[var(--color-fg-subtle)]">
                {formatPrice(listing.listPrice)} · {listing.media.length} saved
                {listing.media.length === 1 ? " photo" : " photos"}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="social-image-template">Image style</Label>
            <Select
              value={imageTemplateKey}
              onValueChange={chooseImageTemplate}
              disabled={!setup.imageTemplates.length || busy !== null}
            >
              <SelectTrigger id="social-image-template" className="min-h-11">
                <SelectValue placeholder="Admin setup required" />
              </SelectTrigger>
              <SelectContent>
                {setup.imageTemplates.map((template) => (
                  <SelectItem key={template.key} value={template.key}>
                    {template.label} · up to {template.maxPhotos} photos
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!setup.imageProviderConfigured && (
              <p className="text-xs text-[var(--color-warning)]">
                An administrator must configure Orshot, approved templates, and
                approved photo/output hosts.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Actual listing photos</Label>
            <span className="text-xs text-[var(--color-fg-subtle)]">
              {selectedMediaIds.length}/{maxSelectedPhotos} selected · image
              style limit {imageMaxPhotos}
            </span>
          </div>
          {listing?.media.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {listing.media.map((photo, index) => {
                const checked = selectedMediaIds.includes(photo.id);
                return (
                  <label
                    key={photo.id}
                    className={cn(
                      "relative min-h-28 overflow-hidden rounded-[var(--radius-md)] border bg-[var(--color-bg-elevated)]",
                      photo.readyForRender
                        ? "cursor-pointer border-[var(--color-border)]"
                        : "cursor-not-allowed border-[var(--color-border)] opacity-60",
                      checked &&
                        "ring-2 ring-[var(--color-primary)] ring-offset-2 ring-offset-[var(--color-bg)]",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="absolute left-2 top-2 z-10 h-5 w-5 accent-[var(--color-primary)]"
                      checked={checked}
                      disabled={!photo.readyForRender || busy !== null}
                      aria-label={`Use listing photo ${index + 1}`}
                      onChange={(event) =>
                        togglePhoto(photo.id, event.target.checked)
                      }
                    />
                    {photo.previewUrl ? (
                      <img
                        src={photo.previewUrl}
                        alt={`Listing photo ${index + 1}`}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-28 w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-28 items-center justify-center p-3 text-center text-xs text-[var(--color-fg-subtle)]">
                        {photo.unavailableReason ?? "Photo unavailable"}
                      </div>
                    )}
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-fg-muted)]">
              This server-saved listing has no photos. Add its actual property
              photos before generating media.
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            size="lg"
            className="min-h-11"
            disabled={
              !canGenerate ||
              !setup.imageProviderConfigured ||
              !imageTemplateKey ||
              !imageSelectionFits ||
              recoveredJobBlocksCurrentIntent ||
              busy !== null
            }
            onClick={() => void generate("image")}
          >
            {busy === "image" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImageIcon className="h-4 w-4" />
            )}
            {busy === "image" ? "Generating image…" : "Generate Social Image"}
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="min-h-11"
            disabled={
              setup.videoProviderStatus === "setup_required" ||
              !canGenerate ||
              busy !== null
            }
            onClick={() => void generate("video")}
          >
            {busy === "video" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Video className="h-4 w-4" />
            )}
            {busy === "video"
              ? "Checking video setup…"
              : setup.videoProviderStatus === "setup_required"
                ? "Generate Social Video · Setup required"
                : "Generate Social Video"}
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-[var(--color-fg-subtle)]">
          Image generation applies deterministic text/graphics over your selected
          photos; it does not create or generatively alter property imagery.
          Video rendering is not live until CutCLI is verified on this deployment;
          the disabled video action does not create a job or use quota.
        </p>
        {!imageSelectionFits && (
          <p className="text-xs text-[var(--color-warning)]">
            Your video selection has {selectedMediaIds.length} photos. Deselect
            down to {imageMaxPhotos} to enable this image style.
          </p>
        )}

        {resultMessage && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 text-sm text-[var(--color-fg-muted)]"
          >
            {job?.status === "completed" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success)]" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" />
            )}
            <div>
              <div>{resultMessage}</div>
              {job && (
                <div className="mt-1 text-xs text-[var(--color-fg-subtle)]">
                  Job {job.id.slice(0, 8)} · {job.status.replaceAll("_", " ")}
                </div>
              )}
              {job?.kind === "image" &&
                (job.status === "completed" ||
                  job.status === "failed" ||
                  job.status === "blocked") && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-2 min-h-11 px-2 text-xs"
                    onClick={startNewImageRender}
                  >
                    Start a new image render
                  </Button>
                )}
            </div>
          </div>
        )}

        {job?.asset?.kind === "image" && (
          <div className="grid gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 md:grid-cols-[minmax(0,1fr)_auto]">
            <img
              src={job.asset.contentUrl}
              alt="Rendered listing social graphic"
              referrerPolicy="no-referrer"
              className="max-h-[32rem] w-full rounded-[var(--radius-md)] object-contain"
            />
            <div className="flex flex-col gap-2">
              <Button asChild className="min-h-11">
                <a
                  href={job.asset.contentUrl}
                  target="_blank"
                  rel="noreferrer"
                  download
                >
                  <Download className="h-4 w-4" />
                  Open / download image
                </a>
              </Button>
              <Button variant="outline" className="min-h-11" disabled>
                Post to Social · planned
              </Button>
              <p className="max-w-56 text-xs text-[var(--color-fg-subtle)]">
                Review the address, price, fair-housing language, and broker rules
                before posting.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
