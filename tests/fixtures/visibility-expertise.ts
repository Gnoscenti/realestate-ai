import type { ExpertiseEvidence, PageObservation } from "@/lib/aieo/visibility/expertise";
import type { VisibilitySubject } from "@/lib/aieo/visibility/basket";
import type { VisibilityRun } from "@/lib/aieo/visibility/report";
import { toCitation } from "@/lib/aieo/visibility/evaluate";
export const source:ExpertiseEvidence={
  id:"evidence-test",entityName:"Jordan Rivera",entityKind:"agent",topic:"rural",kind:"case_material",
  url:"",sourceLabel:"Synthetic authorized case fixture",sourceDate:"2026-09-01",
  excerpt:"Jordan Rivera coordinated rural property inspections and explained well water and septic reports.",
  statement:"Jordan Rivera coordinated rural property inspections and explained well water and septic reports.",
  polarity:"supporting",permission:"authorized",permissionNote:"Synthetic test fixture; no real client data.",
  publishAllowed:true,identityReviewed:true,contentHash:"fixture",observedAt:"2026-09-08T10:00:00Z",
};
export const subject:VisibilitySubject={name:"Jordan Rivera",entityKind:"agent",area:"Rancho Santa Fe, CA",
  websiteHost:"jordanrivera.example",brokerage:"Pacific Coast Realty",license:"01234567",
  profileUrls:["https://zillow.com/profile/jordan-rivera"],expertise:[source],expertiseTopics:["rural"]};
export const page:PageObservation={id:"page-test",url:"https://jordanrivera.example/about",text:"Jordan Rivera works in Rancho Santa Fe at Pacific Coast Realty.",
  contentHash:"page-hash",identityMatched:true,observedAt:"2026-09-08T10:00:00Z"};
export function observation(overrides:Partial<VisibilityRun>={}):VisibilityRun {
  return {id:"run-test",batchId:"batch-test",clusterId:"expertise.rural",promptId:"expertise.rural",
    prompt:"Which agents can help with rural property inspections in Rancho Santa Fe, CA?",
    branded:false,provider:"xai",requestedModel:"test-model",returnedModel:"test-model-actual",
    methodVersion:"expertise-v2",surface:"api_web_grounded",status:"ok",
    answerText:"Consider Alex Chen at Example Realty for rural property due diligence.",
    citations:[toCitation("https://alexchen.example/rural")!],
    entities:[{name:"Alex Chen",kind:"agent",recommended:true}],costUsdTicks:100,
    mentioned:false,cited:false,recommended:false,...overrides};
}
