import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import { listVoiceCalls } from "@/lib/voice/calls.server";

async function getCalls(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId")?.trim();
  if (
    !workspaceId ||
    workspaceId.length > 240 ||
    /[\u0000-\u001f]/.test(workspaceId)
  ) {
    return Response.json({ error: "workspaceId is required" }, { status: 400 });
  }
  const limitText = url.searchParams.get("limit");
  const limit = limitText === null ? 25 : Number(limitText);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return Response.json(
      { error: "limit must be between 1 and 100" },
      { status: 400 },
    );
  }
  try {
    const calls = await listVoiceCalls(session.user.id, workspaceId, {
      limit,
      before: url.searchParams.get("before") ?? undefined,
    });
    return Response.json(calls, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to list calls";
    if (message === "Workspace not found") {
      return Response.json({ error: "Workspace not found" }, { status: 404 });
    }
    if (message === "Invalid call cursor") {
      return Response.json({ error: message }, { status: 400 });
    }
    throw error;
  }
}

export const Route = createFileRoute("/api/voice/calls")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => getCalls(request),
    },
  },
});
