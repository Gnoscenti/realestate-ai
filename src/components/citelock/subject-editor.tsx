import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMyVisibilitySubjects, saveMyVisibilitySubject } from "@/lib/aieo/visibility/api";
import { subjectInputSchema, type SavedSubject, type SubjectInput } from "@/lib/aieo/visibility/subjects";
import { type EntityKind } from "@/lib/aieo/visibility/expertise";
import { US_JURISDICTIONS } from "@/lib/aieo/scan-types";

type Draft = { name: string; website: string; area: string; license: string; jurisdiction: SubjectInput["jurisdiction"] };
const blank = (): Draft => ({ name: "", website: "", area: "", license: "", jurisdiction: "US-CA" });
function fromInput(input: SubjectInput): Draft {
  return { name: input.agentName, website: input.website, area: input.area, license: input.license || "", jurisdiction: input.jurisdiction };
}
export function SubjectEditor({ initialAgent, disabled, onChange }: {
  initialAgent: { name: string; website: string; areaOfOperations: string; license?: string } | null;
  disabled: boolean;
  onChange: (subject: SubjectInput | null) => void;
}) {
  const [kind, setKind] = useState<EntityKind>("agent");
  const [drafts, setDrafts] = useState<Record<EntityKind, Draft>>(() => ({
    agent: initialAgent ? { ...blank(), name: initialAgent.name, website: initialAgent.website, area: initialAgent.areaOfOperations, license: initialAgent.license || "" } : blank(),
    team: blank(), brokerage: blank(),
  }));
  const [saved, setSaved] = useState<SavedSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    void getMyVisibilitySubjects().then(rows => {
      if (!active) return;
      setSaved(rows); setLoaded(true);
      if (rows.length) {
        setDrafts(previous => {
          const next = { ...previous };
          for (const row of rows) next[row.input.entityKind] = fromInput(row.input);
          return next;
        });
        setKind(rows[0].input.entityKind);
      }
      setLoading(false);
    }).catch(e => {
      if (active) { setError(e instanceof Error ? e.message : "Could not load saved identities."); setLoading(false); }
    });
    return () => { active = false; };
  }, [reload]);
  const draft = drafts[kind];
  const current = saved.find(row => row.input.entityKind === kind);
  const parsed = useMemo(() => subjectInputSchema.safeParse({
    agentName: draft.name, website: draft.website, area: draft.area,
    jurisdiction: draft.jurisdiction, entityKind: kind, license: kind === "agent" && draft.license ? draft.license : undefined,
  }), [draft, kind]);
  const unchanged = Boolean(current && parsed.success && JSON.stringify(parsed.data) === JSON.stringify(current.input));
  const selected = !loading && !error && unchanged ? current?.input ?? null : null;
  useEffect(() => { onChange(selected); }, [selected, onChange]);
  const change = (key: keyof Draft, value: string) => {
    setDrafts(previous => ({ ...previous, [kind]: { ...previous[kind], [key]: value } }));
    setNotice("");
  };
  async function save() {
    if (!parsed.success) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const row = await saveMyVisibilitySubject({ data: { input: parsed.data, expectedRevision: current?.revision || 0 } });
      setSaved(previous => [row, ...previous.filter(item => item.input.entityKind !== kind)]);
      setDrafts(previous => ({ ...previous, [kind]: fromInput(row.input) }));
      setNotice("Subject saved to your workspace."); setEditing(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save this subject."); }
    finally { setSaving(false); }
  }
  if (loading) return <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading saved identities…</p>;
  // A failed initial read must never appear as an empty workspace or permit a blind overwrite.
  if (error && !loaded) return <div role="alert" className="space-y-2 text-sm">
    <p>{error}</p><Button variant="outline" onClick={() => setReload(n => n + 1)}>Reload saved identities</Button>
  </div>;
  const locked = disabled || saving;
  const showFields = !unchanged || editing;
  return <div className="space-y-3">
    {!saved.length && <p className="text-sm font-medium">Set up your profile to start</p>}
    <p className="text-xs text-[var(--color-fg-muted)]">Save each identity to use it across devices. Evidence stays with the identity it originally described.</p>
    <div className="max-w-md"><Label htmlFor="citelock-entity">Subject type</Label><select id="citelock-entity" disabled={locked} value={kind}
        onChange={e => { setKind(e.target.value as EntityKind); setNotice(""); setEditing(false); }} className="mt-1.5 w-full rounded-md border bg-background p-2 text-sm">
        <option value="agent">Individual agent</option><option value="team">Team</option><option value="brokerage">Brokerage</option>
      </select></div>
    {!showFields && <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--color-border)] p-3">
      <div className="min-w-0 text-sm"><strong>{draft.name}</strong><p className="mt-1 break-words text-xs text-[var(--color-fg-muted)]">{draft.area} · {draft.website}</p></div>
      <Button size="sm" variant="outline" disabled={locked} onClick={() => setEditing(true)}>Edit saved subject</Button>
    </div>}
    <div className={showFields ? "grid gap-3 sm:grid-cols-2" : "hidden"}>
      <div><Label htmlFor="citelock-area">Market area used in client questions</Label><Input id="citelock-area" className="mt-1.5" value={draft.area} disabled={locked} onChange={e => change("area",e.target.value)} placeholder="Rancho Santa Fe, CA" /></div>
      <div><Label htmlFor={kind === "agent" ? "citelock-agent-name" : "citelock-organization-name"}>Exact {kind} name</Label>
        <Input id={kind === "agent" ? "citelock-agent-name" : "citelock-organization-name"} value={draft.name} disabled={locked} onChange={e => change("name",e.target.value)} className="mt-1.5" /></div>
      <div><Label htmlFor={kind === "agent" ? "citelock-agent-website" : "citelock-organization-website"}>Public {kind} website (HTTPS)</Label>
        <Input id={kind === "agent" ? "citelock-agent-website" : "citelock-organization-website"} value={draft.website} disabled={locked} onChange={e => change("website",e.target.value)} className="mt-1.5" /></div>
      <div><Label htmlFor="citelock-subject-jurisdiction">State</Label><select id="citelock-subject-jurisdiction" disabled={locked} value={draft.jurisdiction} onChange={e => change("jurisdiction",e.target.value)} className="mt-1.5 w-full rounded-md border bg-background p-2 text-sm">
        {US_JURISDICTIONS.map(code => <option key={code} value={code}>{code.slice(3)}</option>)}
      </select></div>
      {kind === "agent" && <div><Label htmlFor="citelock-agent-license">License number (optional)</Label><Input id="citelock-agent-license" value={draft.license} disabled={locked} onChange={e => change("license",e.target.value)} className="mt-1.5" /></div>}
    </div>
    {kind !== "agent" && <p className="text-xs text-[var(--color-fg-muted)]">Use the organization's own identity. Individual evidence and license details are not transferred.</p>}
    {!unchanged && !parsed.success && <p className="text-xs text-[var(--color-fg-muted)]">Enter an exact name, valid HTTPS website and market area. Optional licenses must be 6–12 digits.</p>}
    <div className="flex flex-wrap items-center gap-2">
      {showFields && <Button variant="outline" disabled={locked || !parsed.success || unchanged} onClick={save}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save subject
      </Button>}
      <span role="status" className="text-xs text-[var(--color-fg-muted)]">{notice || (unchanged ? "Saved to your workspace" : "Save changes before using this subject.")}</span>
    </div>
    {error && <div role="alert" className="space-y-2 text-sm text-[var(--color-danger)]"><p>{error}</p><Button variant="outline" onClick={() => setReload(n => n + 1)}>Reload saved identities</Button></div>}
  </div>;
}
