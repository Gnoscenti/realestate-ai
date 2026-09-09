import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assistantGatewayToken } from "@/lib/assistant/credentials.server";

const requestContext = new AsyncLocalStorage<{
  headers: Record<string, string>;
}>();
const contextSymbol = Symbol.for("@vercel/request-context");
const previousContext = Object.getOwnPropertyDescriptor(globalThis, contextSymbol);

beforeEach(() => {
  vi.stubEnv("AI_GATEWAY_API_KEY", "");
  vi.stubEnv("VERCEL_OIDC_TOKEN", "");
  Object.defineProperty(globalThis, contextSymbol, {
    configurable: true,
    value: { get: () => requestContext.getStore() },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  if (previousContext) {
    Object.defineProperty(globalThis, contextSymbol, previousContext);
  } else {
    Reflect.deleteProperty(globalThis, contextSymbol);
  }
});

function withRequestToken<T>(token: string, action: () => T): T {
  return requestContext.run({ headers: { "x-vercel-oidc-token": token } }, action);
}

describe("assistant Gateway credentials", () => {
  it("uses the deployed request credential with no token environment variable", () => {
    expect(process.env.VERCEL_OIDC_TOKEN).toBe("");
    expect(withRequestToken("request-only-token", assistantGatewayToken)).toBe(
      "request-only-token",
    );
  });

  it("prefers an explicit static key and trims it", () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "  configured-gateway-key  ");
    expect(withRequestToken("request-token", assistantGatewayToken)).toBe("configured-gateway-key");
  });

  it("prefers the current request token over a stale build or local token", () => {
    vi.stubEnv("VERCEL_OIDC_TOKEN", "stale-environment-token");
    expect(withRequestToken("current-request-token", assistantGatewayToken)).toBe(
      "current-request-token",
    );
  });

  it("does not cache or mix rotating credentials across concurrent requests", async () => {
    const results = await Promise.all(
      ["request-one", "request-two"].map((token) =>
        withRequestToken(token, async () => {
          await new Promise<void>((resolve) => setImmediate(resolve));
          return assistantGatewayToken();
        }),
      ),
    );
    expect(results).toEqual(["request-one", "request-two"]);
    expect(withRequestToken("next-request", assistantGatewayToken)).toBe("next-request");
  });

  it("supports a local OIDC environment token when no request context exists", () => {
    vi.stubEnv("VERCEL_OIDC_TOKEN", " local-oidc-token ");
    expect(assistantGatewayToken()).toBe("local-oidc-token");
  });

  it("fails closed when credentials are absent or blank", () => {
    expect(assistantGatewayToken()).toBeNull();
    vi.stubEnv("AI_GATEWAY_API_KEY", "  ");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "  ");
    expect(assistantGatewayToken()).toBeNull();
    expect(withRequestToken("  ", assistantGatewayToken)).toBeNull();
  });
});
