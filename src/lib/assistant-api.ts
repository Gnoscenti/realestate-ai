/** Authenticated AI assistant backed by server-owned workspace records. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import {
  ensurePersonalWorkspace,
  getAgentProfile,
} from "@/lib/workspaces/repository.server";
import {
  buildAssistantPolicySystemPrompt,
  buildAssistantWorkspaceData,
  containsProhibitedValuationClaim,
  isPropertyValuationRequest,
  isVerifiedSoldRecordBrowseRequest,
  valuationUnavailableMessage,
  type AssistantWorkspaceContext,
  type VerifiedSoldCompContext,
} from "@/lib/assistant/policy";
import {
  GatewayRequestError,
  requestGatewayAnswer,
} from "@/lib/assistant/gateway.server";
import {
  assistantQuotaLimitsFromEnv,
  blockAssistantGeneration,
  countVerifiedSoldComps,
  createAssistantGeneration,
  finishAssistantGeneration,
  listAssistantListings,
  listVerifiedSoldComps,
  reserveAssistantQuota,
} from "@/lib/assistant/repository.server";

const inputSchema = z.object({
  requestId: z.uuid(),
  question: z.string().trim().min(1).max(2_000),
});

export type LiveAssistantResult =
  | {
      ok: true;
      answer: string;
      source: "workspace" | "verified-sold-records" | "policy";
      model: string | null;
    }
  | {
      ok: false;
      error: string;
      code:
        | "not_configured"
        | "minute_limit"
        | "daily_limit"
        | "duplicate_request"
        | "gateway_budget"
        | "gateway_rate_limit"
        | "gateway_auth"
        | "gateway_timeout"
        | "gateway_unavailable";
      retryAfter?: string;
    };

const DEFAULT_MODEL = "openai/gpt-5.6-luna";
const instanceBursts = new Map<
  string,
  { windowStartedAt: number; count: number }
>();

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(raw?.trim());
  return Number.isInteger(parsed)
    ? Math.max(min, Math.min(max, parsed))
    : fallback;
}

/** Best-effort pre-database burst guard. Durable provider-cost limits remain in
 * Postgres; Vercel Firewall should be the deployment-wide outer layer. */
function reserveInstanceBurst(userId: string, now = Date.now()): boolean {
  const limit = boundedInteger(
    process.env.ASSISTANT_INSTANCE_BURST_PER_MINUTE,
    20,
    5,
    120,
  );
  const existing = instanceBursts.get(userId);
  if (!existing || now - existing.windowStartedAt >= 60_000) {
    instanceBursts.set(userId, { windowStartedAt: now, count: 1 });
  } else {
    existing.count += 1;
    if (existing.count > limit) return false;
  }
  if (instanceBursts.size > 2_000) {
    for (const [id, bucket] of instanceBursts) {
      if (now - bucket.windowStartedAt >= 60_000) instanceBursts.delete(id);
    }
  }
  return true;
}

function gatewayToken(): string | null {
  return (
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.VERCEL_OIDC_TOKEN?.trim() ||
    null
  );
}

function configuredModel(): string {
  return process.env.AI_GATEWAY_ASSISTANT_MODEL?.trim() || DEFAULT_MODEL;
}

function zeroDataRetentionEnabled(): boolean {
  return process.env.AI_GATEWAY_ZERO_DATA_RETENTION?.trim() === "true";
}

function safeRecordText(value: string): string {
  return value.replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim();
}

function formatUsd(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(parsed)
    : "price unavailable";
}

/** Sold-record browsing is deterministic and never delegated to a model. */
function soldRecordSummary(
  records: VerifiedSoldCompContext[],
  totalCount: number,
): string {
  if (!records.length) {
    return [
      "No authorized Closed/Sold records are available in this workspace yet.",
      "Sold-data import is not available in this beta yet. Ask your administrator to load an authorized MLS export or licensed RESO feed. Public websites and active listings are not substitutes.",
    ].join("\n\n");
  }
  const lines = records.map((record, index) => {
    const source = [record.sourceKind, record.provider, record.dataset]
      .filter(Boolean)
      .map((value) => safeRecordText(String(value)))
      .join(" · ");
    return `${index + 1}. ${safeRecordText(record.address)}, ${safeRecordText(record.city)}, ${safeRecordText(record.state)}${record.postalCode ? ` ${safeRecordText(record.postalCode)}` : ""} — closed ${record.closeDate} at ${formatUsd(record.closePrice)} — ${record.livingArea.toLocaleString()} sqft — source: ${source || "authorized workspace import"}${record.sourceAsOf ? ` (as of ${record.sourceAsOf})` : ""}`;
  });
  return [
    `Verified Closed/Sold source records (${totalCount} available; ${records.length} shown)`,
    ...lines,
    "These rows are unranked source data, not a comparable set or price recommendation.",
  ].join("\n");
}

function estimateCostUsd(
  model: string,
  inputTokens: number | null,
  outputTokens: number | null,
): number | null {
  if (inputTokens == null || outputTokens == null) return null;
  const configuredRate = (name: string): number | null => {
    const value = process.env[name]?.trim();
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
  };
  const configuredInput = configuredRate("AI_GATEWAY_INPUT_USD_PER_MILLION");
  const configuredOutput = configuredRate("AI_GATEWAY_OUTPUT_USD_PER_MILLION");
  const inputRate =
    configuredInput != null
      ? configuredInput
      : model === DEFAULT_MODEL
        ? 0.2
        : null;
  const outputRate =
    configuredOutput != null
      ? configuredOutput
      : model === DEFAULT_MODEL
        ? 1.2
        : null;
  if (inputRate == null || outputRate == null) return null;
  return Number(
    ((inputTokens * inputRate + outputTokens * outputRate) / 1_000_000).toFixed(
      6,
    ),
  );
}

function gatewayFailure(error: GatewayRequestError): LiveAssistantResult {
  if (error.status === 401 || error.status === 403) {
    return {
      ok: false,
      error:
        "The AI assistant is not configured correctly. An administrator needs to reconnect AI Gateway.",
      code: "gateway_auth",
    };
  }
  if (error.status === 402) {
    return {
      ok: false,
      error:
        "The AI assistant has reached its workspace budget. Try again after the budget is renewed.",
      code: "gateway_budget",
    };
  }
  if (error.status === 429) {
    return {
      ok: false,
      error: "The AI service is busy. Wait a moment and try again.",
      code: "gateway_rate_limit",
      ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
    };
  }
  if (error.status === 504) {
    return {
      ok: false,
      error:
        "The AI request timed out. Your message was not lost; please try again.",
      code: "gateway_timeout",
    };
  }
  return {
    ok: false,
    error: "The AI service is temporarily unavailable. Please try again shortly.",
    code: "gateway_unavailable",
  };
}

export const askLiveAssistant = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(inputSchema)
  .handler(async ({ data, context }): Promise<LiveAssistantResult> => {
    if (!reserveInstanceBurst(context.userId)) {
      return {
        ok: false,
        error: "Too many requests at once. Wait one minute and try again.",
        code: "minute_limit",
      };
    }

    const valuationRequest = isPropertyValuationRequest(data.question);
    const soldRecordBrowse = isVerifiedSoldRecordBrowseRequest(data.question);
    const token = gatewayToken();

    // An unconfigured ordinary request stops before any database read/write.
    if (!valuationRequest && !soldRecordBrowse && !token) {
      return {
        ok: false,
        error:
          "The AI assistant is not configured yet. An administrator needs to enable Vercel AI Gateway.",
        code: "not_configured",
      };
    }

    const sql = await getSql();
    const workspace = await ensurePersonalWorkspace(context.userId, sql);
    const verifiedSoldRecordCount =
      valuationRequest || soldRecordBrowse
        ? await countVerifiedSoldComps(sql, workspace.id)
        : 0;

    // Record count is never treated as subject-specific comparability.
    if (valuationRequest) {
      return {
        ok: true,
        answer: valuationUnavailableMessage(verifiedSoldRecordCount),
        source: "policy",
        model: null,
      };
    }

    if (soldRecordBrowse) {
      const records = await listVerifiedSoldComps(sql, workspace.id);
      return {
        ok: true,
        answer: soldRecordSummary(records, verifiedSoldRecordCount),
        source: "verified-sold-records",
        model: null,
      };
    }

    if (!token) {
      return {
        ok: false,
        error:
          "The AI assistant is not configured yet. An administrator needs to enable Vercel AI Gateway.",
        code: "not_configured",
      };
    }

    const inputChars = data.question.length;
    const model = configuredModel();
    // Claim the client UUID before charging quota so sequential and concurrent
    // transport retries cannot consume the user's allowance more than once.
    const claimed = await createAssistantGeneration(sql, {
      id: data.requestId,
      workspaceId: workspace.id,
      userId: context.userId,
      model,
      status: "started",
      inputChars,
    });
    if (!claimed) {
      return {
        ok: false,
        error: "That request was already received. Send a new message to continue.",
        code: "duplicate_request",
      };
    }

    const quota = await reserveAssistantQuota(
      sql,
      context.userId,
      inputChars,
      assistantQuotaLimitsFromEnv(),
    );
    if (!quota.allowed) {
      const code = quota.reason === "minute" ? "minute_limit" : "daily_limit";
      await blockAssistantGeneration(sql, { id: data.requestId, errorCode: code });
      return quota.reason === "minute"
        ? {
            ok: false,
            error: "Too many requests at once. Wait one minute and try again.",
            code,
          }
        : {
            ok: false,
            error:
              "You reached today’s AI usage limit. It resets automatically at midnight UTC.",
            code,
          };
    }

    const [profile, listings] = await Promise.all([
      getAgentProfile(context.userId, workspace.id, sql),
      listAssistantListings(sql, workspace.id),
    ]);

    const assistantContext: AssistantWorkspaceContext = {
      workspaceName: workspace.name,
      displayName: profile?.displayName ?? null,
      businessName: profile?.businessName ?? null,
      brokerage: profile?.brokerage ?? null,
      areaOfOperations: profile?.areaOfOperations ?? null,
      listings,
      verifiedSoldRecordCount: 0,
      verifiedSoldRecords: [],
    };

    try {
      const answer = await requestGatewayAnswer({
        token,
        model,
        policy: buildAssistantPolicySystemPrompt(),
        workspaceData: buildAssistantWorkspaceData(
          assistantContext,
          false,
        ),
        question: data.question,
        userId: context.userId,
        zeroDataRetention: zeroDataRetentionEnabled(),
      });
      if (containsProhibitedValuationClaim(answer.text)) {
        await finishAssistantGeneration(sql, {
          id: data.requestId,
          status: "failed",
          inputTokens: answer.usage.inputTokens,
          outputTokens: answer.usage.outputTokens,
          estimatedCostUsd: estimateCostUsd(
            model,
            answer.usage.inputTokens,
            answer.usage.outputTokens,
          ),
          errorCode: "unsafe_valuation_output",
        });
        return {
          ok: true,
          answer:
            "I stopped that answer because it appeared to create a numeric property value. This beta can show saved source records and workflow guidance, but it cannot recommend a price.",
          source: "policy",
          model: null,
        };
      }
      await finishAssistantGeneration(sql, {
        id: data.requestId,
        status: "completed",
        inputTokens: answer.usage.inputTokens,
        outputTokens: answer.usage.outputTokens,
        estimatedCostUsd: estimateCostUsd(
          model,
          answer.usage.inputTokens,
          answer.usage.outputTokens,
        ),
      });
      return {
        ok: true,
        answer: answer.text,
        source: "workspace",
        model,
      };
    } catch (error) {
      const gatewayError =
        error instanceof GatewayRequestError
          ? error
          : new GatewayRequestError("AI service failed", 503);
      await finishAssistantGeneration(sql, {
        id: data.requestId,
        status: "failed",
        errorCode: `gateway_${gatewayError.status}`,
      });
      console.error("[askLiveAssistant] gateway request failed", {
        status: gatewayError.status,
        workspaceId: workspace.id,
        generationId: data.requestId,
      });
      return gatewayFailure(gatewayError);
    }
  });
