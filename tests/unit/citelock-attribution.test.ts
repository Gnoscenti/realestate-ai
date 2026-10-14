import { it } from 'vitest';
import assert from 'node:assert/strict';
import { analyzeGuidePages } from '@/lib/aieo/guide.server';
import { fetchRealTrendsProduction } from '@/lib/aieo/realtrends.server';
import type { GuideInput } from '@/lib/aieo/guide';
import type { Sql } from '@/lib/db';
const input: GuideInput = {name:'Julie Pierce Casey',area:'Rancho Santa Fe, CA',entityKind:'agent',website:'https://juliepiercecasey.com/about',brokerage:'',brokerUrl:'',rankingUrl:'https://www.realtrends.com/agent-profile/julie-pierce-casey-california/',additionalUrl:''};
const text='Julie Pierce Casey Location Rancho Santa Fe, CA Country United States About Julie Pierce Casey Julie Pierce Casey is a nationally recognized agent. RealTrends Verified Performance Based On 2025 Sales Data Sides 20 Volume $33.61M National Volume Rank 2901 Sides Rank - State Volume Rank 853 Sides Rank - City Volume Rank 5 Sides Rank 1 Awards';
it('guide retains the ranking, over qualifier, source URLs and unresolved methodology',()=>{
 const a=analyzeGuidePages(input,[{role:'ranking',url:input.rankingUrl,text},{role:'website',url:input.website,text:'Julie Pierce Casey Rancho Santa Fe closed over $44 million in sales in 2025 and over $56 million in the first half of 2026.'}],'2026-10-14T15:00:00Z');
 assert.equal(a.ranking?.sides,20); assert.equal(a.ranking?.citySidesRank,1);
 assert.equal(a.recommendedClaim,'Julie Pierce Casey ranked No. 1 by transaction sides among RealTrends-ranked agents in Rancho Santa Fe, based on 2025 sales data.');
 assert.equal(a.conflicts.length,1); assert.match(a.conflicts[0]!,/over \$44M/);assert.match(a.conflicts[0]!,/does not establish an error/);assert.match(a.conflicts[0]!,/juliepiercecasey.com/);assert.doesNotMatch(a.conflicts[0]!,/56M/);
});
it('new adapter cache lookups exclude older parser provenance and qualify fresh evidence',async()=>{
 const calls: { q: string; p: unknown[] }[]=[];const sql={query:async(q: string,p: unknown[])=>{calls.push({q,p});return [];}};
 const a=await fetchRealTrendsProduction({profileUrl:input.rankingUrl,observedAt:'2026-10-14T15:00:00Z'},{sql: sql as unknown as Sql,now:()=> '2026-10-14T15:00:00Z',fetchText:async()=>'<p>Based On 2025 Sales Data</p><div>Sides</div><div>20</div><div>Volume</div><div>$33.61M</div><div>City</div><div>Sides Rank</div><div>1</div>'});
 assert.match(calls[0]!.q,/note = \$3/);assert.match(String(calls[0]!.p[2]),/parser v2/);
 assert.equal(a.evidence.find(e=>e.field==='transaction_sides')?.value,'20 sides in 2025');
 for(const e of a.evidence){assert.equal(e.sourceUrl,input.rankingUrl);assert.equal(e.sourceTier,'independent');assert.match(e.note || "",/source-reported/);assert.match(e.note || "",/does not.*measure AI visibility/);}
});
