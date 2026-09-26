import { describe, expect, it } from "vitest";
import { readResponseBytes, readResponseText } from "@/lib/safe-outbound-url.server";
describe("bounded response bodies", () => {
  it("cancels chunked binary bodies at the byte limit even without content-length", async () => {
    let canceled = false;
    const response = new Response(new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(8)); },
      cancel() { canceled = true; },
    }));
    await expect(readResponseBytes(response, 12)).rejects.toThrow("Remote response is too large");
    expect(canceled).toBe(true);
  });
  it("preserves arbitrary image bytes and UTF-8 split across chunks", async () => {
    const bytes = new Uint8Array([0,255,128,67,0]);
    expect(await readResponseBytes(new Response(bytes),5)).toEqual(bytes);
    const text = new TextEncoder().encode("Hello 👋");
    const response = new Response(new ReadableStream({ start(controller) {
      controller.enqueue(text.slice(0,8)); controller.enqueue(text.slice(8)); controller.close();
    }}));
    expect(await readResponseText(response,text.length)).toBe("Hello 👋");
    await expect(readResponseBytes(new Response("abc",{headers:{"content-length":"100"}}),10)).rejects.toThrow(/too large/);
  });
});
