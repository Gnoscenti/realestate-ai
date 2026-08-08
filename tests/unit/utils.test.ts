import { afterEach, describe, expect, it, vi } from "vitest";
import { uid } from "@/lib/utils";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uid", () => {
  it("uses the full UUID entropy when randomUUID is available", () => {
    const getRandomValues = vi.fn();
    vi.stubGlobal("crypto", {
      randomUUID: () => "12345678-1234-4234-8234-1234567890ab",
      getRandomValues,
    });

    expect(uid("lead")).toMatch(
      /^lead_123456781234423482341234567890ab[0-9a-z]+$/,
    );
    expect(getRandomValues).not.toHaveBeenCalled();
  });

  it("falls back to 16 crypto-random bytes when randomUUID is unavailable", () => {
    const getRandomValues = vi.fn((values: Uint8Array) => {
      values.fill(0xab);
      return values;
    });
    vi.stubGlobal("crypto", { getRandomValues });

    expect(uid("lead")).toMatch(/^lead_(ab){16}[0-9a-z]+$/);
    expect(getRandomValues).toHaveBeenCalledOnce();
  });
});
