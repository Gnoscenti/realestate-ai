import { afterEach, describe, expect, it, vi } from "vitest";
import type { BetaCommentRecord } from "@/lib/beta-comments";
import { createGitHubIssue } from "@/lib/beta-comments-api";

const record: BetaCommentRecord = {
  pagePath: "/search",
  pageTitle: "Smart Search",
  module: "search",
  body: "Rank only my book.",
  category: "ux",
  sessionId: "session-test",
  sessionNumber: 1,
  id: "bc-test",
  createdAt: "2026-08-09T20:00:00.000Z",
  globalNumber: 12,
  fileName: "0012-search.md",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GitHub beta issue creation", () => {
  it("creates an issue with the automation label", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          number: 42,
          html_url: "https://github.com/Gnoscenti/realestate-ai/issues/42",
          title: "[Beta #0012] Smart Search",
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const issue = await createGitHubIssue("token", record, "# Feedback");

    expect(issue?.number).toBe(42);
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.labels).toContain("beta-feedback");
  });

  it("keeps beta-feedback on the 422 label fallback", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("invalid label", { status: 422 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            number: 43,
            html_url: "https://github.com/Gnoscenti/realestate-ai/issues/43",
            title: "[Beta #0012] Smart Search",
          }),
          { status: 201 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const issue = await createGitHubIssue("token", record, "# Feedback");

    expect(issue?.number).toBe(43);
    const fallback = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(fallback.labels).toEqual(["beta-feedback"]);
  });

  it("treats a bare 404 as delivery failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Not Found", { status: 404 })),
    );

    await expect(
      createGitHubIssue("token", record, "# Feedback"),
    ).resolves.toBeNull();
  });

  it("preserves device fallback semantics on a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network unavailable")),
    );

    await expect(
      createGitHubIssue("token", record, "# Feedback"),
    ).resolves.toBeNull();
  });
});
