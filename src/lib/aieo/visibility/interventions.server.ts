import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import { requireEntitlement } from "@/lib/billing/entitlement.server";
import { hasBlockingFinding, reviewCaption } from "@/lib/social-desk/fair-housing";
import { socialContentSchema, type SocialPlatform } from "@/lib/social-desk/types";
import { fetchPublicPage, visiblePageText, listExpertise } from "./expertise.server";
import { normalizeEvidenceText, summarizeExpertise, type ExpertiseEvidence } from "./expertise";
import type { VisibilitySubject } from "./basket";
import type { Opportunity } from "./report";
import { nameAppears, citationBelongsToSubject, toCitation } from "./evaluate";

export const interventionKindSchema = z.enum(["site_page","profile_claim","faq","social"]);
export type InterventionKind = z.infer<typeof interventionKindSchema>;
export type ImprovementPackage = {
  subjectName:string; subjectKind:string; allowedHost:string; allowedWebsiteUrl?:string; question:string; gap:string;
  hypothesis:string; testPlan:string; evidence:ExpertiseEvidence[]; evidenceRunIds:string[];
  sourceUrls:string[]; deploymentInstructions:string[]; interviewQuestions:string[];
};
export type Intervention = {
  id:string; subjectFingerprint:string; opportunityKey:string; kind:InterventionKind;
  title:string; targetUrl:string|null; content:string; facts:string[];
  state:"proposed"|"approved"|"deployed"|"verified"|"dismissed"; revision:number;
  package:ImprovementPackage|null; batchId:string|null; draftedWith:string|null;
  socialDraftId:string|null; approvedAt:string|null; deployedUrl:string|null;
  verifiedAt:string|null; verificationNote:string|null; createdAt:string; updatedAt:string;
};
type Row = {
  id:string; subject_fingerprint:string; opportunity_key:string; kind:InterventionKind;
  title:string; target_url:string|null; content:string; facts:string[]|string;
  state:Intervention["state"]; revision:number; package:ImprovementPackage|string;
  batch_id:string|null; drafted_with:string|null; social_draft_id:string|null;
  approved_at:string|Date|null; deployed_url:string|null; verified_at:string|Date|null;
  verification_note:string|null; created_at:string|Date; updated_at:string|Date;
};
const iso=(v:string|Date|null)=>v ? new Date(v).toISOString() : null;
function decode<T>(v:T|string):T {return typeof v==="string" ? JSON.parse(v) as T : v;}
function toIntervention(r:Row):Intervention {
  const pack=decode(r.package);
  return {id:r.id,subjectFingerprint:r.subject_fingerprint,opportunityKey:r.opportunity_key,kind:r.kind,
    title:r.title,targetUrl:r.target_url,content:r.content,facts:decode(r.facts),state:r.state,revision:r.revision,
    package:pack?.subjectName ? pack : null,batchId:r.batch_id,draftedWith:r.drafted_with,socialDraftId:r.social_draft_id,
    approvedAt:iso(r.approved_at),deployedUrl:r.deployed_url,verifiedAt:iso(r.verified_at),
    verificationNote:r.verification_note,createdAt:iso(r.created_at)!,updatedAt:iso(r.updated_at)!};
}
export function buildImprovementPackage(subject:VisibilitySubject, opportunity:Opportunity, kind:InterventionKind) {
  const evidence=opportunity.supportingEvidence?.filter(e=>e.publishAllowed && e.polarity==="supporting" &&
    e.entityKind===(subject.entityKind || "agent") && normalizeEvidenceText(e.entityName)===normalizeEvidenceText(subject.name)) || [];
  if(opportunity.status!=="ready" || !evidence.length || !opportunity.evidenceRunIds.length ||
    !opportunity.pageEvidence?.length || !subject.websiteHost)
    throw new Error("This improvement needs matched source evidence, a public-page observation and a relevant discovery result. Add those under Supported expertise first.");
  const statements=evidence.slice(0,4).map(e=>e.statement);
  if(statements.some(s=>hasBlockingFinding(reviewCaption(s)))) throw new Error("Resolve blocking content findings in the source before using it in public content.");
  const title=opportunity.title.slice(0,160);
  // Exact, permitted source passages prevent generated claims that have no source.
  const body=evidence.slice(0,4).map(e=>[
    e.kind==="client_report" ? "### Client-reported experience" : e.kind==="case_material" ? "### Authorized case evidence" : "### Published expertise",
    e.statement,
    e.url ? `Source: ${e.sourceLabel} (${e.sourceDate}) — ${e.url}` : `Source: ${e.sourceLabel} (${e.sourceDate}); shared with permission.`,
    ...(e.kind==="client_report" ? ["This is a selected client report, not an audited performance measure."] : []),
  ].join("\n\n")).join("\n\n");
  const content=kind==="faq"
    ? `# ${subject.name}: questions about this expertise\n\n## What experience is documented?\n\n${body}\n\n## How can I discuss my situation?\n\nContact ${subject.name} through ${subject.websiteUrl || "https://"+subject.websiteHost} to discuss the fit for your circumstances.`
    : `# ${subject.name}: documented expertise in ${subject.area}\n\n${body}\n\n## Discuss your situation\n\nContact ${subject.name} through ${subject.websiteUrl || "https://"+subject.websiteHost} to discuss your property needs.`;
  const pack:ImprovementPackage={
    subjectName:subject.name,subjectKind:subject.entityKind || "agent",allowedHost:subject.websiteHost,allowedWebsiteUrl:subject.websiteUrl,
    question:opportunity.clientQuestion || "",gap:opportunity.contentGap || "",hypothesis:opportunity.hypothesis || "",
    testPlan:opportunity.testPlan || "",evidence,evidenceRunIds:opportunity.evidenceRunIds,
    sourceUrls:[...new Set(evidence.map(e=>e.url).filter(Boolean))],
    deploymentInstructions:[
      "Review each exact passage, date, subject identity and permission before approving. Remove private client details.",
      "Publish this text as an expertise section or page on the subject website; keep source attribution adjacent.",
      "Add an internal link from the existing biography or services page using the expertise topic as link text.",
      "For a brokerage biography, submit the same approved passages to the authorized editor; preserve supported identity and affiliation.",
      "Paste the public URL here to confirm the live approved text. Create the linked social draft, then repeat the same saved basket.",
    ],
    interviewQuestions:[
      "What specific difficulty did the client face, and what material may be shared with consent?",
      "Which actions did this individual or team personally perform? What source supports that attribution?",
      "What limitations or contrary experiences should the public explanation acknowledge?",
    ],
  };
  return {title,content,pack,statements};
}
async function requireCurrentSupport(userId:string,workspaceId:string,fingerprint:string,pack:ImprovementPackage|null,sql:Sql) {
  if(!pack) throw new Error("Create a supported improvement package before approval.");
  const current=await listExpertise(userId,workspaceId,fingerprint,sql);
  const kind=pack.evidence[0]?.entityKind;
  if(!kind || !pack.evidence.length) throw new Error("This package has insufficient source evidence.");
  const themes=summarizeExpertise(current,kind,pack.subjectName);
  for(const source of pack.evidence) {
    const theme=themes.find(t=>t.topic===source.topic);
    if(theme?.status!=="supported" || !theme.publishable.some(e=>e.id===source.id && e.contentHash===source.contentHash))
      throw new Error("Source evidence or permission has changed, or contradictory evidence needs review. Review Supported expertise before using this package.");
  }
}
export async function draftIntervention(userId:string,workspaceId:string,input:{
  subjectFingerprint:string;subject:VisibilitySubject;opportunity:Opportunity;kind:InterventionKind;
  declaredFacts:string[];batchId?:string;
},sqlOverride?:Sql):Promise<Intervention> {
  const sql=sqlOverride || await getSql();
  await requireWorkspaceAccess(userId,workspaceId,["owner","admin"],sql);
  await requireEntitlement(userId,workspaceId,sql);
  const {title,content,pack,statements}=buildImprovementPackage(input.subject,input.opportunity,input.kind);
  await requireCurrentSupport(userId,workspaceId,input.subjectFingerprint,pack,sql);
  const rows=await sql.query<Row>(
    `with added as (
       insert into citelock_interventions(id,workspace_id,subject_fingerprint,opportunity_key,kind,title,target_url,
         content,facts,drafted_with,created_by_user_id,package,batch_id)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,'source-assembly-v1',$10,$11::jsonb,$12) returning *
     ), event as (
       insert into citelock_intervention_events(workspace_id,intervention_id,revision,action,actor_user_id,snapshot)
       select workspace_id,id,revision,'create',$10,to_jsonb(added) from added
     ) select * from added`,
    [randomUUID(),workspaceId,input.subjectFingerprint,input.opportunity.key,input.kind,title,
      input.subject.websiteUrl || "https://"+input.subject.websiteHost,content,JSON.stringify(statements),userId,JSON.stringify(pack),input.batchId || null]);
  return toIntervention(rows[0]!);
}
export async function listInterventions(userId:string,workspaceId:string,fingerprint:string,sqlOverride?:Sql):Promise<Intervention[]> {
  const sql=sqlOverride || await getSql();
  await requireWorkspaceAccess(userId,workspaceId,undefined,sql);
  return (await sql.query<Row>("select * from citelock_interventions where workspace_id=$1 and subject_fingerprint=$2 order by updated_at desc limit 100",
    [workspaceId,fingerprint])).map(toIntervention);
}
export const interventionCommandSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("edit"),title:z.string().trim().min(1).max(160),content:z.string().trim().min(1).max(20000)}),
  z.object({action:z.literal("approve"),reviewedFactsAndRights:z.literal(true)}),
  z.object({action:z.literal("dismiss")}),
  z.object({action:z.literal("deployed"),url:z.string().url().max(1000)}),
]).and(z.object({expectedRevision:z.number().int().positive().max(2147483646)}));
export type InterventionCommand=z.infer<typeof interventionCommandSchema>;
function normalizeForMatch(s:string) {
  return visiblePageText(s).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}
export function verificationSignature(content:string):string[] {
  return content.split("\n").map(s=>s.replace(/^\s*[-*>]\s*/,"").trim())
    .filter(s=>s.length>=20 && !/^#|^Source:|^https?:/.test(s))
    .map(s=>s.replace(/\[([^\]]+)\]\([^)]+\)/g,"$1").replace(/[*_`]/g,""));
}
export async function applyInterventionCommand(userId:string,workspaceId:string,id:string,input:InterventionCommand,
  dependencies:{sql?:Sql;fetchPage?:(url:string)=>Promise<string>}={}):Promise<Intervention> {
  const command=interventionCommandSchema.parse(input);
  const sql=dependencies.sql || await getSql();
  await requireWorkspaceAccess(userId,workspaceId,["owner","admin"],sql);
  const rows=await sql.query<Row>("select * from citelock_interventions where id=$1 and workspace_id=$2",[id,workspaceId]);
  if(!rows[0]) throw new Error("Intervention not found");
  const current=toIntervention(rows[0]);
  if(current.revision!==command.expectedRevision) throw new Error("This intervention changed. Reload before continuing.");
  let state=current.state; let content=current.content; let title=current.title;
  let deployedUrl=current.deployedUrl; let verificationNote=current.verificationNote;
  if(command.action==="edit") {
    if(current.state==="verified") throw new Error("A verified intervention cannot be edited; create a new revision package.");
    state="proposed";content=command.content;title=command.title;deployedUrl=null;verificationNote=null;
  } else if(command.action==="approve") {
    if(current.state!=="proposed") throw new Error("Only a proposed intervention can be approved.");
    if(hasBlockingFinding(reviewCaption(content))) throw new Error("Resolve blocking content findings before approval.");
    if(!verificationSignature(content).length) throw new Error("Add substantive public content before approving.");
    await requireCurrentSupport(userId,workspaceId,current.subjectFingerprint,current.package,sql);
    state="approved";
  } else if(command.action==="dismiss") {state="dismissed";}
  else {
    if(current.state!=="approved" && current.state!=="deployed") throw new Error("Approve this revision before verifying publication.");
    await requireCurrentSupport(userId,workspaceId,current.subjectFingerprint,current.package,sql);
    const url=new URL(command.url);
    const allowed=current.package?.allowedHost || (current.targetUrl ? new URL(current.targetUrl).hostname : "");
    if(url.protocol!=="https:" || url.username || url.password || url.port ||
      url.hostname.replace(/^www\./,"")!==allowed.replace(/^www\./,""))
      throw new Error("Use an HTTPS page on the approved subject website.");
    const citation=toCitation(url.href);
    if(!citation || !citationBelongsToSubject(citation,{
      name:current.package!.subjectName,area:"",websiteHost:allowed,
      websiteUrl:current.package?.allowedWebsiteUrl,profileUrls:[],
    })) throw new Error("Use the approved subject page, not another profile on the same website.");
    deployedUrl=url.href; state="deployed";
    try {
      const page=dependencies.fetchPage ? await dependencies.fetchPage(url.href) : (await fetchPublicPage(url.href)).text;
      const normalized=normalizeForMatch(page);
      const signatures=verificationSignature(content).map(normalizeForMatch).filter(Boolean);
      const matched=signatures.filter(s=>normalized.includes(s)).length;
      const identity=current.package ? nameAppears(visiblePageText(page),current.package.subjectName) : false;
      const verified=identity && signatures.length>0 && matched===signatures.length;
      if(verified) state="verified";
      verificationNote=verified
        ? `Confirmed the subject identity and all ${matched} substantive approved passages. This does not establish indexing or visibility lift.`
        : `Found ${matched}/${signatures.length} substantive approved passages; identity ${identity ? "matched" : "not confirmed"}. Publication remains user-reported. Check the published revision and try again.`;
    } catch(error) {verificationNote="Could not fetch the page: "+(error instanceof Error?error.message:"unknown error");}
  }
  // Evidence may have been withdrawn while a slow public-page fetch was running.
  if(command.action==="deployed") await requireCurrentSupport(userId,workspaceId,current.subjectFingerprint,current.package,sql);
  const changed=await sql.query<Row>(
    `with changed as (
      update citelock_interventions set state=$4,title=$5,content=$6,deployed_url=$7,verification_note=$8,
        revision=revision+1,updated_at=now(),
        approved_at=case when $9='edit' then null when $9='approve' then now() else approved_at end,
        approved_by=case when $9='edit' then null when $9='approve' then $10 else approved_by end,
        verified_at=case when $4='verified' then now() else null end
      where id=$1 and workspace_id=$2 and revision=$3 returning *
    ), event as (
      insert into citelock_intervention_events(workspace_id,intervention_id,revision,action,actor_user_id,snapshot)
      select workspace_id,id,revision,$9,$10,to_jsonb(changed) from changed
    ) select * from changed`,
    [id,workspaceId,command.expectedRevision,state,title,content,deployedUrl,verificationNote,command.action,userId]);
  if(!changed[0]) throw new Error("This intervention changed during verification. Reload; no newer revision was approved or verified.");
  return toIntervention(changed[0]);
}
export async function socialFromIntervention(userId:string,workspaceId:string,id:string,revision:number,platform:SocialPlatform,sqlOverride?:Sql) {
  const sql=sqlOverride || await getSql();
  await requireWorkspaceAccess(userId,workspaceId,["owner","admin"],sql);
  const rows=await sql.query<Row>("select * from citelock_interventions where id=$1 and workspace_id=$2",[id,workspaceId]);
  if(!rows[0]) throw new Error("Intervention not found");
  const current=toIntervention(rows[0]);
  if(current.revision!==revision) throw new Error("This intervention changed. Reload before creating the social draft.");
  if(!["approved","deployed","verified"].includes(current.state) || !current.package) throw new Error("Approve a supported improvement package first.");
  await requireCurrentSupport(userId,workspaceId,current.subjectFingerprint,current.package,sql);
  if(current.socialDraftId) return {id:current.socialDraftId};
  const destination=current.deployedUrl || current.targetUrl || "";
  const caption=current.state==="verified"
    ? `Read ${current.package.subjectName}'s documented expertise and source notes: ${destination}`
    : `A question to discuss with ${current.package.subjectName}: ${current.package.question}\nLearn more: ${destination}`;
  const content=socialContentSchema.parse({
    title:current.title.slice(0,120),platform,caption,
    facts:current.facts.join("\n").slice(0,3000),sourceUrl:destination,
    attribution:current.package.sourceUrls.join("\n").slice(0,500),mediaUrls:[],
    origin:"citelock:"+current.id+":revision:"+revision,
  });
  const draftId=randomUUID();
  const created=await sql.query<{id:string}>(
    `with linked as (
      update citelock_interventions set social_draft_id=$4 where id=$1 and workspace_id=$2
        and revision=$3 and social_draft_id is null and state in ('approved','deployed','verified')
        returning id
    ), draft as (
      insert into social_drafts(id,workspace_id,content)
      select $4::uuid,$2,$5::jsonb from linked returning *
    ), event as (
      insert into social_draft_events(workspace_id,draft_id,revision,actor_user_id,action,snapshot)
      select workspace_id,id,revision,$6,'create',to_jsonb(draft) from draft
    ) select id from draft`,[id,workspaceId,revision,draftId,JSON.stringify(content),userId]);
  if(!created[0]) throw new Error("The intervention changed or already has a social draft. Reload.");
  return created[0];
}


/** A linked social draft retains its source obligation even if its editable origin changes. */
export async function requireLinkedSocialSupport(userId:string,workspaceId:string,draftId:string,sql:Sql) {
  const rows=await sql.query<Row>(
    "select * from citelock_interventions where workspace_id=$1 and social_draft_id=$2",[workspaceId,draftId]);
  if(!rows[0]) return; // Independently authored drafts rely on their explicit fact/rights review.
  const current=toIntervention(rows[0]);
  if(!["approved","deployed","verified"].includes(current.state))
    throw new Error("The linked Citelock improvement needs approval before social distribution.");
  const creation=await sql.query<{origin:string}>(
    "select snapshot->'content'->>'origin' as origin from social_draft_events where workspace_id=$1 and draft_id=$2 and action='create' order by revision limit 1",
    [workspaceId,draftId]);
  const revision=Number(creation[0]?.origin?.split(":revision:")[1]);
  const original=Number.isInteger(revision) ? await sql.query<{content:string}>(
    "select snapshot->>'content' as content from citelock_intervention_events where workspace_id=$1 and intervention_id=$2 and revision=$3",
    [workspaceId,current.id,revision]) : [];
  if(!original[0] || original[0].content!==current.content)
    throw new Error("The linked Citelock improvement changed. Review a new social draft from the current approved content.");
  await requireCurrentSupport(userId,workspaceId,current.subjectFingerprint,current.package,sql);
}
