import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildBetaIssueLabels,
  buildBetaIssueTitle,
  createGitHubIssue,
  formatBetaIssueBody,
} from "@/lib/beta-comments-api";
import type { BetaCommentRecord } from "@/lib/beta-comments";

const baseRecord: BetaCommentRecord = {
  id: "bc_1",
  pagePath: "/search",
  pageTitle: "Smart Search",
  module: "search",
  body: "Improve the filters so price, beds, and map results update together without flicker.",
  category: "feature",
  sessionId: "s_anon",
  sessionNumber: 2,
  createdAt: "2026-08-09T20:00:00.000Z",
  globalNumber: 12,
  fileName: "0012-search.md",
};

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_PAT;
});

describe("beta comments API issue helpers", () => {
  it("builds the required GitHub issue title and labels", () => {
    expect(buildBetaIssueTitle(baseRecord)).toBe(
      "[Beta #0012] Smart Search: Improve the filters so price, beds, and map results update together with",
    );
    expect(buildBetaIssueLabels(baseRecord)).toEqual([
      "beta-feedback",
      "enhancement",
      "module:search",
    ]);
  });

  it("adds the auto-created footer to the issue body", () => {
    const issueBody = formatBetaIssueBody("# Heading\n\nSuggestion text\n");
    expect(issueBody).toContain("Suggestion text");
    expect(issueBody).toContain("_Auto-created from the beta Suggest drawer._");
  });

  it("retries issue creation without labels after a 422 error", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Validation Failed" }), {
          status: 422,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            number: 99,
            html_url: "https://github.com/Gnoscenti/realestate-ai/issues/99",
            title: "[Beta #0012] Smart Search: Improve the filters so price, beds",
          }),
          { status: 201 },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await createGitHubIssue(baseRecord, "# Markdown");

    expect(result.issue).toEqual({
      number: 99,
      url: "https://github.com/Gnoscenti/realestate-ai/issues/99",
      title: "[Beta #0012] Smart Search: Improve the filters so price, beds",
    });
    expect(result.issueAttempt).toMatchObject({
      attempted: true,
      created: true,
      retriedWithoutLabels: true,
    });

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(firstBody.labels).toEqual(["beta-feedback", "enhancement", "module:search"]);
    expect(secondBody.labels).toBeUndefined();
  });
});
