import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BetaCommentPayload,
  BetaCommentRecord,
} from "@/lib/beta-comments";
import {
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
