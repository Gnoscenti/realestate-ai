import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensurePersonalWorkspace } from "@/lib/workspaces/repository.server";
import { redeemAccessCode } from "@/lib/billing/entitlement.server";
import {
  changeSocialDraft,
  createSocialDraft,
  listPublications,
  listSocialDrafts,
  publishSocialDraft,
  refreshPublication,
  socialDraftHistory,
} from "@/lib/social-desk/repository.server";
import { hasBlockingFinding, reviewCaption } from "@/lib/social-desk/fair-housing";
import { draftCaption } from "@/lib/social-desk/drafting.server";
import {
  decryptSecret,
  PostizError,
  encryptSecret,
  parseChannels,
  parseCreatePostResponse,
  savePostizConnection,
  type PostizChannel,
} from "@/lib/social-desk/postiz.server";
import { exportSocialDraft, socialContentSchema, validatePostUrl } from "@/lib/social-desk/types";

afterEach(() => vi.unstubAllEnvs());

const content = {
  title: "Just listed · 1 Coastal Way",
  platform: "instagram" as const,
  caption: "1 Coastal Way in Solana Beach is listed at $2,450,000. 4 bedrooms, ocean views from the primary suite. Message me for a showing.",
  facts: "Address 1 Coastal Way\nList price $2,450,000\n4 bedrooms",
  sourceUrl: "",
  attribution: "",
  mediaUrls: ["https://photos.example/1.jpg"],
  origin: "",
};

async function workspaceFor() {
  const userId = `social-${randomUUID()}`;
  const workspace = await ensurePersonalWorkspace(userId);
  return { userId, workspace };
}

describe("fair-housing review", () => {
  it("blocks protected-class targeting and flags steering language", () => {
    const findings = reviewCaption("Perfect for families, no kids upstairs, safe neighborhood near the church.");
    expect(hasBlockingFinding(findings)).toBe(true);
    expect(findings.map((finding) => finding.severity)).toContain("review");
    expect(reviewCaption("Four bedrooms, step-free entry, two blocks from the library.")).toEqual([]);
  });

  it("flags unsourced production superlatives for review, not block", () => {
    const findings = reviewCaption("#1 agent in town with $40M in sales");
    expect(hasBlockingFinding(findings)).toBe(false);
    expect(findings.length).toBeGreaterThanOrEqual(2);
  });

  it("blocks source-of-income refusals such as 'no Section 8'", () => {
    expect(hasBlockingFinding(reviewCaption("Bright two-bedroom, no Section 8 please."))).toBe(true);
    expect(hasBlockingFinding(reviewCaption("We don't accept housing vouchers."))).toBe(true);
    expect(hasBlockingFinding(reviewCaption("All lawful sources of income considered."))).toBe(false);
  });
});

describe("draft lifecycle", () => {
  it("creates, edits into a new revision, approves, hands off, and records a receipt", async () => {
    const { userId, workspace } = await workspaceFor();
    const created = await createSocialDraft(userId, workspace.id, content);
    expect(created.state).toBe("draft");
    expect(created.revision).toBe(1);
    expect(() => exportSocialDraft(created)).toThrow(/Approve/);

    await expect(
      changeSocialDraft(userId, workspace.id, created.id, 99, { action: "approve", reviewedFactsAndRights: true }),
    ).rejects.toThrow(/another tab/);
    const approved = await changeSocialDraft(userId, workspace.id, created.id, 1, { action: "approve", reviewedFactsAndRights: true });
    expect(approved.state).toBe("approved");
    expect(approved.approvedBy).toBe(userId);
    expect(exportSocialDraft(approved)).toBe(content.caption);

    const handed = await changeSocialDraft(userId, workspace.id, created.id, approved.revision, { action: "handoff" });
    expect(handed.state).toBe("handed_off");
    await expect(
      changeSocialDraft(userId, workspace.id, created.id, handed.revision, { action: "receipt", postUrl: "https://instagram.com/jordan" }),
    ).rejects.toThrow(/post URL/);
    const posted = await changeSocialDraft(userId, workspace.id, created.id, handed.revision, {
      action: "receipt",
      postUrl: "https://www.instagram.com/p/abc123/",
    });
    expect(posted.state).toBe("reported_posted");
    expect(posted.postUrl).toBe("https://www.instagram.com/p/abc123/");

    const edited = await changeSocialDraft(userId, workspace.id, created.id, posted.revision, {
      action: "edit",
      content: { ...content, caption: "Updated caption for a new post." },
    });
    expect(edited.state).toBe("draft");
    expect(edited.approvedBy).toBeNull();
    const history = await socialDraftHistory(userId, workspace.id, created.id);
    expect(history.map((entry) => entry.action)).toEqual(["edit", "receipt", "handoff", "approve", "create"]);
  });

  it("refuses to approve a caption with a blocking fair-housing finding", async () => {
    const { userId, workspace } = await workspaceFor();
    const created = await createSocialDraft(userId, workspace.id, { ...content, caption: "Adults only building, no kids." });
    await expect(
      changeSocialDraft(userId, workspace.id, created.id, 1, { action: "approve", reviewedFactsAndRights: true }),
    ).rejects.toThrow(/fair-housing/);
  });

  it("enforces platform limits and tenant isolation", async () => {
    expect(socialContentSchema.safeParse({ ...content, platform: "x", caption: "x".repeat(281) }).success).toBe(false);
    expect(() => validatePostUrl("x", "https://x.com/jordan/status/123")).not.toThrow();
    expect(() => validatePostUrl("linkedin", "https://evil.example/posts/1")).toThrow();
    const { userId, workspace } = await workspaceFor();
    await createSocialDraft(userId, workspace.id, content);
    await expect(listSocialDrafts("stranger", workspace.id)).rejects.toThrow("Workspace not found");
  });
});

describe("AI drafting", () => {
  it("requires entitlement, then returns the facts used and a fair-housing review", async () => {
    vi.stubEnv("XAI_API_KEY", "test");
    const { userId, workspace } = await workspaceFor();
    const request = { platform: "x" as const, goal: "just_listed" as const, voice: "Direct and brief", facts: ["List price $1"], audienceNote: "", linkUrl: "" };
    await expect(draftCaption(userId, workspace.id, request)).rejects.toThrow(/active plan/);
    await redeemAccessCode(userId, workspace.id, "RSF-BETA-01");
    const complete = vi.fn(async () => ({
      value: { caption: "x".repeat(400) + " perfect for families", altHooks: ["Hook"], factsUsed: ["List price $1"], unsupportedClaimsAvoided: ["award"], hashtags: ["JustListed", "#Solana Beach", "a", "b", "c"] },
      model: "grok-test",
      costUsdTicks: 1,
    }));
    const draft = await draftCaption(userId, workspace.id, request, { complete: complete as never });
    expect(Array.from(draft.caption).length).toBeLessThanOrEqual(280);
    expect(draft.hashtags).toEqual(["#JustListed", "#SolanaBeach", "#a"]);
    expect(draft.review.some((finding) => /families/.test(finding.phrase))).toBe(true);
    expect(draft.model).toBe("grok-test");
  });
});

describe("Postiz publishing", () => {
  it("encrypts credentials at rest and parses channel and post responses leniently", () => {
    const cipher = encryptSecret("api-key-value");
    expect(cipher).not.toContain("api-key-value");
    expect(decryptSecret(cipher)).toBe("api-key-value");
    expect(parseChannels([{ id: "c1", name: "Jordan", identifier: "linkedin", disabled: false }])).toEqual([
      { id: "c1", name: "Jordan", identifier: "linkedin", platform: "linkedin", picture: undefined, profile: undefined, disabled: false },
    ]);
    expect(parseChannels({ integrations: [{ id: "c2", identifier: "tiktok" }] })[0]?.platform).toBeNull();
    expect(parseCreatePostResponse([{ postId: "p1", integration: "c1" }])).toBe("p1");
    expect(parseCreatePostResponse({ id: "p2" })).toBe("p2");
    expect(parseCreatePostResponse("weird")).toBeNull();
  });

  it("publishes an approved revision through the connection, then reflects provider status", async () => {
    const { userId, workspace } = await workspaceFor();
    const channels: PostizChannel[] = [
      { id: "ig-1", name: "Jordan IG", identifier: "instagram", platform: "instagram", disabled: false },
      { id: "li-1", name: "Jordan LI", identifier: "linkedin", platform: "linkedin", disabled: false },
    ];
    const fetchImpl = vi.fn(async (url: string | URL) => ({
      response: new Response(JSON.stringify(channels), { status: 200, headers: { "content-type": "application/json" } }),
      finalUrl: new URL(String(url)),
    }));
    await savePostizConnection(userId, workspace.id, { apiKey: "postiz-key-12345" }, { fetchImpl: fetchImpl as never });

    const created = await createSocialDraft(userId, workspace.id, content);
    await expect(
      publishSocialDraft(userId, workspace.id, { id: created.id, revision: 1, channelId: "ig-1" }, { channels: async () => channels }),
    ).rejects.toThrow(/Approve/);
    const approved = await changeSocialDraft(userId, workspace.id, created.id, 1, { action: "approve", reviewedFactsAndRights: true });

    await expect(
      publishSocialDraft(userId, workspace.id, { id: created.id, revision: approved.revision, channelId: "li-1" }, { channels: async () => channels }),
    ).rejects.toThrow(/written for instagram/);

    const upload = vi.fn(async () => ({ id: "m1", path: "https://cdn.postiz.example/m1.jpg" }));
    const create = vi.fn(async (_connection, input) => {
      expect(input.content).toBe(content.caption);
      expect(input.media).toEqual([{ id: "m1", path: "https://cdn.postiz.example/m1.jpg" }]);
      return { providerPostId: "post-9", raw: [{ postId: "post-9" }] };
    });
    const published = await publishSocialDraft(
      userId,
      workspace.id,
      { id: created.id, revision: approved.revision, channelId: "ig-1", scheduledFor: new Date(Date.now() + 3_600_000).toISOString() },
      { channels: async () => channels, upload: upload as never, create: create as never },
    );
    expect(published.draft.state).toBe("scheduled");
    expect(published.publication).toMatchObject({ status: "scheduled", providerPostId: "post-9", channelPlatform: "instagram" });
    await expect(
      changeSocialDraft(userId, workspace.id, created.id, published.draft.revision, { action: "edit", content }),
    ).rejects.toThrow(/scheduled/);

    const refreshed = await refreshPublication(userId, workspace.id, published.publication.id, {
      status: async () => ({ state: "PUBLISHED", releaseUrl: "https://www.instagram.com/p/live/", publishDate: null }),
    });
    expect(refreshed.publication.status).toBe("published");
    expect(refreshed.draft.state).toBe("published");
    expect(refreshed.draft.postUrl).toBe("https://www.instagram.com/p/live/");
    const publications = await listPublications(userId, workspace.id);
    expect(publications).toHaveLength(1);
  });

  it("records a failed provider call without losing the approved draft", async () => {
    const { userId, workspace } = await workspaceFor();
    const channels: PostizChannel[] = [{ id: "ig-1", name: "IG", identifier: "instagram", platform: "instagram", disabled: false }];
    const fetchImpl = vi.fn(async (url: string | URL) => ({ response: new Response(JSON.stringify(channels), { status: 200 }), finalUrl: new URL(String(url)) }));
    await savePostizConnection(userId, workspace.id, { apiKey: "postiz-key-12345" }, { fetchImpl: fetchImpl as never });
    const created = await createSocialDraft(userId, workspace.id, { ...content, mediaUrls: [] });
    const approved = await changeSocialDraft(userId, workspace.id, created.id, 1, { action: "approve", reviewedFactsAndRights: true });
    await expect(
      publishSocialDraft(
        userId,
        workspace.id,
        { id: created.id, revision: approved.revision, channelId: "ig-1" },
        {
          channels: async () => channels,
          create: (async () => {
            throw new PostizError("postiz_rate_limited","Postiz rate limit reached (90 posts/hour)");
          }) as never,
        },
      ),
    ).rejects.toThrow(/rate limit/);
    const drafts = await listSocialDrafts(userId, workspace.id);
    expect(drafts[0]?.state).toBe("approved");
    const publications = await listPublications(userId, workspace.id);
    expect(publications[0]?.status).toBe("failed");
  });

  it("rejects a bad key before storing anything", async () => {
    const { userId, workspace } = await workspaceFor();
    const fetchImpl = vi.fn(async (url: string | URL) => ({ response: new Response("{}", { status: 401 }), finalUrl: new URL(String(url)) }));
    await expect(
      savePostizConnection(userId, workspace.id, { apiKey: "postiz-key-12345" }, { fetchImpl: fetchImpl as never }),
    ).rejects.toThrow(/rejected the API key/);
  });
});
