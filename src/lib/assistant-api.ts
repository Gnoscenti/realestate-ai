/**
 * Live AI assistant — Grok + web_search for comps, market, and listing ideas.
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
    "You MUST use web_search for comps, recent sales, neighborhood trends, school notes, and current pricing context.",
    "Do not invent MLS numbers or sale prices. Cite public sources and note they are not a substitute for MLS.",
    "Be specific, actionable, and concise. Fair housing: never suggest exclusionary targeting.",
    "",
    `Their book (${listings.length} listings):`,
    lines.length ? lines.join("\n") : "- (empty book — still help with market strategy, scripts, and ideas)",
    stale.length
      ? `\nLong-standing listings (≥45 DOM):\n${stale.map((s) => `- ${s.title} (${s.daysOnMarket} DOM)`).join("\n")}`
      : "",
    data.hotLeadNames?.length ? `Hot leads: ${data.hotLeadNames.join(", ")}.` : "",
    data.memoryNotes ? `Agent notes: ${data.memoryNotes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function extractAnswer(json: any): string {
  if (typeof json?.output_text === "string" && json.output_text.trim()) {
    return json.output_text.trim();
  }
  const chunks: string[] = [];
  const output = json?.output ?? [];
  for (const item of output) {
    if (item?.type === "message" || item?.role === "assistant") {
      const content = item.content;
      if (typeof content === "string") chunks.push(content);
      else if (Array.isArray(content)) {
        for (const c of content) {
          if (typeof c?.text === "string") chunks.push(c.text);
          if (typeof c?.output_text === "string") chunks.push(c.output_text);
        }
      }
    }
    if (typeof item?.text === "string") chunks.push(item.text);
  }
  if (json?.choices?.[0]?.message?.content) {
    const c = json.choices[0].message.content;
    if (typeof c === "string") chunks.push(c);
  }
  return chunks.join("\n").trim();
}

function usedSearch(json: any): boolean {
  const usage = json?.server_side_tool_usage || json?.usage;
  if (usage?.SERVER_SIDE_TOOL_WEB_SEARCH || usage?.web_search) return true;
  const output = json?.output ?? [];
  return output.some(
    (i: any) =>
      i?.type === "web_search_call" ||
      i?.type === "web_search" ||
      String(i?.type || "").includes("web_search"),
  );
}

export const askLiveAssistant = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(inputSchema)
  .handler(async ({ data, context }): Promise<LiveAssistantResult> => {
    const key = xaiKey();
    if (!key) {
      return {
        ok: false,
        error:
          "XAI_API_KEY is missing on this deployment. Add it in Vercel → Environment Variables (Production) and redeploy.",
      };
    }

    const model = process.env.XAI_ASSISTANT_MODEL?.trim() || "grok-4.6";
    const system = buildSystem(data);
    const { ensurePersonalWorkspace } = await import(
      "@/lib/workspaces/repository.server"
    );
    const { finalizeAiGeneration, reserveAiGeneration } = await import(
      "@/lib/ai-usage/repository.server"
    );
    const workspace = await ensurePersonalWorkspace(context.userId);
    const reservation = await reserveAiGeneration({
      userId: context.userId,
      workspaceId: workspace.id,
      product: "grok_assistant",
      operation: "assistant",
      model,
      inputChars: system.length + data.question.length,
      units: 1,
    });
    if (!reservation.allowed) {
      return {
        ok: false,
        error:
          reservation.reason === "entitlement_required"
            ? "Live assistant requires an active AI entitlement for this workspace."
            : "Live assistant quota reached. Try again after the quota window resets.",
      };
    }

    const settleUsage = async (
      status: "completed" | "failed",
      errorCode?: string,
    ) => {
      try {
        await finalizeAiGeneration({
          id: reservation.id,
          userId: context.userId,
          workspaceId: workspace.id,
          status,
          errorCode,
        });
      } catch (error) {
        console.error("[askLiveAssistant] usage settlement failed", error);
      }
    };

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
          reasoning: { effort: "low" },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        const answer = extractAnswer(json);
        if (answer) {
          await settleUsage("completed");
          return {
            ok: true,
            answer,
            usedWebSearch: usedSearch(json) || true,
            model,
          };
        }
      }
      const message =
        json?.error?.message ||
        json?.error ||
        (res.ok ? "Empty response from Grok" : `Grok error (${res.status})`);
      await settleUsage("failed", res.ok ? "empty_response" : "provider_error");
      return { ok: false, error: String(message) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Assistant request failed";
      console.error("[askLiveAssistant]", msg);
      await settleUsage("failed", "request_failed");
      return { ok: false, error: msg };
    }
  });
