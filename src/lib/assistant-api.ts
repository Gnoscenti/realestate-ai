/**
 * Live AI assistant — Grok + web_search for comps, market, and listing ideas.
 * Client falls back to local answerAssistant when XAI_API_KEY is missing.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";

const XAI_BASE = "https://api.x.ai/v1";

const listingSchema = z.object({
  title: z.string(),
  address: z.string().optional(),
  city: z.string().optional(),
  neighborhood: z.string().optional(),
  price: z.number().optional(),
  beds: z.number().optional(),
  baths: z.number().optional(),
  sqft: z.number().optional(),
  daysOnMarket: z.number().optional(),
  status: z.string().optional(),
  features: z.array(z.string()).optional(),
});

const inputSchema = z.object({
  question: z.string().min(1).max(4000),
  profileName: z.string().max(120).optional(),
  areaOfOperations: z.string().max(200).optional(),
  website: z.string().max(300).optional(),
  listings: z.array(listingSchema).max(20).optional(),
  hotLeadNames: z.array(z.string()).max(10).optional(),
  memoryNotes: z.string().max(1500).optional(),
});

export type LiveAssistantResult =
  | { ok: true; answer: string; usedWebSearch: boolean; model: string }
  | { ok: false; error: string };

function xaiKey(): string | null {
  return process.env.XAI_API_KEY?.trim() || process.env.GROK_API_KEY?.trim() || null;
}

function buildSystem(data: z.infer<typeof inputSchema>): string {
  const listings = data.listings ?? [];
  const stale = listings.filter(
    (l) => (l.daysOnMarket ?? 0) >= 45 && (l.status === "active" || !l.status),
  );
  const lines = listings.slice(0, 12).map((l) => {
    const loc = [l.neighborhood, l.city].filter(Boolean).join(", ");
    return `- ${l.title}${loc ? ` (${loc})` : ""}${l.price ? ` · $${l.price.toLocaleString()}` : ""}${l.daysOnMarket != null ? ` · ${l.daysOnMarket} DOM` : ""}`;
  });
  return [
    "You are the live AI copilot inside RealEstate AI Agent OS for a working realtor.",
    data.profileName ? `Agent: ${data.profileName}.` : "",
    data.areaOfOperations ? `Market focus: ${data.areaOfOperations}.` : "",
    data.website ? `Agent website: ${data.website}.` : "",
    "",
    "Mission: help them win business and sell listings — not only query MLS.",
    "You have web_search. Use it for comps, recent sales, neighborhood trends, and pricing context when asked or when inventory is thin.",
    "Be specific, actionable, and concise. Fair housing: never suggest exclusionary targeting.",
    "",
    `Their book (${listings.length} listings):`,
    lines.length ? lines.join("\n") : "- (empty book — still help with strategy, scripts, and ideas)",
    stale.length
      ? `\nLong-standing listings (≥45 DOM):\n${stale.map((s) => `- ${s.title} (${s.daysOnMarket} DOM)`).join("\n")}`
      : "",
    data.hotLeadNames?.length ? `Hot leads: ${data.hotLeadNames.join(", ")}.` : "",
    data.memoryNotes ? `Agent notes: ${data.memoryNotes}` : "",
    "",
    "When asked for comps: search the open web for recent comparable sales, give price bands and caveats (public web ≠ MLS), and positioning tips.",
    "When asked how to sell a stale listing: give 5–8 creative practical tactics (video, broker open, neighbor letter, price test, re-copy, etc.).",
  ]
    .filter(Boolean)
    .join("\n");
}

function extractAnswer(json: any): string {
  if (typeof json?.output_text === "string" && json.output_text.trim()) {
    return json.output_text.trim();
  }
  const chunks: string[] = [];
  const output = json?.output ?? json?.choices ?? [];
  for (const item of output) {
    if (typeof item?.text === "string") chunks.push(item.text);
    const content = item?.content ?? item?.message?.content;
    if (typeof content === "string") chunks.push(content);
    else if (Array.isArray(content)) {
      for (const c of content) {
        if (typeof c?.text === "string") chunks.push(c.text);
      }
    }
  }
  if (json?.choices?.[0]?.message?.content) {
    const c = json.choices[0].message.content;
    if (typeof c === "string") chunks.push(c);
  }
  return chunks.join("\n").trim();
}

export const askLiveAssistant = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(inputSchema)
  .handler(async ({ data }): Promise<LiveAssistantResult> => {
    const key = xaiKey();
    if (!key) {
      return { ok: false, error: "Live assistant requires XAI_API_KEY on the server" };
    }
    const model = process.env.XAI_ASSISTANT_MODEL?.trim() || "grok-4";
    const system = buildSystem(data);
    try {
      const res = await fetch(`${XAI_BASE}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: [
            { role: "system", content: system },
            { role: "user", content: data.question },
          ],
          tools: [{ type: "web_search" }],
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        const answer = extractAnswer(json);
        if (answer) return { ok: true, answer, usedWebSearch: true, model };
      }
      const chat = await fetch(`${XAI_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: data.question },
          ],
          temperature: 0.6,
        }),
      });
      const cj = await chat.json().catch(() => ({}));
      if (!chat.ok) {
        return {
          ok: false,
          error:
            cj?.error?.message ||
            json?.error?.message ||
            `Assistant error (${res.status}/${chat.status})`,
        };
      }
      const answer =
        cj?.choices?.[0]?.message?.content?.trim() || extractAnswer(cj);
      if (!answer) return { ok: false, error: "Empty response from Grok" };
      return { ok: true, answer, usedWebSearch: false, model };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Assistant request failed",
      };
    }
  });
