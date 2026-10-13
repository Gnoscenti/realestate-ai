import { createHash, randomUUID } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import { readResponseText, safeFetch } from "@/lib/safe-outbound-url.server";
import { expertiseSourceSchema, normalizeEvidenceText, suggestExpertisePassages, type ExpertiseEvidence, type PageObservation, type ExpertiseSource } from "./expertise";
import { nameAppears } from "./evaluate";
import type { VisibilitySubject } from "./basket";

const digest = (s: string) => createHash("sha256").update(s).digest("hex");
function assertFingerprint(f: string) { if (!/^[a-f0-9]{64}$/.test(f)) throw new Error("Invalid subject"); }
type EvidenceRow = {id:string; source:ExpertiseSource|string; content_hash:string; created_at:Date|string;withdrawn_at:Date|string|null;withdrawal_reason:string|null};
function fromRow(r: EvidenceRow): ExpertiseEvidence {
  return {...expertiseSourceSchema.parse(typeof r.source === "string" ? JSON.parse(r.source) : r.source),
    id:r.id, contentHash:r.content_hash, observedAt:new Date(r.created_at).toISOString(),
    ...(r.withdrawn_at ? {withdrawnAt:new Date(r.withdrawn_at).toISOString(),withdrawalReason:r.withdrawal_reason || ""}: {})};
}
export async function listExpertise(userId:string, workspaceId:string, fingerprint:string, sqlOverride?:Sql) {
  assertFingerprint(fingerprint);
  const sql=sqlOverride || await getSql();
  await requireWorkspaceAccess(userId,workspaceId,undefined,sql);
  const rows=await sql.query<EvidenceRow>(
    "select * from citelock_expertise where workspace_id=$1 and subject_fingerprint=$2 order by created_at desc limit 100",
    [workspaceId,fingerprint]);
  return rows.map(fromRow);
}
export async function saveExpertise(userId:string, workspaceId:string, fingerprint:string, input:ExpertiseSource, sqlOverride?:Sql) {
  assertFingerprint(fingerprint);
  const source=expertiseSourceSchema.parse(input);
  const sql=sqlOverride || await getSql();
  await requireWorkspaceAccess(userId,workspaceId,["owner","admin"],sql);
  const hash=digest([source.entityKind,normalizeEvidenceText(source.entityName),source.topic,normalizeEvidenceText(source.excerpt)].join("|"));
  const rows=await sql.query<EvidenceRow>(
    `insert into citelock_expertise(id,workspace_id,subject_fingerprint,source,content_hash,created_by)
     select $1,$2,$3,$4::jsonb,$5,$6 where
       (select count(*) from citelock_expertise where workspace_id=$2 and subject_fingerprint=$3)<100
     on conflict(workspace_id,subject_fingerprint,content_hash) where withdrawn_at is null do nothing returning *`,
    [randomUUID(),workspaceId,fingerprint,JSON.stringify(source),hash,userId]);
  if(!rows[0]) throw new Error("This source excerpt is already recorded, or the 100-source limit was reached. Syndicated copies do not add independent evidence.");
  return fromRow(rows[0]);
}
export function visiblePageText(html:string) {
  return html.replace(/<!--[\s\S]*?-->/g," ")
    .replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi," ")
    .replace(/<[^>]*>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&")
    .replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/\s+/g," ").trim();
}
export async function fetchPublicPage(url:string) {
  const control=new AbortController(); const timer=setTimeout(()=>control.abort(),15000);
  try {
    const {response,finalUrl}=await safeFetch(url,
      {signal:control.signal,headers:{Accept:"text/html","User-Agent":"CiteLock-Expertise/1.0"}},
      {allowCrossOriginRedirects:false,maxRedirects:2});
    if(!response.ok) throw new Error("Public page returned HTTP "+response.status);
    if(!/text\/html|text\/plain|application\/xhtml/i.test(response.headers.get("content-type") || "")) throw new Error("Use an HTML or text page");
    const text=visiblePageText(await readResponseText(response,1024*1024)).slice(0,40000);
    if(text.length<40) throw new Error("No usable public text was returned; JavaScript-only pages need a text-accessible version.");
    return {text,url:finalUrl.toString()};
  } finally {clearTimeout(timer);}
}
export async function observeExpertisePage(userId:string,workspaceId:string,fingerprint:string,subject:VisibilitySubject,url:string,
  deps:{sql?:Sql;fetchPage?:typeof fetchPublicPage}={}) {
  assertFingerprint(fingerprint);
  const sql=deps.sql || await getSql();
  await requireWorkspaceAccess(userId,workspaceId,["owner","admin"],sql);
  const quota=await sql.query(
    `insert into citelock_visibility_quota_buckets(scope,window_started_at,count)
     values($1,date_trunc('day',now()),1) on conflict(scope,window_started_at)
     do update set count=citelock_visibility_quota_buckets.count+1
       where citelock_visibility_quota_buckets.count<20 returning count`,[`workspace:${workspaceId}:expertise-pages`]);
  if(!quota.length) throw new Error("Public-page limit reached (20 per workspace per day).");
  const page=await (deps.fetchPage || fetchPublicPage)(url);
  const context=normalizeEvidenceText(page.text);
  const area=normalizeEvidenceText(subject.area.split(",")[0] || subject.area);
  const identityMatched=nameAppears(page.text,subject.name) &&
    Boolean((area && context.includes(area)) || (subject.brokerage && context.includes(normalizeEvidenceText(subject.brokerage))) ||
      (subject.license && context.includes(subject.license)));
  const rows=await sql.query<{id:string; observed_at:Date|string}>(
    `insert into citelock_page_observations(id,workspace_id,subject_fingerprint,url,page_text,content_hash,identity_matched)
     values($1,$2,$3,$4,$5,$6,$7) returning id,observed_at`,
    [randomUUID(),workspaceId,fingerprint,page.url,page.text,digest(page.text),identityMatched]);
  return {id:rows[0]!.id,url:page.url,text:page.text,contentHash:digest(page.text),identityMatched,
    observedAt:new Date(rows[0]!.observed_at).toISOString(),suggestions:identityMatched?suggestExpertisePassages(page.text):[]};
}
export async function listExpertisePages(userId:string,workspaceId:string,fingerprint:string,sqlOverride?:Sql):Promise<PageObservation[]> {
  const sql=sqlOverride || await getSql(); assertFingerprint(fingerprint);
  await requireWorkspaceAccess(userId,workspaceId,undefined,sql);
  const rows=await sql.query<{id:string;url:string;page_text:string;content_hash:string;identity_matched:boolean;observed_at:Date|string}>(
    "select * from citelock_page_observations where workspace_id=$1 and subject_fingerprint=$2 order by observed_at desc limit 20",
    [workspaceId,fingerprint]);
  return rows.map(r=>({id:r.id,url:r.url,text:r.page_text,contentHash:r.content_hash,identityMatched:r.identity_matched,observedAt:new Date(r.observed_at).toISOString()}));
}


export async function withdrawExpertise(userId:string,workspaceId:string,id:string,reason:string,sqlOverride?:Sql) {
  const sql=sqlOverride || await getSql();
  await requireWorkspaceAccess(userId,workspaceId,["owner","admin"],sql);
  if(reason.trim().length<5 || reason.length>500) throw new Error("Record a withdrawal reason (5–500 characters).");
  const rows=await sql.query<EvidenceRow>(
    "update citelock_expertise set withdrawn_at=now(),withdrawn_by=$3,withdrawal_reason=$4 where id=$1 and workspace_id=$2 and withdrawn_at is null returning *",
    [id,workspaceId,userId,reason.trim()]);
  if(!rows[0]) throw new Error("Source not found or already withdrawn.");
  return fromRow(rows[0]);
}
