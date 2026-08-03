import { describe, expect, it } from "vitest";
import {
  buildFileName,
  formatBetaCommentMarkdown,
  resolvePageMeta,
} from "@/lib/beta-comments";

describe("beta comments", () => {
  it("resolves module for known routes", () => {
    expect(resolvePageMeta("/outreach").module).toBe("outreach");
    expect(resolvePageMeta("/").title).toBe("Command Center");
  });

  it("builds numbered filenames", () => {
    expect(buildFileName(7, "Email Alerts")).toBe("0007-email-alerts.md");
  });

  it("formats anonymous markdown for Grok", () => {
    const md = formatBetaCommentMarkdown({
      id: "x",
      pagePath: "/cma",
      pageTitle: "CMA Studio",
      module: "cma",
      body: "Add export to PDF button",
      category: "feature",
      sessionId: "s_anon",
      sessionNumber: 1,
      createdAt: "2026-08-03T00:00:00.000Z",
      globalNumber: 3,
      fileName: "0003-cma.md",
    });
    expect(md).toMatch(/Beta Comment #0003/);
    expect(md).toMatch(/CMA Studio/);
    expect(md).toMatch(/`cma`/);
    expect(md).toMatch(/Add export to PDF/);
    expect(md).not.toMatch(/@|email|name:/i);
  });
});
