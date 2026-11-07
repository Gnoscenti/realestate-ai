import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { authClient, authEnabled } from "@/lib/auth/client";
import { startDemoSession } from "@/lib/demo-mode";

/**
 * Shareable demo link (for a QR code or a text message): opens the workspace
 * with sample data and no account. Signed-in visitors simply go to their own
 * workspace; the demo never replaces a real session.
 */
export const Route = createFileRoute("/demo")({
  component: authEnabled ? DemoEntry : DevDemoEntry,
});

function DemoEntry() {
  const navigate = useNavigate();
  const { data, isPending } = authClient.useSession();
  const signedIn = Boolean(data?.user);

  useEffect(() => {
    if (isPending) return;
    if (!signedIn) startDemoSession();
    void navigate({ to: "/", replace: true });
  }, [isPending, signedIn, navigate]);

  return <Opening />;
}

/** Auth disabled (local dev and tests): there is no sign-in to skip. */
function DevDemoEntry() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/", replace: true });
  }, [navigate]);
  return <Opening />;
}

function Opening() {
  return (
    <div role="status" className="flex min-h-dvh items-center justify-center text-sm text-[var(--color-fg-muted)]">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening the demo workspace…
    </div>
  );
}
