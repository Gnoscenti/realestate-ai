import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyEmail,
  clearLegacyEmailToken,
  isLegacyGeneratedAlert,
  type RawEmailMessage,
} from "@/lib/email-alerts";

/**
 * Email Alerts runs one Gmail scan per pasted token and nothing else. These
 * tests hold it to that: no scan without a token, no invented alert, no raw
 * Google error on screen, and nothing left behind from the removed demo inbox.
 */

const STORE_KEY = "realestate-ai-workspace-v12";

function createMemoryStorage(initial: Record<string, string>): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

function stubBrowserStorage(initial: Record<string, string> = {}) {
  const localStorage = createMemoryStorage(initial);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: localStorage });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
  return localStorage;
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
  Reflect.deleteProperty(globalThis, "sessionStorage");
  Reflect.deleteProperty(globalThis, "window");
  vi.unstubAllGlobals();
  vi.doUnmock("@/lib/email-scan");
  vi.resetModules();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("scanGmailInbox", () => {
  it("does not call Gmail without a token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { scanGmailInbox } = await import("@/lib/email-scan");

    const result = await scanGmailInbox({ accessToken: "   " });

    expect(result).toEqual({
      ok: false,
      messages: [],
      error: "No Gmail access token was sent, so nothing was scanned.",
      mode: "none",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains a refused token in plain words and never repeats Google's reply", async () => {
    const googleBody = { error: { code: 401, message: "Request had invalid authentication credentials. SECRET-DETAIL" } };
    const cases: [number, string][] = [
      [401, "Gmail did not accept that access token. It may have expired. Paste a new one and scan again."],
      [403, "Gmail refused the request. The access token may not include permission to read mail."],
      [429, "Gmail is limiting requests right now. Wait a few minutes and scan again."],
      [500, "Gmail returned an error (code 500). No alerts were added."],
    ];
    const { scanGmailInbox } = await import("@/lib/email-scan");
    for (const [status, message] of cases) {
      vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(googleBody, status)));
      const result = await scanGmailInbox({ accessToken: "ya29.test" });
      expect(result.ok).toBe(false);
      expect(result.messages).toEqual([]);
      expect(result.error).toBe(message);
      expect(result.error).not.toContain("SECRET-DETAIL");
    }
  });

  it("does not show an internal failure as the reason", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed: ECONNRESET 10.0.0.7");
      }),
    );
    const { scanGmailInbox } = await import("@/lib/email-scan");

    const result = await scanGmailInbox({ accessToken: "ya29.test" });

    expect(result.error).toBe(
      "Our server could not complete the request to Gmail. No alerts were added. Try again in a few minutes.",
    );
    expect(result.messages).toEqual([]);
  });

  it("only reads: every request is a GET to Gmail, carries the token and has a time limit", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (url.includes("/messages?")) return jsonResponse({ messages: [{ id: "18c2f0a1b2c3d4e5" }] });
        return jsonResponse({
          id: "18c2f0a1b2c3d4e5",
          snippet: "Wire instructions attached",
          internalDate: "1767225600000",
          payload: {
            headers: [
              { name: "From", value: "Pacific Escrow <team@pacificescrow.example>" },
              { name: "Subject", value: "Escrow opened" },
            ],
          },
        });
      }),
    );
    const { scanGmailInbox } = await import("@/lib/email-scan");

    const result = await scanGmailInbox({ accessToken: "ya29.test", maxResults: 15 });

    expect(result.ok).toBe(true);
    expect(result.messages).toEqual([
      {
        id: "18c2f0a1b2c3d4e5",
        from: "Pacific Escrow <team@pacificescrow.example>",
        subject: "Escrow opened",
        snippet: "Wire instructions attached",
        date: new Date(1767225600000).toISOString(),
        provider: "gmail",
      },
    ]);
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(new URL(call.url).origin).toBe("https://gmail.googleapis.com");
      expect(call.init?.method ?? "GET").toBe("GET");
      expect(call.init?.body).toBeUndefined();
      expect(call.init?.headers).toEqual({ Authorization: "Bearer ya29.test" });
      expect(call.init?.signal).toBeInstanceOf(AbortSignal);
    }
    // The search is limited to the last 14 days and the page says so.
    expect(decodeURIComponent(calls[0]!.url)).toContain("newer_than:14d");
    expect(calls[0]!.url).toContain("maxResults=15");
  });
});

describe("alerts made from scanned mail", () => {
  it("does not invent a subject for an email that has none", () => {
    const lead = {
      id: "l1",
      name: "Alex Buyer",
      email: "alex@example.com",
      heat: "warm",
    } as Parameters<typeof classifyEmail>[1] extends (infer L)[] | undefined ? L : never;

    const signature = classifyEmail({ from: "DocuSign <dse@docusign.net>", subject: "" });
    expect(signature.kind).toBe("docusign");
    expect(signature.subject).toBe("(no subject)");

    const fromLead = classifyEmail({ from: "Alex Buyer <alex@example.com>", subject: " " }, [lead]);
    expect(fromLead.kind).toBe("client");
    expect(fromLead.subject).toBe("(no subject)");
    // The button opens a page in this app. It does not reply to the email.
    expect(fromLead.actionLabel).toBe("Open Instant Response for this lead");
  });

  it("sends listing mail to the listings page, not the rental-unit page", () => {
    const alert = classifyEmail({ from: "ShowingTime <no-reply@showingtime.example>", subject: "Showing request" });
    expect(alert.kind).toBe("mls");
    expect(alert.href).toBe("/mls");
    expect(alert.actionLabel).toBe("Open Listings & Data");
  });
});

describe("leftovers from the removed demo inbox", () => {
  it("recognises a made-up alert by its synthetic id only", () => {
    expect(isLegacyGeneratedAlert({ messageId: "demo_ds_1" })).toBe(true);
    expect(isLegacyGeneratedAlert({ messageId: "demo_lead_l1" })).toBe(true);
    expect(isLegacyGeneratedAlert({ messageId: "18c2f0a1b2c3d4e5" })).toBe(false);
    expect(isLegacyGeneratedAlert({})).toBe(false);
  });

  it("removes a Gmail token an older build left in browser storage", () => {
    const local = createMemoryStorage({ "realestate-ai-email-token": "ya29.old", keep: "1" });
    const session = createMemoryStorage({ "realestate-ai-email-token": "ya29.old" });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: local });
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: session });

    clearLegacyEmailToken();

    expect(local.getItem("realestate-ai-email-token")).toBeNull();
    expect(session.getItem("realestate-ai-email-token")).toBeNull();
    expect(local.getItem("keep")).toBe("1");
  });

  it("does nothing, quietly, when storage is missing or blocked", () => {
    expect(() => clearLegacyEmailToken()).not.toThrow();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    expect(() => clearLegacyEmailToken()).not.toThrow();
  });

  it("drops made-up alerts on load and keeps real ones exactly as saved", async () => {
    const real = {
      id: "ealert_real",
      kind: "escrow",
      from: "Pacific Escrow",
      fromEmail: "team@pacificescrow.example",
      subject: "Escrow opened",
      snippet: "",
      receivedAt: "2026-11-01T10:00:00.000Z",
      read: true,
      priority: "critical",
      provider: "gmail",
      messageId: "18c2f0a1b2c3d4e5",
      actionLabel: "Open Transaction Hub",
      href: "/transactions",
    };
    const madeUp = { ...real, id: "ealert_demo", read: false, messageId: "demo_esc_1", subject: "Wire due" };
    const localStorage = stubBrowserStorage({
      [STORE_KEY]: JSON.stringify({ state: { emailAlerts: [madeUp, real] }, version: 0 }),
    });
    const { rehydrateStore, useAppStore } = await import("@/lib/store");

    rehydrateStore();
    await vi.waitFor(() => expect(useAppStore.getState().hydrated).toBe(true));

    expect(useAppStore.getState().emailAlerts).toEqual([real]);
    const persisted = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
    expect(persisted.state.emailAlerts).toEqual([real]);
  });
});

describe("scanEmailInbox in the store", () => {
  async function storeWithScan(result: { ok: boolean; messages: RawEmailMessage[]; error?: string; mode: string } | Error) {
    stubBrowserStorage();
    const scanConnectedEmail = vi.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    });
    vi.doMock("@/lib/email-scan", () => ({ scanConnectedEmail }));
    const { useAppStore } = await import("@/lib/store");
    return { useAppStore, scanConnectedEmail };
  }

  it("does nothing without a token", async () => {
    const { useAppStore, scanConnectedEmail } = await storeWithScan({ ok: true, messages: [], mode: "gmail_api" });

    const result = await useAppStore.getState().scanEmailInbox();

    expect(result).toMatchObject({
      added: 0,
      error: "No Gmail access token was provided, so nothing was scanned.",
    });
    expect(scanConnectedEmail).not.toHaveBeenCalled();
    expect(useAppStore.getState().emailAlerts).toEqual([]);
    expect(useAppStore.getState().emailConnection).toBeNull();
  });

  it("adds no alert when the scan fails, and does not record a finished scan", async () => {
    const { useAppStore } = await storeWithScan({
      ok: false,
      messages: [],
      error: "Gmail did not accept that access token. It may have expired. Paste a new one and scan again.",
      mode: "gmail_api",
    });

    const result = await useAppStore.getState().scanEmailInbox({ accessToken: "ya29.test" });

    expect(result.added).toBe(0);
    expect(result.error).toMatch(/^Gmail did not accept that access token/);
    expect(useAppStore.getState().emailAlerts).toEqual([]);
    expect(useAppStore.getState().emailConnection?.lastScanAt).toBeUndefined();
  });

  it("gives a plain reason when the request to our own server fails", async () => {
    const { useAppStore } = await storeWithScan(new Error("Unauthorized: session cookie missing"));

    const result = await useAppStore.getState().scanEmailInbox({ accessToken: "ya29.test" });

    expect(result.error).toBe(
      "The Gmail scan could not start. Check that you are signed in and online, then try again.",
    );
    expect(useAppStore.getState().emailAlerts).toEqual([]);
  });

  it("records the scan and makes nothing up when Gmail returns no messages", async () => {
    const { useAppStore } = await storeWithScan({ ok: true, messages: [], mode: "gmail_api" });

    const result = await useAppStore.getState().scanEmailInbox({ accessToken: "ya29.test" });

    expect(result).toMatchObject({ added: 0, total: 0 });
    expect(result.error).toBeUndefined();
    expect(useAppStore.getState().emailAlerts).toEqual([]);
    const record = useAppStore.getState().emailConnection;
    expect(record?.provider).toBe("gmail");
    expect(Number.isFinite(new Date(record?.lastScanAt ?? "").getTime())).toBe(true);
  });

  it("turns scanned messages into alerts and never keeps the token", async () => {
    const { useAppStore, scanConnectedEmail } = await storeWithScan({
      ok: true,
      mode: "gmail_api",
      messages: [
        {
          id: "18c2f0a1b2c3d4e5",
          from: "Pacific Escrow <team@pacificescrow.example>",
          subject: "Escrow opened",
          snippet: "Wire instructions attached",
          date: "2026-11-01T10:00:00.000Z",
          provider: "gmail",
        },
      ],
    });

    const result = await useAppStore.getState().scanEmailInbox({ accessToken: "ya29.very-secret" });

    expect(scanConnectedEmail).toHaveBeenCalledWith({
      data: { accessToken: "ya29.very-secret", maxResults: 15 },
    });
    expect(result).toMatchObject({ added: 1, total: 1 });
    const [alert] = useAppStore.getState().emailAlerts;
    expect(alert).toMatchObject({
      kind: "escrow",
      subject: "Escrow opened",
      messageId: "18c2f0a1b2c3d4e5",
      provider: "gmail",
      read: false,
    });
    expect(JSON.stringify(useAppStore.getState())).not.toContain("ya29.very-secret");
  });
});
