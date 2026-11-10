import { afterEach, describe, expect, it, vi } from "vitest";
import { parse } from "pg-connection-string";
import { pinVerifyFullSslMode } from "@/lib/pg-ssl-mode";

const BASE = "postgresql://app_user:p%40ss%2Fw0rd@db.example.com:5432/app";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pinVerifyFullSslMode", () => {
  it.each(["prefer", "require", "verify-ca"])(
    "rewrites sslmode=%s to the verify-full it already means",
    (mode) => {
      expect(pinVerifyFullSslMode(`${BASE}?sslmode=${mode}`)).toBe(`${BASE}?sslmode=verify-full`);
    },
  );

  it("changes only the sslmode value and keeps every other parameter", () => {
    expect(
      pinVerifyFullSslMode(`${BASE}?connect_timeout=10&sslmode=require&channel_binding=require`),
    ).toBe(`${BASE}?connect_timeout=10&sslmode=verify-full&channel_binding=require`);
  });

  it.each([
    BASE,
    `${BASE}?sslmode=verify-full`,
    `${BASE}?sslmode=disable`,
    `${BASE}?sslmode=no-verify`,
    `${BASE}?application_name=sslmode=require-ish`,
    // An explicit opt-in to libpq semantics is the operator's decision.
    `${BASE}?uselibpqcompat=true&sslmode=require`,
    `${BASE}?sslmode=require&uselibpqcompat=true`,
    "postgresql://release_test:ci-only@127.0.0.1:5432/realestate_test",
  ])("leaves %s unchanged", (url) => {
    expect(pinVerifyFullSslMode(url)).toBe(url);
  });

  it("does not touch a password that happens to contain sslmode text", () => {
    const url = "postgresql://u:sslmode%3Drequire@db.example.com/app?sslmode=require";
    expect(pinVerifyFullSslMode(url)).toBe(
      "postgresql://u:sslmode%3Drequire@db.example.com/app?sslmode=verify-full",
    );
  });

  it("yields the same driver TLS config as before, without the deprecation warning", () => {
    const warning = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
    const original = `${BASE}?sslmode=require`;

    const pinned = parse(pinVerifyFullSslMode(original));
    expect(warning).not.toHaveBeenCalled();

    const before = parse(original);
    expect(pinned.ssl).toEqual(before.ssl);
    expect({ ...pinned, sslmode: undefined }).toEqual({ ...before, sslmode: undefined });
  });
});
