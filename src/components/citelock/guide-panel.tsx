import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Download, ExternalLink, FileText, Loader2, Lock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createMyGuide, exportMyGuide, getMyGuides, updateMyGuideStep } from "@/lib/aieo/guide-api";
import { guideInputSchema, type GuideInput, type GuideView } from "@/lib/aieo/guide";
import { useAppStore } from "@/lib/store";

const fields = [
  ["name","Agent, team or brokerage name", "Your public name"],
  ["area","Target locale", "City, region or service area"],
  ["website","Personal or business website", "https://your-website.com/about"],
  ["brokerage","Brokerage name (optional)", "Your current brokerage"],
  ["brokerUrl","Broker profile URL (optional)", "https://broker.com/your-profile"],
  ["rankingUrl","Ranking or recognition URL (optional)", "https://publisher.com/your-profile"],
  ["additionalUrl","Additional evidence URL (optional)", "A public biography, award or case page"],
] as const;

export function GuidePanel() {
  const profile = useAppStore(s => s.agentProfile);
  const [input, setInput] = useState<GuideInput>(() => ({
    name:profile?.name || "", area:profile?.areaOfOperations || "", website:profile?.website || "",
    entityKind:"agent", brokerage:profile?.brokerage || "", brokerUrl:"", rankingUrl:"", additionalUrl:"",
  }));
  const [guides,setGuides] = useState<GuideView[]>([]);
  const [selected,setSelected] = useState<string | null>(null);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [exporting,setExporting] = useState(false);
  const [saving,setSaving] = useState<string | null>(null);
  const [error,setError] = useState("");
  const [historyError,setHistoryError] = useState("");
  const guide = guides.find(g => g.id === selected) || guides[0];
  const load = useCallback(async () => {
    setLoading(true); setHistoryError("");
    try { setGuides(await getMyGuides()); }
    catch { setHistoryError("We could not load your saved guides. Retry to restore your history."); }
    finally { setLoading(false); }
  },[]);
  useEffect(() => { void load(); },[load]);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    const parsed = guideInputSchema.safeParse(input);
    if (!parsed.success) {setError(parsed.error.issues[0]?.message || "Check your details.");return;}
    setBusy(true); setError("");
    try {
      const next = await createMyGuide({data:parsed.data});
      setGuides(old => [next,...old].slice(0,10)); setSelected(next.id);
      toast.success("Your source-backed guide is saved.");
    } catch(e) {setError(e instanceof Error ? e.message : "Could not create the guide. Please retry.");}
    finally {setBusy(false);}
  }
  async function toggle(stepId: string, complete: boolean) {
    if (!guide) return;
    const previous = guide;
    setSaving(stepId);
    setGuides(old => old.map(g => g.id === guide.id ? {...g,completedStepIds:complete ? [...new Set([...g.completedStepIds,stepId])] : g.completedStepIds.filter(id=>id!==stepId)} : g));
    try {
      const next = await updateMyGuideStep({data:{id:guide.id,stepId,complete}});
      setGuides(old => old.map(g => g.id === next.id ? next : g));
    } catch {
      setGuides(old=>old.map(g=>g.id===previous.id ? previous : g));
      toast.error("That change was not saved. Retry; your prior progress is intact.");
    }
    finally {setSaving(null);}
  }
  async function download() {
    if (!guide) return;
    setExporting(true);
    try {
      const current = await exportMyGuide({data:{id:guide.id}});
      setGuides(old=>old.map(g=>g.id===current.guide.id ? current.guide : g));
      const blob = new Blob([current.markdown],{type:"text/markdown;charset=utf-8"});
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href=url; a.download="citelock-visibility-guide.md"; a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch { toast.error("Could not export the current guide. Check your connection and retry."); }
    finally { setExporting(false); }
  }
  return <div className="space-y-6" data-testid="citelock-guide">
    <section className="overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-8">
      <Badge variant="accent"><FileText className="h-3 w-3" /> CiteLock · your visibility playbook</Badge>
      <h1 className="mt-4 max-w-3xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">Make your strongest evidence easier to find.</h1>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--color-fg-muted)]">
        Turn your website, brokerage profile and public recognition into a practical plan for being understood by AI search.
        Get three useful actions free, or the complete plan with full access. You choose what to publish.
      </p>
      <div className="mt-5 flex flex-wrap gap-3 text-xs text-[var(--color-fg-muted)]">
        <span>Source-linked findings</span><span>•</span><span>No MLS connection required</span><span>•</span><span>Saved progress + export</span>
      </div>
    </section>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,350px)_minmax(0,1fr)]">
      <Card>
        <CardHeader><CardTitle className="text-base">Start with the assets you have</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={create} className="space-y-4">
            <fieldset disabled={busy} className="space-y-4">
              <label className="block text-xs font-medium" htmlFor="guide-entityKind">Identity type
                <select id="guide-entityKind" className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm" value={input.entityKind}
                  onChange={e=>setInput(old=>({...old,entityKind:e.target.value as GuideInput["entityKind"]}))}>
                  <option value="agent">Individual agent</option><option value="team">Team</option><option value="brokerage">Brokerage</option>
                </select>
              </label>
              {fields.map(([key,label,placeholder])=><div key={key}>
                <label htmlFor={"guide-"+key} className="text-xs font-medium">{label}</label>
                <Input id={"guide-"+key} className="mt-1" value={input[key]} placeholder={placeholder}
                  required={["name","area","website"].includes(key)} maxLength={key.includes("Url") || key==="website" ? 1000 : 160}
                  type={key.includes("Url") || key==="website" ? "url" : "text"}
                  onChange={e=>setInput(old=>({...old,[key]:e.target.value}))} />
              </div>)}
            </fieldset>
            <p className="text-xs leading-relaxed text-[var(--color-fg-muted)]">Use exact public pages. We inspect up to four URLs; private pages and conflicting claims stay unresolved. Three inspections per day. No API key or paid visibility batch is needed.</p>
            {error && <p role="alert" className="text-sm text-[var(--color-danger)]">{error}</p>}
            <Button type="submit" disabled={busy || loading} className="w-full">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {busy ? "Inspecting your sources…" : "Build my visibility guide"}
            </Button>
            {busy && <p role="status" className="text-xs text-[var(--color-fg-muted)]">Checking public text and preparing your instructions. This can take up to 20 seconds.</p>}
          </form>
        </CardContent>
      </Card>
      <div className="min-w-0 space-y-5">
        {loading && <p role="status" className="flex gap-2 p-5 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading saved guides…</p>}
        {historyError && <Card><CardContent className="space-y-3 pt-5"><p role="alert">{historyError}</p><Button onClick={()=>void load()} variant="outline"><RefreshCw className="h-4 w-4"/> Retry saved guides</Button></CardContent></Card>}
        {!guide && !loading && <Card><CardContent className="space-y-4 p-6 sm:p-8">
          <FileText className="h-8 w-8 text-[var(--color-primary)]" />
          <h2 className="font-display text-xl font-semibold">Your next steps, grounded in your sources.</h2>
          <p className="text-sm text-[var(--color-fg-muted)]">Add your name, locale and website. A ranking is useful when you have one; your professional identity and real client expertise are useful assets too.</p>
          <ul className="list-disc space-y-2 pl-5 text-sm"><li>See what the inspected pages actually support.</li><li>Get cautious wording for supported recognition.</li><li>Follow a prioritized, manual implementation plan.</li></ul>
          <p className="text-xs text-[var(--color-fg-muted)]">This assessment does not claim you already appear in LLM answers. Optional paid measurements are available in the advanced workspace.</p>
        </CardContent></Card>}
        {guide && <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="guide-history" className="text-xs font-medium">Saved guide</label>
              <select id="guide-history" value={guide.id} onChange={e=>setSelected(e.target.value)}
                className="mt-1 block w-full max-w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm">
                {guides.map(g=><option key={g.id} value={g.id}>{g.analysis.input.name} · {new Date(g.createdAt).toLocaleString()}</option>)}
              </select>
            </div>
            <Button variant="outline" disabled={exporting} onClick={()=>void download()}>{exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export guide</Button>
          </div>
          <Card>
            <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-lg">What your sources support</CardTitle><Badge variant={guide.tier==="full" ? "accent":"outline"}>{guide.tier==="full" ? "Full guide":"Free basic guide"}</Badge></div></CardHeader>
            <CardContent className="space-y-4">
              {guide.analysis.recommendedClaim && <div className="rounded-xl bg-[var(--color-primary-soft)] p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">Suggested source-attributed wording</p>
                <p className="mt-2 text-sm font-medium">{guide.analysis.recommendedClaim}</p>
                <p className="mt-2 text-xs text-[var(--color-fg-muted)]">Keep the original category, year and publisher. Review before publication.</p>
              </div>}
              {guide.analysis.conflicts.map((text,i)=><p key={i} role="alert" className="break-words rounded-xl border border-[var(--color-warning)] p-3 text-sm">{text}</p>)}
              {guide.analysis.sources.map((source,i)=><details key={source.role+i} className="rounded-xl border border-[var(--color-border)] p-3" open={source.status!=="matched"}>
                <summary className="cursor-pointer text-sm font-medium capitalize">{source.role} · {source.status === "matched" ? "Identity text matched" : source.status}</summary>
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-start gap-1 break-all text-xs text-[var(--color-primary)]">{source.url}<ExternalLink className="h-3 w-3 shrink-0"/></a>
                <p className="mt-2 text-xs text-[var(--color-fg-muted)]">{source.note}</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">{source.facts.map(f=><li key={f}>{f}</li>)}</ul>
                <p className="mt-2 text-[11px] text-[var(--color-fg-subtle)]">Observed {new Date(source.observedAt).toLocaleString()}</p>
              </details>)}
            </CardContent>
          </Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl font-semibold">Your prioritized action plan</h2>
            <span role="status" className="text-xs text-[var(--color-fg-muted)]">{saving ? "Saving progress…" : `${guide.completedStepIds.length} of ${guide.steps.length} marked complete`}</span>
          </div>
          <ol className="space-y-4">
            {guide.steps.map((step,index)=><li key={step.id}><Card>
              <CardHeader><div className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-sm font-semibold text-[var(--color-primary)]">{guide.completedStepIds.includes(step.id) ? <CheckCircle2 className="h-4 w-4"/> : index+1}</span>
                <div><p className="text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)]">{step.priority} · {step.effort}</p><CardTitle className="mt-1 text-base">{step.title}</CardTitle></div>
              </div></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-[var(--color-fg-muted)]">{step.why}</p>
                <ul className="list-disc space-y-2 break-words pl-5">{step.instructions.map((line,i)=><li key={i}>{line}</li>)}</ul>
                <p className="rounded-lg bg-[var(--color-bg-elevated)] p-3 text-xs"><strong>Done when: </strong>{step.doneWhen}</p>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-[var(--color-fg-muted)]">Owner: {step.owner}</span>
                  <label className="flex cursor-pointer items-center gap-2 text-xs">
                    <input type="checkbox" checked={guide.completedStepIds.includes(step.id)} disabled={saving!==null}
                      onChange={e=>void toggle(step.id,e.target.checked)} /> Mark step {index+1} complete
                  </label>
                </div>
              </CardContent>
            </Card></li>)}
          </ol>
          {guide.lockedStepCount>0 && <Card className="border-[var(--color-primary)]">
            <CardContent className="space-y-3 p-5">
              <Lock className="h-5 w-5 text-[var(--color-primary)]" />
              <h3 className="font-display text-lg font-semibold">Go from first actions to a complete plan</h3>
              <p className="text-sm text-[var(--color-fg-muted)]">Full access adds {guide.lockedStepCount} detailed steps: evidence placement, technical inspection, profile corrections, social distribution, comparable measurement and a four-week plan.</p>
              <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-primary)]">View full access <ArrowRight className="h-4 w-4" /></Link>
            </CardContent>
          </Card>}
          <details className="rounded-xl border border-[var(--color-border)] p-4 text-xs text-[var(--color-fg-muted)]">
            <summary className="cursor-pointer font-semibold">Methodology and limits</summary>
            <ul className="mt-3 list-disc space-y-2 pl-4">{guide.limitations.map(l=><li key={l}>{l}</li>)}</ul>
            <a href={guide.methodologyUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-[var(--color-primary)]">Google Search guidance for AI features</a>
          </details>
        </>}
      </div>
    </div>
  </div>;
}
