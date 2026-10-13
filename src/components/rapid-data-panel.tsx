import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { useAppStore } from "@/lib/store";
import { searchRapidProperties } from "@/lib/rapidapi/api";
import { rapidQuerySchema, type RapidOperation, type RapidResult, type RapidQuery } from "@/lib/rapidapi/types";

const labels: Record<RapidOperation,string> = {
  search:"Property search",agents:"Agent search",active:"Agent active listings",sold:"Agent sold listings",
  rentals:"Agent rental listings",details:"Property details",address:"Property by address",
  zestimate:"Property Zestimate",coordinates:"Search by coordinates",polygon:"Search by polygon",
};
export function RapidDataPanel() {
  const user=useCurrentUser();
  return <RapidDataSearch key={user?.id || "signed-out"} enabled={Boolean(user)} />;
}
function RapidDataSearch({enabled}:{enabled:boolean}) {
  const [operation,setOperation]=useState<RapidOperation>("search");
  const [query,setQuery]=useState("");
  const [name,setName]=useState("");
  const [homeStatus,setHomeStatus]=useState<RapidQuery["homeStatus"]>("FOR_SALE");
  const [lat,setLat]=useState(""),[long,setLong]=useState(""),[diameter,setDiameter]=useState("1");
  const [result,setResult]=useState<RapidResult|null>(null);
  const [submitted,setSubmitted]=useState<RapidQuery|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return ()=>{alive.current=false;};},[]);
  async function run(page=1) {
    const parsed=rapidQuerySchema.safeParse(page!==1 && submitted ? {...submitted,page} : {
      operation,query,name:name||undefined,page,homeStatus,
      lat:lat.trim()?Number(lat):undefined,long:long.trim()?Number(long):undefined,diameter:Number(diameter),
    });
    if(!parsed.success){setError(parsed.error.issues[0]?.message||"Check the search inputs.");return;}
    setBusy(true);setError("");setResult(null);
    try {
      const response=await searchRapidProperties({data:parsed.data});
      if(alive.current){setResult(response);setSubmitted(parsed.data);if(!response.ok)setError(response.error||"Search unavailable.");}
    }catch {if(alive.current)setError("Search could not complete. Check your session and try again.");}
    finally{if(alive.current)setBusy(false);}
  }
  function importResults() {
    if(!result?.ok)return;
    const incoming=result.listings.flatMap(l=>l.property?[l.property]:[]);
    useAppStore.setState(state=>{
      const ids=new Set(incoming.map(p=>p.id));
      return {properties:[...incoming,...state.properties.filter(p=>!ids.has(p.id))]};
    });
    toast.success(`Added or updated ${incoming.length} market observations. Representation remains unverified.`);
  }
  const genericLabel = operation==="agents" ? "Location slug" :
    ["active","sold","rentals"].includes(operation) ? "Agent encodedZuid" :
    ["details","zestimate"].includes(operation) ? "Zillow property ID (zpid)" :
    operation==="address" ? "Property address" : operation==="polygon" ? "Closed polygon (longitude latitude pairs)" : "Location";
  const imported=result?.listings.filter(l=>l.property).length||0;
  return <Card>
    <CardHeader>
      <CardTitle>Live real estate data</CardTitle>
      <CardDescription>Third-party property data via RapidAPI (Zillow source). Agent identity, listing representation, and display permission remain unverified.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <form className="space-y-3" onSubmit={e=>{e.preventDefault();void run();}}>
        <label className="block text-sm">Lookup
          <select aria-label="RapidAPI lookup" value={operation} disabled={busy} onChange={e=>{setOperation(e.target.value as RapidOperation);setQuery("");setResult(null);setSubmitted(null);setError("");}} className="block w-full rounded border p-2 bg-[var(--color-surface)]">
            {Object.entries(labels).map(([k,label])=><option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        {operation!=="coordinates" && <label className="block text-sm">{genericLabel}
          <Input aria-label={genericLabel} value={query} disabled={busy} onChange={e=>setQuery(e.target.value)} placeholder={operation==="agents"?"san-diego-ca":operation==="search"?"San Diego, CA":""}/>
        </label>}
        {operation==="agents" && <label className="block text-sm">Agent name (optional)<Input aria-label="Agent name" value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label>}
        {operation==="coordinates" && <div className="grid gap-2 sm:grid-cols-3">
          <label>Latitude<Input aria-label="Latitude" value={lat} onChange={e=>setLat(e.target.value)}/></label>
          <label>Longitude<Input aria-label="Longitude" value={long} onChange={e=>setLong(e.target.value)}/></label>
          <label>Diameter (miles)<Input aria-label="Diameter" value={diameter} onChange={e=>setDiameter(e.target.value)}/></label>
        </div>}
        {["search","coordinates","polygon"].includes(operation) && <label className="block text-sm">Property status
          <select aria-label="Property status" value={homeStatus} onChange={e=>setHomeStatus(e.target.value as RapidQuery["homeStatus"])} className="block rounded border p-2 bg-[var(--color-surface)]">
            <option value="FOR_SALE">For sale</option><option value="FOR_RENT">For rent</option><option value="RECENTLY_SOLD">Recently sold</option>
          </select>
        </label>}
        <Button disabled={busy||!enabled} type="submit">{busy?"Fetching observations…":"Search live data"}</Button>
      </form>
      {error && <p role="alert">{error}</p>}
      {result?.ok && <div className="space-y-3">
        <p className="text-xs">Observed {new Date(result.observedAt).toLocaleString()} · Page {result.page}{result.cached?" · Cached (up to 15 minutes)":""}</p>
        {result.warnings.map(w=><p className="text-xs text-[var(--color-fg-muted)]" key={w}>{w}</p>)}
        {!result.agents.length&&!result.listings.length && <p>No results returned for this lookup.</p>}
        {result.agents.map(agent=><div className="rounded border p-3" key={agent.id}>
          <p>{agent.name}{agent.brokerage?" · "+agent.brokerage:""}</p>
          <p className="text-xs">{agent.id}</p>
          {agent.url&&<a href={agent.url} target="_blank" rel="noreferrer">View source profile</a>}
          <Button variant="outline" onClick={()=>{setOperation("active");setQuery(agent.id);setResult(null);setSubmitted(null);}}>Use this agent ID</Button>
        </div>)}
        <div className="grid gap-3 sm:grid-cols-2">{result.listings.map(l=><div className="rounded border p-3 space-y-1" key={l.id}>
          <p className="font-medium">{l.address}</p>
          <p>{l.status} · {l.price===null?"Price unavailable":"$"+l.price.toLocaleString()}</p>
          <p className="text-xs">{l.beds??"—"} beds · {l.baths??"—"} baths · {l.sqft??"—"} sqft · zpid {l.id}</p>
          {l.zestimate!==null&&<p className="text-xs">Zestimate (estimate): ${l.zestimate.toLocaleString()}</p>}
          {l.rentZestimate!==null&&<p className="text-xs">Rent Zestimate (estimate): ${l.rentZestimate.toLocaleString()}</p>}
          {l.url&&<a href={l.url} target="_blank" rel="noreferrer" className="text-sm underline">View on Zillow</a>}
        </div>)}</div>
        {imported>0&&<Button variant="outline" onClick={importResults}>Import {imported} market observations</Button>}
        {result.hasMore&&<Button disabled={busy} onClick={()=>void run(result.page+1)}>Next page</Button>}
      </div>}
    </CardContent>
  </Card>;
}
