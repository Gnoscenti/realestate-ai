import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Radar,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
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
import { AIEO_PILLAR_LABEL, scoreAieo } from "@/lib/aieo/score";
import {
  JURISDICTION_LABELS,
  US_JURISDICTIONS,
  type CiteJurisdiction,
  type CiteLockScanRecord,
} from "@/lib/aieo/scan-types";
import {
  getMyLatestCiteLockScan,
  runMyCiteLockScan,
} from "@/lib/aieo/api";
import type { CiteAgentProfile, CiteProperty } from "@/lib/aieo/provenance";
import { useAppStore } from "@/lib/store";

export const Route = createFileRoute("/aieo")({
  component: AieoPage,
});

type Tab = "overview" | "evidence" | "answers" | "schema" | "recognition";

const TAB_LABEL: Record<Tab, string> = {
  overview: "Overview",
  evidence: "Evidence Locker",
  answers: "Answer Pack",
  schema: "Schema",
  recognition: "Recognition",
};

function AieoPage() {
  const profile = useAppStore((state) => state.agentProfile);
  const properties = useAppStore((state) => state.properties);
  const memory = useAppStore((state) => state.agentMemory);
  const [tab, setTab] = useState<Tab>("overview");
  const [scan, setScan] = useState<CiteLockScanRecord | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [jurisdiction, setJurisdiction] = useState<CiteJurisdiction>("US-CA");
  const [scoreClock, setScoreClock] = useState(() => new Date().toISOString());

  useEffect(() => {
    const interval = window.setInterval(
      () => setScoreClock(new Date().toISOString()),
      60_000,
    );
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!profile?.website || !profile?.name) {
      setScan(null);
      return;
    }
    let active = true;
    setScan(null);
    void getMyLatestCiteLockScan({
      data: {
        website: profile.website,
        agentName: profile.name,
        license: profile.license || undefined,
        responsibleBrokerLicense: (profile as CiteAgentProfile)
          .responsibleBrokerLicense,
        jurisdiction,
      },
    })
      .then((record) => {
        if (active) setScan(record);
      })
      .catch(() => {
        // A missing historical scan is a normal first-run state.
      });
    return () => {
      active = false;
    };
  }, [
    profile?.website,
    profile?.name,
    profile?.license,
    (profile as CiteAgentProfile | null)?.responsibleBrokerLicense,
    jurisdiction,
  ]);

  useEffect(() => {
    const code = (profile as CiteAgentProfile | null)?.licenseJurisdiction;
    if (code && US_JURISDICTIONS.includes(code as CiteJurisdiction))
      setJurisdiction(code as CiteJurisdiction);
  }, [profile]);

  const reportProfile = useMemo(() => {
    if (!profile) return null;
    const patch = Object.fromEntries(
      Object.entries(scan?.profilePatch || {}).filter(
        ([, value]) => value !== undefined,
      ),
    );
    return {
      ...(profile as CiteAgentProfile),
      ...patch,
      siteAudit:
        scan?.siteAudit || (profile as CiteAgentProfile).siteAudit,
    } as CiteAgentProfile;
  }, [profile, scan]);

  // Browser/localStorage inventory is useful workflow context, but it is not
  // an authorization boundary. CiteLock will not treat a client-supplied
  // attestation string as provider proof; the future server MLS adapter must
  // return the scored observations directly.
  const reportProperties = useMemo(
    () =>
      properties.map((property) => {
        const citeProperty = property as CiteProperty;
        return {
          ...citeProperty,
          source: citeProperty.source
            ? {
                ...citeProperty.source,
                trust: "client_import" as const,
                attestationId: undefined,
              }
            : undefined,
        };
      }),
    [properties],
  );

  const report = useMemo(
    () =>
      scoreAieo({
        profile: reportProfile,
        properties: reportProperties,
        voice: memory?.preferredVoice,
        evidence: scan?.evidence,
        evaluatedAt: scoreClock,
      }),
    [reportProfile, reportProperties, memory?.preferredVoice, scan, scoreClock],
  );

  const runVerifiedScan = async () => {
    if (!profile?.website || !profile.name) {
      toast.error("Add your name and public website before scanning");
      return;
    }
    setScanBusy(true);
    setScanError(null);
    try {
      const record = await runMyCiteLockScan({
        data: {
          website: profile.website,
          agentName: profile.name,
          license: profile.license || undefined,
          responsibleBrokerLicense: (profile as CiteAgentProfile)
            .responsibleBrokerLicense,
          jurisdiction,
        },
      });
      setScan(record);
      toast.success("Verified CiteLock scan saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scan failed";
      setScanError(message);
      toast.error(message);
    } finally {
      setScanBusy(false);
    }
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.message("Select and copy");
    }
  };

  const statusVariant =
    report.readiness.status === "publish_ready"
      ? "success"
      : report.readiness.status === "blocked"
        ? "danger"
        : "secondary";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="space-y-3 p-5 sm:p-7">
          <Badge variant="accent">
            <Radar className="h-3 w-3" />
            CiteLock™ Beta · logic v{report.algorithmVersion}
          </Badge>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Lock the agent, brokerage, market, and evidence into one citable graph
          </h1>
          <p className="max-w-3xl text-sm text-[var(--color-fg-muted)]">
            CiteScore measures verified publishing readiness. Recognition is a
            separate observed metric and remains unmeasured until controlled
            model runs exist. No score guarantees a citation or ranking.
          </p>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-[var(--color-primary)]" />
            Verified evidence scan
          </CardTitle>
          <CardDescription>
            Re-audit the public site and verify the license against the state
            registry. California is the San Diego pilot adapter; every other
            jurisdiction fails explicitly to unverified until its adapter ships.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="text-xs font-medium" htmlFor="citelock-jurisdiction">
              License jurisdiction
            </label>
            <select
              id="citelock-jurisdiction"
              value={jurisdiction}
              onChange={(event) =>
                setJurisdiction(event.target.value as CiteJurisdiction)
              }
              className="min-h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm"
            >
              {US_JURISDICTIONS.map((code) => (
                <option key={code} value={code}>
                  {JURISDICTION_LABELS[code]}
                </option>
              ))}
            </select>
            <Button
              type="button"
              onClick={runVerifiedScan}
              disabled={scanBusy || !profile?.website || !profile?.name}
            >
              {scanBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {scanBusy ? "Scanning public evidence…" : "Run verified scan"}
            </Button>
          </div>
          {!profile?.website && (
            <p className="text-xs text-[var(--color-fg-muted)]">
              Add a public website in Profile before running CiteLock.
            </p>
          )}
          {scanError && (
            <p className="text-xs text-[var(--color-danger)]">{scanError}</p>
          )}
          {scan && (
            <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
              <div className="text-xs font-medium">
                Last reproducible scan · {new Date(scan.evaluatedAt).toLocaleString()}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {scan.sourceOutcomes.map((outcome, index) => (
                  <div key={`${outcome.source}:${index}`} className="text-xs">
                    <Badge
                      variant={
                        outcome.status === "verified"
                          ? "success"
                          : outcome.status === "mismatch" ||
                              outcome.status === "unavailable"
                            ? "danger"
                            : "secondary"
                      }
                      className="mr-2 capitalize"
                    >
                      {outcome.status}
                    </Badge>
                    {outcome.url ? (
                      <a
                        href={outcome.url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {outcome.label} <ExternalLink className="inline h-3 w-3" />
                      </a>
                    ) : (
                      outcome.label
                    )}
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
              <span className="font-display text-5xl">{report.total}</span>
              <span className="pb-1 text-sm text-[var(--color-fg-muted)]">/ 100</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge variant={statusVariant} className="capitalize">
              {report.readiness.status.replace(/_/g, " ")}
            </Badge>
            <Badge variant="outline">Grade {report.grade}</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Evidence coverage</CardDescription>
            <CardTitle className="font-display text-5xl">
              {report.readiness.evidenceCoverage}%
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-[var(--color-fg-muted)]">
            Weighted by source authority and verification status. First-party
            claims never equal regulator or MLS proof.
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Observed recognition</CardDescription>
            <CardTitle className="font-display text-3xl">
              {report.recognition
                ? report.recognition.state === "measured"
                  ? `${report.recognition.mentionRate}%`
                  : "Insufficient sample"
                : "Not measured"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-[var(--color-fg-muted)]">
            {report.recognition
              ? `${report.recognition.runs} controlled run(s) across ${report.recognition.providers.join(", ")}. ${report.recognition.state === "insufficient" ? "Need 18 runs, 3 engines, and 3 prompt families." : "Sampling threshold met."}`
              : "Run the frozen prompt panel before reporting model visibility."}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div>
            <CardTitle className="text-base">CiteLock command center</CardTitle>
            <CardDescription>{report.summary}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(TAB_LABEL) as Tab[]).map((item) => (
              <Button
                key={item}
                size="sm"
                variant={tab === item ? "default" : "outline"}
                onClick={() => setTab(item)}
              >
                {TAB_LABEL[item]}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {tab === "overview" && (
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <h2 className="mb-2 text-sm font-semibold">Readiness pillars</h2>
                  <div className="space-y-3">
                    {(Object.keys(report.pillars) as Array<keyof typeof report.pillars>).map((key) => {
                      const pillar = report.pillars[key];
                      return (
                        <div key={key}>
                          <div className="mb-1 flex justify-between text-xs">
                            <span>{AIEO_PILLAR_LABEL[key]}</span>
                            <span className="text-[var(--color-fg-subtle)]">
                              {pillar.score}/{pillar.max}
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-bg-elevated)]">
                            <div
                              className="h-full bg-[var(--color-primary)]"
                              style={{ width: `${Math.round((pillar.score / pillar.max) * 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h2 className="mb-2 text-sm font-semibold">Publishing gates</h2>
                  <div className="space-y-2">
                    {report.gates.map((gate) => (
                      <div
                        key={gate.id}
                        className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3"
                      >
                        <div className="flex items-center gap-2">
                          {gate.status === "pass" ? (
                            <ShieldCheck className="h-4 w-4 text-[var(--color-success)]" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-[var(--color-warning)]" />
                          )}
                          <span className="text-sm font-medium">{gate.label}</span>
                          <Badge
                            variant={gate.status === "block" ? "danger" : gate.status === "pass" ? "success" : "secondary"}
                            className="ml-auto capitalize"
                          >
                            {gate.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{gate.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <h2 className="mb-2 text-sm font-semibold">Highest-impact actions</h2>
                <div className="space-y-2">
                  {report.actions.length ? (
                    report.actions.slice(0, 8).map((action) => (
                      <div
                        key={action.id}
                        className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3"
                      >
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={action.severity === "blocking" ? "danger" : "secondary"}
                            className="capitalize"
                          >
                            {action.severity}
                          </Badge>
                          <span className="text-sm font-medium">{action.issue}</span>
                          <span className="ml-auto text-xs text-[var(--color-fg-subtle)]">
                            +{action.pointsAvailable} available
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{action.fix}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--color-fg-muted)]">No open readiness actions.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "evidence" && (
            <div className="space-y-4">
              {report.conflicts.map((conflict) => (
                <div
                  key={conflict.id}
                  className="rounded-[var(--radius-md)] border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/5 p-3"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-[var(--color-danger)]" />
                    <span className="text-sm font-semibold">Conflicting {conflict.field.replace(/_/g, " ")}</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{conflict.message}</p>
                  <p className="mt-1 text-xs">{conflict.values.join(" ↔ ")}</p>
                </div>
              ))}
              <div className="grid gap-3 md:grid-cols-2">
                {report.evidence.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3"
                  >
                    <div className="flex items-start gap-2">
                      <Link2 className="mt-0.5 h-4 w-4 text-[var(--color-primary)]" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{item.field.replace(/_/g, " ")}</span>
                          <Badge variant={item.status === "verified" ? "success" : item.status === "conflicted" ? "danger" : "secondary"} className="ml-auto capitalize">
                            {item.status}
                          </Badge>
                        </div>
                        <p className="mt-1 break-words text-xs">{item.value}</p>
                        <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                          {item.sourceLabel} · {item.sourceTier.replace(/_/g, " ")}
                          {item.observedAt ? ` · observed ${item.observedAt.slice(0, 10)}` : ""}
                        </p>
                        {item.sourceUrl && (
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
                          >
                            Open source <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "answers" && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--color-fg-muted)]">
                All generated answers require human review. CiteLock suppresses unsupported “best,” ranking,
                production, and representation claims.
              </p>
              {report.faqs.map((faq) => (
                <div
                  key={faq.question}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{faq.question}</span>
                        <Badge variant={faq.publishable ? "success" : "secondary"}>
                          {faq.publishable ? "Sources attached" : "Draft only"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--color-fg-muted)]">{faq.answer}</p>
                      <p className="mt-2 text-[11px] text-[var(--color-fg-subtle)]">
                        Evidence: {faq.evidenceIds.length ? faq.evidenceIds.join(", ") : "none"}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => copy(`${faq.question}\n${faq.answer}`, "Answer") }>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "schema" && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--color-fg-muted)]">
                The person and responsible brokerage are separate linked entities. Publish only where the same
                facts are visible on-page, then validate the deployed URL.
              </p>
              <pre className="max-h-[32rem] overflow-auto rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] p-3 text-[11px]">
                {JSON.stringify(report.jsonLd, null, 2)}
              </pre>
              <Button
                disabled={report.readiness.status !== "publish_ready"}
                onClick={() => copy(JSON.stringify(report.jsonLd, null, 2), "JSON-LD")}
              >
                <Copy className="h-4 w-4" /> Copy schema
              </Button>
              {report.readiness.status !== "publish_ready" && (
                <p className="text-xs text-[var(--color-fg-muted)]">
                  Complete every publishing gate before exporting
                  machine-readable claims.
                </p>
              )}
            </div>
          )}

          {tab === "recognition" && (
            <div className="space-y-4">
              <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-[var(--color-primary)]" />
                  <span className="text-sm font-semibold">
                    {report.recognition ? "Controlled recognition results" : "Recognition is not measured"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
                  {report.recognition
                    ? `${report.recognition.citationRate}% citation rate, ${report.recognition.identityAccuracy}% correct identity, and ${report.recognition.brokerageAccuracy}% correct brokerage attribution.`
                    : "CiteScore is not an LLM ranking. Freeze these prompts, retain raw answers and citations, and compare model, location, and date over time."}
                </p>
              </div>
              <div className="space-y-2">
                {report.queryPlan.map((query) => (
                  <div
                    key={query.id}
                    className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="capitalize">{query.category}</Badge>
                      <Badge variant={query.readiness === "ready" ? "success" : "secondary"} className="capitalize">
                        {query.readiness}
                      </Badge>
                      {query.mode === "measurement_only" && <Badge variant="secondary">Measure only</Badge>}
                    </div>
                    <p className="mt-2 text-sm">{query.prompt}</p>
                    <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                      Evidence: {query.evidenceIds.length ? query.evidenceIds.join(", ") : "none"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-[var(--color-primary)]" />
            Provider-verified listing answers
          </CardTitle>
          <CardDescription>
            Only active public listings with current MLS/provider role evidence appear here.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {report.listingBlurbs.length ? (
            report.listingBlurbs.map((blurb) => (
              <div key={blurb.id} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium">{blurb.title}</div>
                  <Button size="sm" variant="ghost" onClick={() => copy(blurb.blurb, "Listing answer") }>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="mt-1 text-xs text-[var(--color-fg-muted)]">{blurb.blurb}</p>
                <a href={blurb.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline">
                  Verify source <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--color-fg-muted)]">
              No publishable represented inventory. Website/IDX cards remain unverified until current provider
              attribution matches this agent or co-agent.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
