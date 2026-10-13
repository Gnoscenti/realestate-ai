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
  createMyInterventionSocial,
  repeatMyVisibilityBatch,
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
import { ExpertisePanel } from "@/components/citelock/expertise-panel";
import { GuidePanel } from "@/components/citelock/guide-panel";
import { getMyAccess } from "@/lib/billing/api";
import { SubjectEditor } from "@/components/citelock/subject-editor";
import type { SubjectInput } from "@/lib/aieo/visibility/subjects";
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

type Tab = "expertise" | "visibility" | "opportunities" | "readiness" | "evidence";
const TAB_LABEL: Record<Tab, string> = {
  expertise: "Supported expertise",
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
  const [mode,setMode] = useState<"guide" | "advanced">("guide");
  const [access,setAccess] = useState<"loading" | "full" | "basic" | "error">("loading");
  useEffect(()=>{let active=true; void getMyAccess().then(result=>{if(active)setAccess(result.active ? "full":"basic");}).catch(()=>{if(active)setAccess("error");});return()=>{active=false;};},[]);
  return <div className="mx-auto max-w-7xl space-y-5">
    <div className="flex flex-wrap gap-2">
      <Button variant={mode==="guide" ? "default":"outline"} onClick={()=>setMode("guide")}>Visibility guide</Button>
      <Button variant={mode==="advanced" ? "default":"outline"} disabled={access!=="full"} onClick={()=>setMode("advanced")}>Advanced workspace</Button>
      {access==="basic" && <Link to="/" className="self-center text-xs text-[var(--color-primary)]">Full access includes measurement + Social Desk</Link>}
      {access==="error" && <p role="alert" className="text-xs">Could not verify advanced access. Reload to retry.</p>}
    </div>
    {mode==="guide" ? <GuidePanel /> : <MeasurementWorkspace />}
  </div>;
}

function MeasurementWorkspace() {
  const profile = useAppStore((state) => state.agentProfile);
  const properties = useAppStore((state) => state.properties);
  const memory = useAppStore((state) => state.agentMemory);
  const [tab, setTab] = useState<Tab>("expertise");
  const [jurisdiction, setJurisdiction] = useState<CiteJurisdiction>("US-CA");
  const [scan, setScan] = useState<CiteLockScanRecord | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderInfo | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [providerRetry, setProviderRetry] = useState(0);
  const [batches, setBatches] = useState<VisibilityBatch[]>([]);
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [trend, setTrend] = useState<Trend>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [subjectFingerprint, setSubjectFingerprint] = useState<string | null>(null);
  const [subjectInput, setSubjectInput] = useState<SubjectInput | null>(null);
  const historyRequest=useRef(0);
  const [scoreClock, setScoreClock] = useState(() => new Date().toISOString());
  const cancelRef = useRef(false);
  useEffect(() => () => { cancelRef.current = true; }, []);

  useEffect(() => {
    const code = (profile as CiteAgentProfile | null)?.licenseJurisdiction;
    if (code && US_JURISDICTIONS.includes(code as CiteJurisdiction)) setJurisdiction(code as CiteJurisdiction);
  }, [profile]);

  useEffect(() => {
    const interval = window.setInterval(() => setScoreClock(new Date().toISOString()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (subjectInput?.entityKind === "agent") setJurisdiction(subjectInput.jurisdiction);
  }, [subjectInput]);

  const scanInput = useMemo(
    () =>
      subjectInput?.entityKind === "agent" ? { ...subjectInput, jurisdiction } : profile?.website && profile?.name
        ? {
            website: profile.website,
            agentName: profile.name,
            license: profile.license || undefined,
            responsibleBrokerLicense: (profile as CiteAgentProfile).responsibleBrokerLicense,
            jurisdiction,
          }
        : null,
    [profile, jurisdiction, subjectInput],
  );
  useEffect(() => {
    let active = true;
    setProviderError(null);
    void getVisibilityProviders()
      .then((info) => {
        if (active) setProviders(info);
      })
      .catch((error) => {
        if (active) { setProviders(null); setProviderError(errorMessage(error, "Could not load provider configuration.")); }
      });
    return () => {
      active = false;
    };
  }, [providerRetry]);

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
    async (fingerprint: string, selectLatest: boolean, signal?:AbortSignal) => {
      const request=++historyRequest.current;
      const [list, series, drafts] = await Promise.all([
        listMyVisibilityBatches({ data: { subjectFingerprint: fingerprint } }),
        getMyVisibilityTrend({ data: { subjectFingerprint: fingerprint } }),
        listMyInterventions({ data: { subjectFingerprint: fingerprint } }),
      ]);
      if(signal?.aborted || request!==historyRequest.current) return;
      setBatches(list);
      setTrend(series);
      setInterventions(drafts);
      if (selectLatest && list[0]) {
        setDetailLoading(true);
        try {
          const next=await getMyVisibilityBatch({ data: { batchId: list[0].id } });
          if(!signal?.aborted && request===historyRequest.current) setDetail(next);
        } finally {
          if(!signal?.aborted && request===historyRequest.current) setDetailLoading(false);
        }
      } else if(selectLatest) {setDetail(null);setDetailLoading(false);}
    },
    [],
  );

  useEffect(() => {
    ++historyRequest.current;
    setSubjectFingerprint(null);setBatches([]);setDetail(null);setTrend([]);setInterventions([]);setDetailLoading(false);
    if (!subjectInput) {
      setSubjectFingerprint(null);
      setBatches([]);
      setDetail(null);
      return;
    }
    let active = true;
    const controller=new AbortController();
    void resolveMyVisibilitySubject({ data: subjectInput })
      .then(async (resolved) => {
        if (!active) return;
        setSubjectFingerprint(resolved.fingerprint);
        await loadHistory(resolved.fingerprint, true, controller.signal);
      })
      .catch((error) => {
        if (active) setBatchError(errorMessage(error, "Could not load visibility history"));
      });
    return () => {
      active = false;
      controller.abort();
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
      // Another request can own an unexpired lease. Avoid a tight server-request loop while waiting.
      if (!step.executed && remaining > 0 && !cancelRef.current) await new Promise(resolve => window.setTimeout(resolve, 2000));
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
    const request = ++historyRequest.current;
    setDetailLoading(true);
    try {
      const next = await getMyVisibilityBatch({ data: { batchId } });
      if (request === historyRequest.current) setDetail(next);
    } catch (error) {
      if (request === historyRequest.current) toast.error(errorMessage(error, "Could not load that batch"));
    } finally {
      if (request === historyRequest.current) setDetailLoading(false);
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


  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="space-y-3 p-5 sm:p-7">
          <Badge variant="accent">
            <Radar className="h-3 w-3" />
            CiteLock · answer-engine visibility
          </Badge>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Get discovered for the work you do best.
          </h1>
          <p className="max-w-3xl text-sm text-[var(--color-fg-muted)]">
            CiteLock connects supported expertise to designed client questions, records who engines recommend and which
            sources they cite, and turns the gaps into drafted fixes you approve. Every number shows its sample
            size; nothing here guarantees a citation.
          </p>
        </div>
      </section>

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
                  : providerError || "Loading provider configuration…"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {providerError && <Button variant="outline" onClick={() => setProviderRetry(n => n + 1)}>Retry provider configuration</Button>}
            <SubjectEditor initialAgent={profile} disabled={batchBusy} onChange={setSubjectInput} />
            <div className="flex flex-wrap gap-2">
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
              Subject: <strong className="text-[var(--color-fg)]">{subjectInput?.agentName || "Save an identity above"}</strong> · {subjectInput?.website}
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

      <div className="flex flex-wrap gap-1">
        {(Object.keys(TAB_LABEL) as Tab[]).map((item) => (
          <Button key={item} size="sm" variant={tab === item ? "default" : "outline"} onClick={() => setTab(item)}>
            {TAB_LABEL[item]}
          </Button>
        ))}
      </div>

      {tab === "expertise" && subjectInput && subjectFingerprint && <ExpertisePanel key={subjectFingerprint} subject={subjectInput} fingerprint={subjectFingerprint}
        onSaved={async()=>{await loadHistory(subjectFingerprint,false);if(detail)setDetail(await getMyVisibilityBatch({data:{batchId:detail.batch.id}}));}} />}
      {detail && !batchBusy && detail.batch.status !== "running" && <Button variant="outline" onClick={async()=>{
        setBatchBusy(true);cancelRef.current=false;try{await driveBatch(await repeatMyVisibilityBatch({data:{batchId:detail.batch.id}}));}
        catch(e){toast.error(errorMessage(e,"Could not repeat the basket"));}finally{setBatchBusy(false);setProgress(null);}
      }}>Repeat this exact basket after publishing</Button>}
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
          <div className="grid gap-3 md:grid-cols-4">
            <RateChip
              label="Discovery rate"
              rate={report.discovery}
              hint="Completed unbranded answers recommending the resolved subject; API observations only."
            />
            <RateChip
              label="Mention rate" rate={report.mentions} hint="Includes neutral or negative name mentions; separate from recommendation." />
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
              {report.ambiguous} ambiguous identities · {report.negative} negative mentions · engines {report.providers.join(", ")} · basket {detail.batch.basketVersion} · provider-reported cost at least ${report.costUsd.toFixed(2)}
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
            <CardDescription>Separate series for each provider, returned model, prompt, geography, surface and method. Same-day repeats do not establish lift.</CardDescription>
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
                  {batch.completedRuns}/{batch.plannedRuns} ok · {batch.failedRuns} failed · reported at least ${batch.costUsd.toFixed(2)}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TrendTable({ trend }: { trend: Trend; clusters: ProviderInfo["clusters"] }) {
  return <div className="space-y-3">
    {trend.map(row=><details key={row.batchId+row.seriesId} className="rounded-md border p-2 text-xs">
      <summary className="cursor-pointer">{new Date(row.startedAt).toLocaleDateString()} · {row.provider} · {row.model} · {row.clusterId}
        <span className="ml-2">recommended {row.recommended}/{row.completed} · mentioned {row.mentioned}/{row.completed} · cited {row.cited}/{row.completed} · failed {row.failed}</span>
      </summary>
      <p className="mt-2">{row.prompt}</p><p className="mt-1">{row.surface} · {row.method} · series {row.seriesId.slice(0,12)}</p>
      <p className="mt-1">{row.change}{row.previousDate ? " Prior: "+new Date(row.previousDate).toLocaleDateString() : ""}</p>
    </details>)}
  </div>;
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
            {run.evaluation?.negativeMention ? " · negative mention" : run.evaluation?.ambiguousIdentity ? " · identity ambiguous" : run.recommended ? " · recommended" : ""}
            {run.cited ? <Link2 className="ml-2 h-3.5 w-3.5 text-[var(--color-success)]" /> : null}
            {run.cited ? "cited" : ""}
          </span>
        )}
        {run.status === "pending" && run.errorCode === "provider_rate_limited" && <span className="text-xs text-[var(--color-fg-muted)]">Rate limited · waiting for provider cooldown</span>}
        {run.status === "failed" && <span className="text-xs text-[var(--color-danger)]">{run.errorCode}</span>}
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-[var(--color-border)] p-3 text-xs">
          {run.providerFailure && <p className="text-[var(--color-warning)]" role="status">
            {[run.providerFailure.httpStatus ? `HTTP ${run.providerFailure.httpStatus}` : null,
              run.providerFailure.providerType, run.providerFailure.providerCode,
              run.providerFailure.responseStatus, run.providerFailure.incompleteReason].filter(Boolean).join(" · ")}
            {run.errorCode === "provider_quota_exhausted" && " · Add provider credits or configure a funded project key before a new batch."}
            {run.errorCode === "provider_incomplete" && " · Partial response retained as evidence; excluded from recognition counts."}
          </p>}
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
          {Boolean(run.sources?.length) && run.citations.length === 0 && <p className="text-[var(--color-fg-muted)]">No URL-citation annotations were returned. Retrieved sources below do not establish that the answer cited your page.</p>}
          {Boolean(run.sources?.length) && (
            <details>
              <summary className="cursor-pointer">Retrieved sources ({run.sources?.length}) · excluded from citation counts</summary>
              <ul className="mt-2 space-y-1">
                {run.sources?.map((source, index) => (
                  <li key={`${source.url}:${index}`}>
                    <a href={source.url} target="_blank" rel="noreferrer" className="text-[var(--color-primary)] hover:underline">{source.title || source.url}</a>
                    {source.date && <span> · {source.date}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="text-[var(--color-fg-subtle)]">
            {run.surface ? `${run.surface} · ` : ""}
            {run.observedAt ? `${new Date(run.observedAt).toLocaleString()} · ` : ""}
            {run.latencyMs ? `${(run.latencyMs / 1000).toFixed(1)}s · ` : ""}
            {typeof run.searchCalls === "number" ? `${run.searchCalls} web searches · ` : ""}
            provider-reported cost at least ${(run.costUsdTicks / 1e10).toFixed(3)}
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
  const [rightsReviewed,setRightsReviewed]=useState<Record<string,boolean>>({});
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
          declaredFacts: [],
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
        const url = (deployUrl[intervention.id] || intervention.deployedUrl)?.trim();
        if (!url) {
          toast.error("Enter the live URL where you published this");
          return;
        }
        const result = await updateMyIntervention({ data: { id: intervention.id, command: { action: "deployed", url, expectedRevision:intervention.revision } } });
        if (result.state === "verified") toast.success("Verified on the live page");
        else toast.message(result.verificationNote || "Not verified yet");
      } else if (action === "edit") {
        const edit = editing[intervention.id];
        if (!edit) return;
        await updateMyIntervention({ data: { id: intervention.id, command: { action: "edit", title: edit.title, content: edit.content, expectedRevision:intervention.revision } } });
        setEditing((current) => {
          const next = { ...current };
          delete next[intervention.id];
          return next;
        });
        toast.success("Draft updated");
      } else {
        await updateMyIntervention({ data: { id: intervention.id, command: action==="approve" ? {action,expectedRevision:intervention.revision,reviewedFactsAndRights:true} : {action,expectedRevision:intervention.revision} } });
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
            priority = 100 × supported fit × evidence strength × observed gap × actionability (all 0–1). Heuristic, not a lift prediction. Each one
            lists the answers it came from.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!report && <p className="text-sm text-[var(--color-fg-muted)]">Run a visibility batch first.</p>}
          {report && report.opportunities.length === 0 && (
            <p className="text-sm text-[var(--color-fg-muted)]">
              No supported opportunity yet. Add permitted evidence and inspect your public pages under Supported expertise,
              then run a new baseline with the matching expertise questions. Contradictory evidence needs review.
            </p>
          )}
          {report?.opportunities.map((opportunity) => (
            <div key={opportunity.key} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="accent" className="tabular">priority {opportunity.priority}</Badge>
                <span className="text-sm font-medium">{opportunity.title}</span>
                <Badge variant="outline" className="capitalize">{opportunity.effort} effort</Badge>
              </div>
              <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{opportunity.why}</p>
              <p className="mt-2 text-sm">{opportunity.clientQuestion}</p>
              <p className="mt-2 text-xs"><strong>Content gap: </strong>{opportunity.contentGap}</p>
              <p className="mt-1 text-xs"><strong>Hypothesis: </strong>{opportunity.hypothesis}</p>
              <p className="mt-1 text-xs"><strong>Test: </strong>{opportunity.testPlan}</p>
              <ul className="mt-2 space-y-1 text-xs">{opportunity.supportingEvidence?.map(e=><li key={e.id}>
                {e.statement} — {e.sourceLabel}, {e.sourceDate} {e.url && <a href={e.url} target="_blank" rel="noreferrer" className="text-primary">View source</a>}
              </li>)}</ul>
              <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)] tabular">
                gap {opportunity.factors.gap.toFixed(2)} · evidence strength {opportunity.evidenceStrength?.toFixed(2) ?? "unknown"} · actionability{" "}
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
              <div key={intervention.id} data-testid="intervention-card" className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={intervention.state === "verified" ? "success" : intervention.state === "dismissed" ? "secondary" : intervention.state === "approved" || intervention.state === "deployed" ? "accent" : "outline"}
                    className="capitalize"
                  >
                    {intervention.state === "deployed" ? "Publication reported" : intervention.state} · revision {intervention.revision}
                  </Badge>
                  <Badge variant="outline" className="capitalize">{intervention.kind.replace("_", " ")}</Badge>
                  <span className="text-sm font-medium">{intervention.title}</span>
                  <span className="ml-auto text-[11px] text-[var(--color-fg-subtle)]">
                    {intervention.draftedWith ? `drafted with ${intervention.draftedWith}` : ""}
                  </span>
                </div>
                {edit ? (
                  <div className="mt-2 space-y-2">
                    <Input aria-label="Intervention title" value={edit.title} onChange={(event) => setEditing({ ...editing, [intervention.id]: { ...edit, title: event.target.value } })} />
                    <Textarea aria-label="Intervention public content" rows={12} value={edit.content} onChange={(event) => setEditing({ ...editing, [intervention.id]: { ...edit, content: event.target.value } })} />
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
                {intervention.package && <details className="mt-2 text-xs">
                  <summary className="cursor-pointer">Sources, placement instructions and follow-up test</summary>
                  <p className="mt-2">{intervention.package.gap}</p><p>{intervention.package.hypothesis}</p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5">{intervention.package.deploymentInstructions.map(step=><li key={step}>{step}</li>)}</ol>
                  <p className="mt-2">{intervention.package.testPlan}</p>
                  <p className="mt-2 font-medium">Case-study interview questions — missing facts remain questions</p>
                  <ul className="list-disc pl-5">{intervention.package.interviewQuestions.map(q=><li key={q}>{q}</li>)}</ul>
                </details>}
                {intervention.state==="proposed" && !edit && <label className="mt-3 flex items-start gap-2 text-xs">
                  <input type="checkbox" checked={Boolean(rightsReviewed[intervention.id+":"+intervention.revision])}
                    onChange={e=>setRightsReviewed({...rightsReviewed,[intervention.id+":"+intervention.revision]:e.target.checked})}/>
                  I reviewed the facts, exact entity, source attribution and publication rights for this revision.
                </label>}
                {intervention.verificationNote && (
                  <p className={cn("mt-2 text-xs", intervention.state === "verified" ? "text-[var(--color-success)]" : "text-[var(--color-warning)]")}>
                    {intervention.verificationNote}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(intervention.content).then(() => toast.success("Copied")).catch(()=>toast.error("Clipboard unavailable. Select and copy the text above."))}>
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                  {intervention.state === "proposed" && !edit && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setEditing({ ...editing, [intervention.id]: { title: intervention.title, content: intervention.content } })}>Edit</Button>
                      <Button size="sm" onClick={() => command(intervention, "approve")} disabled={busyKey === intervention.id || !rightsReviewed[intervention.id+":"+intervention.revision]}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => command(intervention, "dismiss")} disabled={busyKey === intervention.id}>Dismiss</Button>
                    </>
                  )}
                  {["approved","deployed","verified"].includes(intervention.state) && intervention.package && (
                    intervention.socialDraftId ? <Button asChild size="sm" variant="outline"><Link to="/marketing" search={{origin:"citelock:"+intervention.id}}>Open linked social draft</Link></Button>
                    : <Button size="sm" variant="outline" disabled={busyKey===intervention.id} onClick={async()=>{
                      setBusyKey(intervention.id);
                      try {await createMyInterventionSocial({data:{id:intervention.id,revision:intervention.revision,platform:"linkedin"}});
                        await onChange();toast.success("Linked draft saved in Social Desk; review and approve it there.");}
                      catch(e){toast.error(errorMessage(e,"Could not create linked social draft"));}finally{setBusyKey(null);}
                    }}>Create linked social draft</Button>
                  )}
                  {(intervention.state === "approved" || intervention.state === "deployed") && (
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                      <Input
                        aria-label="Published intervention URL"
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
