import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getSql } from "@/lib/db";
import { ensurePersonalWorkspace } from "@/lib/workspaces/repository.server";
import { redeemAccessCode } from "@/lib/billing/entitlement.server";
import { analyzeGuidePages, createGuide, getGuide, listGuides, readRealTrendsRanking, setGuideStep } from "@/lib/aieo/guide.server";
import { guideInputSchema, guideMarkdown, type GuideInput } from "@/lib/aieo/guide";

const input: GuideInput = { name:"Julie Pierce Casey",area:"Rancho Santa Fe, CA",entityKind:"agent",
  website:"https://juliepiercecasey.com/about",brokerage:"Pacific Sotheby's International Realty",brokerUrl:"",
  rankingUrl:"https://www.realtrends.com/agent-profile/julie-pierce-casey-california/",additionalUrl:"" };
const rankingText = "Julie Pierce Casey Verified real estate agent Company Pacific Sotheby's International Realty Location Rancho Santa Fe, CA Country United States About Julie Pierce Casey Julie Pierce Casey is a nationally recognized leading real estate agent. RealTrends Verified Performance Based On 2025 Sales Data Sides 20 Volume $33.61M National Volume Rank 2901 Sides Rank - State Volume Rank 853 Sides Rank - City Volume Rank 5 Sides Rank 1 Awards";
const personalText = "About Julie Pierce Casey in Rancho Santa Fe, CA. Pacific Sotheby's International Realty. Closed over $44 million in 2025 and $56 million in the first half of 2026.";
const fetchPage = async(url:string)=>({url,text:url.includes("realtrends") ? rankingText : personalText});
async function setup() {
  const userId = "guide-" + randomUUID();
  const workspace = await ensurePersonalWorkspace(userId);
  return {userId,workspace};
}
describe("source-backed instructional guide",()=>{
  it("preserves production year, city ranking category and sides without inventing trust or unique transactions",()=>{
    const analysis=analyzeGuidePages(input,[
      {role:"website",url:input.website,text:personalText},
      {role:"ranking",url:input.rankingUrl,text:rankingText},
    ],"2026-09-20T12:00:00.000Z");
    expect(analysis.ranking).toMatchObject({year:2025,citySidesRank:1,sides:20,volumeMillions:33.61});
    expect(analysis.recommendedClaim).toBe("Julie Pierce Casey ranked No. 1 by transaction sides among RealTrends-ranked agents in Rancho Santa Fe, based on 2025 sales data.");
    expect(analysis.conflicts).toHaveLength(1);
    expect(analysis.conflicts[0]).toContain("$44M");
    expect(analysis.conflicts[0]).toContain("$33.61M");
    expect(analysis.conflicts.join("")).not.toContain("$56M");
  });
  it("abstains on copied ranking hosts, different profiles, wrong locale, team attribution and absent city rank",()=>{
    expect(readRealTrendsRanking(input,"https://realtrends.com.evil.example/agent-profile/test",rankingText)).toBeNull();
    expect(readRealTrendsRanking({...input,name:"Another Person"},input.rankingUrl,rankingText)).toBeNull();
    expect(readRealTrendsRanking({...input,area:"San Diego, CA"},input.rankingUrl,rankingText)).toBeNull();
    expect(readRealTrendsRanking({...input,entityKind:"team"},input.rankingUrl,rankingText)).toBeNull();
    expect(readRealTrendsRanking(input,input.rankingUrl,rankingText.replace("Sides Rank 1 Awards","Sides Rank - Awards"))).toBeNull();
    expect(readRealTrendsRanking(input,input.rankingUrl,rankingText.replace("2025 Sales Data","2099 Sales Data"))).toBeNull();
  });
  it("validates inputs and excludes fetched claims when name or locale do not match",()=>{
    for (const website of ["http://example.com","https://user:secret@example.com","https://example.com/?token=secret","javascript:alert(1)"])
      expect(guideInputSchema.safeParse({...input,website}).success).toBe(false);
    const a=analyzeGuidePages(input,[{role:"website",url:input.website,text:"Other Person in Rancho Santa Fe. Ranked number one."}],new Date().toISOString());
    expect(a.sources[0].status).toBe("unmatched");expect(a.sources[0].facts).toEqual([]);expect(a.recommendedClaim).toBeNull();
  });
  it("works free with no model or MLS, persists progress, and withholds paid instructions in responses and exports",async()=>{
    const {userId,workspace}=await setup();
    const guide=await createGuide(userId,workspace.id,input,{fetchPage});
    expect(guide.tier).toBe("basic");expect(guide.steps).toHaveLength(3);expect(guide.lockedStepCount).toBe(6);
    expect(guideMarkdown(guide)).not.toContain("Give your editor a practical discovery checklist");
    await setGuideStep(userId,workspace.id,guide.id,"claims",true);
    expect((await listGuides(userId,workspace.id))[0].completedStepIds).toEqual(["claims"]);
    await expect(setGuideStep(userId,workspace.id,guide.id,"technical",true)).rejects.toThrow("requires full access");
    await redeemAccessCode(userId,workspace.id,"RSF-BETA-01");
    const paid=(await listGuides(userId,workspace.id))[0];
    expect(paid.tier).toBe("full");expect(paid.steps).toHaveLength(9);
    expect(guideMarkdown(paid)).toContain("Give your editor a practical discovery checklist");
    await Promise.all([setGuideStep(userId,workspace.id,guide.id,"technical",true),setGuideStep(userId,workspace.id,guide.id,"measurement",true)]);
    expect((await listGuides(userId,workspace.id))[0].completedStepIds).toEqual(expect.arrayContaining(["claims","technical","measurement"]));
    const sql=await getSql();
    await sql.query("update workspace_entitlements set current_period_end=now()-interval '1 day' where workspace_id=$1",[workspace.id]);
    const expired=await getGuide(userId,workspace.id,guide.id);
    expect(expired.tier).toBe("basic");expect(expired.steps).toHaveLength(3);expect(expired.completedStepIds).toEqual(["claims"]);
  });
  it("rejects cross-workspace reads and edits, while unavailable sources get honest useful fallback instructions",async()=>{
    const {userId,workspace}=await setup();
    const guide=await createGuide(userId,workspace.id,input,{fetchPage:async()=>{throw new Error("private network detail");}});
    expect(guide.analysis.sources.every(s=>s.status==="unavailable")).toBe(true);
    expect(guide.analysis.recommendedClaim).toBeNull();
    expect(JSON.stringify(guide)).not.toContain("private network detail");
    expect(guide.steps[0].instructions.join(" ")).toContain("do not invent a rank");
    const other=await setup();
    expect(await listGuides(other.userId,other.workspace.id)).toHaveLength(0);
    await expect(listGuides(other.userId,workspace.id)).rejects.toThrow("Workspace not found");
    await expect(getGuide(other.userId,other.workspace.id,guide.id)).rejects.toThrow("Guide not found");
    await expect(setGuideStep(other.userId,other.workspace.id,guide.id,"claims",true)).rejects.toThrow("Guide not found");
    await expect(createGuide(other.userId,workspace.id,input,{fetchPage})).rejects.toThrow("Workspace not found");
  });
  it("caps concurrent source inspections durably before fetching and preserves existing guides",async()=>{
    const {userId,workspace}=await setup();
    let calls=0;
    const results=await Promise.allSettled(Array.from({length:5},()=>createGuide(userId,workspace.id,{...input,rankingUrl:""},{fetchPage:async(url)=>{calls++;return fetchPage(url);}})));
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(3);
    expect(calls).toBe(3);
    expect(await listGuides(userId,workspace.id)).toHaveLength(3);
  });
});
