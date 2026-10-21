import { afterEach, describe, expect, it, vi } from "vitest";
const request = vi.hoisted(() => ({ current: new Request("https://app.example/voice") }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => request.current }));
import { assertCheckoutReturnUrl, assertCheckoutReturnUrls } from "../../src/lib/checkout-origin.server";
afterEach(() => { vi.unstubAllEnvs(); request.current = new Request("https://app.example/voice"); });
describe("checkout and portal return URL guards", () => {
  it("uses the same origin guard for the single portal return URL", () => {
    expect(assertCheckoutReturnUrl("https://app.example/voice#panel")).toBe("https://app.example/voice");
    expect(assertCheckoutReturnUrls({ successUrl: "https://app.example/ok", cancelUrl: "https://app.example/cancel" })).toEqual({ successUrl: "https://app.example/ok", cancelUrl: "https://app.example/cancel" });
  });
  it.each(["https://evil.example/voice", "https://app.example.evil.example/", "https://user:pass@app.example/voice", "javascript:alert(1)", "https://app.example:9999/"])("rejects unsafe portal return %s", url => {
    expect(() => assertCheckoutReturnUrl(url)).toThrow();
  });
  it("rejects HTTP even on the same origin in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    request.current = new Request("http://app.example/voice");
    expect(() => assertCheckoutReturnUrl("http://app.example/voice")).toThrow("HTTPS");
  });
});
