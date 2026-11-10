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

  it("pins every duplicate, because the driver keeps the last one", () => {
    const pinned = pinVerifyFullSslMode(`${BASE}?sslmode=require&connect_timeout=5&sslmode=prefer`);

    expect(pinned).toBe(`${BASE}?sslmode=verify-full&connect_timeout=5&sslmode=verify-full`);
    expect(parse(pinned).sslmode).toBe("verify-full");
  });

  it("treats a question mark inside a value as part of that value", () => {
    expect(
      pinVerifyFullSslMode(`${BASE}?application_name=job?sslmode=require&sslmode=require`),
    ).toBe(`${BASE}?application_name=job?sslmode=require&sslmode=verify-full`);
    // The compatibility text sits inside application_name, so it is not an opt-in.
    expect(
      pinVerifyFullSslMode(`${BASE}?application_name=worker?uselibpqcompat=true&sslmode=require`),
    ).toBe(`${BASE}?application_name=worker?uselibpqcompat=true&sslmode=verify-full`);
  });

  it("pins a percent-encoded mode the driver would decode to a weakening one", () => {
    const original = `${BASE}?sslmode=%72equire`;
    expect(parse(pinVerifyFullSslMode(original)).sslmode).toBe("verify-full");
  });

  it("keeps a trailing fragment in place", () => {
    expect(pinVerifyFullSslMode(`${BASE}?sslmode=require#note`)).toBe(
      `${BASE}?sslmode=verify-full#note`,
    );
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
