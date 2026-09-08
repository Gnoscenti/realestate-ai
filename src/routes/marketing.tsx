import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Copy,
  Download,
  History,
  ImageIcon,
  Link2,
  Loader2,
  Megaphone,
  RefreshCw,
  Send,
  Share2,
  Sparkles,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  connectPostiz,
  disconnectPostiz,
  draftSocialCaption,
  getSocialDesk,
  getSocialHistory,
  publishSocial,
  refreshSocialPublication,
  saveNewSocialDraft,
  updateSocialDraft,
} from "@/lib/social-desk/api";
import { hasBlockingFinding, reviewCaption } from "@/lib/social-desk/fair-housing";
import { GOAL_OPTIONS, VOICE_PRESETS, listingFacts, suggestContentGap, type ContentGoal } from "@/lib/social-desk/suggest";
import {
  PLATFORM_LABEL,
  PLATFORM_LIMITS,
  exportSocialDraft,
  type SocialContent,
  type SocialDraft,
  type SocialPlatform,
  type SocialPublication,
} from "@/lib/social-desk/types";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { describeAiError } from "@/lib/ai-errors";

const searchSchema = z.object({
  origin: z.string().max(200).optional(),
  property: z.string().max(200).optional(),
});

export const Route = createFileRoute("/marketing")({
  validateSearch: searchSchema,
  component: SocialDeskPage,
});

type Desk = Awaited<ReturnType<typeof getSocialDesk>>;
type DraftResult = Awaited<ReturnType<typeof draftSocialCaption>>;

const PLATFORMS = Object.keys(PLATFORM_LABEL) as SocialPlatform[];

function errorMessage(error: unknown, fallback: string): string {
  return describeAiError(error, fallback);
}

function emptyContent(platform: SocialPlatform, origin = ""): SocialContent {
  return { title: "", platform, caption: "", facts: "", sourceUrl: "", attribution: "", mediaUrls: [], origin };
}

const STATE_LABEL: Record<SocialDraft["state"], string> = {
  draft: "Draft",
  approved: "Approved",
  handed_off: "Handed off",
  reported_posted: "Posted (reported)",
  scheduled: "Scheduled",
  published: "Published",
  failed: "Publish failed",
};

function stateVariant(state: SocialDraft["state"]) {
  if (state === "published" || state === "reported_posted") return "success" as const;
  if (state === "failed") return "danger" as const;
  if (state === "approved" || state === "scheduled" || state === "handed_off") return "accent" as const;
  return "secondary" as const;
}

function SocialDeskPage() {
  const { origin: originParam, property: propertyParam } = Route.useSearch();
  const properties = useAppStore((state) => state.properties);
  const profile = useAppStore((state) => state.agentProfile);
  const [desk, setDesk] = useState<Desk | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composer, setComposer] = useState<SocialContent>(() => emptyContent("instagram", originParam || ""));
  const [composerDirty, setComposerDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [goal, setGoal] = useState<ContentGoal>(originParam?.startsWith("citelock:") ? "citelock_intervention" : "just_listed");
  const [voice, setVoice] = useState<string>(VOICE_PRESETS[0]);
  const [propertyId, setPropertyId] = useState<string>(propertyParam || "");
  const [drafting, setDrafting] = useState(false);
  const [lastDraft, setLastDraft] = useState<DraftResult | null>(null);
  const [history, setHistory] = useState<{ revision: number; action: string; createdAt: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [channelId, setChannelId] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [postizKey, setPostizKey] = useState("");
  const [postizUrl, setPostizUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await getSocialDesk();
      setDesk(next);
    } catch (error) {
      setLoadError(errorMessage(error, "Could not load the social desk"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(() => desk?.drafts.find((draft) => draft.id === selectedId) || null, [desk, selectedId]);
  const property = properties.find((item) => item.id === propertyId);
  const suggestion = useMemo(() => suggestContentGap(properties), [properties]);

  useEffect(() => {
    if (!propertyId && suggestion.property) setPropertyId(suggestion.property.id);
  }, [propertyId, suggestion.property]);

  useEffect(() => {
    if (!selected) {
      setHistory([]);
      return;
    }
    let active = true;
    void getSocialHistory({ data: { id: selected.id } })
      .then((rows) => {
        if (active) setHistory(rows);
      })
      .catch(() => {
        if (active) setHistory([]);
      });
    return () => {
      active = false;
    };
  }, [selected]);

  const openDraft = (draft: SocialDraft) => {
    setSelectedId(draft.id);
    setComposer(draft.content);
    setComposerDirty(false);
    setLastDraft(null);
    setReceiptUrl(draft.postUrl || "");
  };

  const newDraft = () => {
    setSelectedId(null);
    setComposer(emptyContent(composer.platform, originParam || ""));
    setComposerDirty(false);
    setLastDraft(null);
  };

  const review = useMemo(() => reviewCaption(composer.caption), [composer.caption]);
  const blocking = hasBlockingFinding(review);
  const captionLength = Array.from(composer.caption).length;
  const limit = PLATFORM_LIMITS[composer.platform];

  const facts = useMemo(() => {
    const lines: string[] = [];
    if (property) lines.push(...listingFacts(property));
    if (profile?.name) lines.push(`Agent: ${profile.name}${profile.brokerage ? ` · ${profile.brokerage}` : ""}`);
    if (profile?.areaOfOperations) lines.push(`Market: ${profile.areaOfOperations}`);
    if (profile?.website) lines.push(`Website: ${profile.website}`);
    return lines;
  }, [property, profile]);

  const runDraft = async () => {
    const declared = composer.facts.split("\n").map((line) => line.trim()).filter(Boolean);
    const allFacts = [...facts, ...declared];
    if (!allFacts.length) {
      toast.error("Add at least one fact before drafting");
      return;
    }
    setDrafting(true);
    try {
      const result = await draftSocialCaption({
        data: {
          platform: composer.platform,
          goal,
          voice,
          facts: allFacts.slice(0, 20),
          audienceNote: originParam ? `Origin: ${originParam}` : "",
          linkUrl: composer.sourceUrl || "",
        },
      });
      setLastDraft(result);
      const caption = [result.caption, result.hashtags.join(" ")].filter(Boolean).join("\n\n");
      setComposer((current) => ({
        ...current,
        caption: Array.from(caption).slice(0, limit).join(""),
        title: current.title || `${GOAL_OPTIONS.find((option) => option.value === goal)?.label} · ${property?.title || profile?.areaOfOperations || "post"}`,
        facts: current.facts || facts.join("\n"),
      }));
      setComposerDirty(true);
      toast.success(`Drafted with ${result.model} — review the facts it used`);
    } catch (error) {
      toast.error(errorMessage(error, "Drafting failed"));
    } finally {
      setDrafting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      if (selected) {
        const updated = await updateSocialDraft({
          data: { id: selected.id, revision: selected.revision, command: { action: "edit", content: composer } },
        });
        await load();
        setSelectedId(updated.id);
        setComposerDirty(false);
        toast.success("Saved as a new revision");
      } else {
        const created = await saveNewSocialDraft({ data: composer });
        await load();
        setSelectedId(created.id);
        setComposerDirty(false);
        toast.success("Draft saved");
      }
    } catch (error) {
      toast.error(errorMessage(error, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const command = async (action: "approve" | "handoff" | "receipt") => {
    if (!selected) return;
    setBusy(action);
    try {
      if (action === "approve") {
        await updateSocialDraft({ data: { id: selected.id, revision: selected.revision, command: { action: "approve", reviewedFactsAndRights: true } } });
        toast.success("Approved — this exact text can now be published");
      } else if (action === "handoff") {
        await updateSocialDraft({ data: { id: selected.id, revision: selected.revision, command: { action: "handoff" } } });
        toast.success("Handoff recorded — post it manually, then paste the URL");
      } else {
        await updateSocialDraft({ data: { id: selected.id, revision: selected.revision, command: { action: "receipt", postUrl: receiptUrl.trim() } } });
        toast.success("Receipt recorded");
      }
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "Update failed"));
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    if (!selected) return;
    if (!channelId) {
      toast.error("Choose a connected channel");
      return;
    }
    setBusy("publish");
    try {
      const scheduledFor = scheduleAt ? new Date(scheduleAt).toISOString() : undefined;
      const result = await publishSocial({ data: { id: selected.id, revision: selected.revision, channelId, scheduledFor } });
      toast.success(scheduledFor ? `Scheduled via Postiz for ${new Date(scheduledFor).toLocaleString()}` : "Sent to Postiz — it publishes as soon as its worker runs");
      await load();
      setSelectedId(result.draft.id);
    } catch (error) {
      toast.error(errorMessage(error, "Publish failed"));
      await load();
    } finally {
      setBusy(null);
    }
  };

  const refresh = async (publication: SocialPublication) => {
    setBusy(publication.id);
    try {
      const result = await refreshSocialPublication({ data: { publicationId: publication.id } });
      toast.message(`Postiz status: ${result.publication.status}`);
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not refresh"));
    } finally {
      setBusy(null);
    }
  };

  const copyText = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(exportSocialDraft(selected));
      toast.success("Approved caption copied");
    } catch (error) {
      toast.error(errorMessage(error, "Copy failed"));
    }
  };

  const shareNative = async () => {
    if (!selected) return;
    try {
      const text = exportSocialDraft(selected);
      if (typeof navigator.share === "function") {
        await navigator.share({ text, url: selected.content.mediaUrls[0] || undefined });
      } else {
        await navigator.clipboard.writeText(text);
        toast.message("Share sheet unavailable here — caption copied instead");
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") toast.error(errorMessage(error, "Share failed"));
    }
  };

  const download = () => {
    if (!selected) return;
    try {
      const text = [exportSocialDraft(selected), "", `Media: ${selected.content.mediaUrls.join(", ") || "none"}`].join("\n");
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${selected.content.title.replace(/[^\w]+/g, "-").toLowerCase() || "post"}.txt`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(errorMessage(error, "Download failed"));
    }
  };

  const connect = async () => {
    setBusy("connect");
    try {
      const summary = await connectPostiz({ data: { apiKey: postizKey, apiUrl: postizUrl || undefined } });
      toast.success(`Connected · ${summary.channels.length} channel(s) found`);
      setPostizKey("");
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not connect Postiz"));
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("disconnect");
    try {
      await disconnectPostiz();
      toast.message("Postiz disconnected");
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not disconnect"));
    } finally {
      setBusy(null);
    }
  };

  const channels = (desk?.scheduler?.channels || []).filter((channel) => !channel.disabled);
  const matchingChannels = channels.filter((channel) => !channel.platform || channel.platform === (selected?.content.platform ?? composer.platform));
  const selectedPublications = desk?.publications.filter((publication) => publication.draftId === selected?.id) || [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="relative overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7">
          <div className="max-w-2xl">
            <Badge variant="accent">
              <Megaphone className="h-3 w-3" />
              Social desk
            </Badge>
            <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Draft from facts, review for fair housing, approve, then publish or hand off
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-fg-muted)]">
              Every post starts from facts on record. AI drafts echo back which facts they used. Publishing goes through
              your own scheduler connection or a manual handoff with a receipt — never a fake "published" badge.
            </p>
          </div>
          <Button onClick={newDraft} variant="secondary">
            <Sparkles className="h-4 w-4" /> New post
          </Button>
        </div>
      </div>

      {loadError && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 py-4 text-sm">
            <span className="text-[var(--color-danger)]">{loadError}</span>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Drafts</CardTitle>
              <CardDescription>Stored on the server with a revision history.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading && !desk && (
                <div className="flex items-center gap-2 text-sm text-[var(--color-fg-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              )}
              {desk && desk.drafts.length === 0 && (
                <p className="text-sm text-[var(--color-fg-muted)]">
                  No drafts yet. {suggestion.reason}
                </p>
              )}
              {desk?.drafts.map((draft) => (
                <button
                  key={draft.id}
                  type="button"
                  onClick={() => openDraft(draft)}
                  className={cn(
                    "w-full rounded-[var(--radius-md)] border px-3 py-2.5 text-left transition-colors",
                    selectedId === draft.id ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]/40" : "border-[var(--color-border)] hover:bg-[var(--color-bg-elevated)]",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{draft.content.title}</span>
                    <Badge variant={stateVariant(draft.state)}>{STATE_LABEL[draft.state]}</Badge>
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--color-fg-subtle)]">
                    {PLATFORM_LABEL[draft.content.platform]} · rev {draft.revision} · {new Date(draft.updatedAt).toLocaleString()}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="h-4 w-4 text-[var(--color-primary)]" /> Publishing
              </CardTitle>
              <CardDescription>
                Connect your Postiz workspace (it holds the Instagram, LinkedIn, Facebook, and X authorizations). The API
                key is encrypted on the server and never shown again.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {desk?.scheduler ? (
                <>
                  <div className="text-xs text-[var(--color-fg-muted)]">
                    Connected {new Date(desk.scheduler.connectedAt).toLocaleDateString()} · {desk.scheduler.apiUrl}
                  </div>
                  {desk.scheduler.error && (
                    <p className="text-xs text-[var(--color-danger)]" role="alert">
                      Postiz check failed: {desk.scheduler.error}
                    </p>
                  )}
                  {desk.scheduler.channels.length ? (
                    <ul className="space-y-1 text-xs">
                      {desk.scheduler.channels.map((channel) => (
                        <li key={channel.id} className="flex items-center justify-between">
                          <span>
                            {channel.name}
                            <span className="text-[var(--color-fg-subtle)]"> · {channel.platform || channel.identifier}</span>
                          </span>
                          {channel.disabled && <Badge variant="danger">disabled</Badge>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    !desk.scheduler.error && <p className="text-xs text-[var(--color-fg-muted)]">No channels connected in Postiz yet. Add them there, then reload.</p>
                  )}
                  <Button size="sm" variant="outline" onClick={disconnect} disabled={busy === "disconnect"}>
                    <Unplug className="h-3.5 w-3.5" /> Disconnect
                  </Button>
                </>
              ) : (
                <form
                  className="space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void connect();
                  }}
                >
                  <Label htmlFor="postiz-key">Postiz API key</Label>
                  <Input id="postiz-key" type="password" autoComplete="off" value={postizKey} onChange={(event) => setPostizKey(event.target.value)} placeholder="From Postiz → Settings → Public API" />
                  <Label htmlFor="postiz-url">Self-hosted API URL (optional)</Label>
                  <Input id="postiz-url" value={postizUrl} onChange={(event) => setPostizUrl(event.target.value)} placeholder="https://api.postiz.com" />
                  <Button type="submit" size="sm" disabled={busy === "connect" || postizKey.trim().length < 8}>
                    {busy === "connect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                    Connect and list channels
                  </Button>
                  <p className="text-[11px] text-[var(--color-fg-subtle)]">
                    No scheduler? Approve a post and use Hand off: copy, share, or download, then paste the live URL as your receipt.
                  </p>
                </form>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-8">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{selected ? `Editing rev ${selected.revision}` : "New post"}</CardTitle>
                  <CardDescription>
                    {selected && selected.state !== "draft"
                      ? "Editing creates a new revision and returns it to draft; the approved text is kept in history."
                      : "Facts first. The caption must fit the platform limit and pass the fair-housing review."}
                  </CardDescription>
                </div>
                {selected && <Badge variant={stateVariant(selected.state)}>{STATE_LABEL[selected.state]}</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Platform</Label>
                  <Select value={composer.platform} onValueChange={(value) => { setComposer({ ...composer, platform: value as SocialPlatform }); setComposerDirty(true); }}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map((platform) => (
                        <SelectItem key={platform} value={platform}>{PLATFORM_LABEL[platform]} · {PLATFORM_LIMITS[platform]} chars</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Goal</Label>
                  <Select value={goal} onValueChange={(value) => setGoal(value as ContentGoal)}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GOAL_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Voice</Label>
                  <Select value={voice} onValueChange={setVoice}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VOICE_PRESETS.map((preset) => (
                        <SelectItem key={preset} value={preset}>{preset}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Listing on record (optional)</Label>
                <Select value={propertyId || "none"} onValueChange={(value) => setPropertyId(value === "none" ? "" : value)}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="No listing" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No listing</SelectItem>
                    {properties.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.title} · {item.status}{item.listingSide === "mine" ? " · yours" : " · observed"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {facts.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-[var(--color-fg-muted)]">
                    {facts.map((fact) => <li key={fact}>{fact}</li>)}
                  </ul>
                )}
              </div>

              <div>
                <Label htmlFor="social-facts">Your own facts and perspective (one per line) — required</Label>
                <Textarea
                  id="social-facts"
                  className="mt-1.5"
                  value={composer.facts}
                  onChange={(event) => { setComposer({ ...composer, facts: event.target.value }); setComposerDirty(true); }}
                  placeholder={"Open house Saturday 1–3 PM (I set this)\nBuyers loved the west-facing patio at last weekend's showings\nSeller completed a roof inspection in August"}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={runDraft} disabled={drafting || !desk?.draftingConfigured}>
                  {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {drafting ? "Drafting…" : "Draft with AI from these facts"}
                </Button>
                {desk && !desk.draftingConfigured && (
                  <span className="text-xs text-[var(--color-fg-muted)]">AI drafting is off on this server (no XAI_API_KEY). Write the caption below.</span>
                )}
              </div>
              {lastDraft && (
                <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 text-xs">
                  <div className="font-medium">Facts the model says it used ({lastDraft.model})</div>
                  <ul className="mt-1 list-disc pl-5 text-[var(--color-fg-muted)]">
                    {lastDraft.factsUsed.map((fact) => <li key={fact}>{fact}</li>)}
                  </ul>
                  {lastDraft.unsupportedClaimsAvoided.length > 0 && (
                    <>
                      <div className="mt-2 font-medium">Claims it deliberately did not make</div>
                      <ul className="mt-1 list-disc pl-5 text-[var(--color-fg-muted)]">
                        {lastDraft.unsupportedClaimsAvoided.map((claim) => <li key={claim}>{claim}</li>)}
                      </ul>
                    </>
                  )}
                  {lastDraft.altHooks.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {lastDraft.altHooks.map((hook) => (
                        <Button key={hook} size="sm" variant="outline" onClick={() => { setComposer({ ...composer, caption: `${hook}\n\n${composer.caption}` }); setComposerDirty(true); }}>
                          Use hook: {hook.slice(0, 40)}{hook.length > 40 ? "…" : ""}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <Label htmlFor="social-title">Title (internal)</Label>
                <Input id="social-title" className="mt-1.5" value={composer.title} onChange={(event) => { setComposer({ ...composer, title: event.target.value }); setComposerDirty(true); }} placeholder="Just listed · 1 Coastal Way" />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="social-caption">Caption — exact text that will be published</Label>
                  <span className={cn("text-xs tabular", captionLength > limit ? "text-[var(--color-danger)]" : "text-[var(--color-fg-subtle)]")}>{captionLength}/{limit}</span>
                </div>
                <Textarea id="social-caption" rows={9} className="mt-1.5" value={composer.caption} onChange={(event) => { setComposer({ ...composer, caption: event.target.value }); setComposerDirty(true); }} />
              </div>
              {review.length > 0 && (
                <div className={cn("rounded-[var(--radius-md)] border p-3 text-xs", blocking ? "border-[var(--color-danger)]/50 bg-[var(--color-danger-soft)]" : "border-[var(--color-warning)]/50 bg-[var(--color-warning-soft)]")}>
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-3.5 w-3.5" /> Fair-housing and claims review · {blocking ? "blocking" : "needs a look"}
                  </div>
                  <ul className="mt-1 space-y-1">
                    {review.map((finding) => (
                      <li key={`${finding.phrase}:${finding.reason}`}>
                        <Badge variant={finding.severity === "block" ? "danger" : "warning"} className="mr-1 capitalize">{finding.severity}</Badge>
                        “{finding.phrase}” — {finding.reason} <span className="text-[var(--color-fg-muted)]">{finding.suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="social-source">Link to include (optional, https)</Label>
                  <Input id="social-source" className="mt-1.5" value={composer.sourceUrl} onChange={(event) => { setComposer({ ...composer, sourceUrl: event.target.value }); setComposerDirty(true); }} placeholder="https://your-site.com/page" />
                </div>
                <div>
                  <Label htmlFor="social-attribution">Attribution / disclosures (optional)</Label>
                  <Input id="social-attribution" className="mt-1.5" value={composer.attribution} onChange={(event) => { setComposer({ ...composer, attribution: event.target.value }); setComposerDirty(true); }} placeholder="Photo: listing photographer · DRE #…" />
                </div>
              </div>
              <div>
                <Label className="flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" /> Media you have rights to (https image URLs, one per line, max 4)</Label>
                <Textarea
                  className="mt-1.5"
                  rows={2}
                  value={composer.mediaUrls.join("\n")}
                  onChange={(event) => { setComposer({ ...composer, mediaUrls: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 4) }); setComposerDirty(true); }}
                  placeholder={property?.photoUrls?.[0] || "https://…/photo.jpg"}
                />
                {property?.photoUrls?.length ? (
                  <div className="mt-2 flex gap-2 overflow-x-auto">
                    {property.photoUrls.slice(0, 6).map((url) => (
                      <button key={url} type="button" className="shrink-0" onClick={() => { if (!composer.mediaUrls.includes(url) && composer.mediaUrls.length < 4) { setComposer({ ...composer, mediaUrls: [...composer.mediaUrls, url] }); setComposerDirty(true); } }} title="Add to post">
                        <img src={url} alt="" className={cn("h-14 w-14 rounded-md object-cover ring-1", composer.mediaUrls.includes(url) ? "ring-[var(--color-primary)]" : "ring-[var(--color-border)]")} crossOrigin="anonymous" />
                      </button>
                    ))}
                  </div>
                ) : null}
                <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">Aggregator or MLS photos require reuse rights you hold. Postiz re-hosts media before publishing.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={save} disabled={saving || !composerDirty || !composer.title.trim() || !composer.caption.trim() || !composer.facts.trim() || captionLength > limit}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {selected ? "Save new revision" : "Save draft"}
                </Button>
                {selected?.state === "draft" && !composerDirty && (
                  <Button variant="accent" onClick={() => command("approve")} disabled={busy === "approve" || blocking}>
                    <CheckCircle2 className="h-4 w-4" /> Approve facts, rights, and text
                  </Button>
                )}
                {blocking && <span className="self-center text-xs text-[var(--color-danger)]">Blocking findings must be fixed before approval.</span>}
              </div>
            </CardContent>
          </Card>

          {selected && selected.state !== "draft" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><Send className="h-4 w-4 text-[var(--color-primary)]" /> Publish rev {selected.revision}</CardTitle>
                <CardDescription>The approved text goes out verbatim. Choose a channel in your scheduler, or hand it off manually and record the receipt.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {desk?.scheduler && (selected.state === "approved" || selected.state === "handed_off") && (
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                    <div>
                      <Label>Channel</Label>
                      <Select value={channelId} onValueChange={setChannelId}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder={matchingChannels.length ? "Choose a channel" : `No ${PLATFORM_LABEL[selected.content.platform]} channel connected`} /></SelectTrigger>
                        <SelectContent>
                          {matchingChannels.map((channel) => (
                            <SelectItem key={channel.id} value={channel.id}>{channel.name} · {channel.platform || channel.identifier}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="social-when"><CalendarClock className="mr-1 inline h-3.5 w-3.5" />Schedule (blank = now)</Label>
                      <Input id="social-when" type="datetime-local" className="mt-1.5" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} />
                    </div>
                    <Button onClick={publish} disabled={busy === "publish" || !channelId}>
                      {busy === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      {scheduleAt ? "Schedule via Postiz" : "Publish via Postiz"}
                    </Button>
                  </div>
                )}
                {(selected.state === "approved" || selected.state === "handed_off") && (
                  <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
                    <div className="text-sm font-medium">Manual handoff</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={copyText}><Copy className="h-3.5 w-3.5" /> Copy caption</Button>
                      <Button size="sm" variant="outline" onClick={shareNative}><Share2 className="h-3.5 w-3.5" /> Share sheet</Button>
                      <Button size="sm" variant="outline" onClick={download}><Download className="h-3.5 w-3.5" /> Download .txt</Button>
                      {selected.state === "approved" && (
                        <Button size="sm" onClick={() => command("handoff")} disabled={busy === "handoff"}>I'll post this myself</Button>
                      )}
                    </div>
                    {selected.state === "handed_off" && (
                      <div className="mt-3 flex flex-wrap items-end gap-2">
                        <div className="min-w-[16rem] flex-1">
                          <Label htmlFor="social-receipt">Live post URL (your receipt)</Label>
                          <Input id="social-receipt" className="mt-1.5" value={receiptUrl} onChange={(event) => setReceiptUrl(event.target.value)} placeholder={`https://${selected.content.platform === "x" ? "x.com/you/status/…" : `${selected.content.platform}.com/…`}`} />
                        </div>
                        <Button size="sm" onClick={() => command("receipt")} disabled={busy === "receipt" || !receiptUrl.trim()}>Record receipt</Button>
                      </div>
                    )}
                  </div>
                )}
                {selected.postUrl && (
                  <p className="text-xs">
                    Posted at{" "}
                    <a href={selected.postUrl} target="_blank" rel="noreferrer" className="text-[var(--color-primary)] hover:underline">{selected.postUrl}</a>
                  </p>
                )}
                {selectedPublications.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-medium">Scheduler publications</div>
                    {selectedPublications.map((publication) => (
                      <div key={publication.id} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-xs">
                        <Badge variant={publication.status === "published" ? "success" : publication.status === "failed" ? "danger" : "accent"} className="capitalize">{publication.status}</Badge>
                        <span>{publication.channelName || publication.channelId} · rev {publication.revision}{publication.scheduledFor ? ` · ${new Date(publication.scheduledFor).toLocaleString()}` : ""}</span>
                        {publication.releaseUrl && <a href={publication.releaseUrl} target="_blank" rel="noreferrer" className="text-[var(--color-primary)] hover:underline">open</a>}
                        {publication.status === "scheduled" && (
                          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => refresh(publication)} disabled={busy === publication.id}>
                            <RefreshCw className="h-3.5 w-3.5" /> Check status
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {selected && history.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><History className="h-4 w-4" /> Revision history</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-xs text-[var(--color-fg-muted)]">
                  {history.map((entry) => (
                    <li key={`${entry.revision}:${entry.action}`}>rev {entry.revision} · {entry.action} · {new Date(entry.createdAt).toLocaleString()}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
