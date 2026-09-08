import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/webhooks/social-stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!process.env.STRIPE_SOCIAL_WEBHOOK_SECRET || !process.env.STRIPE_SECRET_KEY)
          return new Response("Webhook setup required", { status: 503 });
        const signature = request.headers.get("stripe-signature");
        if (!signature) return new Response("Signature required", { status: 400 });
        if (Number(request.headers.get("content-length")) > 262144)
          return new Response("Payload too large", { status: 413 });
        const reader = request.body?.getReader();
        if (!reader) return new Response("Body required", { status: 400 });
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.length;
            if (size > 262144) return new Response("Payload too large", { status: 413 });
            chunks.push(chunk.value);
          }
        } finally {
          await reader.cancel().catch(() => undefined);
        }
        try {
          const { handleSocialStripeWebhook } = await import("@/lib/social-media/billing.server");
          const result = await handleSocialStripeWebhook(
            Buffer.concat(chunks).toString("utf8"),
            signature,
          );
          return Response.json(result);
        } catch (error) {
          const name = error instanceof Error ? error.name : "UnknownError";
          if (name === "StripeSignatureVerificationError")
            return new Response("Invalid signature", { status: 400 });
          // Return non-2xx so Stripe retries transient retrieval/database failures.
          console.error("[social-stripe] processing failed", { name });
          return new Response("Webhook could not be processed", { status: 503 });
        }
      },
    },
  },
});
