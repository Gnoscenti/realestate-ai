import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRequest } = vi.hoisted(() => ({ getRequest: vi.fn() }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest }));

import { assertCheckoutReturnUrl } from "@/lib/checkout-origin.server";

describe("checkout return URL validation", () => {
  beforeEach(() => {
    getRequest.mockReturnValue({ url: "https://app.example.test/billing" });
  });

  it("accepts a same-origin return URL and removes its fragment", () => {
    expect(
      assertCheckoutReturnUrl("https://app.example.test/voice?success=1#section"),
    ).toBe("https://app.example.test/voice?success=1");
  });

  it("rejects a return URL with a different origin", () => {
    expect(() => assertCheckoutReturnUrl("https://attacker.example/")).toThrow(
      "Checkout return URLs must use this app's origin",
    );
  });
});
