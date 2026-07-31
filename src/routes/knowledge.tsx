import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  BookOpen,
  Brain,
  MapPin,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  RSF_KNOWLEDGE,
  RSF_MARKET_META,
  knowledgeCategoryLabel,
  searchKnowledge,
  type KnowledgeCategory,
  type KnowledgeEntry,
} from "@/data/rsf-knowledge";
import { memoryInsights } from "@/lib/agent-memory";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/knowledge")({
  component: KnowledgePage,
});

const CATEGORIES: KnowledgeCategory[] = [
  "neighborhood",
  "surrounding",
  "hoa_covenant",
  "market",
  "comps_rules",
  "talking_points",
  "buyer_profile",
  "seller_playbook",
  "schools",
  "lifestyle",
  "seasonality",
];

function KnowledgePage() {
  const profile = useAppStore((s) => s.agentProfile);
  const memory = useAppStore((s) => s.agentMemory);
  const resetMemory = useAppStore((s) => s.resetMemory);
  const recordSignal = useAppStore((s) => s.recordSignal);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<KnowledgeCategory | "all">("all");
  const [selected, setSelected] = useState<KnowledgeEntry | null>(
    RSF_KNOWLEDGE[0] ?? null,
  );
  const [rememberText, setRememberText] = useState("");

  const results = useMemo(() => {
    const hits = q.trim()
      ? searchKnowledge(q, 40).map((h) => h.entry)
      : RSF_KNOWLEDGE;
    if (cat === "all") return hits;
    return hits.filter((e) => e.category === cat);
  }, [q, cat]);

  const insights = useMemo(
    () => memoryInsights(memory, profile),
    [memory, profile],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="relative overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(ellipse 55% 70% at 0% 0%, color-mix(in oklab, var(--color-primary) 12%, transparent), transparent 55%), radial-gradient(ellipse 45% 50% at 100% 80%, color-mix(in oklab, var(--color-accent) 10%, transparent), transparent 50%)",
          }}
        />
        <div className="relative flex flex-col gap-4 p-5 sm:p-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap gap-2">
              <Badge variant="accent">
                <BookOpen className="h-3 w-3" />
                Market knowledge
              </Badge>
              <Badge variant="secondary">
                <MapPin className="h-3 w-3" />
                {RSF_MARKET_META.primary}
              </Badge>
            </div>
            <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Rancho Santa Fe & corridor intelligence
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-fg-muted)]">
              {RSF_MARKET_META.region}. {RSF_MARKET_META.covenantNote}
            </p>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-3 text-sm">
            <div className="flex items-center gap-2 font-medium text-[var(--color-fg)]">
              <Brain className="h-4 w-4 text-[var(--color-primary)]" />
              AI familiarity
            </div>
            <div className="mt-1 font-display text-2xl font-semibold tabular">
              {memory.familiarityScore}
              <span className="text-sm font-normal text-[var(--color-fg-subtle)]">
                /100
              </span>
            </div>
            <p className="text-[11px] text-[var(--color-fg-subtle)]">
              {memory.totalInteractions} learning signals
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="kb">
        <TabsList>
          <TabsTrigger value="kb">Knowledge base</TabsTrigger>
          <TabsTrigger value="memory">AI memory</TabsTrigger>
        </TabsList>

        <TabsContent value="kb" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search Covenant, schools, comps, Del Mar…"
                className="pl-9"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCat("all")}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                cat === "all"
                  ? "border-[color-mix(in_oklab,var(--color-primary)_40%,var(--color-border))] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                  : "border-[var(--color-border)] text-[var(--color-fg-muted)]",
              )}
            >
              All ({RSF_KNOWLEDGE.length})
            </button>
            {CATEGORIES.map((c) => {
              const n = RSF_KNOWLEDGE.filter((e) => e.category === c).length;
              if (!n) return null;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCat(c)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                    cat === c
                      ? "border-[color-mix(in_oklab,var(--color-primary)_40%,var(--color-border))] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                      : "border-[var(--color-border)] text-[var(--color-fg-muted)]",
                  )}
                >
                  {knowledgeCategoryLabel(c)}
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            <div className="space-y-2 lg:col-span-5">
              {results.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelected(entry)}
                  className={cn(
                    "w-full rounded-[var(--radius-lg)] border p-3 text-left transition-colors",
                    selected?.id === entry.id
                      ? "border-[color-mix(in_oklab,var(--color-primary)_40%,var(--color-border))] bg-[var(--color-surface)]"
                      : "border-[var(--color-border)] bg-[var(--color-surface)]/70 hover:bg-[var(--color-surface-2)]/40",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {knowledgeCategoryLabel(entry.category)}
                    </Badge>
                    <span className="text-[10px] text-[var(--color-fg-subtle)]">
                      {entry.updatedLabel}
                    </span>
                  </div>
                  <div className="mt-1.5 text-sm font-semibold text-[var(--color-fg)]">
                    {entry.title}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-fg-muted)]">
                    {entry.summary}
                  </p>
                </button>
              ))}
              {!results.length && (
                <Card>
                  <CardContent className="py-10 text-center text-sm text-[var(--color-fg-muted)]">
                    No entries match that search.
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="lg:col-span-7">
              {selected && (
                <Card className="lg:sticky lg:top-24">
                  <CardHeader>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="accent">
                        {knowledgeCategoryLabel(selected.category)}
                      </Badge>
                      {selected.places.map((p) => (
                        <Badge key={p} variant="secondary">
                          {p}
                        </Badge>
                      ))}
                    </div>
                    <CardTitle className="mt-2 text-xl">
                      {selected.title}
                    </CardTitle>
                    <CardDescription>{selected.summary}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-fg-muted)]">
                      {selected.body}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-[var(--color-bg-elevated)] px-2 py-0.5 text-[10px] text-[var(--color-fg-subtle)]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        recordSignal({
                          kind: "chat",
                          text: selected.title + " " + selected.summary,
                        });
                        toast.success("Pinned into AI context");
                      }}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Use in AI context
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="memory" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Brain className="h-4 w-4 text-[var(--color-primary)]" />
                  What the AI has learned about you
                </CardTitle>
                <CardDescription>
                  Grows from chats, CMAs, campaigns, lead touches, and explicit
                  “remember that …” notes
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {insights.map((line) => (
                  <div
                    key={line}
                    className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm text-[var(--color-fg-muted)]"
                  >
                    {line}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Teach the AI</CardTitle>
                <CardDescription>
                  Permanent practice notes (voice, niches, boundaries)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  value={rememberText}
                  onChange={(e) => setRememberText(e.target.value)}
                  placeholder="e.g. I only list Covenant & Bridges estates"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      const t = rememberText.trim();
                      if (!t) return;
                      recordSignal({ kind: "remember", text: t });
                      setRememberText("");
                      toast.success("Saved to AI memory");
                    }}
                  >
                    Remember this
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      resetMemory();
                      toast.message("Memory reset to onboarding baseline");
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Reset memory
                  </Button>
                </div>
                <div className="space-y-2 pt-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-fg-subtle)]">
                    Stored facts
                  </div>
                  {memory.learnedFacts.length === 0 ? (
                    <p className="text-sm text-[var(--color-fg-muted)]">
                      No custom facts yet.
                    </p>
                  ) : (
                    memory.learnedFacts.slice(0, 12).map((f) => (
                      <div
                        key={f.id}
                        className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-2.5 text-xs text-[var(--color-fg-muted)]"
                      >
                        <span className="font-medium text-[var(--color-fg)]">
                          {f.text}
                        </span>
                        <div className="mt-1 text-[10px] text-[var(--color-fg-subtle)]">
                          {f.source} · confidence {Math.round(f.confidence * 100)}%
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Surrounding markets covered</CardTitle>
              <CardDescription>
                {RSF_MARKET_META.surrounding.join(" · ")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[var(--color-fg-muted)]">
                {RSF_MARKET_META.priceContext2026}
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
