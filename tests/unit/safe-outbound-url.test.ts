import { describe, expect, it } from "vitest";
import {
  assertPublicHttpUrl,
  isPublicIpAddress,
} from "@/lib/safe-outbound-url.server";

describe("safe outbound URL validation", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
  ])("rejects non-public IP %s", (address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it.each(["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"])(
    "accepts public IP %s",
    (address) => {
      expect(isPublicIpAddress(address)).toBe(true);
    },
  );

  it.each([
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.1/",
    "http://[::1]/",
    "file:///etc/passwd",
    "https://user:password@93.184.216.34/",
    "https://93.184.216.34:8443/",
  ])("blocks unsafe URL %s", async (url) => {
    await expect(assertPublicHttpUrl(url)).rejects.toThrow();
  });

  it("allows a standard-port public URL", async () => {
    await expect(
      assertPublicHttpUrl("https://93.184.216.34/path"),
    ).resolves.toMatchObject({
      protocol: "https:",
      hostname: "93.184.216.34",
    });
  });
});
