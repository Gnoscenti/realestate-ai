import { createFileRoute } from "@tanstack/react-router";
import { requireCronAuthorization } from "@/lib/voice/config.server";
import { processVoiceWebhookBatch } from "@/lib/voice/webhooks.server";
import {
  reconcileVoicePolicies,
  sweepVoiceRetention,
} from "@/lib/voice/maintenance.server";
import { processVoiceProvisioningBatch } from "@/lib/voice/provisioning.server";
import { drainPendingVoiceStripePolicies } from "@/lib/voice/billing.server";

async function safeRun<T>(work: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await work();
  } catch (error) {
    return {
      error: error instanceof Error ? error.message.slice(0, 500) : "Worker failed",
    };
  }
}

async function runWebhookProcessor(request: Request): Promise<Response> {
  try {
    requireCronAuthorization(request);
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Daily cron is a safety net compatible with Vercel Hobby. The UI advances
  // provisioning one durable provider step at a time through the authenticated
  // server function, so activation does not wait for this maintenance run.
  const provisioning = await safeRun(() => processVoiceProvisioningBatch());
  const webhooks = await safeRun(() => processVoiceWebhookBatch());
  const stripePolicies = await safeRun(() => drainPendingVoiceStripePolicies());
  const policies = await safeRun(() => reconcileVoicePolicies());
  const retention = await safeRun(() => sweepVoiceRetention());
  return Response.json({
    provisioning, webhooks, stripePolicies, policies, retention,
  }, {
    headers: { "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/internal/voice/process-webhooks")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) =>
        runWebhookProcessor(request),
      POST: async ({ request }: { request: Request }) =>
        runWebhookProcessor(request),
    },
  },
});
