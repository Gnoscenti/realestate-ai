import { createFileRoute } from "@tanstack/react-router";
import {
  createVoiceStripeClient,
  getVoiceStripeConfig,
  processVoiceStripeEvent,
  type StripeClientLike,
  type VoiceStripeConfig,
} from "@/lib/voice/billing.server";

const MAX_STRIPE_WEBHOOK_BYTES = 1_000_000;

async function readLimitedRawBody(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let body = "";
  let bytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > MAX_STRIPE_WEBHOOK_BYTES) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(chunk.value, { stream: true });
  }
  return body + decoder.decode();
}

export async function receiveStripeWebhook(
  request: Request,
  deps: {
    config?: VoiceStripeConfig;
    stripe?: StripeClientLike;
  } = {},
): Promise<Response> {
  const config = deps.config ?? getVoiceStripeConfig();
  if (!config) {
    return new Response("Voice billing webhook is not configured", {
      status: 503,
    });
  }
  const signature = request.headers.get("stripe-signature")?.trim();
  if (!signature) return new Response("Invalid signature", { status: 400 });
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_STRIPE_WEBHOOK_BYTES) {
    return new Response("Payload too large", { status: 413 });
  }

  let rawBody: string | null;
  try {
    rawBody = await readLimitedRawBody(request);
  } catch {
    return new Response("Invalid UTF-8 payload", { status: 400 });
  }
  if (rawBody === null) return new Response("Payload too large", { status: 413 });

  const stripe =
    deps.stripe ?? (await createVoiceStripeClient(config.secretKey));
  let event;
  try {
    // Stripe signs the exact raw bytes. Never call request.json() here.
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      config.webhookSecret,
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    await processVoiceStripeEvent(event, rawBody, { config, stripe });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("[voice-billing] verified Stripe event failed", {
      eventId: event.id,
      eventType: event.type,
      error: error instanceof Error ? error.message : "unknown",
    });
    // A non-2xx response tells Stripe to retry. Event writes and entitlement
    // writes are atomic and deduplicated by event_id when the retry succeeds.
    return new Response("Webhook temporarily unavailable", { status: 500 });
  }
}

export const Route = createFileRoute("/api/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) =>
        receiveStripeWebhook(request),
    },
  },
});
