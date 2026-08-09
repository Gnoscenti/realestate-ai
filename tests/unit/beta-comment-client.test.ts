import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BetaCommentPayload,
  BetaCommentRecord,
} from "@/lib/beta-comments";
import {
  emailBetaCommentClient,
  loadLocalBetaInbox,
  reconcileLocalBetaComment,
  saveLocalBetaComment,
} from "@/lib/beta-comment-client";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const payload: BetaCommentPayload = {
  pagePath: "/search",
  pageTitle: "Search",
  module: "search",
  body: "Please make this clearer.",
  category: "ux",
  sessionId: "session-test",
  sessionNumber: 1,
};

const record: BetaCommentRecord = {
  ...payload,
  id: "local-1",
  createdAt: "2026-08-09T20:00:00.000Z",
  globalNumber: 1,
  fileName: "0001-search.md",
};

let openMailApp: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
  openMailApp = vi.fn();
  vi.stubGlobal("window", { open: openMailApp });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("emailBetaCommentClient", () => {
  it("returns the FormSubmit channel on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ success: "true", message: "Thank you" }),
          { status: 200 },
        ),
      ),
    );

    const result = await emailBetaCommentClient(record, {
      recipient: "feedback@example.com",
    });

    expect(result).toMatchObject({ ok: true, channel: "formsubmit" });
    expect(openMailApp).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      "https://formsubmit.co/ajax/feedback%40example.com",
      expect.any(Object),
    );
  });

  it("reports activation on 422 and requests the mail app", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: "false",
            message: "Check your email to activate your form",
          }),
          { status: 422 },
        ),
      ),
    );

    const result = await emailBetaCommentClient(record, {
      recipient: "feedback@example.com",
    });

    expect(result).toMatchObject({
      ok: true,
      channel: "mailto",
      needsActivation: true,
    });
    expect(openMailApp).toHaveBeenCalledOnce();
  });

  it("does not misclassify a bare 404 as activation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Not Found", { status: 404 })),
    );

    const result = await emailBetaCommentClient(record);

    expect(result).toMatchObject({
      ok: true,
      channel: "mailto",
      needsActivation: false,
    });
  });

  it("requests the mail app after a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network unavailable")),
    );

    const result = await emailBetaCommentClient(record);

    expect(result).toMatchObject({
      ok: true,
      channel: "mailto",
      needsActivation: false,
      error: "network unavailable",
    });
    expect(openMailApp).toHaveBeenCalledOnce();
  });

  it("returns device-only state when the mail-app request fails", async () => {
    openMailApp.mockImplementation(() => {
      throw new Error("no mail handler");
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network unavailable")),
    );

    const result = await emailBetaCommentClient(record);

    expect(result).toMatchObject({
      ok: false,
      channel: "none",
      needsActivation: false,
    });
  });
});

describe("local beta comment reconciliation", () => {
  it("upserts the server record without duplicating the device-first record", () => {
    const local = saveLocalBetaComment(payload);
    const server: BetaCommentRecord = {
      ...local,
      id: "server-27",
      globalNumber: 27,
      fileName: "0027-search.md",
      createdAt: "2026-08-09T20:01:00.000Z",
    };

    reconcileLocalBetaComment(local.id, server);

    expect(loadLocalBetaInbox()).toEqual([server]);
  });
});
