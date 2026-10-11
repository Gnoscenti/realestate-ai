import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { redeemAccessCode } from "@/lib/billing/entitlement.server";
import { ensurePersonalWorkspace } from "@/lib/workspaces/repository.server";
import { createSocialDraft,changeSocialDraft,publishSocialDraft,getSocialDraft,listPublications,refreshPublication,socialDraftHistory } from "@/lib/social-desk/repository.server";
import { savePostizConnection,PostizError,type PostizChannel } from "@/lib/social-desk/postiz.server";
const channels:PostizChannel[]=[{id:"channel",name:"Test",identifier:"linkedin",platform:"linkedin",disabled:false}];
async function setup() {
  const userId="dispatch-"+randomUUID();const workspace=await ensurePersonalWorkspace(userId);
  await redeemAccessCode(userId,workspace.id,"RSF-BETA-01");
  await savePostizConnection(userId,workspace.id,{apiKey:"synthetic-test-key"},{
    fetchImpl:async(url)=>({response:new Response(JSON.stringify(channels),{status:200}),finalUrl:new URL(url)}),
  });
  const content={title:"Test",platform:"linkedin" as const,caption:"A documented perspective for a real estate client.",
    facts:"Author's own perspective.",sourceUrl:"",attribution:"",mediaUrls:[],origin:""};
  const draft=await createSocialDraft(userId,workspace.id,content);
  const approved=await changeSocialDraft(userId,workspace.id,draft.id,draft.revision,{action:"approve",reviewedFactsAndRights:true});
  return {userId,workspace,content,approved,request:{id:approved.id,revision:approved.revision,channelId:"channel"}};
}
describe("social dispatch reservations",()=>{
  it("freezes the revision before sending, rejects duplicate dispatch/edit and retains unknown outcomes",async()=>{
    const {userId,workspace,content,approved,request}=await setup();
    let started!:()=>void;const dispatched=new Promise<void>(resolve=>{started=resolve;});
    let release!:()=>void;const waiting=new Promise<void>(resolve=>{release=resolve;});
    let calls=0;
    const sending=publishSocialDraft(userId,workspace.id,request,{channels:async()=>channels,
      create:async()=>{calls++;started();await waiting;throw new PostizError("postiz_timeout");},
    });
    // Attach rejection observer before completing the asynchronous dispatch.
    const outcome=expect(sending).rejects.toThrow("postiz_timeout");
    await dispatched;
    expect((await getSocialDraft(userId,workspace.id,approved.id)).state).toBe("publishing");
    await expect(publishSocialDraft(userId,workspace.id,request,{channels:async()=>channels})).rejects.toThrow(/Approve/);
    await expect(changeSocialDraft(userId,workspace.id,approved.id,approved.revision,{action:"edit",content})).rejects.toThrow(/confirmation/);
    release();await outcome;
    expect(calls).toBe(1);
    expect((await listPublications(userId,workspace.id))[0]?.status).toBe("unknown");
    expect((await getSocialDraft(userId,workspace.id,approved.id)).content).toEqual(content);
  });
  it("returns a definitively rejected dispatch to reviewable approved content",async()=>{
    const {userId,workspace,approved,request}=await setup();
    await expect(publishSocialDraft(userId,workspace.id,request,{channels:async()=>channels,
      create:async()=>{throw new PostizError("postiz_http_400","Rejected content");},
    })).rejects.toThrow("Rejected content");
    expect((await getSocialDraft(userId,workspace.id,approved.id)).state).toBe("approved");
    expect((await listPublications(userId,workspace.id))[0]?.status).toBe("failed");
  });
});

describe("social publication reconciliation", () => {
  it("retains a terminal result when an older refresh returns pending, with one publication event", async () => {
    const {userId,workspace,request} = await setup();
    const scheduled = await publishSocialDraft(userId,workspace.id,request,{
      channels:async()=>channels,create:async()=>({providerPostId:"remote-id",raw:{id:"remote-id"}}),
    });
    let release!:()=>void, started!:()=>void;
    const waiting = new Promise<void>(resolve=>{release=resolve;});
    const inFlight = new Promise<void>(resolve=>{started=resolve;});
    const stale = refreshPublication(userId,workspace.id,scheduled.publication.id,{status:async()=>{
      started();await waiting;return {state:"QUEUE",releaseUrl:null,publishDate:null};
    }});
    await inFlight;
    const confirmed = await refreshPublication(userId,workspace.id,scheduled.publication.id,{status:async()=>({
      state:"PUBLISHED",releaseUrl:"https://www.linkedin.com/feed/update/urn:li:activity:123456789",publishDate:null,
    })});
    release();
    const late = await stale;
    expect(confirmed.publication.status).toBe("published");
    expect(late.publication).toEqual(confirmed.publication);
    expect(late.draft.revision).toBe(confirmed.draft.revision);
    expect(late.draft.state).toBe("published");
    const events = await socialDraftHistory(userId,workspace.id,request.id);
    expect(events.filter(e=>e.action==="publish")).toHaveLength(1);
  });
  it("never renders a provider's unsafe release URL as a publication link", async () => {
    const {userId,workspace,request} = await setup();
    const scheduled = await publishSocialDraft(userId,workspace.id,request,{
      channels:async()=>channels,create:async()=>({providerPostId:"remote-id",raw:{}}),
    });
    const result=await refreshPublication(userId,workspace.id,scheduled.publication.id,{status:async()=>({
      state:"PUBLISHED",releaseUrl:"javascript:alert(1)",publishDate:null,
    })});
    expect(result.publication.status).toBe("published");
    expect(result.publication.releaseUrl).toBeNull();
    expect(result.draft.postUrl).toBeNull();
  });
});
