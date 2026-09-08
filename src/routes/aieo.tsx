import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Link2,
  Loader2,
  Radar,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AIEO_PILLAR_LABEL, scoreAieo } from "@/lib/aieo/score";
import {
  JURISDICTION_LABELS,
  US_JURISDICTIONS,
  type CiteJurisdiction,
  type CiteLockScanRecord,
} from "@/lib/aieo/scan-types";
import { getMyLatestCiteLockScan, runMyCiteLockScan } from "@/lib/aieo/api";
import {
  continueMyVisibilityBatch,
  draftMyIntervention,
  getMyVisibilityBatch,
  getMyVisibilityTrend,
  getVisibilityProviders,
  listMyInterventions,
  listMyVisibilityBatches,
  resolveMyVisibilitySubject,
  startMyVisibilityBatch,
  updateMyIntervention,
} from "@/lib/aieo/visibility/api";
import type { CiteAgentProfile, CiteProperty } from "@/lib/aieo/provenance";
import type { Opportunity, Rate, VisibilityRun } from "@/lib/aieo/visibility/report";
import type { VisibilityBatch } from "@/lib/aieo/visibility/engine.server";
import type { Intervention, InterventionKind } from "@/lib/aieo/visibility/interventions.server";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { describeAiError } from "@/lib/ai-errors";

export const Route = createFileRoute("/aieo")({
  component: CiteLockPage,
});

type Tab = "visibility" | "opportunities" | "readiness" | "evidence";
const TAB_LABEL: Record<Tab, string> = {
  visibility: "Where you show up",
  opportunities: "What to fix",
  readiness: "Readiness",
  evidence: "Evidence locker",
};

type ProviderInfo = Awaited<ReturnType<typeof getVisibilityProviders>>;
type BatchDetail = Awaited<ReturnType<typeof getMyVisibilityBatch>>;
type Trend = Awaited<ReturnType<typeof getMyVisibilityTrend>>;

function errorMessage(error: unknown, fallback: string): string {
  return describeAiError(error, fallback);
}

function RateChip({ label, rate, hint }: { label: string; rate: Rate; hint?: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-subtle)]">{label}</div>
      <div className="mt-1 flex items-end gap-2">
        <span className="font-display text-3xl font-semibold tabular">
          {rate.percent === null ? "—" : `${rate.percent}%`}
        </span>
        <span className="pb-1 text-xs text-[var(--color-fg-muted)] tabular">
          {rate.numerator}/{rate.denominator}
        </span>
      </div>
      {hint && <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">{hint}</p>}
    </div>
  );
}

function CiteLockPage() {
  const profile = useAppStore((state) => state.agentProfile);
  const properties = useAppStore((state) => state.properties);
  const memory = useAppStore((state) => state.agentMemory);
  const [tab, setTab] = useState<Tab>("visibility");
  const [jurisdiction, setJurisdiction] = useState<CiteJurisdiction>("US-CA");
  const [scan, setScan] = useState<CiteLockScanRecord | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderInfo | null>(null);
  const [batches, setBatches] = useState<VisibilityBatch[]>([]);
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [trend, setTrend] = useState<Trend>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [subjectFingerprint, setSubjectFingerprint] = useState<string | null>(null);
  const [area, setArea] = useState(profile?.areaOfOperations || "");
  const [scoreClock, setScoreClock] = useState(() => new Date().toISOString());
  const cancelRef = useRef(false);

  useEffect(() => {
    if (profile?.areaOfOperations && !area) setArea(profile.areaOfOperations);
  }, [profile?.areaOfOperations, area]);

  useEffect(() => {
    const code = (profile as CiteAgentProfile | null)?.licenseJurisdiction;
    if (code && US_JURISDICTIONS.includes(code as CiteJurisdiction)) setJurisdiction(code as CiteJurisdiction);
  }, [profile]);

  useEffect(() => {
    const interval = window.setInterval(() => setScoreClock(new Date().toISOString()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const scanInput = useMemo(
    () =>
      profile?.website && profile?.name
        ? {
            website: profile.website,
            agentName: profile.name,
            license: profile.license || undefined,
            responsibleBrokerLicense: (profile as CiteAgentProfile).responsibleBrokerLicense,
            jurisdiction,
          }
        : null,
    [profile, jurisdiction],
  );
  const subjectInput = useMemo(
    () => (scanInput && area.trim().length >= 2 ? { ...scanInput, area: area.trim() } : null),
    [scanInput, area],
  );

  useEffect(() => {
    let active = true;
    void getVisibilityProviders()
      .then((info) => {
        if (active) setProviders(info);
      })
      .catch(() => {
        if (active) setProviders(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!scanInput) {
      setScan(null);
      return;
    }
    let active = true;
    void getMyLatestCiteLockScan({ data: scanInput })
      .then((record) => {
        if (active) setScan(record);
      })
      .catch(() => {
        /* first run */
      });
    return () => {
      active = false;
    };
  }, [scanInput]);

  const loadHistory = useCallback(
    async (fingerprint: string, selectLatest: boolean) => {
      const [list, series, drafts] = await Promise.all([
        listMyVisibilityBatches({ data: { subjectFingerprint: fingerprint } }),
        getMyVisibilityTrend({ data: { subjectFingerprint: fingerprint } }),
        listMyInterventions({ data: { subjectFingerprint: fingerprint } }),
      ]);
      setBatches(list);
      setTrend(series);
      setInterventions(drafts);
      if (selectLatest && list[0]) {
        setDetailLoading(true);
        try {
          setDetail(await getMyVisibilityBatch({ data: { batchId: list[0].id } }));
        } finally {
          setDetailLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!subjectInput) {
      setSubjectFingerprint(null);
      setBatches([]);
      setDetail(null);
      return;
    }
    let active = true;
    void resolveMyVisibilitySubject({ data: subjectInput })
      .then(async (resolved) => {
        if (!active) return;
        setSubjectFingerprint(resolved.fingerprint);
        await loadHistory(resolved.fingerprint, true);
      })
      .catch((error) => {
        if (active) setBatchError(errorMessage(error, "Could not load visibility history"));
      });
    return () => {
      active = false;
    };
  }, [subjectInput, loadHistory]);

  /**
   * Drive a batch to completion from the browser in short server slices. Safe
   * to call again for a batch that was interrupted (tab closed, reload): the
   * server only executes runs that are still pending or whose lease expired.
   */
  const driveBatch = async (batch: VisibilityBatch) => {
    setProgress({ done: batch.plannedRuns - (batch.plannedRuns - batch.completedRuns - batch.failedRuns), total: batch.plannedRuns });
    let remaining = batch.plannedRuns - batch.completedRuns - batch.failedRuns;
    while (remaining > 0 && !cancelRef.current) {
      const step = await continueMyVisibilityBatch({ data: { batchId: batch.id } });
      remaining = step.remaining;
      setProgress({ done: step.batch.plannedRuns - remaining, total: step.batch.plannedRuns });
    }
    const finished = await getMyVisibilityBatch({ data: { batchId: batch.id } });
    setDetail(finished);
    await loadHistory(batch.subjectFingerprint, false);
    if (cancelRef.current && finished.batch.status === "running") toast.message("Stopped. Resume any time; completed answers are kept.");
    else if (finished.batch.status === "failed") toast.error("Every probe failed — see the run table for provider errors");
    else toast.success(`Visibility batch complete · ${finished.report.completed} answers, ${finished.report.failed} failed`);
  };

  const runBatch = async () => {
    if (!subjectInput) {
      toast.error("Add your name, public website, and market area first");
      return;
    }
    setBatchBusy(true);
    setBatchError(null);
    cancelRef.current = false;
    try {
      const batch = await startMyVisibilityBatch({ data: subjectInput });
      await driveBatch(batch);
    } catch (error) {
      setBatchError(errorMessage(error, "Visibility batch failed"));
      toast.error(errorMessage(error, "Visibility batch failed"));
    } finally {
      setBatchBusy(false);
      setProgress(null);
    }
  };

  const resumeBatch = async (batch: VisibilityBatch) => {
    setBatchBusy(true);
    setBatchError(null);
    cancelRef.current = false;
    try {
      await driveBatch(batch);
    } catch (error) {
      setBatchError(errorMessage(error, "Could not resume the batch"));
      toast.error(errorMessage(error, "Could not resume the batch"));
    } finally {
      setBatchBusy(false);
      setProgress(null);
    }
  };
  const interruptedBatch = !batchBusy && detail?.batch.status === "running" ? detail.batch : null;

  const runVerifiedScan = async () => {
    if (!scanInput) {
      toast.error("Add your name and public website before scanning");
      return;
    }
    setScanBusy(true);
    setScanError(null);
    try {
      const record = await runMyCiteLockScan({ data: scanInput });
      setScan(record);
      toast.success("Public evidence scan saved");
    } catch (error) {
      setScanError(errorMessage(error, "Scan failed"));
      toast.error(errorMessage(error, "Scan failed"));
    } finally {
      setScanBusy(false);
    }
  };

  const selectBatch = async (batchId: string) => {
    setDetailLoading(true);
    try {
      setDetail(await getMyVisibilityBatch({ data: { batchId } }));
    } catch (error) {
      toast.error(errorMessage(error, "Could not load that batch"));
    } finally {
      setDetailLoading(false);
    }
  };

  const reportProfile = useMemo(() => {
    if (!profile) return null;
    const patch = Object.fromEntries(Object.entries(scan?.profilePatch || {}).filter(([, value]) => value !== undefined));
    return { ...(profile as CiteAgentProfile), ...patch, siteAudit: scan?.siteAudit || (profile as CiteAgentProfile).siteAudit } as CiteAgentProfile;
  }, [profile, scan]);

  const readiness = useMemo(
    () =>
      scoreAieo({
        profile: reportProfile,
        properties: properties.map((property) => {
          const item = property as CiteProperty;
          return { ...item, source: item.source ? { ...item.source, trust: "client_import" as const, attestationId: undefined } : undefined };
        }),
        voice: memory?.preferredVoice,
        evidence: scan?.evidence,
        evaluatedAt: scoreClock,
      }),
    [reportProfile, properties, memory?.preferredVoice, scan, scoreClock],
  );

  const missingSetup = !profile?.website || !profile?.name;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="space-y-3 p-5 sm:p-7">
          <Badge variant="accent">
            <Radar className="h-3 w-3" />
            CiteLock · answer-engine visibility
          </Badge>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            See where AI answers send your clients — and what to change so they name you
          </h1>
          <p className="max-w-3xl text-sm text-[var(--color-fg-muted)]">
            CiteLock asks answer engines the unbranded questions your clients ask, records who they name and which
            sources they cite, and turns the gaps into drafted fixes you approve. Every number shows its sample
            size; nothing here guarantees a citation.
          </p>
        </div>
      </section>

      {missingSetup ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Set up your profile to start</CardTitle>
            <CardDescription>
              CiteLock needs your name, public website, and market area. Add them from the profile button in the
              sidebar; nothing else is required.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              onClick={() => window.dispatchEvent(new Event("realestate-ai:open-profile-setup"))}
            >
              Open profile setup
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4 text-[var(--color-primary)]" />
              Run a visibility batch
            </CardTitle>
            <CardDescription>
              {providers?.providers.length
                ? `${providers.providers.length} answer engine${providers.providers.length === 1 ? "" : "s"} configured: ${providers.providers
                    .map((provider) => `${provider.label} (${provider.model}${provider.verified ? "" : ", unverified adapter"})`)
                    .join(", ")}. Basket ${providers.basketVersion}: ${providers.clusters.filter((cluster) => !cluster.branded).length} unbranded intents + ${providers.clusters.filter((cluster) => cluster.branded).length} branded checks. Limit ${providers.limits.batchesPerWorkspacePerDay} batches/day.`
                : providers
                  ? "No answer-engine provider key is configured on this server. Ask your administrator to add XAI_API_KEY (or OPENAI/GEMINI/PERPLEXITY)."
                  : "Loading provider configuration…"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <Label htmlFor="citelock-area">Market area used in client questions</Label>
                <Input
                  id="citelock-area"
                  className="mt-1.5"
                  value={area}
                  onChange={(event) => setArea(event.target.value)}
                  placeholder="Rancho Santa Fe, CA"
                />
              </div>
              <Button
                type="button"
                onClick={runBatch}
                disabled={batchBusy || !subjectInput || !providers?.providers.length}
                data-testid="run-visibility-batch"
              >
                {batchBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
                {batchBusy
                  ? progress
                    ? `Asking engines… ${progress.done}/${progress.total}`
                    : "Starting…"
                  : "Run visibility batch"}
              </Button>
            </div>
            <p className="text-xs text-[var(--color-fg-muted)]">
              Subject: <strong className="text-[var(--color-fg)]">{profile?.name}</strong> · {profile?.website}
              {scan ? ` · evidence scan ${new Date(scan.evaluatedAt).toLocaleDateString()}` : " · no evidence scan yet (run one under Readiness to bind brokerage and profile links)"}
            </p>
            {batchError && (
              <p className="text-xs text-[var(--color-danger)]" role="alert">
                {batchError}
              </p>
            )}
            {batchBusy && (
              <Button type="button" variant="ghost" size="sm" onClick={() => (cancelRef.current = true)}>
                Stop after the current probes
              </Button>
            )}
            {interruptedBatch && (
              <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-warning)]/50 bg-[var(--color-warning-soft)] p-3 text-xs">
                <AlertTriangle className="h-4 w-4 text-[var(--color-warning)]" />
                <span>
                  The batch from {new Date(interruptedBatch.startedAt).toLocaleString()} was interrupted:{" "}
                  {interruptedBatch.completedRuns} of {interruptedBatch.plannedRuns} answers stored, {interruptedBatch.failedRuns} failed.
                </span>
                <Button type="button" size="sm" onClick={() => resumeBatch(interruptedBatch)} data-testid="resume-visibility-batch">
                  <RefreshCw className="h-3.5 w-3.5" /> Resume batch
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-1">
        {(Object.keys(TAB_LABEL) as Tab[]).map((item) => (
          <Button key={item} size="sm" variant={tab === item ? "default" : "outline"} onClick={() => setTab(item)}>
            {TAB_LABEL[item]}
          </Button>
        ))}
      </div>

      {tab === "visibility" && (
        <VisibilityTab
          batches={batches}
          detail={detail}
          loading={detailLoading}
          onSelect={selectBatch}
          trend={trend}
          clusters={providers?.clusters || []}
        />
      )}
      {tab === "opportunities" && (
        <OpportunitiesTab
          detail={detail}
          interventions={interventions}
          onChange={async () => {
            if (subjectFingerprint) await loadHistory(subjectFingerprint, false);
          }}
        />
      )}
      {tab === "readiness" && (
        <ReadinessTab
          readiness={readiness}
          scan={scan}
          scanBusy={scanBusy}
          scanError={scanError}
          jurisdiction={jurisdiction}
          setJurisdiction={setJurisdiction}
          onScan={runVerifiedScan}
          canScan={Boolean(scanInput)}
        />
      )}
      {tab === "evidence" && <EvidenceTab readiness={readiness} />}
    </div>
  );
}

function VisibilityTab({
  batches,
  detail,
  loading,
  onSelect,
  trend,
  clusters,
}: {
  batches: VisibilityBatch[];
  detail: BatchDetail | null;
  loading: boolean;
  onSelect: (id: string) => void;
  trend: Trend;
  clusters: ProviderInfo["clusters"];
}) {
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const report = detail?.report;
  if (!batches.length && !loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-[var(--color-fg-muted)]">
          No visibility batch yet. Run one above; the first batch takes a few minutes because every answer engine
          searches the web before it answers.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {loading && (
        <div className="flex items-center gap-2 text-sm text-[var(--color-fg-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading batch…
        </div>
      )}
      {report && detail && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <RateChip
              label="Discovery rate"
              rate={report.discovery}
              hint="Unbranded client questions where an engine named you."
            />
            <RateChip
              label="Citation rate"
              rate={report.citation}
              hint="Unbranded answers citing a page you control (provider-returned citations only)."
            />
            <RateChip
              label="Identity accuracy"
              rate={report.identityAccuracy}
              hint="Branded checks where the answer matched your brokerage, license, or site."
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-fg-muted)]">
            <Badge variant={detail.batch.status === "completed" ? "success" : detail.batch.status === "failed" ? "danger" : "secondary"} className="capitalize">
              {detail.batch.status}
            </Badge>
            <span>
              {new Date(detail.batch.startedAt).toLocaleString()} · {report.completed} answers, {report.failed} failed ·
              engines {report.providers.join(", ")} · basket {detail.batch.basketVersion} · cost ${report.costUsd.toFixed(2)}
            </span>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">By client intent</CardTitle>
              <CardDescription>Each row is one designed client question. Named entities are model-extracted from the answer text.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.clusters.map((cluster) => (
                <div key={cluster.clusterId} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{cluster.label}</span>
                    {cluster.branded && <Badge variant="outline">branded</Badge>}
                    <Badge variant={cluster.mentioned.numerator ? "success" : "secondary"} className="tabular">
                      named {cluster.mentioned.numerator}/{cluster.mentioned.denominator}
                    </Badge>
                    <Badge variant={cluster.cited.numerator ? "success" : "secondary"} className="tabular">
                      cited {cluster.cited.numerator}/{cluster.cited.denominator}
                    </Badge>
                    {cluster.failed > 0 && <Badge variant="danger">{cluster.failed} failed</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{cluster.intent}</p>
                  {cluster.topEntities.length > 0 && (
                    <p className="mt-2 text-xs">
                      <span className="text-[var(--color-fg-subtle)]">Who engines named: </span>
                      {cluster.topEntities.map((entity) => `${entity.name}${entity.brokerage ? ` (${entity.brokerage})` : ""} ×${entity.runs}`).join(" · ")}
                    </p>
                  )}
                  {cluster.citedHosts.length > 0 && (
                    <p className="mt-1 text-xs">
                      <span className="text-[var(--color-fg-subtle)]">Sources cited: </span>
                      {cluster.citedHosts.map((host) => (
                        <span key={host.host} className={cn("mr-2", host.yours && "text-[var(--color-success)]")}>
                          {host.label || host.host} ×{host.runs}{host.yours ? " (you)" : ""}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Who gets recommended instead</CardTitle>
                <CardDescription>Across unbranded answers. Model-extracted; verify before quoting.</CardDescription>
              </CardHeader>
              <CardContent>
                {report.competitors.length ? (
                  <ul className="space-y-1 text-sm">
                    {report.competitors.map((competitor) => (
                      <li key={`${competitor.kind}:${competitor.name}`} className="flex items-center justify-between gap-2">
                        <span>
                          {competitor.name}
                          {competitor.brokerage ? <span className="text-[var(--color-fg-subtle)]"> · {competitor.brokerage}</span> : null}
                          <Badge variant="outline" className="ml-2 capitalize">{competitor.kind}</Badge>
                        </span>
                        <span className="tabular text-xs text-[var(--color-fg-muted)]">
                          recommended {competitor.recommended} · named {competitor.runs}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--color-fg-muted)]">No competitor entities were extracted from completed answers.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sources engines rely on</CardTitle>
                <CardDescription>Provider-returned citations across unbranded answers. Green = a page you control.</CardDescription>
              </CardHeader>
              <CardContent>
                {report.sourceGaps.length ? (
                  <ul className="space-y-1 text-sm">
                    {report.sourceGaps.slice(0, 12).map((source) => (
                      <li key={source.host} className="flex items-center justify-between gap-2">
                        <span className={cn(source.yours && "text-[var(--color-success)]")}>
                          {source.label}
                          <span className="text-[var(--color-fg-subtle)]"> · {source.host}</span>
                        </span>
                        <span className="tabular text-xs text-[var(--color-fg-muted)]">{source.citingRuns} answers</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--color-fg-muted)]">No citations were returned in completed answers.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Every answer, verbatim</CardTitle>
              <CardDescription>Raw provider output is kept so any number above can be audited.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {detail.runs.map((run) => (
                <RunRow key={run.id} run={run} expanded={expandedRun === run.id} onToggle={() => setExpandedRun(expandedRun === run.id ? null : run.id)} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Limits of this measurement</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--color-fg-muted)]">
                {report.limits.map((limit) => (
                  <li key={limit}>{limit}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-[var(--color-primary)]" /> Discovery over time
            </CardTitle>
            <CardDescription>Same basket version, completed batches only. Named / completed per intent.</CardDescription>
          </CardHeader>
          <CardContent>
            {trend.length ? (
              <TrendTable trend={trend} clusters={clusters} />
            ) : (
              <p className="text-sm text-[var(--color-fg-muted)]">Run a second batch after you publish changes to compare.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Batch history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {batches.map((batch) => (
              <button
                key={batch.id}
                type="button"
                onClick={() => onSelect(batch.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-[var(--radius-md)] border px-3 py-2 text-left text-xs",
                  detail?.batch.id === batch.id ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]" : "border-[var(--color-border)]",
                )}
              >
                <span>{new Date(batch.startedAt).toLocaleString()}</span>
                <span className="tabular text-[var(--color-fg-muted)]">
                  {batch.completedRuns}/{batch.plannedRuns} ok · {batch.failedRuns} failed · ${batch.costUsd.toFixed(2)}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TrendTable({ trend, clusters }: { trend: Trend; clusters: ProviderInfo["clusters"] }) {
  const batchIds = [...new Set(trend.map((row) => row.batchId))];
  const byBatch = new Map(trend.map((row) => [`${row.batchId}:${row.clusterId}`, row]));
  const clusterIds = [...new Set(trend.map((row) => row.clusterId))];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[var(--color-fg-subtle)]">
            <th className="py-1 pr-2">Intent</th>
            {batchIds.map((id) => (
              <th key={id} className="py-1 pr-2 tabular">
                {new Date(trend.find((row) => row.batchId === id)!.startedAt).toLocaleDateString()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {clusterIds.map((clusterId) => (
            <tr key={clusterId} className="border-t border-[var(--color-border)]">
              <td className="py-1 pr-2">{clusters.find((cluster) => cluster.id === clusterId)?.label || clusterId}</td>
              {batchIds.map((id) => {
                const cell = byBatch.get(`${id}:${clusterId}`);
                return (
                  <td key={id} className="py-1 pr-2 tabular">
                    {cell ? `${cell.mentioned}/${cell.completed}` : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RunRow({ run, expanded, onToggle }: { run: VisibilityRun; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)]">
      <button type="button" onClick={onToggle} className="flex w-full flex-wrap items-center gap-2 p-3 text-left">
        <Badge variant={run.status === "ok" ? "success" : run.status === "failed" ? "danger" : "secondary"} className="capitalize">
          {run.status}
        </Badge>
        <span className="text-xs text-[var(--color-fg-subtle)]">{run.provider} · {run.returnedModel || run.requestedModel}</span>
        {run.branded && <Badge variant="outline">branded</Badge>}
        <span className="min-w-0 flex-1 truncate text-sm">{run.prompt}</span>
        {run.status === "ok" && (
          <span className="flex items-center gap-1 text-xs">
            {run.mentioned ? <Eye className="h-3.5 w-3.5 text-[var(--color-success)]" /> : <EyeOff className="h-3.5 w-3.5 text-[var(--color-fg-subtle)]" />}
            {run.mentioned ? "named" : "not named"}
            {run.cited ? <Link2 className="ml-2 h-3.5 w-3.5 text-[var(--color-success)]" /> : null}
            {run.cited ? "cited" : ""}
          </span>
        )}
        {run.status === "failed" && <span className="text-xs text-[var(--color-danger)]">{run.errorCode}</span>}
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-[var(--color-border)] p-3 text-xs">
          {run.answerText ? (
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-[var(--radius-sm)] bg-[var(--color-bg-elevated)] p-3 font-sans leading-relaxed">
              {run.answerText}
            </pre>
          ) : (
            <p className="text-[var(--color-fg-muted)]">No answer stored for this run.</p>
          )}
          {run.citations.length > 0 && (
            <div>
              <div className="mb-1 text-[var(--color-fg-subtle)]">Provider citations ({run.citations.length})</div>
              <ul className="space-y-0.5">
                {run.citations.map((citation) => (
                  <li key={citation.url} className="truncate">
                    <a href={citation.url} target="_blank" rel="noreferrer" className="text-[var(--color-primary)] hover:underline">
                      {citation.title || citation.url}
                    </a>
                    <span className="text-[var(--color-fg-subtle)]"> · {citation.host}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="text-[var(--color-fg-subtle)]">
            {run.observedAt ? `${new Date(run.observedAt).toLocaleString()} · ` : ""}
            {run.latencyMs ? `${(run.latencyMs / 1000).toFixed(1)}s · ` : ""}
            {typeof run.searchCalls === "number" ? `${run.searchCalls} web searches · ` : ""}
            ${(run.costUsdTicks / 1e10).toFixed(3)}
            {run.extractionModel ? ` · entities via ${run.extractionModel}` : ""}
          </div>
        </div>
      )}
    </div>
  );
}

function OpportunitiesTab({
  detail,
  interventions,
  onChange,
}: {
  detail: BatchDetail | null;
  interventions: Intervention[];
  onChange: () => Promise<void>;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [facts, setFacts] = useState("");
  const [deployUrl, setDeployUrl] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, { title: string; content: string }>>({});
  const report = detail?.report;

  const draft = async (opportunity: Opportunity, kind: InterventionKind) => {
    if (!detail) return;
    setBusyKey(`${opportunity.key}:${kind}`);
    try {
      await draftMyIntervention({
        data: {
          batchId: detail.batch.id,
          opportunityKey: opportunity.key,
          kind,
          declaredFacts: facts.split("\n").map((line) => line.trim()).filter(Boolean),
        },
      });
      toast.success("Draft created — review it below before approving");
      await onChange();
    } catch (error) {
      toast.error(errorMessage(error, "Could not draft"));
    } finally {
      setBusyKey(null);
    }
  };

  const command = async (intervention: Intervention, action: "approve" | "dismiss" | "deployed" | "edit") => {
    setBusyKey(intervention.id);
    try {
      if (action === "deployed") {
        const url = deployUrl[intervention.id]?.trim();
        if (!url) {
          toast.error("Enter the live URL where you published this");
          return;
        }
        const result = await updateMyIntervention({ data: { id: intervention.id, command: { action: "deployed", url } } });
        if (result.state === "verified") toast.success("Verified on the live page");
        else toast.message(result.verificationNote || "Not verified yet");
      } else if (action === "edit") {
        const edit = editing[intervention.id];
        if (!edit) return;
        await updateMyIntervention({ data: { id: intervention.id, command: { action: "edit", title: edit.title, content: edit.content } } });
        setEditing((current) => {
          const next = { ...current };
          delete next[intervention.id];
          return next;
        });
        toast.success("Draft updated");
      } else {
        await updateMyIntervention({ data: { id: intervention.id, command: { action } } });
        toast.success(action === "approve" ? "Approved" : "Dismissed");
      }
      await onChange();
    } catch (error) {
      toast.error(errorMessage(error, "Update failed"));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-[var(--color-primary)]" /> Ranked opportunities
          </CardTitle>
          <CardDescription>
            priority = 100 × gap × reach × actionability × fit (all 0–1). Heuristic, not a lift prediction. Each one
            lists the answers it came from.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!report && <p className="text-sm text-[var(--color-fg-muted)]">Run a visibility batch first.</p>}
          {report && report.opportunities.length === 0 && (
            <p className="text-sm text-[var(--color-fg-muted)]">
              Insufficient opportunity evidence in this batch: engines either named you already or returned no
              claimable sources. Re-run after publishing changes, or add profile links under Readiness.
            </p>
          )}
          {report && report.opportunities.length > 0 && (
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
              <Label htmlFor="citelock-facts">Facts you can support (one per line) — used for drafts, never invented</Label>
              <Textarea
                id="citelock-facts"
                className="mt-1.5"
                value={facts}
                onChange={(event) => setFacts(event.target.value)}
                placeholder={"Represented buyers in 14 Rancho Santa Fe transactions since 2019\nCovenant resident since 2012\nSpecialize in equestrian and well/septic due diligence"}
              />
            </div>
          )}
          {report?.opportunities.map((opportunity) => (
            <div key={opportunity.key} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="accent" className="tabular">priority {opportunity.priority}</Badge>
                <span className="text-sm font-medium">{opportunity.title}</span>
                <Badge variant="outline" className="capitalize">{opportunity.effort} effort</Badge>
              </div>
              <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{opportunity.why}</p>
              <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)] tabular">
                gap {opportunity.factors.gap.toFixed(2)} · reach {opportunity.factors.reach.toFixed(2)} · actionability{" "}
                {opportunity.factors.actionability.toFixed(2)} · fit {opportunity.factors.fit.toFixed(2)} · evidence: {opportunity.evidenceRunIds.length} answers ·
                intents: {opportunity.clusterIds.join(", ")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {opportunity.kind === "profile_claim" ? (
                  <Button size="sm" disabled={busyKey === `${opportunity.key}:profile_claim`} onClick={() => draft(opportunity, "profile_claim")}>
                    {busyKey === `${opportunity.key}:profile_claim` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Build claim checklist
                  </Button>
                ) : (
                  <>
                    <Button size="sm" disabled={busyKey === `${opportunity.key}:site_page`} onClick={() => draft(opportunity, "site_page")}>
                      {busyKey === `${opportunity.key}:site_page` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Draft web page
                    </Button>
                    <Button size="sm" variant="outline" disabled={busyKey === `${opportunity.key}:faq`} onClick={() => draft(opportunity, "faq")}>
                      Draft FAQ
                    </Button>
                  </>
                )}
                <Button asChild size="sm" variant="ghost">
                  <Link to="/marketing" search={{ origin: `citelock:${opportunity.key}` }}>
                    Draft social posts
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Improvement drafts</CardTitle>
          <CardDescription>Proposed → approved → deployed → verified against the live page. Nothing publishes itself.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!interventions.length && <p className="text-sm text-[var(--color-fg-muted)]">No drafts yet.</p>}
          {interventions.map((intervention) => {
            const edit = editing[intervention.id];
            return (
              <div key={intervention.id} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={intervention.state === "verified" ? "success" : intervention.state === "dismissed" ? "secondary" : intervention.state === "approved" || intervention.state === "deployed" ? "accent" : "outline"}
                    className="capitalize"
                  >
                    {intervention.state}
                  </Badge>
                  <Badge variant="outline" className="capitalize">{intervention.kind.replace("_", " ")}</Badge>
                  <span className="text-sm font-medium">{intervention.title}</span>
                  <span className="ml-auto text-[11px] text-[var(--color-fg-subtle)]">
                    {intervention.draftedWith ? `drafted with ${intervention.draftedWith}` : ""}
                  </span>
                </div>
                {edit ? (
                  <div className="mt-2 space-y-2">
                    <Input value={edit.title} onChange={(event) => setEditing({ ...editing, [intervention.id]: { ...edit, title: event.target.value } })} />
                    <Textarea rows={12} value={edit.content} onChange={(event) => setEditing({ ...editing, [intervention.id]: { ...edit, content: event.target.value } })} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => command(intervention, "edit")} disabled={busyKey === intervention.id}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing((current) => { const next = { ...current }; delete next[intervention.id]; return next; })}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-[var(--radius-sm)] bg-[var(--color-bg-elevated)] p-3 font-sans text-xs leading-relaxed">
                    {intervention.content}
                  </pre>
                )}
                {intervention.verificationNote && (
                  <p className={cn("mt-2 text-xs", intervention.state === "verified" ? "text-[var(--color-success)]" : "text-[var(--color-warning)]")}>
                    {intervention.verificationNote}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(intervention.content).then(() => toast.success("Copied"))}>
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                  {intervention.state === "proposed" && !edit && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setEditing({ ...editing, [intervention.id]: { title: intervention.title, content: intervention.content } })}>Edit</Button>
                      <Button size="sm" onClick={() => command(intervention, "approve")} disabled={busyKey === intervention.id}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => command(intervention, "dismiss")} disabled={busyKey === intervention.id}>Dismiss</Button>
                    </>
                  )}
                  {(intervention.state === "approved" || intervention.state === "deployed") && (
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                      <Input
                        className="max-w-md"
                        placeholder="https://your-site.com/the-page-you-published"
                        value={deployUrl[intervention.id] ?? intervention.deployedUrl ?? ""}
                        onChange={(event) => setDeployUrl({ ...deployUrl, [intervention.id]: event.target.value })}
                      />
                      <Button size="sm" onClick={() => command(intervention, "deployed")} disabled={busyKey === intervention.id}>
                        {busyKey === intervention.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                        I published it — verify
                      </Button>
                    </div>
                  )}
                  {intervention.state === "verified" && intervention.deployedUrl && (
                    <a href={intervention.deployedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline">
                      Live page <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function ReadinessTab({
  readiness,
  scan,
  scanBusy,
  scanError,
  jurisdiction,
  setJurisdiction,
  onScan,
  canScan,
}: {
  readiness: ReturnType<typeof scoreAieo>;
  scan: CiteLockScanRecord | null;
  scanBusy: boolean;
  scanError: string | null;
  jurisdiction: CiteJurisdiction;
  setJurisdiction: (value: CiteJurisdiction) => void;
  onScan: () => void;
  canScan: boolean;
}) {
  const statusVariant = readiness.readiness.status === "publish_ready" ? "success" : readiness.readiness.status === "blocked" ? "danger" : "secondary";
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-[var(--color-primary)]" /> Public evidence scan
          </CardTitle>
          <CardDescription>
            Audits your site (identity, indexability, schema, profile links) and checks the license against the state
            registry. California is the live registry adapter; other states record "unsupported" rather than guessing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="text-xs font-medium" htmlFor="citelock-jurisdiction">License jurisdiction</label>
            <select
              id="citelock-jurisdiction"
              value={jurisdiction}
              onChange={(event) => setJurisdiction(event.target.value as CiteJurisdiction)}
              className="min-h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
            >
              {US_JURISDICTIONS.map((code) => (
                <option key={code} value={code}>{JURISDICTION_LABELS[code]}</option>
              ))}
            </select>
            <Button type="button" onClick={onScan} disabled={scanBusy || !canScan}>
              {scanBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {scanBusy ? "Scanning public evidence…" : "Run verified scan"}
            </Button>
          </div>
          {scanError && <p className="text-xs text-[var(--color-danger)]" role="alert">{scanError}</p>}
          {scan && (
            <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
              <div className="text-xs font-medium">Last scan · {new Date(scan.evaluatedAt).toLocaleString()}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {scan.sourceOutcomes.map((outcome, index) => (
                  <div key={`${outcome.source}:${index}`} className="text-xs">
                    <Badge variant={outcome.status === "verified" ? "success" : outcome.status === "mismatch" || outcome.status === "unavailable" ? "danger" : "secondary"} className="mr-2 capitalize">
                      {outcome.status}
                    </Badge>
                    {outcome.url ? (
                      <a href={outcome.url} target="_blank" rel="noreferrer" className="hover:underline">
                        {outcome.label} <ExternalLink className="inline h-3 w-3" />
                      </a>
                    ) : outcome.label}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>CiteScore readiness</CardDescription>
            <CardTitle className="flex items-end gap-3">
              <span className="font-display text-5xl">{readiness.total}</span>
              <span className="pb-1 text-sm text-[var(--color-fg-muted)]">/ 100</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge variant={statusVariant} className="capitalize">{readiness.readiness.status.replace(/_/g, " ")}</Badge>
            <Badge variant="outline">Grade {readiness.grade}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Evidence coverage</CardDescription>
            <CardTitle className="font-display text-5xl">{readiness.readiness.evidenceCoverage}%</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-[var(--color-fg-muted)]">
            Weighted by source authority and verification status. First-party claims never equal regulator proof.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Readiness pillars</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(Object.keys(readiness.pillars) as Array<keyof typeof readiness.pillars>).map((key) => {
              const pillar = readiness.pillars[key];
              return (
                <div key={key}>
                  <div className="mb-0.5 flex justify-between text-[11px]">
                    <span>{AIEO_PILLAR_LABEL[key]}</span>
                    <span className="text-[var(--color-fg-subtle)] tabular">{pillar.score}/{pillar.max}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-bg-elevated)]">
                    <div className="h-full bg-[var(--color-primary)]" style={{ width: `${Math.round((pillar.score / pillar.max) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Publishing gates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {readiness.gates.map((gate) => (
              <div key={gate.id} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
                <div className="flex items-center gap-2">
                  {gate.status === "pass" ? <ShieldCheck className="h-4 w-4 text-[var(--color-success)]" /> : <AlertTriangle className="h-4 w-4 text-[var(--color-warning)]" />}
                  <span className="text-sm font-medium">{gate.label}</span>
                  <Badge variant={gate.status === "block" ? "danger" : gate.status === "pass" ? "success" : "secondary"} className="ml-auto capitalize">{gate.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{gate.reason}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Readiness actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {readiness.actions.length ? readiness.actions.slice(0, 8).map((action) => (
              <div key={action.id} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
                <div className="flex items-center gap-2">
                  <Badge variant={action.severity === "blocking" ? "danger" : "secondary"} className="capitalize">{action.severity}</Badge>
                  <span className="text-sm font-medium">{action.issue}</span>
                  <span className="ml-auto text-xs text-[var(--color-fg-subtle)]">+{action.pointsAvailable}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{action.fix}</p>
              </div>
            )) : <p className="text-sm text-[var(--color-fg-muted)]">No open readiness actions.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Answer pack and schema</CardTitle>
          <CardDescription>Source-backed answers you can put on your site. Everything needs human review; schema exports only when every gate passes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {readiness.faqs.map((faq) => (
            <div key={faq.question} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{faq.question}</span>
                <Badge variant={faq.publishable ? "success" : "secondary"}>{faq.publishable ? "Sources attached" : "Draft only"}</Badge>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void navigator.clipboard.writeText(`${faq.question}\n${faq.answer}`).then(() => toast.success("Copied"))}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-fg-muted)]">{faq.answer}</p>
            </div>
          ))}
          <pre className="max-h-[24rem] overflow-auto rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] p-3 text-[11px]">{JSON.stringify(readiness.jsonLd, null, 2)}</pre>
          <Button disabled={readiness.readiness.status !== "publish_ready"} onClick={() => void navigator.clipboard.writeText(JSON.stringify(readiness.jsonLd, null, 2)).then(() => toast.success("JSON-LD copied"))}>
            <Copy className="h-4 w-4" /> Copy schema
          </Button>
          {readiness.readiness.status !== "publish_ready" && (
            <p className="text-xs text-[var(--color-fg-muted)]">Complete every publishing gate before exporting machine-readable claims.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EvidenceTab({ readiness }: { readiness: ReturnType<typeof scoreAieo> }) {
  return (
    <div className="space-y-4">
      {readiness.conflicts.map((conflict) => (
        <div key={conflict.id} className="rounded-[var(--radius-md)] border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/5 p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[var(--color-danger)]" />
            <span className="text-sm font-semibold">Conflicting {conflict.field.replace(/_/g, " ")}</span>
          </div>
          <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{conflict.message}</p>
          <p className="mt-1 text-xs">{conflict.values.join(" ↔ ")}</p>
        </div>
      ))}
      <div className="grid gap-3 md:grid-cols-2">
        {readiness.evidence.map((item) => (
          <div key={item.id} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{item.field.replace(/_/g, " ")}</span>
              <Badge variant={item.status === "verified" ? "success" : item.status === "conflicted" ? "danger" : "secondary"} className="ml-auto capitalize">{item.status}</Badge>
            </div>
            <p className="mt-1 break-words text-xs">{item.value}</p>
            <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
              {item.sourceLabel} · {item.sourceTier.replace(/_/g, " ")}{item.observedAt ? ` · observed ${item.observedAt.slice(0, 10)}` : ""}
            </p>
            {item.sourceUrl && (
              <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline">
                Open source <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
