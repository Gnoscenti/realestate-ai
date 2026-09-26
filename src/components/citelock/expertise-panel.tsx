import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, BookOpen, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getMyExpertise, inspectMyExpertisePage, saveMyExpertise, withdrawMyExpertise } from "@/lib/aieo/visibility/api";
import { EXPERTISE_TOPICS, summarizeExpertise, type ExpertiseSource, type EntityKind } from "@/lib/aieo/visibility/expertise";
import type { CiteLockScanInput } from "@/lib/aieo/scan-types";

type SubjectInput = CiteLockScanInput & {area:string;entityKind:EntityKind};
const empty=(subject:SubjectInput):ExpertiseSource=>({
  topic:"communication",entityKind:subject.entityKind,entityName:subject.agentName,
  kind:"declaration",url:"",sourceLabel:"",sourceDate:new Date().toISOString().slice(0,10),
  excerpt:"",statement:"",polarity:"supporting",permission:"authorized",permissionNote:"",
  publishAllowed:false,identityReviewed:true,
});
export function ExpertisePanel({subject,fingerprint,onSaved}:{subject:SubjectInput;fingerprint:string;onSaved:()=>Promise<void>}) {
  const [data,setData]=useState<Awaited<ReturnType<typeof getMyExpertise>>|null>(null);
  const [form,setForm]=useState(()=>empty(subject));
  const [pageUrl,setPageUrl]=useState(subject.website);
  const [inspected,setInspected]=useState<Awaited<ReturnType<typeof inspectMyExpertisePage>>|null>(null);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [reviewed,setReviewed]=useState(false);
  const [withdrawReason,setWithdrawReason]=useState<Record<string,string>>({});
  const load=async()=>setData(await getMyExpertise({data:{subjectFingerprint:fingerprint}}));
  useEffect(()=>{
    let active=true;
    setData(null);setForm(empty(subject));setInspected(null);setReviewed(false);
    void getMyExpertise({data:{subjectFingerprint:fingerprint}}).then(value=>{if(active)setData(value);})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:"Could not load evidence");});
    return ()=>{active=false;};
  },[fingerprint,subject]);
  async function inspect() {
    setBusy("inspect");setError(null);
    try {
      const result=await inspectMyExpertisePage({data:{subject,url:pageUrl}});
      setInspected(result);await load();await onSaved();
      toast.message(result.identityMatched ? "Public page observed. Review any passages before adding evidence." : "Identity is ambiguous; no expertise was attributed.");
    } catch(e) {setError(e instanceof Error?e.message:"Could not inspect the page");}
    finally {setBusy(null);}
  }
  async function save() {
    setBusy("save");setError(null);
    try {
      await saveMyExpertise({data:{subject,source:{...form,entityName:subject.agentName,entityKind:subject.entityKind}}});
      await load();await onSaved();setForm(empty(subject));setReviewed(false);toast.success("Source evidence saved");
    } catch(e) {setError(e instanceof Error?e.message:"Could not save evidence");}
    finally {setBusy(null);}
  }
  async function withdraw(id:string) {
    setBusy(id);setError(null);
    try {
      await withdrawMyExpertise({data:{id,reason:withdrawReason[id] || ""}});
      await load();await onSaved();toast.success("Evidence withdrawn; history retained");
    } catch(e) {setError(e instanceof Error?e.message:"Could not withdraw evidence");}
    finally {setBusy(null);}
  }
  const themes=data?summarizeExpertise(data.evidence,subject.entityKind,subject.agentName):[];
  const field=(key:"url"|"sourceLabel"|"sourceDate"|"permissionNote",label:string)=><div key={key}>
    <Label htmlFor={"expertise-"+key}>{label}</Label>
    <Input id={"expertise-"+key} type={key==="sourceDate"?"date":"text"} className="mt-1"
      value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} />
  </div>;
  return <div className="space-y-4">
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5"/>Supported expertise</CardTitle>
      <CardDescription>Start with the work this {subject.entityKind} can support with evidence. Client comments are reports, not audited results; source selection and missing data limit what we can conclude.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{themes.map(t=><div key={t.topic} className="rounded-lg border p-3">
          <p className="text-sm font-medium">{t.label}</p><Badge variant={t.status==="supported"?"success":"outline"} className="mt-2">
            {t.status==="supported"?"Source-supported":t.status==="needs_review"?"Contradictory evidence — review":"Insufficient evidence"}
          </Badge><p className="mt-1 text-xs text-muted-foreground">{t.evidence.length} unique source excerpts · {t.publishable.length} permitted for publication</p>
        </div>)}</div>
        {!data && !error && <p role="status">Loading saved evidence…</p>}
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"><div>
          <Label htmlFor="expertise-page">Public website or accurately matched profile</Label>
          <Input id="expertise-page" value={pageUrl} onChange={e=>setPageUrl(e.target.value)} /></div>
          <Button disabled={!!busy || !pageUrl} onClick={inspect}>{busy==="inspect"?<Loader2 className="h-4 w-4 animate-spin"/>:null}Inspect public page</Button>
        </div>
        <p className="text-xs text-muted-foreground">Checks one text-accessible page, with a source timestamp and content digest. Add relevant biography and service pages individually. No MLS access is needed.</p>
        {inspected && <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm">{inspected.identityMatched?"Name and local/affiliation context matched — confirm the entity below.":"Unresolved identity: do not attribute this page to the subject."}</p>
          {inspected.suggestions.map((s,i)=><div key={i} className="border-t pt-2">
            <p className="text-xs">{s.statement}</p>
            <Button size="sm" variant="outline" className="mt-1" onClick={()=>{setForm({...empty(subject),
              kind:"website",url:inspected.url,sourceLabel:"Public website observation",topic:s.topic,
              statement:s.statement,excerpt:s.statement,polarity:s.polarity});setReviewed(false);}}>
              Review passage: {EXPERTISE_TOPICS[s.topic]}
            </Button>
          </div>)}
          {inspected.identityMatched && !inspected.suggestions.length && <p className="text-xs">No theme passage found automatically. Inspect the bounded text and select an exact passage, or add permitted client/case material.</p>}
          <details><summary className="cursor-pointer text-xs">Observed public text</summary><p className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">{inspected.text}</p></details>
        </div>}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Add a source-backed passage</CardTitle>
      <CardDescription>Record a short permitted excerpt. A declaration is retained as a declaration and cannot independently establish expertise. Negative and mixed reports stay visible.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="expertise-topic">Expertise topic</Label><select id="expertise-topic" className="mt-1 w-full rounded-md border bg-background p-2 text-sm" value={form.topic} onChange={e=>setForm({...form,topic:e.target.value as ExpertiseSource["topic"]})}>
            {Object.entries(EXPERTISE_TOPICS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div>
          <div><Label htmlFor="expertise-kind">Source type</Label><select id="expertise-kind" className="mt-1 w-full rounded-md border bg-background p-2 text-sm" value={form.kind} onChange={e=>setForm({...form,kind:e.target.value as ExpertiseSource["kind"]})}>
            <option value="declaration">User declaration</option><option value="website">Inspected public website</option>
            <option value="client_report">Permitted client report / review</option><option value="case_material">Authorized case material</option></select></div>
          {field("sourceLabel","Source label")}{field("url","Source URL (required for public evidence)")}
          {field("sourceDate","Date of source material")}
          <div><Label htmlFor="expertise-polarity">Evidence direction</Label><select id="expertise-polarity" className="mt-1 w-full rounded-md border bg-background p-2 text-sm" value={form.polarity} onChange={e=>setForm({...form,polarity:e.target.value as ExpertiseSource["polarity"]})}>
            <option value="supporting">Supporting</option><option value="contradictory">Contradictory / negative</option><option value="mixed">Mixed or uncertain</option></select></div>
        </div>
        <div><Label htmlFor="expertise-excerpt">Permitted source excerpt</Label><Textarea id="expertise-excerpt" value={form.excerpt} onChange={e=>setForm({...form,excerpt:e.target.value})} maxLength={1800}/></div>
        <div><Label htmlFor="expertise-statement">Exact passage to support the expertise (20–600 characters)</Label><Textarea id="expertise-statement" value={form.statement} onChange={e=>setForm({...form,statement:e.target.value})} maxLength={600}/></div>
        {field("permissionNote","Permission or consent basis; omit confidential client details")}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>
          I checked that this source concerns {subject.agentName} ({subject.entityKind}), and I am authorized to store this excerpt for analysis.</label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={form.publishAllowed} onChange={e=>setForm({...form,publishAllowed:e.target.checked})}/>
          I have permission to republish this exact passage and its attribution. Access to a website or image alone does not grant reuse rights.</label>
        <Button disabled={!!busy || !reviewed || form.statement.length<20 || form.permissionNote.length<10} onClick={save}>
          {busy==="save"?<Loader2 className="h-4 w-4 animate-spin"/>:null}Save expertise evidence</Button>
      </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Source history</CardTitle></CardHeader><CardContent className="space-y-3">
      {data?.evidence.length===0 && <p className="text-sm text-muted-foreground">No evidence yet. Insufficient evidence means unknown, not poor service.</p>}
      {data?.evidence.map(e=><div key={e.id} className="rounded-lg border p-3 text-xs">
        <div className="flex flex-wrap items-center gap-2"><strong>{e.sourceLabel}</strong><Badge variant="outline">{e.kind}</Badge><Badge variant={e.polarity==="supporting"?"secondary":"danger"}>{e.polarity}</Badge>
          {e.url && <a href={e.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary">Source <ExternalLink className="h-3 w-3"/></a>}</div>
        <p className="mt-2">{e.statement}</p><p className="mt-1 text-muted-foreground">{e.entityName} · {e.entityKind} · source {e.sourceDate} · recorded {new Date(e.observedAt).toLocaleString()}</p>
        {e.withdrawnAt ? <p className="mt-2 font-medium">Withdrawn {new Date(e.withdrawnAt).toLocaleString()} · {e.withdrawalReason}. Excluded from current recommendations and new approvals.</p> :
          <details className="mt-2"><summary className="cursor-pointer">Withdraw evidence or permission</summary>
            <Label htmlFor={"withdraw-"+e.id}>Reason (retained in history)</Label>
            <Input id={"withdraw-"+e.id} value={withdrawReason[e.id] || ""} onChange={event=>setWithdrawReason({...withdrawReason,[e.id]:event.target.value})} maxLength={500} />
            <Button className="mt-2" size="sm" variant="outline" disabled={!!busy || (withdrawReason[e.id] || "").trim().length<5} onClick={()=>void withdraw(e.id)}>Withdraw this source</Button>
          </details>}
        <p className="mt-1 text-muted-foreground">{e.publishAllowed?"Republication permission declared":"Analysis only — excluded from public drafts"} · {e.permissionNote}</p>
      </div>)}
      {data?.pages.map(page=><p key={page.id} className="text-xs text-muted-foreground">Page observed: {page.url} · {new Date(page.observedAt).toLocaleString()} · {page.identityMatched?"context matched":"identity unresolved"}</p>)}
    </CardContent></Card>
  </div>;
}
