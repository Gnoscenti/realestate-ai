import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, Radar, Sparkles } from "lucide-react";
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
import { useAppStore } from "@/lib/store";
import { AIEO_PILLAR_LABEL, scoreAieo } from "@/lib/aieo/score";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/aieo")({
  component: AieoPage,
});

function AieoPage() {
  const profile = useAppStore((s) => s.agentProfile);
  const properties = useAppStore((s) => s.properties);
  const memory = useAppStore((s) => s.agentMemory);
  const [tab, setTab] = useState<"score" | "faqs" | "schema">("score");

  const report = useMemo(
    () =>
      scoreAieo({
        profile,
        properties,
        voice: memory?.preferredVoice,
        scrapedSummary: profile?.websiteScrapeSummary,
      }),
    [profile, properties, memory?.preferredVoice],
  );

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.message("Select and copy");
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="relative overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="relative space-y-3 p-5 sm:p-7">
          <Badge variant="accent">
            <Radar className="h-3 w-3" />
            CiteLock™ AIEO
          </Badge>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Get cited by Grok, ChatGPT, and Perplexity
          </h1>
          <p className="max-w-2xl text-sm text-[var(--color-fg-muted)]">
            Realtor-specific AI-engine optimization. Scores entity lock, answer
            coverage, real photos, and local authority — never invents listings.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">CiteScore</CardTitle>
            <CardDescription>{report.summary}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="font-display text-5xl font-semibold">{report.total}</div>
              <Badge variant={report.grade === "A" || report.grade === "B" ? "success" : "secondary"}>
                Grade {report.grade}
              </Badge>
            </div>
            <div className="space-y-2">
              {(Object.keys(report.pillars) as Array<keyof typeof report.pillars>).map((k) => {
                const p = report.pillars[k];
                return (
                  <div key={k}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span>{AIEO_PILLAR_LABEL[k]}</span>
                      <span className="text-[var(--color-fg-subtle)]">
                        {p.score}/{p.max}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-bg-elevated)]">
                      <div
                        className="h-full bg-[var(--color-primary)]"
                        style={{ width: `${Math.round((p.score / p.max) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Fix list</CardTitle>
              <CardDescription>Highest-leverage gaps first</CardDescription>
            </div>
            <div className="flex gap-1">
              {(["score", "faqs", "schema"] as const).map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={tab === t ? "default" : "outline"}
                  className="capitalize"
                  onClick={() => setTab(t)}
                >
                  {t === "faqs" ? "FAQs" : t}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {tab === "score" &&
              (report.gaps.length ? (
                report.gaps.map((g) => (
                  <div
                    key={g.issue}
                    className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant={g.severity === "high" ? "danger" : "secondary"} className="capitalize">
                        {g.severity}
                      </Badge>
                      <span className="text-sm font-medium">{g.issue}</span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{g.fix}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--color-fg-muted)]">No critical gaps.</p>
              ))}

            {tab === "faqs" &&
              report.faqs.map((f) => (
                <div
                  key={f.question}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-medium">{f.question}</div>
                    <Button size="sm" variant="ghost" onClick={() => copy(`${f.question}\n${f.answer}`, "FAQ")}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--color-fg-muted)]">{f.answer}</p>
                </div>
              ))}

            {tab === "schema" && (
              <div className="space-y-3">
                <pre className="max-h-72 overflow-auto rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] p-3 text-[11px]">
                  {JSON.stringify(report.jsonLd, null, 2)}
                </pre>
                <Button onClick={() => copy(JSON.stringify(report.jsonLd, null, 2), "JSON-LD")}>
                  <Copy className="h-4 w-4" />
                  Copy schema
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-[var(--color-primary)]" />
            LLM-ready listing blurbs
          </CardTitle>
          <CardDescription>Answer-shaped copy from real listing facts only.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {report.listingBlurbs.length ? (
            report.listingBlurbs.map((b) => (
              <div key={b.title} className={cn("rounded-[var(--radius-md)] border border-[var(--color-border)] p-3")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium">{b.title}</div>
                  <Button size="sm" variant="ghost" onClick={() => copy(b.blurb, "Blurb")}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{b.blurb}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--color-fg-muted)]">
              Scan your website or connect MLS so CiteLock can write from real inventory.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
