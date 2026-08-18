import { createFileRoute } from "@tanstack/react-router";
import { getRetellWebhookApiKey } from "@/lib/voice/config.server";
import { verifyRetellWebhook } from "@/lib/voice/retell.server";
import {
  acceptRetellWebhook,
  processAcceptedRetellWebhook,
  retellWebhookVerifier,
} from "@/lib/voice/webhooks.server";

const MAX_WEBHOOK_BYTES = 1_000_000;

async function readLimitedUtf8Body(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let body = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > MAX_WEBHOOK_BYTES) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(chunk.value, { stream: true });
  }
  return body + decoder.decode();
}

export async function receiveRetellWebhook(request: Request): Promise<Response> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_WEBHOOK_BYTES) {
    return new Response("Payload too large", { status: 413 });
  }
  let rawBody: string | null;
  try {
    rawBody = await readLimitedUtf8Body(request);
  } catch {
    return new Response("Invalid UTF-8 payload", { status: 400 });
  }
  if (rawBody === null) {
    return new Response("Payload too large", { status: 413 });
  }
  try {
    const apiKey = getRetellWebhookApiKey();
    const accepted = await acceptRetellWebhook(
      rawBody,
      request.headers.get("x-retell-signature"),
      retellWebhookVerifier((body, signature) =>
        verifyRetellWebhook(body, signature, apiKey),
      ),
    );
    // The event is already durable. Provider-side privacy deletion is deferred
    // to maintenance, but usage reconciliation runs inline so the 200-minute
    // hard stop cannot drift until the daily recovery job.
    const processing = await processAcceptedRetellWebhook(accepted.eventKey);
    if (processing.retried > 0) {
      throw new Error("Voice webhook processing is pending retry");
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook";
    if (message.startsWith("Voice service is not configured")) {
      return new Response("Voice webhook is not configured", { status: 503 });
    }
    if (message.includes("signature")) {
      return new Response("Unauthorized", { status: 401 });
    }
    if (message.startsWith("Invalid Retell")) {
      return new Response("Invalid webhook", { status: 400 });
    }
    // A non-2xx response asks Retell to retry after a transient persistence
    // failure, without reflecting database/provider details to the caller.
    return new Response("Webhook temporarily unavailable", { status: 500 });
  }
}

export const Route = createFileRoute("/api/webhooks/retell")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) =>
        receiveRetellWebhook(request),
    },
  },
});
