import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BetaCommentPayload,
  BetaCommentRecord,
} from "@/lib/beta-comments";
import {
  betaCommentDeliveryStatus,
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
  pageTitle: "Smart Search",
  module: "search",
  body: "Please make this clearer.",
  category: "ux",
  sessionId: "session-test",
  sessionNumber: 1,
};

beforeEach(() => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("device-first beta comment storage", () => {
  it("saves before delivery and reconciles without a duplicate", () => {
    const local = saveLocalBetaComment(payload);
    expect(loadLocalBetaInbox()).toEqual([local]);

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

  it("upserts a repeated server response instead of duplicating it", () => {
    const local = saveLocalBetaComment(payload);
    const server: BetaCommentRecord = {
      ...local,
      id: "server-27",
      globalNumber: 27,
      fileName: "0027-search.md",
    };

    reconcileLocalBetaComment(local.id, server);
    reconcileLocalBetaComment(local.id, {
      ...server,
      body: "Updated canonical body",
    });

    expect(loadLocalBetaInbox()).toHaveLength(1);
    expect(loadLocalBetaInbox()[0]?.body).toBe("Updated canonical body");
  });
});

describe("engineering-intake delivery tracking", () => {
  const serverRecord = (local: BetaCommentRecord, id: string): BetaCommentRecord => ({
    pagePath: local.pagePath,
    pageTitle: local.pageTitle,
    module: local.module,
    body: local.body,
    category: local.category,
    sessionId: local.sessionId,
    sessionNumber: local.sessionNumber,
    id,
    createdAt: local.createdAt,
    globalNumber: local.globalNumber,
    fileName: local.fileName,
  });

  it("marks a new suggestion unsent until the server confirms an issue", () => {
    const local = saveLocalBetaComment(payload);
    expect(betaCommentDeliveryStatus(local)).toBe("unsent");

    reconcileLocalBetaComment(local.id, serverRecord(local, "feedback_1"), {
      state: "sent",
      issueNumber: 12,
      issueUrl: "https://github.com/o/r/issues/12",
    });

    const [stored] = loadLocalBetaInbox();
    expect(betaCommentDeliveryStatus(stored!)).toBe("sent");
    expect(stored?.delivery).toEqual({
      state: "sent",
      issueNumber: 12,
      issueUrl: "https://github.com/o/r/issues/12",
    });
  });

  it("keeps a server-accepted suggestion re-sendable when no issue was created", () => {
    const local = saveLocalBetaComment(payload);
    reconcileLocalBetaComment(local.id, serverRecord(local, "feedback_2"), { state: "unsent" });

    expect(betaCommentDeliveryStatus(loadLocalBetaInbox()[0]!)).toBe("unsent");
  });

  it("classifies records saved before delivery tracking existed", () => {
    const legacy = serverRecord(saveLocalBetaComment(payload), "x");

    expect(betaCommentDeliveryStatus({ ...legacy, id: "bc_local_3_abc" })).toBe("unsent");
    expect(betaCommentDeliveryStatus({ ...legacy, id: "feedback_legacy" })).toBe("unknown");
  });

  it("re-sends an older suggestion in place without duplicating or reordering", () => {
    const older = saveLocalBetaComment(payload);
    const newer = saveLocalBetaComment({ ...payload, body: "A newer idea." });

    reconcileLocalBetaComment(older.id, serverRecord(older, "feedback_older"), {
      state: "sent",
      issueNumber: 3,
      issueUrl: "https://github.com/o/r/issues/3",
    });

    const inbox = loadLocalBetaInbox();
    expect(inbox.map((record) => record.id)).toEqual([newer.id, "feedback_older"]);
    expect(betaCommentDeliveryStatus(inbox[1]!)).toBe("sent");
  });
});
