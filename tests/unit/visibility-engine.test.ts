import { getSql } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ensurePersonalWorkspace } from "@/lib/workspaces/repository.server";
import { redeemAccessCode } from "@/lib/billing/entitlement.server";
import { saveCiteLockScan } from "@/lib/aieo/repository.server";
import { citeLockSubjectFingerprint } from "@/lib/aieo/scan.server";
import {
  continueVisibilityBatch,
  getVisibilityRuns,
  listVisibilityBatches,
  startVisibilityBatch,
  visibilityTrend,
} from "@/lib/aieo/visibility/engine.server";
import { ProviderError, type ProviderSpec } from "@/lib/aieo/visibility/providers.server";
import {
  applyInterventionCommand,
  draftIntervention,
  listInterventions,
  verificationSignature,
  socialFromIntervention,
} from "@/lib/aieo/visibility/interventions.server";
import { source, subject, page, observation } from "../fixtures/visibility-expertise";
import { buildVisibilityReport } from "@/lib/aieo/visibility/report";
import { saveExpertise, listExpertise, observeExpertisePage, withdrawExpertise } from "@/lib/aieo/visibility/expertise.server";
import { getSocialDraft, changeSocialDraft } from "@/lib/social-desk/repository.server";
import { toCitation } from "@/lib/aieo/visibility/evaluate";

// Each scenario owns a fresh global budget fixture. Persistent PostgreSQL
// otherwise accumulates quotas across test runs, unlike an in-memory database.
// This resets only a known test fixture; application quota limits stay unchanged.
beforeEach(async () => {
  const url=process.env.DATABASE_URL;
  if(url && !/_tests?$/.test(new URL(url).pathname)) throw new Error("Visibility tests require an isolated _test database.");
  const sql=await getSql();
  await sql.query("delete from citelock_visibility_quota_buckets where scope='global:runs'");
});
afterEach(() => vi.unstubAllEnvs());

const INPUT = {
  website: "https://jordanrivera.example/",
  agentName: "Jordan Rivera",
  license: "01234567",
  jurisdiction: "US-CA" as const,
  area: "Rancho Santa Fe, CA",
};

const spec: ProviderSpec = { provider: "xai", label: "Grok", model: "grok-test", key: "k", verified: true };

async function entitledWorkspace() {
  const userId = `vis-${randomUUID()}`;
  const workspace = await ensurePersonalWorkspace(userId);
  await redeemAccessCode(userId, workspace.id, "RSF-BETA-01");
  await saveCiteLockScan(userId, workspace.id, {
    subjectFingerprint: citeLockSubjectFingerprint(INPUT),
    agentName: INPUT.agentName,
    website: INPUT.website,
    jurisdiction: "US-CA",
    evaluatedAt: new Date().toISOString(),
    evidence: [],
    profilePatch: { name: INPUT.agentName, brokerageBrand: "Pacific Coast Realty", sameAs: ["https://www.zillow.com/profile/jordan-rivera"] },
    sourceOutcomes: [],
  });
  return { userId, workspace };
}

const answer = (text: string, urls: string[]) => ({
  text,
  citations: urls.map((url) => toCitation(url)!),
  returnedModel: "grok-4.6-real",
  searchCalls: 3,
  costUsdTicks: 500_000_000,
});

describe("visibility batch lifecycle", () => {
  it("stores failed partial evidence and quota subtype without success metrics or quota retries", async () => {
    vi.stubEnv("CITELOCK_VISIBILITY_RUNS_PER_CALL", "1");
    const { userId, workspace } = await entitledWorkspace();
    const batch = await startVisibilityBatch(userId, workspace.id, INPUT, { providers: [spec] });
    const partial = answer("Consider Jordan Rivera at Pacific Coast Realty.", [INPUT.website]);
    const ask = vi.fn()
      .mockRejectedValueOnce(new ProviderError("provider_incomplete", undefined, undefined, 200, {
        incompleteReason: "max_output_tokens", responseStatus: "incomplete", evidence: { ...partial, usage: { output_tokens: 2000 } },
      }))
      .mockRejectedValueOnce(new ProviderError("provider_quota_exhausted", undefined, undefined, 429, {
        providerCode: "credit_balance_exhausted", providerType: "insufficient_quota",
      }));
    const extract = vi.fn();
    await continueVisibilityBatch(userId, workspace.id, batch.id, { providers: [spec], ask, extract });
    await continueVisibilityBatch(userId, workspace.id, batch.id, { providers: [spec], ask, extract });
    const detail = await getVisibilityRuns(userId, workspace.id, batch.id);
    const incomplete = detail.runs.find(run => run.errorCode === "provider_incomplete")!;
    expect(incomplete).toMatchObject({ status: "failed", answerText: partial.text, citations: [expect.objectContaining({ url: INPUT.website })],
      costUsdTicks: partial.costUsdTicks, mentioned: false, cited: false, recommended: false,
      providerFailure: { incompleteReason: "max_output_tokens", httpStatus: 200 } });
    expect(JSON.parse(incomplete.usage!)).toMatchObject({ output_tokens: 2000 });
    expect(detail.runs.find(run => run.errorCode === "provider_quota_exhausted")).toMatchObject({
      status: "failed", providerFailure: { providerCode: "credit_balance_exhausted", httpStatus: 429 },
    });
    expect(detail.report.completed).toBe(0);
    expect(detail.report.costUsd).toBe(partial.costUsdTicks / 1e10);
    expect(extract).not.toHaveBeenCalled();
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("persists explicit alias/policy settings and fails closed while retaining disallowed or missing grounding", async () => {
    vi.stubEnv("CITELOCK_VISIBILITY_RUNS_PER_CALL", "1");
    const { userId, workspace } = await entitledWorkspace();
    const input = { ...INPUT, nameAliases: ["Jordan R"], sourcePolicy: "non_listing" as const,
      sourceUrls: ["https://jordanrivera.example/about"] };
    const batch = await startVisibilityBatch(userId, workspace.id, input, { providers: [spec] });
    expect(batch.subject).toMatchObject({ nameAliases: input.nameAliases, sourcePolicy: "non_listing", sourceUrls: input.sourceUrls });
    expect(batch.basketVersion).toBe("v2-expertise-nonlisting-v1");
    const text = "Consider Jordan R at Pacific Coast Realty.";
    const rejected = "https://jordanrivera.example/properties/123";
    const ask = vi.fn().mockResolvedValueOnce(answer(text, [rejected])).mockResolvedValueOnce(answer(text, []));
    const extract = vi.fn();
    await continueVisibilityBatch(userId, workspace.id, batch.id, { providers: [spec], ask, extract });
    await continueVisibilityBatch(userId, workspace.id, batch.id, { providers: [spec], ask, extract });
    const detail = await getVisibilityRuns(userId, workspace.id, batch.id);
    const failed = detail.runs.filter(run => run.status === "failed");
    expect(failed).toHaveLength(2);
    expect(failed.every(run => run.errorCode === "source_policy_rejected" && run.answerText === text &&
      run.methodVersion === "expertise-v2.2" && !run.mentioned && !run.cited && !run.recommended)).toBe(true);
    expect(failed.find(run => run.citations.length)?.citations[0]?.url).toBe(rejected);
    expect(failed.map(run => run.evaluation?.sourcePolicy?.rejectionReason).sort()).toEqual(["excluded_sources", "missing_grounding"]);
    expect(detail.report.completed).toBe(0);
    expect(detail.report.discovery.percent).toBeNull();
    expect(detail.report.costUsd).toBeGreaterThan(0);
    expect(extract).not.toHaveBeenCalled();
  });

  it("refuses without entitlement", async () => {
    const userId = `vis-noent-${randomUUID()}`;
    const workspace = await ensurePersonalWorkspace(userId);
    await expect(startVisibilityBatch(userId, workspace.id, INPUT, { providers: [spec] })).rejects.toThrow(/active plan/i);
  });

  it("plans, executes in resumable slices, records failures, and aggregates", async () => {
    vi.stubEnv("CITELOCK_VISIBILITY_RUNS_PER_CALL", "3");
    const { userId, workspace } = await entitledWorkspace();
    const batch = await startVisibilityBatch(userId, workspace.id, INPUT, { providers: [spec] });
    expect(batch.plannedRuns).toBe(7);
    expect(batch.subject.websiteHost).toBe("jordanrivera.example");
    expect(batch.subject.profileUrls).toContain("https://www.zillow.com/profile/jordan-rivera");

    const ask = vi.fn(async (_spec: ProviderSpec, prompt: string) => {
      if (/relocating/.test(prompt)) throw new ProviderError("provider_http_400");
      if (/Jordan Rivera/.test(prompt)) return answer("Jordan Rivera is with Pacific Coast Realty. https://jordanrivera.example/about", ["https://jordanrivera.example/about"]);
      return answer("Consider Alex Chen (Compass). Consider Jordan Rivera at Pacific Coast Realty.", ["https://www.zillow.com/profile/alex-chen", "https://www.realtor.com/agent/x"]);
    });
    const extract = vi.fn(async () => ({
      entities: [
        { name: "Alex Chen", kind: "agent" as const, recommended: true, brokerage: "Compass" },
        { name: "Jordan Rivera", kind: "agent" as const, recommended: true },
      ],
      model: "grok-extract",
      costUsdTicks: 10_000_000,
    }));

    let step = await continueVisibilityBatch(userId, workspace.id, batch.id, { providers: [spec], ask, extract });
    expect(step.executed).toBeGreaterThan(0);
    let guard = 0;
    while (step.remaining > 0 && guard < 10) {
      step = await continueVisibilityBatch(userId, workspace.id, batch.id, { providers: [spec], ask, extract });
      guard += 1;
    }
    expect(step.batch.status).toBe("completed");
    expect(step.batch.completedRuns).toBe(6);
    expect(step.batch.failedRuns).toBe(1);

    const detail = await getVisibilityRuns(userId, workspace.id, batch.id);
    const failed = detail.runs.find((run) => run.status === "failed");
    expect(failed?.errorCode).toBe("provider_http_400");
    const branded = detail.runs.filter((run) => run.branded);
    expect(branded.every((run) => run.returnedModel === "grok-4.6-real" && run.cited && run.evaluation?.identityConsistent)).toBe(true);
    expect(detail.report.discovery).toEqual({ numerator: 4, denominator: 4, percent: 100 });
    expect(detail.report.identityAccuracy.percent).toBe(100);
    expect(detail.report.competitors[0]?.name).toBe("Alex Chen");
    // The subject controls one Zillow profile URL, but the cited page is a
    // competitor's, so Zillow is still a source gap.
    expect(detail.report.opportunities).toEqual([]); // no expertise evidence yet
    expect(detail.batch.costUsd).toBeGreaterThan(0);
    // Extraction was not run for branded prompts.
    expect(extract).toHaveBeenCalledTimes(4);

    const list = await listVisibilityBatches(userId, workspace.id, batch.subjectFingerprint);
    expect(list[0]?.id).toBe(batch.id);
    const trend = await visibilityTrend(userId, workspace.id, batch.subjectFingerprint);
    expect(trend.filter((row) => row.batchId === batch.id)).toHaveLength(5);

    // A second continue is idempotent.
    const again = await continueVisibilityBatch(userId, workspace.id, batch.id, { providers: [spec], ask, extract });
    expect(again.executed).toBe(0);
    expect(ask).toHaveBeenCalledTimes(7);
  });

  it("records ambiguous paid timeouts without replaying them", async () => {
    const { userId, workspace } = await entitledWorkspace();
    const batch = await startVisibilityBatch(userId, workspace.id, INPUT, { providers: [spec] });
    const ask = vi.fn(async () => {
      throw new ProviderError("provider_timeout");
    });
    let step = await continueVisibilityBatch(userId, workspace.id, batch.id, { providers: [spec], ask });
    let guard = 0;
    while (step.remaining > 0 && guard < 20) {
      step = await continueVisibilityBatch(userId, workspace.id, batch.id, { providers: [spec], ask });
      guard += 1;
    }
    expect(step.batch.status).toBe("failed");
    expect(step.batch.failedRuns).toBe(7);
    expect(ask).toHaveBeenCalledTimes(7);
  });

  it("enforces the per-workspace daily batch budget and single running batch", async () => {
    vi.stubEnv("CITELOCK_VISIBILITY_BATCHES_PER_DAY", "1");
    const { userId, workspace } = await entitledWorkspace();
    await startVisibilityBatch(userId, workspace.id, INPUT, { providers: [spec] });
    await expect(startVisibilityBatch(userId, workspace.id, INPUT, { providers: [spec] })).rejects.toThrow(/already running/);
  });

  it("serializes concurrent starts and rolls back batch quota when the global budget refuses work",async()=>{
    const {userId,workspace}=await entitledWorkspace();
    vi.stubEnv("CITELOCK_VISIBILITY_RUNS_PER_DAY","1");
    await expect(startVisibilityBatch(userId,workspace.id,INPUT,{providers:[spec]})).rejects.toThrow(/budget/);
    const sql=await getSql();
    expect(await sql.query("select * from citelock_visibility_batches where workspace_id=$1",[workspace.id])).toHaveLength(0);
    expect(await sql.query("select * from citelock_visibility_quota_buckets where scope=$1",["workspace:"+workspace.id+":batches"])).toHaveLength(0);
    vi.stubEnv("CITELOCK_VISIBILITY_RUNS_PER_DAY","1000");
    const attempts=await Promise.allSettled([
      startVisibilityBatch(userId,workspace.id,INPUT,{providers:[spec]}),
      startVisibilityBatch(userId,workspace.id,INPUT,{providers:[spec]}),
    ]);
    expect(attempts.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    const [batch]=await listVisibilityBatches(userId,workspace.id,citeLockSubjectFingerprint(INPUT));
    const detail=await getVisibilityRuns(userId,workspace.id,batch!.id);
    expect(detail.runs).toHaveLength(batch!.plannedRuns);
  });

  it("does not reveal another tenant's batch", async () => {
    const { userId, workspace } = await entitledWorkspace();
    const batch = await startVisibilityBatch(userId, workspace.id, INPUT, { providers: [spec] });
    await expect(getVisibilityRuns("stranger", workspace.id, batch.id)).rejects.toThrow("Workspace not found");
  });
});

describe("connected expertise improvement lifecycle",()=>{
  it("stores source evidence, produces an improvement, requires revision review, confirms live text and links social",async()=>{
    const {userId,workspace}=await entitledWorkspace();
    const fingerprint=citeLockSubjectFingerprint(INPUT);
    const {id:_id,contentHash:_hash,observedAt:_at,...input}=source;
    const saved=await saveExpertise(userId,workspace.id,fingerprint,input);
    await expect(saveExpertise(userId,workspace.id,fingerprint,input)).rejects.toThrow(/already recorded/);
    await expect(listExpertise("stranger",workspace.id,fingerprint)).rejects.toThrow("Workspace not found");
    const inspected=await observeExpertisePage(userId,workspace.id,fingerprint,subject,page.url,{
      fetchPage:async()=>({url:page.url,text:page.text}),
    });
    expect(inspected.identityMatched).toBe(true);
    const batch=await startVisibilityBatch(userId,workspace.id,INPUT,{providers:[spec]});
    expect(batch.plannedRuns).toBe(8);
    let step;
    do {
      step=await continueVisibilityBatch(userId,workspace.id,batch.id,{providers:[spec],
        ask:async()=>answer(observation().answerText!,["https://alexchen.example/rural"]),
        extract:async()=>({entities:observation().entities,model:"extract-test",costUsdTicks:0}),
      });
    } while(step.remaining);
    const detail=await getVisibilityRuns(userId,workspace.id,batch.id);
    const opportunity=detail.report.opportunities[0]!;
    expect(opportunity.supportingEvidence?.[0]?.id).toBe(saved.id);
    const draft=await draftIntervention(userId,workspace.id,{subjectFingerprint:fingerprint,subject:detail.batch.subject,
      opportunity,kind:"site_page",declaredFacts:[],batchId:batch.id});
    expect(draft.content).toContain(source.statement);
    expect(draft.package?.deploymentInstructions.length).toBeGreaterThan(0);
    await expect(applyInterventionCommand(userId,workspace.id,draft.id,{action:"deployed",url:page.url,expectedRevision:1})).rejects.toThrow(/Approve/);
    const approved=await applyInterventionCommand(userId,workspace.id,draft.id,{action:"approve",expectedRevision:1,reviewedFactsAndRights:true});
    await expect(applyInterventionCommand(userId,workspace.id,draft.id,{action:"edit",expectedRevision:1,title:"Stale",content:"This edit is stale and must not replace approved content."})).rejects.toThrow(/changed/);
    const missing=await applyInterventionCommand(userId,workspace.id,draft.id,{action:"deployed",url:page.url,expectedRevision:approved.revision},
      {fetchPage:async()=>"<p>Coming soon</p>"});
    expect(missing.state).toBe("deployed");
    const partial=await applyInterventionCommand(userId,workspace.id,draft.id,{action:"deployed",url:page.url,expectedRevision:missing.revision},
      {fetchPage:async()=>source.statement});
    expect(partial.state).toBe("deployed");
    const verified=await applyInterventionCommand(userId,workspace.id,draft.id,{action:"deployed",url:page.url,expectedRevision:partial.revision},
      {fetchPage:async()=>draft.content});
    expect(verified.state).toBe("verified");
    const linked=await socialFromIntervention(userId,workspace.id,draft.id,verified.revision,"linkedin");
    expect((await socialFromIntervention(userId,workspace.id,draft.id,verified.revision,"linkedin")).id).toBe(linked.id);
    const social=await getSocialDraft(userId,workspace.id,linked.id);
    expect(social.state).toBe("draft");expect(social.content.origin).toContain(draft.id);
    expect(social.content.caption).toContain(page.url);
    const approvedSocial=await changeSocialDraft(userId,workspace.id,social.id,social.revision,{action:"approve",reviewedFactsAndRights:true});
    const handed=await changeSocialDraft(userId,workspace.id,social.id,approvedSocial.revision,{action:"handoff"});
    const receipt=await changeSocialDraft(userId,workspace.id,social.id,handed.revision,{action:"receipt",postUrl:"https://linkedin.com/posts/test-123"});
    expect(receipt.state).toBe("reported_posted");
    const repeated=await startVisibilityBatch(userId,workspace.id,INPUT,{providers:[spec],baselineBatchId:batch.id});
    const repeatedDetail=await getVisibilityRuns(userId,workspace.id,repeated.id);
    expect(repeatedDetail.runs.map(r=>r.prompt)).toEqual(detail.runs.map(r=>r.prompt));
    const persisted=await listInterventions(userId,workspace.id,fingerprint);
    expect(persisted[0]?.socialDraftId).toBe(social.id);
    await expect(withdrawExpertise("stranger",workspace.id,saved.id,"Permission revoked")).rejects.toThrow("Workspace not found");
    const pending=await draftIntervention(userId,workspace.id,{subjectFingerprint:fingerprint,subject:detail.batch.subject,
      opportunity,kind:"site_page",declaredFacts:[],batchId:batch.id});
    const pendingApproved=await applyInterventionCommand(userId,workspace.id,pending.id,{
      action:"approve",expectedRevision:pending.revision,reviewedFactsAndRights:true,
    });
    const withdrawn=await withdrawExpertise(userId,workspace.id,saved.id,"Permission revoked by the source owner");
    const fetchAfterWithdrawal=vi.fn(async()=>pending.content);
    await expect(applyInterventionCommand(userId,workspace.id,pending.id,{
      action:"deployed",url:page.url,expectedRevision:pendingApproved.revision,
    },{fetchPage:fetchAfterWithdrawal})).rejects.toThrow(/permission has changed/);
    expect(fetchAfterWithdrawal).not.toHaveBeenCalled();
    expect(withdrawn.withdrawnAt).toBeTruthy();
    expect((await listExpertise(userId,workspace.id,fingerprint))[0]?.withdrawalReason).toContain("Permission revoked");
    expect((await getVisibilityRuns(userId,workspace.id,batch.id)).report.opportunities).toEqual([]);
    await expect(socialFromIntervention(userId,workspace.id,draft.id,verified.revision,"linkedin")).rejects.toThrow(/permission has changed/);
    expect((await getVisibilityRuns(userId,workspace.id,batch.id)).runs).toHaveLength(8);
    const editedSocial=await changeSocialDraft(userId,workspace.id,social.id,receipt.revision,{
      action:"edit",content:{...receipt.content,origin:"manual",caption:"A revised caption still has the original source obligations."},
    });
    await expect(changeSocialDraft(userId,workspace.id,social.id,editedSocial.revision,{
      action:"approve",reviewedFactsAndRights:true,
    })).rejects.toThrow(/permission has changed/);

  });
  it("refuses live verification if source permission is withdrawn during the fetch",async()=>{
    const {userId,workspace}=await entitledWorkspace();
    const fingerprint=citeLockSubjectFingerprint(INPUT);
    const {id:_id,contentHash:_hash,observedAt:_at,...input}=source;
    const saved=await saveExpertise(userId,workspace.id,fingerprint,input);
    const supported={...subject,expertise:[saved]};
    const opportunity=buildVisibilityReport([observation()],supported,[page]).opportunities[0]!;
    const draft=await draftIntervention(userId,workspace.id,{subjectFingerprint:fingerprint,subject:supported,
      opportunity,kind:"site_page",declaredFacts:[]});
    const approved=await applyInterventionCommand(userId,workspace.id,draft.id,{
      action:"approve",expectedRevision:draft.revision,reviewedFactsAndRights:true,
    });
    await expect(applyInterventionCommand(userId,workspace.id,draft.id,{
      action:"deployed",url:page.url,expectedRevision:approved.revision,
    },{fetchPage:async()=>{
      await withdrawExpertise(userId,workspace.id,saved.id,"Permission withdrawn while checking the public page");
      return draft.content;
    }})).rejects.toThrow(/permission has changed/);
    const current=(await listInterventions(userId,workspace.id,fingerprint))[0]!;
    expect(current.state).toBe("approved");
    expect(current.revision).toBe(approved.revision);
  });
  it("requires evidence rather than a model key or an empty checklist",async()=>{
    const {userId,workspace}=await entitledWorkspace();
    const opportunity=buildVisibilityReport([observation()],subject,[page]).opportunities[0]!;
    await expect(draftIntervention(userId,workspace.id,{
      subjectFingerprint:citeLockSubjectFingerprint(INPUT),subject,opportunity:{...opportunity,supportingEvidence:[]},
      kind:"site_page",declaredFacts:["Unsupported ranking claim"],
    })).rejects.toThrow(/needs matched source evidence/);
    expect(verificationSignature("# Empty heading")).toEqual([]);
  });
  it("does not attribute an ambiguous public namesake",async()=>{
    const {userId,workspace}=await entitledWorkspace();
    const result=await observeExpertisePage(userId,workspace.id,citeLockSubjectFingerprint(INPUT),subject,page.url,
      {fetchPage:async()=>({url:page.url,text:"Jordan Rivera works in a different place. No other context is available."})});
    expect(result.identityMatched).toBe(false);expect(result.suggestions).toEqual([]);
  });
});


describe("Agent surface persistence and provider cooldown", () => {
  it("persists retrieved sources without citation credit and refuses legacy baseline reuse", async () => {
    const {userId, workspace} = await entitledWorkspace();
    const agent: ProviderSpec = {...spec, provider:"perplexity", model:"openai/gpt-5.6-luna"};
    const batch=await startVisibilityBatch(userId,workspace.id,INPUT,{providers:[agent]});
    const ask=vi.fn(async()=>({...answer("Jordan Rivera is named.",[]),
      sources:[{...toCitation(INPUT.website)!,sourceId:1,snippet:"Retrieved, not cited"}]}));
    const extract=async()=>({entities:[],model:"unsupported"});
    let step;
    do { step=await continueVisibilityBatch(userId,workspace.id,batch.id,{providers:[agent],ask,extract}); } while(step.remaining);
    const detail=await getVisibilityRuns(userId,workspace.id,batch.id);
    expect(detail.runs.every(run=>run.surface==="perplexity_agent_web_v2_output6000" && !run.cited && run.sources?.length===1)).toBe(true);
    const sql=await getSql();
    await sql.query("update citelock_visibility_runs set surface='api_web_grounded' where batch_id=$1",[batch.id]);
    await expect(startVisibilityBatch(userId,workspace.id,INPUT,{providers:[agent],baselineBatchId:batch.id})).rejects.toThrow(/new baseline/);
  });

  it("holds every workspace until Retry-After, retries once, and retains terminal failures", async () => {
    vi.stubEnv("CITELOCK_VISIBILITY_RUNS_PER_CALL","1");
    const one=await entitledWorkspace(), two=await entitledWorkspace();
    const agent:ProviderSpec={...spec,provider:"perplexity",model:"openai/gpt-5.6-luna"};
    const batch=await startVisibilityBatch(one.userId,one.workspace.id,INPUT,{providers:[agent]});
    const other=await startVisibilityBatch(two.userId,two.workspace.id,INPUT,{providers:[agent]});
    const sql=await getSql();
    const ask=vi.fn(async()=>{throw new ProviderError("provider_rate_limited",undefined,90_000,429);});
    try {
      await continueVisibilityBatch(one.userId,one.workspace.id,batch.id,{providers:[agent],ask});
      expect(ask).toHaveBeenCalledTimes(1);
      const cooldown=await sql.query<{seconds:number}>("select extract(epoch from (retry_after-now()))::int as seconds from citelock_provider_cooldowns where provider='perplexity'");
      expect(cooldown[0]!.seconds).toBeGreaterThanOrEqual(85);
      expect((await continueVisibilityBatch(one.userId,one.workspace.id,batch.id,{providers:[agent],ask})).executed).toBe(0);
      expect((await continueVisibilityBatch(two.userId,two.workspace.id,other.id,{providers:[agent],ask})).executed).toBe(0);
      expect(ask).toHaveBeenCalledTimes(1);
      await sql.query("update citelock_provider_cooldowns set retry_after=now()-interval '1 second' where provider='perplexity'");
      await continueVisibilityBatch(one.userId,one.workspace.id,batch.id,{providers:[agent],ask});
      expect(ask).toHaveBeenCalledTimes(2);
      const detail=await getVisibilityRuns(one.userId,one.workspace.id,batch.id);
      expect(detail.runs.filter(run=>run.status==="failed" && run.errorCode==="provider_rate_limited")).toHaveLength(1);
    } finally {
      await sql.query("delete from citelock_provider_cooldowns where provider='perplexity'");
    }
  });
});
