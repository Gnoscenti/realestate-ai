import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rapidQuerySchema, type RapidQuery } from "@/lib/rapidapi/types";
import { normalizeRapidResponse } from "@/lib/rapidapi/normalize";
import { queryRapidApi, rapidRequestUrl, RAPIDAPI_HOST } from "@/lib/rapidapi/adapter.server";
import { ensurePersonalWorkspace } from "@/lib/workspaces/repository.server";
import { EntitlementRequiredError, grantVerifiedCheckout } from "@/lib/billing/entitlement.server";
import { getSql } from "@/lib/db";
import { scoreAieo } from "@/lib/aieo/score";

afterEach(()=>vi.unstubAllEnvs());
const at = "2026-09-04T12:00:00.000Z";
const row = {zpid:"123456",streetAddress:"100 Test St",city:"San Diego",address:"100 Test St, San Diego",
  homeStatus:"FOR_SALE",homeType:"SINGLE_FAMILY",price:500000,bedrooms:3,bathrooms:2,livingArea:1500,
  detailUrl:"https://www.zillow.com/homedetails/123456_zpid/",imgSrc:"https://photos.zillowstatic.com/fp/a.jpg"};
const query = (extra:Partial<RapidQuery>={}) => rapidQuerySchema.parse({operation:"search",query:"San Diego, CA",...extra});
const payload = {status:"OK",data:[row]};

describe("RapidAPI request contract",()=>{
  it("encodes input and never uses a user-provided host",()=>{
    const url=rapidRequestUrl(query({query:"San Diego & api_key=evil"}));
    expect(url.hostname).toBe(RAPIDAPI_HOST);
    expect(url.searchParams.get("location")).toBe("San Diego & api_key=evil");
    expect(url.searchParams.has("api_key")).toBe(false);
  });
  it("excludes team listings and uses the documented sold resource",()=>{
    const q=query({operation:"active",query:"X1-agent-id"});
    expect(rapidRequestUrl(q).searchParams.get("include_team")).toBe("false");
    expect(rapidRequestUrl({...q,operation:"sold"}).pathname).toBe("/zillow/agent-properties-sold");
    expect(rapidRequestUrl({...q,operation:"sold"}).searchParams.has("include_team")).toBe(false);
  });
  it("rejects malformed IDs, oversized pages and unclosed polygons",()=>{
    for(const bad of [
      {operation:"details",query:"https://evil.test/"},
      {operation:"agents",query:"San Diego, CA"},
      {operation:"search",query:"x",page:21},
      {operation:"coordinates",query:"",lat:91,long:0},
      {operation:"polygon",query:"-117 32,-118 33,-119 34,-120 35"},
    ])expect(rapidQuerySchema.safeParse(bad).success).toBe(false);
    expect(rapidQuerySchema.safeParse({operation:"polygon",query:"-117 32,-118 33,-119 34,-117 32"}).success).toBe(true);
  });
});
describe("Aggregator provenance",()=>{
  it("maps real-shaped observations without granting MLS or representation trust",()=>{
    const result=normalizeRapidResponse(payload,query(),at);
    const p=result.listings[0]!.property!;
    expect(p.source).toMatchObject({kind:"aggregator",evidenceLevel:"site_published",trust:"client_import",observedAt:at});
    expect(p.source?.attestationId).toBeUndefined();
    expect(p).toMatchObject({listingSide:"market",visibility:"private",representation:{role:"unknown"}});
    const score=scoreAieo({properties:[p],evaluatedAt:at});
    expect(score.listingBlurbs).toHaveLength(0);
    expect(score.evidence.some(e=>e.sourceTier==="mls")).toBe(false);
    expect(score.evidence.some(e=>e.sourceTier==="independent")).toBe(true);
  });
  it("keeps withheld addresses private and estimates separate from price",()=>{
    const r=normalizeRapidResponse({status:"OK",data:[{...row,isUndisclosedAddress:true,price:undefined,zestimate:450000}]},query(),at).listings[0]!;
    expect(r.address).toBe("Address withheld");
    expect(r.url).toBeUndefined();
    expect(r.property).toBeUndefined();
    expect(r.price).toBeNull();
    expect(r.zestimate).toBe(450000);
  });
  it("keeps missing fields unknown, skips unsupported imports, and flags duplicate rows",()=>{
    const r=normalizeRapidResponse({status:"OK",data:[{zpid:"1"},row,row,{foo:"bar"}]},query(),at);
    expect(r.listings).toHaveLength(2);
    expect(r.listings[0]).toMatchObject({status:"UNKNOWN",price:null,property:undefined});
    expect(r.warnings).toContain("Duplicate or unsupported listing rows were omitted.");
  });
  it("preserves empty results and rejects a changed envelope",()=>{
    expect(normalizeRapidResponse({status:"OK",data:{listing_count:0,listings:[]}},query({operation:"active",query:"X1-agent-id"}),at).listings).toEqual([]);
    expect(()=>normalizeRapidResponse({status:"ERROR",data:[]},query(),at)).toThrow();
    expect(()=>normalizeRapidResponse({status:"OK",data:{unexpected:[]}},query(),at)).toThrow();
  });
  it("recognizes coming soon and strips external links and forged trust",()=>{
    const r=normalizeRapidResponse({status:"OK",data:[{...row,listingSubType:{is_comingSoon:true},source:{trust:"server_attested"},imgSrc:"https://evil.test/x"}]},query(),at);
    expect(r.listings[0]?.property?.status).toBe("coming_soon");
    expect(r.listings[0]?.imageUrl).toBeUndefined();
    expect(r.listings[0]?.property?.source?.trust).toBe("client_import");
  });
  it("respects explicit next-page boundaries",()=>{
    const r=normalizeRapidResponse({status:"OK",data:{listing_count:6,listings:[row]}},query({operation:"active",query:"X1-agent-id"}),at);
    expect(r.hasMore).toBe(true);
    expect(normalizeRapidResponse({status:"OK",data:{listing_count:6,listings:[row]}},query({operation:"active",query:"X1-agent-id",page:2}),at).hasMore).toBe(false);
  });
});
describe("Authenticated cache and quota",()=>{
  async function setup(entitled = true) {
    const user="rapid-test-"+randomUUID(), ws=await ensurePersonalWorkspace(user);
    if (entitled) await grantVerifiedCheckout(user,ws.id,{sessionId:"cs_rapid_"+randomUUID(),paid:true,demo:false});
    const fetch=vi.fn(async ()=>({response:new Response(JSON.stringify(payload),{status:200}),finalUrl:new URL("https://"+RAPIDAPI_HOST)}));
    return {user,ws,fetch};
  }
  it("rejects an inactive workspace before creating a cache lease or consuming any provider quota",async()=>{
    const {user,ws,fetch}=await setup(false), sql=await getSql();
    const before=await sql.query("select scope,window_started_at,request_count from rapidapi_quota_buckets order by scope,window_started_at");
    await expect(queryRapidApi(user,ws.id,query(),{key:"test-secret",fetch,sql})).rejects.toBeInstanceOf(EntitlementRequiredError);
    expect(fetch).not.toHaveBeenCalled();
    expect(await sql.query("select cache_key from rapidapi_observation_cache where workspace_id=$1",[ws.id])).toHaveLength(0);
    expect(await sql.query("select scope,window_started_at,request_count from rapidapi_quota_buckets order by scope,window_started_at")).toEqual(before);
  });
  it.each(["expired","canceled"])("rejects %s access before serving cached observations or fetching a new query",async(state)=>{
    const {user,ws,fetch}=await setup(), sql=await getSql();
    expect((await queryRapidApi(user,ws.id,query(),{key:"test-secret",fetch,sql})).ok).toBe(true);
    await sql.query("update workspace_entitlements set status=$2,current_period_end=$3::timestamptz where workspace_id=$1",
      [ws.id,state==="canceled"?"canceled":"active",new Date(Date.now()+(state==="expired"?-1:1)*86400000).toISOString()]);
    const before=await sql.query("select scope,window_started_at,request_count from rapidapi_quota_buckets order by scope,window_started_at");
    for (const request of [query(),query({query:"Los Angeles, CA"})]) {
      await expect(queryRapidApi(user,ws.id,request,{key:"test-secret",fetch,sql})).rejects.toBeInstanceOf(EntitlementRequiredError);
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await sql.query("select cache_key from rapidapi_observation_cache where workspace_id=$1",[ws.id])).toHaveLength(1);
    expect(await sql.query("select scope,window_started_at,request_count from rapidapi_quota_buckets order by scope,window_started_at")).toEqual(before);
  });
  it("caches for a workspace without refreshing the original observation time",async()=>{
    const {user,ws,fetch}=await setup();
    const first=await queryRapidApi(user,ws.id,query(),{key:"test-secret",fetch});
    const second=await queryRapidApi(user,ws.id,query(),{key:"test-secret",fetch});
    expect(first.ok).toBe(true);expect(second.cached).toBe(true);
    expect(second.observedAt).toBe(first.observedAt);expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(second)).not.toContain("test-secret");
    expect(fetch.mock.calls[0]).toBeDefined();
  });
  it("rejects cross-workspace access before fetching or serving cached data",async()=>{
    const {user,ws,fetch}=await setup();
    await queryRapidApi(user,ws.id,query(),{key:"test-secret",fetch});
    await expect(queryRapidApi("other-user",ws.id,query(),{key:"test-secret",fetch})).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("redacts error bodies and obeys Retry-After without retries",async()=>{
    const {user,ws}=await setup();
    const fetch=vi.fn(async()=>({response:new Response("test-secret provider body",{status:429,headers:{"retry-after":"180"}}),finalUrl:new URL("https://"+RAPIDAPI_HOST)}));
    const first=await queryRapidApi(user,ws.id,query(),{key:"test-secret",fetch});
    expect(first).toMatchObject({ok:false,retryAfterSeconds:180});
    expect(JSON.stringify(first)).not.toContain("test-secret");
    const second=await queryRapidApi(user,ws.id,query(),{key:"test-secret",fetch});
    expect(second.cached).toBe(true);expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("enforces the workspace request budget before calling a provider",async()=>{
    const {user,ws,fetch}=await setup(), sql=await getSql();
    await sql.query("insert into rapidapi_quota_buckets values($1,date_trunc('hour',now()),30)",["workspace:"+ws.id]);
    expect((await queryRapidApi(user,ws.id,query(),{key:"test",fetch})).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not fetch when unconfigured or a request lease is held",async()=>{
    const {user,ws,fetch}=await setup();
    expect((await queryRapidApi(user,ws.id,query(),{key:"",fetch})).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    let release!:()=>void;
    const blocked=vi.fn(async()=>{await new Promise<void>(r=>{release=r;});return {response:new Response(JSON.stringify(payload)),finalUrl:new URL("https://"+RAPIDAPI_HOST)};});
    const first=queryRapidApi(user,ws.id,query(),{key:"concurrent",fetch:blocked});
    await vi.waitFor(()=>expect(blocked).toHaveBeenCalled());
    const second=await queryRapidApi(user,ws.id,query(),{key:"concurrent",fetch:blocked});
    expect(second.error).toMatch(/already running/);
    release();await first;expect(blocked).toHaveBeenCalledTimes(1);
  });
});
