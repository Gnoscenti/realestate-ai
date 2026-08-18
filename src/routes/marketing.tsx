import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Download,
  Loader2,
  Megaphone,
  Play,
  Share2,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/lib/store";
import {
  GOAL_OPTIONS,
  PLATFORM_META,
  VOICE_PRESETS,
  composeFullCaption,
  exportCampaignMarkdown,
  getAgentPipeline,
  runSocialContentAgent,
  type AgentStep,
  type CampaignGoal,
  type CampaignPlan,
  type SocialPlatform,
  type SocialPost,
} from "@/lib/social-agent";
import { myListings } from "@/lib/mls";
import { cn } from "@/lib/utils";
import {
  MAX_SELECTED_LISTING_PHOTOS,
  attachMediaToPosts,
  filterListingPhotoSelection,
  listingPhotoUrls,
  needsPhotoCta,
  pickListingMedia,
} from "@/lib/imagine-media";
import { SOCIAL_NETWORKS, networkForPlatform } from "@/lib/social-accounts";
import { Image as ImageIcon, Link2, Power } from "lucide-react";
import { Input } from "@/components/ui/input";

const searchSchema = z.object({
  goal: z.string().optional(),
  property: z.string().optional(),
});

export const Route = createFileRoute("/marketing")({
  validateSearch: searchSchema,
  component: MarketingPage,
});

const ALL_PLATFORMS = Object.keys(PLATFORM_META) as SocialPlatform[];

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.message("Select text to copy");
  }
}

function MarketingPage() {
  const { goal: goalParam, property: propertyParam } = Route.useSearch();
  const properties = useAppStore((s) => s.properties);
  const profile = useAppStore((s) => s.agentProfile);
  const memory = useAppStore((s) => s.agentMemory);
  const campaigns = useAppStore((s) => s.campaigns);
  const saveCampaign = useAppStore((s) => s.saveCampaign);
  const setCampaignPostStatus = useAppStore((s) => s.setCampaignPostStatus);
  const deleteCampaign = useAppStore((s) => s.deleteCampaign);
  const socialAccounts = useAppStore((s) => s.socialAccounts);
  const connectSocialAccount = useAppStore((s) => s.connectSocialAccount);
  const disconnectSocialAccount = useAppStore((s) => s.disconnectSocialAccount);
  const setSocialAutoPost = useAppStore((s) => s.setSocialAutoPost);
  const [handleDrafts, setHandleDrafts] = useState<Record<string, string>>({});
  const [mediaAttachBusy, setMediaAttachBusy] = useState(false);
  const [selectedPhotoUrls, setSelectedPhotoUrls] = useState<string[]>([]);

  const book = useMemo(() => {
    const mine = myListings(properties);
    return mine.length ? mine : properties.filter((p) => p.status === "active");
  }, [properties]);

  const validGoals = GOAL_OPTIONS.map((g) => g.value);
  const initialGoal = (
    goalParam && validGoals.includes(goalParam as CampaignGoal)
      ? goalParam
      : "just_listed"
  ) as CampaignGoal;

  const [goal, setGoal] = useState<CampaignGoal>(initialGoal);
  const [propertyId, setPropertyId] = useState(
    propertyParam && properties.some((p) => p.id === propertyParam)
      ? propertyParam
      : book[0]?.id ?? properties[0]?.id ?? "",
  );
  const [voice, setVoice] = useState<string>(VOICE_PRESETS[0]);
  // hydrate preferred voice after memory loads
  useEffect(() => {
    if (memory?.preferredVoice && VOICE_PRESETS.includes(memory.preferredVoice as typeof VOICE_PRESETS[number])) {
      setVoice(memory.preferredVoice);
    } else if (memory?.preferredVoice) {
      setVoice(memory.preferredVoice);
    }
  }, [memory?.preferredVoice]);
  const [platforms, setPlatforms] = useState<SocialPlatform[]>([
    "instagram",
    "facebook",
    "linkedin",
    "stories",
  ]);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<AgentStep[]>(() =>
    getAgentPipeline(initialGoal),
  );
  const [activePlan, setActivePlan] = useState<CampaignPlan | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [tab, setTab] = useState("agent");

  useEffect(() => {
    if (goalParam && validGoals.includes(goalParam as CampaignGoal)) {
      setGoal(goalParam as CampaignGoal);
      setSteps(getAgentPipeline(goalParam as CampaignGoal));
    }
    if (propertyParam && properties.some((p) => p.id === propertyParam)) {
      setPropertyId(propertyParam);
    }
  }, [goalParam, propertyParam, properties]);

  useEffect(() => {
    if (campaigns[0] && !activePlan) {
      setActivePlan(campaigns[0]);
      setSelectedPostId(campaigns[0].posts[0]?.id ?? null);
    }
  }, [campaigns, activePlan]);

  const property = properties.find((p) => p.id === propertyId);
  const listingPhotos = useMemo(() => listingPhotoUrls(property), [property]);

  useEffect(() => {
    setSelectedPhotoUrls(
      listingPhotos.slice(0, MAX_SELECTED_LISTING_PHOTOS),
    );
  }, [listingPhotos]);

  const selectedListingPhotos = useMemo(
    () => filterListingPhotoSelection(property, selectedPhotoUrls),
    [property, selectedPhotoUrls],
  );

  const toggleListingPhoto = (url: string) => {
    if (selectedPhotoUrls.includes(url)) {
      setSelectedPhotoUrls((current) =>
        current.filter((selectedUrl) => selectedUrl !== url),
      );
      return;
    }
    if (selectedPhotoUrls.length >= MAX_SELECTED_LISTING_PHOTOS) {
      toast.message(
        `Choose up to ${MAX_SELECTED_LISTING_PHOTOS} listing photos`,
      );
      return;
    }
    setSelectedPhotoUrls((current) => [...current, url]);
  };

  const selectedPost = useMemo(() => {
    if (!activePlan || !selectedPostId) return activePlan?.posts[0] ?? null;
    return (
      activePlan.posts.find((p) => p.id === selectedPostId) ??
      activePlan.posts[0] ??
      null
    );
  }, [activePlan, selectedPostId]);

  const togglePlatform = (p: SocialPlatform) => {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  };

  const runAgent = async () => {
    if (
      platforms.filter((p) => p !== "stories").length === 0 &&
      !platforms.includes("instagram")
    ) {
      toast.error("Select at least one platform");
      return;
    }
    setRunning(true);
    setTab("agent");
    const pipeline = getAgentPipeline(goal);
    setSteps(pipeline.map((s) => ({ ...s, status: "pending" })));

    const advance = async (idx: number) => {
      setSteps((prev) =>
        prev.map((s, i) =>
          i === idx
            ? { ...s, status: "running" }
            : i < idx
              ? { ...s, status: "done" }
              : s,
        ),
      );
      await new Promise((r) => setTimeout(r, 320 + idx * 80));
      setSteps((prev) =>
        prev.map((s, i) => (i === idx ? { ...s, status: "done" } : s)),
      );
    };

    for (let i = 0; i < pipeline.length; i++) {
      await advance(i);
    }

    const agentName = profile?.name || "your local agent";
    const site = profile?.website
      ? profile.website.replace(/^https?:\/\//, "")
      : undefined;
    const area = profile?.areaOfOperations || property?.city || "your market";

    let plan = runSocialContentAgent({
      goal,
      platforms,
      voice,
      property,
      agentName,
      marketNote: /rancho|rsf|del mar|solana|fairbanks|bridges/i.test(area)
        ? `${area}: thin estate inventory, association-aware pricing, private-tour culture. Lead with land, Covenant/Bridges clarity, and lifestyle — not portal Zestimates.${site ? ` More at ${site}.` : ""}`
        : `${area} mid-band inventory remains competitive; well-priced homes with strong media still clear in weeks, not months.${site ? ` More at ${site}.` : ""}`,
      openHouseWhen: "Sat 1–4 PM",
    });

    // Attach listing / website photos + Imagine prompts (no fake view-count overlays)
    plan = {
      ...plan,
      posts: attachMediaToPosts(plan.posts, property, profile?.photoUrl),
    };

    // Inject website into CTAs where useful — never "000 view listing" junk
    if (site) {
      plan.posts = plan.posts.map((p) => ({
        ...p,
        cta: /view listing|000 view/i.test(p.cta)
          ? `Message for details · ${site}`
          : p.cta.includes("link in bio")
            ? p.cta
            : `${p.cta}${p.platform === "x" ? ` ${site}` : `\n${site}`}`,
      }));
    }
    plan.posts = plan.posts.map((p) => ({
      ...p,
      hook: p.hook.replace(/\b000\s*view\s*listing\b/gi, "").trim(),
      body: p.body.replace(/\b000\s*view\s*listing\b/gi, "").trim(),
      cta: p.cta.replace(/\b000\s*view\s*listing\b/gi, "Message for details").trim(),
      visualBrief: p.visualBrief
        .replace(/JUST LISTED/gi, "New to market")
        .replace(/view count|000 views|fake engagement/gi, "")
        .trim(),
    }));

    // Auto-queue posts for networks with autoPost ON
    plan.posts = plan.posts.map((p) => {
      const net = networkForPlatform(p.platform);
      const acct = socialAccounts.find((a) => a.id === net);
      if (acct?.connected && acct.autoPost) {
        return { ...p, status: "queued" as const };
      }
      return p;
    });

    saveCampaign(plan);
    setActivePlan(plan);
    setSelectedPostId(plan.posts[0]?.id ?? null);
    setRunning(false);
    setTab("pack");
    toast.success(`Campaign ready — ${plan.posts.length} assets for ${agentName}`);
  };

  const downloadPack = () => {
    if (!activePlan) return;
    const md = exportCampaignMarkdown(activePlan);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activePlan.title.replace(/[^\w]+/g, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Campaign exported");
  };

  const statusBadge = (status: SocialPost["status"]) => {
    const v =
      status === "published"
        ? "success"
        : status === "queued"
          ? "accent"
          : status === "approved"
            ? "default"
            : "secondary";
    return (
      <Badge variant={v as "success"} className="capitalize">
        {status}
      </Badge>
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="relative overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(ellipse 60% 80% at 10% 0%, color-mix(in oklab, var(--color-accent) 12%, transparent), transparent 50%), radial-gradient(ellipse 50% 60% at 100% 100%, color-mix(in oklab, var(--color-primary) 10%, transparent), transparent 55%)",
          }}
        />
        <div className="relative flex flex-col gap-4 p-5 sm:p-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="accent">
                <Bot className="h-3 w-3" />
                Content Agent
              </Badge>
              {profile && (
                <Badge variant="secondary">
                  {profile.name} · {profile.areaOfOperations}
                </Badge>
              )}
            </div>
            <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-3xl">
              Social media marketing engine
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-fg-muted)]">
              Pulls from your MLS-synced active book. Campaigns sign as{" "}
              {profile?.name ?? "you"}
              {profile?.website ? ` · ${profile.website.replace(/^https?:\/\//, "")}` : ""}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void runAgent()} disabled={running}>
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4" />
              )}
              {running ? "Agent running…" : "Run Content Agent"}
            </Button>
            {activePlan && (
              <Button variant="secondary" onClick={downloadPack}>
                <Download className="h-4 w-4" />
                Export pack
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-[var(--color-primary)]" />
                Campaign brief
              </CardTitle>
              <CardDescription>
                MLS listings first — content grounded in your active inventory
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Goal</Label>
                <Select
                  value={goal}
                  onValueChange={(v) => {
                    setGoal(v as CampaignGoal);
                    setSteps(getAgentPipeline(v as CampaignGoal));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GOAL_OPTIONS.map((g) => (
                      <SelectItem key={g.value} value={g.value}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-[var(--color-fg-subtle)]">
                  {GOAL_OPTIONS.find((g) => g.value === goal)?.blurb}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>MLS listing</Label>
                <Select value={propertyId} onValueChange={setPropertyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select listing" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.listingSide === "mine" ? "★ " : ""}
                        {p.title}
                        {p.mlsNumber ? ` · ${p.mlsNumber}` : ""} · {p.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {property?.mlsNumber && (
                  <p className="text-[11px] text-[var(--color-fg-subtle)]">
                    MLS# {property.mlsNumber}
                    {property.listingSide === "mine" ? " · Your listing" : ""}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Brand voice</Label>
                <Select value={voice} onValueChange={setVoice}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICE_PRESETS.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Platforms</Label>
                <div className="flex flex-wrap gap-2">
                  {ALL_PLATFORMS.map((p) => {
                    const on = platforms.includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => togglePlatform(p)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          on
                            ? "border-[color-mix(in_oklab,var(--color-primary)_40%,var(--color-border))] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                            : "border-[var(--color-border)] text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-elevated)]",
                        )}
                      >
                        {PLATFORM_META[p].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={() => void runAgent()}
                disabled={running}
              >
                {running ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {running ? "Generating campaign…" : "Generate full campaign"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Your MLS book</CardTitle>
              <CardDescription>Quick-start content from your listings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {book.slice(0, 5).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPropertyId(p.id);
                    setGoal("just_listed");
                  }}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--color-bg-elevated)]"
                >
                  <div className="font-medium text-[var(--color-fg)]">
                    {p.title}
                  </div>
                  <div className="text-[var(--color-fg-subtle)]">
                    {p.mlsNumber ?? "—"} · {p.status}
                    {p.listingSide === "mine" ? " · Yours" : ""}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Saved campaigns</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {campaigns.length === 0 ? (
                <p className="text-sm text-[var(--color-fg-muted)]">
                  No campaigns yet — run the agent on an MLS listing.
                </p>
              ) : (
                campaigns.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setActivePlan(c);
                      setSelectedPostId(c.posts[0]?.id ?? null);
                      setTab("pack");
                    }}
                    className={cn(
                      "w-full rounded-[var(--radius-md)] border px-3 py-2.5 text-left transition-colors",
                      activePlan?.id === c.id
                        ? "border-[color-mix(in_oklab,var(--color-primary)_35%,var(--color-border))] bg-[var(--color-primary-soft)]/40"
                        : "border-[var(--color-border)] hover:bg-[var(--color-bg-elevated)]",
                    )}
                  >
                    <div className="text-sm font-medium text-[var(--color-fg)]">
                      {c.title}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--color-fg-subtle)]">
                      {c.posts.length} posts · {c.durationDays}d
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-8 space-y-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="agent">Agent run</TabsTrigger>
              <TabsTrigger value="pack">Content pack</TabsTrigger>
              <TabsTrigger value="calendar">Calendar</TabsTrigger>
              <TabsTrigger value="queue">Publish queue</TabsTrigger>
              <TabsTrigger value="accounts">Accounts</TabsTrigger>
            </TabsList>

            <TabsContent value="agent" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pipeline</CardTitle>
                  <CardDescription>
                    Grounded in your MLS pull for{" "}
                    {profile?.areaOfOperations ?? "your market"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {steps.map((step, i) => (
                    <div
                      key={step.id}
                      className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3"
                    >
                      <div className="mt-0.5">
                        {step.status === "done" ? (
                          <CheckCircle2 className="h-5 w-5 text-[var(--color-success)]" />
                        ) : step.status === "running" ? (
                          <Loader2 className="h-5 w-5 animate-spin text-[var(--color-primary)]" />
                        ) : (
                          <Circle className="h-5 w-5 text-[var(--color-fg-subtle)]" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-[var(--color-fg)]">
                          {i + 1}. {step.label}
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">
                          {step.detail}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pack" className="space-y-4">
              {!activePlan ? (
                <Card>
                  <CardContent className="py-12 text-center text-sm text-[var(--color-fg-muted)]">
                    Select an MLS listing and run the Content Agent.
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-base">
                            {activePlan.title}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            {activePlan.objective} · Voice: {activePlan.brandVoice}
                          </CardDescription>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            deleteCampaign(activePlan.id);
                            setActivePlan(null);
                            toast.message("Campaign removed");
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap gap-1.5">
                        {activePlan.platforms.map((p) => (
                          <Badge key={p} variant="secondary">
                            {PLATFORM_META[p].label}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid gap-4 lg:grid-cols-5">
                    <div className="space-y-2 lg:col-span-2">
                      {activePlan.posts.map((post) => (
                        <button
                          key={post.id}
                          type="button"
                          onClick={() => setSelectedPostId(post.id)}
                          className={cn(
                            "w-full rounded-[var(--radius-lg)] border p-3 text-left transition-colors",
                            selectedPost?.id === post.id
                              ? "border-[color-mix(in_oklab,var(--color-primary)_40%,var(--color-border))] bg-[var(--color-surface)]"
                              : "border-[var(--color-border)] bg-[var(--color-surface)]/60 hover:bg-[var(--color-surface-2)]/50",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-[var(--color-primary)]">
                              {PLATFORM_META[post.platform].label}
                            </span>
                            {statusBadge(post.status)}
                          </div>
                          <div className="mt-1 line-clamp-2 text-sm font-medium text-[var(--color-fg)]">
                            {post.hook}
                          </div>
                          <div className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                            Day {post.dayOffset} · {post.timeSlot}
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="lg:col-span-3">
                      {selectedPost && (
                        <Card className="sticky top-24">
                          <CardHeader className="flex-row items-start justify-between space-y-0 gap-3">
                            <div>
                              <CardTitle className="text-base">
                                {PLATFORM_META[selectedPost.platform].label}
                              </CardTitle>
                              <CardDescription>
                                Day {selectedPost.dayOffset} · {selectedPost.timeSlot}
                              </CardDescription>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void copyText(composeFullCaption(selectedPost))
                              }
                            >
                              <Copy className="h-3.5 w-3.5" />
                              Copy
                            </Button>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            {selectedPost.imageUrl && (
                              <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
                                <img
                                  src={selectedPost.imageUrl}
                                  alt={selectedPost.altText}
                                  className="max-h-56 w-full object-cover"
                                  crossOrigin="anonymous"
                                />
                                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-[var(--color-fg-subtle)]">
                                  {selectedPost.mediaSource === "imagine"
                                    ? "Grok Imagine"
                                    : selectedPost.mediaSource === "mls"
                                      ? "MLS photo"
                                      : "Website photo"}
                                </div>
                              </div>
                            )}
                            <pre className="whitespace-pre-wrap rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] p-4 text-sm leading-relaxed text-[var(--color-fg)] font-sans">
                              {composeFullCaption(selectedPost)}
                            </pre>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
                                <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-fg-subtle)]">
                                  Visual brief
                                </div>
                                <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
                                  {selectedPost.visualBrief}
                                </p>
                              </div>
                              <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
                                <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-fg-subtle)]">
                                  Alt text
                                </div>
                                <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
                                  {selectedPost.altText}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {(
                                [
                                  "approved",
                                  "queued",
                                  "published",
                                  "draft",
                                ] as const
                              ).map((st) => (
                                <Button
                                  key={st}
                                  size="sm"
                                  variant={
                                    selectedPost.status === st
                                      ? "default"
                                      : "outline"
                                  }
                                  className="capitalize"
                                  onClick={() => {
                                    setCampaignPostStatus(
                                      activePlan.id,
                                      selectedPost.id,
                                      st,
                                    );
                                    setActivePlan((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            posts: prev.posts.map((p) =>
                                              p.id === selectedPost.id
                                                ? { ...p, status: st }
                                                : p,
                                            ),
                                          }
                                        : prev,
                                    );
                                    toast.success(`Marked ${st}`);
                                  }}
                                >
                                  {st === "approved" && (
                                    <Check className="h-3.5 w-3.5" />
                                  )}
                                  {st}
                                </Button>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="calendar" className="space-y-4">
              {!activePlan ? (
                <Card>
                  <CardContent className="py-12 text-center text-sm text-[var(--color-fg-muted)]">
                    Generate a campaign to see the posting calendar.
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Calendar className="h-4 w-4 text-[var(--color-primary)]" />
                      {activePlan.durationDays}-day calendar
                    </CardTitle>
                    <CardDescription>{activePlan.calendarNote}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {Array.from({ length: activePlan.durationDays }, (_, day) => {
                      const dayPosts = activePlan.posts.filter(
                        (p) => p.dayOffset === day,
                      );
                      if (!dayPosts.length) return null;
                      return (
                        <div key={day}>
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-fg-subtle)]">
                            Day {day}
                          </div>
                          <div className="space-y-2">
                            {dayPosts.map((p) => (
                              <div
                                key={p.id}
                                className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="min-w-0">
                                  <Badge variant="secondary">
                                    {PLATFORM_META[p.platform].label}
                                  </Badge>
                                  <div className="mt-1 truncate text-sm">
                                    {p.hook}
                                  </div>
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedPostId(p.id);
                                    setTab("pack");
                                  }}
                                >
                                  Edit
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="queue" className="space-y-4">
              {!activePlan ? (
                <Card>
                  <CardContent className="py-12 text-center text-sm text-[var(--color-fg-muted)]">
                    Approve posts, then manage the queue here.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {(["queued", "approved", "published", "draft"] as const).map(
                    (bucket) => {
                      const list = activePlan.posts.filter(
                        (p) => p.status === bucket,
                      );
                      if (!list.length) return null;
                      return (
                        <Card key={bucket}>
                          <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-base capitalize">
                              <Share2 className="h-4 w-4" />
                              {bucket} ({list.length})
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {list.map((p) => (
                              <div
                                key={p.id}
                                className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div>
                                  <div className="text-sm font-medium">
                                    {PLATFORM_META[p.platform].label} · Day{" "}
                                    {p.dayOffset}
                                  </div>
                                  <div className="text-xs text-[var(--color-fg-muted)] line-clamp-1">
                                    {p.hook}
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  {bucket !== "published" && (
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        const next =
                                          bucket === "queued"
                                            ? "published"
                                            : "queued";
                                        setCampaignPostStatus(
                                          activePlan.id,
                                          p.id,
                                          next,
                                        );
                                        setActivePlan((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                posts: prev.posts.map((x) =>
                                                  x.id === p.id
                                                    ? { ...x, status: next }
                                                    : x,
                                                ),
                                              }
                                            : prev,
                                        );
                                      }}
                                    >
                                      {bucket === "queued" ? "Publish" : "Queue"}
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      void copyText(composeFullCaption(p))
                                    }
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </CardContent>
                        </Card>
                      );
                    },
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="accounts" className="space-y-4">
              <Card className="glass-card border-0">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Link2 className="h-4 w-4 text-[var(--color-primary)]" />
                    Connected accounts
                  </CardTitle>
                  <CardDescription>
                    Connect each network, then use the Auto-post switch when you want
                    approved content queued automatically. You stay in control.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {socialAccounts.map((acct) => {
                    const meta = SOCIAL_NETWORKS.find((n) => n.id === acct.id)!;
                    return (
                      <div
                        key={acct.id}
                        className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-[var(--color-fg)]">
                            {acct.label}
                          </div>
                          {acct.connected ? (
                            <div className="text-xs text-[var(--color-fg-muted)]">
                              Connected as {acct.handle}
                            </div>
                          ) : (
                            <Input
                              className="mt-1.5 h-10 max-w-xs"
                              placeholder={meta.placeholder}
                              value={handleDrafts[acct.id] ?? ""}
                              onChange={(e) =>
                                setHandleDrafts((d) => ({
                                  ...d,
                                  [acct.id]: e.target.value,
                                }))
                              }
                            />
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {acct.connected && (
                            <button
                              type="button"
                              className={cn(
                                "flex min-h-[40px] items-center gap-2 rounded-full border px-3 text-xs font-semibold transition",
                                acct.autoPost
                                  ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                                  : "border-[var(--color-border)] text-[var(--color-fg-muted)]",
                              )}
                              onClick={() => {
                                setSocialAutoPost(acct.id, !acct.autoPost);
                                toast.message(
                                  acct.autoPost
                                    ? `${acct.label} auto-post off`
                                    : `${acct.label} auto-post on — approved posts queue automatically`,
                                );
                              }}
                            >
                              <Power className="h-3.5 w-3.5" />
                              Auto-post {acct.autoPost ? "ON" : "OFF"}
                            </button>
                          )}
                          {acct.connected ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                disconnectSocialAccount(acct.id);
                                toast.message(`${acct.label} disconnected`);
                              }}
                            >
                              Disconnect
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => {
                                const h = (handleDrafts[acct.id] || "").trim();
                                if (!h) {
                                  toast.error("Enter a handle or page name");
                                  return;
                                }
                                connectSocialAccount(acct.id, h);
                                toast.success(`${acct.label} connected`);
                              }}
                            >
                              Connect
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card className="glass-card border-0">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ImageIcon className="h-4 w-4 text-[var(--color-primary)]" />
                    Listing photos
                  </CardTitle>
                  <CardDescription>
                    Choose up to {MAX_SELECTED_LISTING_PHOTOS} real MLS or website
                    photos. Attaching uses the originals and never invents property
                    imagery.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(() => {
                    const pick = pickListingMedia(property, profile?.photoUrl);

                    if (!listingPhotos.length) {
                      return (
                        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 text-sm text-[var(--color-fg-muted)]">
                          {needsPhotoCta(property)}
                        </div>
                      );
                    }

                    const previewPhoto =
                      selectedListingPhotos[0] ?? pick.imageUrl;

                    return (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
                          <img
                            src={previewPhoto}
                            alt={property?.title || "Selected listing"}
                            className="h-44 w-full object-cover"
                            crossOrigin="anonymous"
                          />
                          <div className="p-3 text-xs text-[var(--color-fg-muted)]">
                            Source: <strong className="text-[var(--color-fg)]">{pick.source}</strong>
                            {" · "}
                            {pick.reason}
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
                              Select listing photos
                            </div>
                            <span className="text-xs text-[var(--color-fg-muted)]">
                              {selectedListingPhotos.length}/
                              {MAX_SELECTED_LISTING_PHOTOS}
                            </span>
                          </div>
                          <div className="flex gap-2 overflow-x-auto pb-1">
                            {listingPhotos.map((url, index) => {
                              const selected = selectedPhotoUrls.includes(url);
                              const atLimit =
                                selectedPhotoUrls.length >=
                                MAX_SELECTED_LISTING_PHOTOS;

                              return (
                                <button
                                  key={url}
                                  type="button"
                                  aria-label={`${selected ? "Remove" : "Select"} listing photo ${index + 1}`}
                                  aria-pressed={selected}
                                  disabled={!selected && atLimit}
                                  title={
                                    !selected && atLimit
                                      ? `Choose up to ${MAX_SELECTED_LISTING_PHOTOS} photos`
                                      : undefined
                                  }
                                  onClick={() => toggleListingPhoto(url)}
                                  className={cn(
                                    "relative h-16 w-16 shrink-0 overflow-hidden rounded-md ring-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45",
                                    selected
                                      ? "ring-[var(--color-primary)]"
                                      : "ring-[var(--color-border)] opacity-75 hover:opacity-100",
                                  )}
                                >
                                  <img
                                    src={url}
                                    alt=""
                                    className="h-full w-full object-cover"
                                    crossOrigin="anonymous"
                                  />
                                  {selected && (
                                    <span
                                      aria-hidden="true"
                                      className="absolute right-1 top-1 rounded-full bg-[var(--color-primary)] p-0.5 text-white"
                                    >
                                      <Check className="h-3 w-3" />
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          <Button
                            className="min-h-[44px] w-full"
                            disabled={
                              !activePlan ||
                              mediaAttachBusy ||
                              selectedListingPhotos.length === 0
                            }
                            onClick={() => {
                              if (!activePlan) {
                                toast.message("Run the Content Agent first");
                                return;
                              }
                              if (!selectedListingPhotos.length) {
                                toast.error("Select at least one listing photo");
                                return;
                              }
                              setMediaAttachBusy(true);
                              try {
                                const next = {
                                  ...activePlan,
                                  posts: attachMediaToPosts(
                                    activePlan.posts,
                                    property,
                                    profile?.photoUrl,
                                    {
                                      selectedPhotoUrls:
                                        selectedListingPhotos,
                                      includeImaginePrompt: false,
                                    },
                                  ),
                                };
                                saveCampaign(next);
                                setActivePlan(next);
                                toast.success(
                                  `${selectedListingPhotos.length} selected listing ${selectedListingPhotos.length === 1 ? "photo" : "photos"} attached`,
                                );
                              } finally {
                                setMediaAttachBusy(false);
                              }
                            }}
                          >
                            <Check className="h-4 w-4" />
                            Attach selected photos to campaign
                          </Button>
                          <p className="text-xs text-[var(--color-fg-subtle)]">
                            Original listing photos only. No AI generation occurs
                            in this attachment step.
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Card className="border-[color-mix(in_oklab,var(--color-accent)_20%,var(--color-border))]">
            <CardContent className="flex gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                <Megaphone className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-medium text-[var(--color-fg)]">
                  Fair housing & brand QA
                </div>
                <p className="text-xs text-[var(--color-fg-muted)]">
                  Agent avoids exclusionary language, keeps one CTA, respects
                  platform length caps. Always review before publish.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
