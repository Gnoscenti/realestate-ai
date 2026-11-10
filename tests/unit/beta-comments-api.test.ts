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
  it("creates a review-only intake issue without the coding-agent label", async () => {
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
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "Gnoscenti/realestate-ai-feedback-intake/issues",
    );
    expect(request.labels).toContain("feedback-intake");
    expect(request.labels).not.toContain("ai-ready");
  });

  it("keeps feedback-intake on the 422 label fallback", async () => {
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
    expect(fallback.labels).toEqual(["feedback-intake"]);
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

  it("reports a rejected delivery to operators without the token or reporter text", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Bad credentials" }), {
          status: 401,
          headers: { "x-github-request-id": "REQ-123" },
        }),
      ),
    );

    await expect(
      createGitHubIssue("github_pat_secret_value", record, "# Feedback"),
    ).resolves.toBeNull();

    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith("[suggest-intake] issue delivery failed", {
      reason: "github_rejected",
      repository: "Gnoscenti/realestate-ai-feedback-intake",
      status: 401,
      githubRequestId: "REQ-123",
      githubMessage: "Bad credentials",
    });
    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).not.toContain("github_pat_secret_value");
    expect(logged).not.toContain(record.body);
  });

  it("reports a non-JSON rejection and a network failure to operators", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("Not Found", { status: 404 }))
        .mockRejectedValueOnce(new Error("network unavailable")),
    );

    await createGitHubIssue("token", record, "# Feedback");
    await createGitHubIssue("token", record, "# Feedback");

    expect(errorLog.mock.calls[0]?.[1]).toMatchObject({
      reason: "github_rejected",
      status: 404,
      githubMessage: "",
    });
    expect(errorLog.mock.calls[1]?.[1]).toEqual({
      reason: "network",
      repository: "Gnoscenti/realestate-ai-feedback-intake",
    });
  });

  it("stays quiet in the error log when the issue is created", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ number: 7, html_url: "https://github.com/o/r/issues/7", title: "t" }),
          { status: 201 },
        ),
      ),
    );

    await expect(createGitHubIssue("token", record, "# Feedback")).resolves.toMatchObject({
      number: 7,
    });
    expect(errorLog).not.toHaveBeenCalled();
  });
});
