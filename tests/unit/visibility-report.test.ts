import { describe, expect, it } from "vitest";
import { buildVisibilityBasket, BASKET_VERSION } from "@/lib/aieo/visibility/basket";
import { nameAppears, evaluateSubject, citationBelongsToSubject, toCitation } from "@/lib/aieo/visibility/evaluate";
import { buildVisibilityReport } from "@/lib/aieo/visibility/report";
import { summarizeExpertise, expertiseSourceSchema, suggestExpertisePassages } from "@/lib/aieo/visibility/expertise";
import { source,subject,page,observation } from "../fixtures/visibility-expertise";

describe("expertise-based discovery measurement",()=>{
  it("freezes designed questions without names, biography, brokerage or prestige bias in discovery",()=>{
    const prompts=buildVisibilityBasket(subject);
    expect(BASKET_VERSION).toBe("v2-expertise");
    expect(prompts).toHaveLength(8);
    for(const p of prompts.filter(p=>!p.branded)) {
      expect(p.text).not.toMatch(/Jordan Rivera|Pacific Coast Realty|jordanrivera|luxury|high.end/);
      expect(p.text).toContain(subject.area);
    }
    expect(buildVisibilityBasket(subject)).toEqual(prompts);
  });
  it("rejects dispersed names and namesakes as positive identity",()=>{
    expect(nameAppears("Jordan Smith and Maria Rivera-Lopez","Jordan Rivera")).toBe(false);
    expect(nameAppears("Jordan's brother Sam Rivera is a plumber.","Jordan Rivera")).toBe(false);
    expect(evaluateSubject("Consider Jordan Rivera.",[],subject)).toMatchObject({mentioned:true,ambiguousIdentity:true,recommended:false});
  });
  it("separates a negative mention from a recommendation even with a valid subject citation",()=>{
    const result=evaluateSubject("I do not recommend Jordan Rivera at Pacific Coast Realty.",[toCitation("https://jordanrivera.example/about")!],subject);
    expect(result).toMatchObject({mentioned:true,cited:true,negativeMention:true,recommended:false});
  });
  it("does not treat a prose URL or another agent's page on a directory as a subject citation",()=>{
    expect(evaluateSubject("Jordan Rivera https://jordanrivera.example",[],subject).cited).toBe(false);
    expect(citationBelongsToSubject(toCitation("https://zillow.com/profile/other")!,subject)).toBe(false);
    expect(citationBelongsToSubject(toCitation("https://jordanrivera.example.evil.test")!,subject)).toBe(false);
    expect(citationBelongsToSubject(toCitation("https://compass.com/agents/someone-else")!,{...subject,websiteHost:"compass.com"})).toBe(false);
  });
  it("separates mention/recommendation/citation denominators and failed observations",()=>{
    const runs=[
      observation({id:"positive",promptId:"one",answerText:"Consider Jordan Rivera at Pacific Coast Realty.",mentioned:true,recommended:true}),
      observation({id:"negative",promptId:"two",answerText:"Avoid Jordan Rivera at Pacific Coast Realty.",mentioned:true,recommended:true}),
      observation({id:"ambiguous",promptId:"three",answerText:"Jordan Rivera is an agent.",mentioned:true,recommended:true}),
      observation({id:"failed",promptId:"four",status:"failed",errorCode:"provider_timeout"}),
    ];
    const report=buildVisibilityReport(runs,subject,[page]);
    expect(report.discovery).toEqual({numerator:1,denominator:3,percent:33});
    expect(report.mentions.numerator).toBe(3);expect(report.negative).toBe(1);expect(report.ambiguous).toBe(1);expect(report.failed).toBe(1);
  });
  it("deduplicates execution keys and preserves team versus person competitors",()=>{
    const run=observation({entities:[{name:subject.brokerage!,kind:"brokerage",recommended:true}]});
    const report=buildVisibilityReport([run,{...run,id:"duplicate"}],subject,[page]);
    expect(report.completed).toBe(1);expect(report.competitors[0]?.name).toBe(subject.brokerage);
  });
  it("produces an actionable evidence-linked gap and an explicit test hypothesis",()=>{
    const opportunity=buildVisibilityReport([observation()],subject,[page]).opportunities[0]!;
    expect(opportunity.status).toBe("ready");
    expect(opportunity.supportingEvidence?.[0]?.id).toBe(source.id);
    expect(opportunity.evidenceRunIds).toEqual(["run-test"]);
    expect(opportunity.pageEvidence?.[0]?.id).toBe(page.id);
    expect(opportunity.priority).toBe(60);
    expect(opportunity.contentGap).toMatch(/bounded check/);
    expect(opportunity.testPlan).toMatch(/matching provider/);
  });
  it("does not use another agent's biography as the subject's page evidence",()=>{
    const brokerSubject={...subject,websiteHost:"smallbroker.example",websiteUrl:"https://smallbroker.example/agents/jordan"};
    const otherPage={...page,url:"https://smallbroker.example/agents/alex",text:page.text+" Rural specialists in our team."};
    expect(buildVisibilityReport([observation()],brokerSubject,[otherPage]).opportunities).toEqual([]);
    const ownPage={...otherPage,url:brokerSubject.websiteUrl};
    expect(buildVisibilityReport([observation()],brokerSubject,[ownPage]).opportunities).toHaveLength(1);
  });
  it("abstains without support, public-page inspection, permissions, or relevant observation",()=>{
    expect(buildVisibilityReport([observation()],{...subject,expertise:[]},[page]).opportunities).toEqual([]);
    expect(buildVisibilityReport([observation()],subject,[]).opportunities).toEqual([]);
    expect(buildVisibilityReport([observation()],{...subject,expertise:[{...source,publishAllowed:false}]},[page]).opportunities).toEqual([]);
    expect(buildVisibilityReport([observation({clusterId:"choose_agent"})],subject,[page]).opportunities).toEqual([]);
    expect(buildVisibilityReport([observation({status:"failed"})],subject,[page]).discovery.percent).toBeNull();
  });
});
describe("expertise evidence",()=>{
  it("does not turn declarations or a team's evidence into personal expertise",()=>{
    expect(summarizeExpertise([{...source,kind:"declaration"}],"agent",subject.name).find(t=>t.topic==="rural")?.status).toBe("insufficient");
    expect(summarizeExpertise([{...source,entityKind:"team"}],"agent",subject.name).find(t=>t.topic==="rural")?.status).toBe("insufficient");
  });
  it("keeps contrary reports and does not treat syndicated copies as independent support",()=>{
    const negative={...source,id:"negative",excerpt:"The client reported poor communication during the rural inspection.",statement:"The client reported poor communication during the rural inspection.",polarity:"contradictory" as const};
    const themes=summarizeExpertise([source,{...source,id:"copy",url:"https://another.example/review"},negative],"agent",subject.name);
    expect(themes.find(t=>t.topic==="rural")).toMatchObject({status:"needs_review",strength:0});
    expect(themes.find(t=>t.topic==="rural")?.evidence).toHaveLength(2);
    expect(buildVisibilityReport([observation()],{...subject,expertise:[source,negative]},[page]).opportunities).toEqual([]);
  });
  it("validates exact excerpts, permission notes and nonfuture dates",()=>{
    const {id: _id,contentHash:_hash,observedAt:_at,...input}=source;
    expect(expertiseSourceSchema.safeParse(input).success).toBe(true);
    expect(expertiseSourceSchema.safeParse({...input,statement:"An invented outcome that is not in this source."}).success).toBe(false);
    expect(expertiseSourceSchema.safeParse({...input,sourceDate:"2099-01-01"}).success).toBe(false);
    expect(expertiseSourceSchema.safeParse({...input,permissionNote:""}).success).toBe(false);
  });
  it("suggests exact passages without inventing review themes",()=>{
    const suggestions=suggestExpertisePassages(source.statement);
    expect(suggestions.some(s=>s.topic==="rural" && s.statement===source.statement)).toBe(true);
  });
});

describe("citation footprint boundaries", () => {
  it("does not award an agent the other profiles of an unrecognized brokerage", () => {
    const hosted = {...subject,websiteHost:"localbrokerage.example",websiteUrl:"https://localbrokerage.example/agents/Jordan"};
    expect(citationBelongsToSubject(toCitation("https://localbrokerage.example/agents/Other")!,hosted)).toBe(false);
    expect(citationBelongsToSubject(toCitation("https://localbrokerage.example/agents/Jordan")!,hosted)).toBe(true);
    expect(citationBelongsToSubject(toCitation("https://localbrokerage.example/agents/jordan")!,hosted)).toBe(false);
    expect(citationBelongsToSubject(toCitation("https://localbrokerage.example/agents/Jordan/another-agent")!,hosted)).toBe(false);
  });
  it("retains identity-bearing query parameters and ignores only tracking parameters", () => {
    const hosted = {...subject,websiteHost:"directory.example",websiteUrl:"https://directory.example/profile?id=1",profileUrls:[]};
    expect(citationBelongsToSubject(toCitation("https://directory.example/profile?id=2")!,hosted)).toBe(false);
    expect(citationBelongsToSubject(toCitation("https://directory.example/profile?id=1&utm_source=engine")!,hosted)).toBe(true);
    expect(citationBelongsToSubject(toCitation("https://directory.example/")!,hosted)).toBe(false);
  });
});
