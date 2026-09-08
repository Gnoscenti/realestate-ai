import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/listing-media/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { requireUserId } = await import("@/lib/auth/verify.server");
        const { readManagedImage } = await import("@/lib/social-media/managed-media.server");
        try {
          const userId = await requireUserId();
          const media = await readManagedImage(userId, params.id);
          return new Response(new Uint8Array(media.bytes), {
            headers: {
              "Content-Type": media.contentType,
              "Content-Length": String(media.bytes.length),
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
              "Content-Disposition":
                'inline; filename="listing-image.' +
                (media.contentType === "image/png" ? "png" : "jpg") +
                '"',
            },
          });
        } catch (error) {
          return new Response("Image unavailable", {
            status: error instanceof Error && error.message === "Unauthorized" ? 401 : 404,
            headers: { "Cache-Control": "private, no-store" },
          });
        }
      },
    },
  },
});
