import { createHash } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import { readResponseText, safeFetch } from "@/lib/safe-outbound-url.server";
import { RAPIDAPI_ENDPOINTS, rapidQuerySchema, type RapidQuery, type RapidResult } from "./types";
import { normalizeRapidResponse } from "./normalize";

export const RAPIDAPI_HOST = "real-time-real-estate-data2.p.rapidapi.com";
export function rapidRequestUrl(query: RapidQuery): URL {
  const u = new URL(RAPIDAPI_ENDPOINTS[query.operation], "https://" + RAPIDAPI_HOST);
  if (["search","agents"].includes(query.operation)) u.searchParams.set("location",query.query);
  if (query.operation === "agents" && query.name) u.searchParams.set("name",query.name);
  if (["active","sold","rentals"].includes(query.operation)) u.searchParams.set("encodedZuid",query.query);
  if (["active","rentals"].includes(query.operation)) u.searchParams.set("include_team","false");
  if (["details","zestimate"].includes(query.operation)) u.searchParams.set("zpid",query.query);
  if (query.operation === "address") u.searchParams.set("address",query.query);
  if (query.operation === "polygon") u.searchParams.set("polygon",query.query);
  if (query.operation === "coordinates") {
    u.searchParams.set("lat",String(query.lat)); u.searchParams.set("long",String(query.long));
    u.searchParams.set("diameter",String(query.diameter));
  }
  if (["search","coordinates","polygon"].includes(query.operation)) u.searchParams.set("home_status",query.homeStatus);
  if (!["details","address","zestimate"].includes(query.operation)) u.searchParams.set("page",String(query.page));
  return u;
}
async function quota(sql: Sql, scope: string, interval: "minute" | "hour" | "day", max: number) {
  const rows = await sql.query(
    `insert into rapidapi_quota_buckets(scope,window_started_at,request_count)
     values($1,date_trunc('${interval}',now()),1)
     on conflict(scope,window_started_at) do update set request_count=rapidapi_quota_buckets.request_count+1
     where rapidapi_quota_buckets.request_count < $2 returning request_count`,[scope,max]);
  if (!rows.length) throw new Error("RapidAPI request budget reached. Try again later.");
}
function limit(value: string | undefined, fallback: number) {
  const n=Number(value); return Number.isInteger(n) && n>0 && n<=1000 ? n : fallback;
}
export async function queryRapidApi(userId: string, workspaceId: string, input: RapidQuery,
  deps: {sql?:Sql; fetch?:typeof safeFetch; key?:string} = {}): Promise<RapidResult> {
  const query = rapidQuerySchema.parse(input);
  const sql=deps.sql || await getSql();
  await requireWorkspaceAccess(userId,workspaceId,["owner","admin"],sql);
  const failed = (error:string):RapidResult => ({ok:false,operation:query.operation,page:query.page,observedAt:new Date().toISOString(),cached:false,listings:[],agents:[],hasMore:false,warnings:[],error});
  const key = deps.key ?? process.env.RAPIDAPI_KEY?.trim();
  if (!key) return failed("RapidAPI is not configured on this server.");
  const url=rapidRequestUrl(query);
  const cacheKey=createHash("sha256").update("v1:"+key+":"+url.toString()).digest("hex");
  const cached=await sql.query<{result:RapidResult|string}>(
    "select result from rapidapi_observation_cache where workspace_id=$1 and cache_key=$2 and expires_at>now() and result is not null",
    [workspaceId,cacheKey]);
  if (cached[0]) return {...(typeof cached[0].result==="string"?JSON.parse(cached[0].result):cached[0].result),cached:true};
  const lease=await sql.query(
    `insert into rapidapi_observation_cache(workspace_id,cache_key,lease_until) values($1,$2,now()+interval '60 seconds')
     on conflict(workspace_id,cache_key) do update set lease_until=excluded.lease_until
     where rapidapi_observation_cache.lease_until<=now() returning cache_key`,[workspaceId,cacheKey]);
  if (!lease.length) return failed("This request is already running. Try again shortly.");
  let result:RapidResult, ttl=900;
  try {
    await quota(sql,"workspace:"+workspaceId,"hour",30);
    await quota(sql,"rapidapi:minute","minute",10);
    await quota(sql,"rapidapi:day","day",limit(process.env.RAPIDAPI_DAILY_BUDGET,100));
    const response = (await (deps.fetch||safeFetch)(url,{
      headers:{"x-rapidapi-host":RAPIDAPI_HOST,"x-rapidapi-key":key,Accept:"application/json"},
      signal:AbortSignal.timeout(45000),
    },{maxRedirects:0,allowCrossOriginRedirects:false})).response;
    if (!response.ok) {
      const retry = response.headers.get("retry-after");
      const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : retry ? Math.ceil((Date.parse(retry)-Date.now())/1000) : 60;
      ttl = Math.min(3600,Math.max(60,Number.isFinite(seconds)?seconds:60));
      await response.body?.cancel();
      result=failed(response.status===429 ? "RapidAPI rate limit reached." : response.status===401 || response.status===403 ?
        "RapidAPI authorization or subscription failed." : "RapidAPI is temporarily unavailable.");
      result.retryAfterSeconds=ttl;
    } else {
      const raw=await readResponseText(response,5*1024*1024);
      result=normalizeRapidResponse(JSON.parse(raw),query,new Date().toISOString());
    }
  } catch {
    result=failed("The request could not complete (budget, timeout, or unexpected provider response). Try again later.");
    ttl=60;
  }
  await sql.query(
    `update rapidapi_observation_cache set result=$3::jsonb,expires_at=now()+($4*interval '1 second'),lease_until=now()
     where workspace_id=$1 and cache_key=$2`,[workspaceId,cacheKey,JSON.stringify(result),ttl]);
  return result;
}
