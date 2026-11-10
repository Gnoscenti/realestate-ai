import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bell,
  CheckCheck,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/relative-time";
import { ALERT_KIND_LABEL, unreadCount } from "@/lib/email-alerts";
import { DEMO_LOCKED_MESSAGE, isDemoSession } from "@/lib/demo-mode";
import { useAppStore } from "@/lib/store";
import { cn, relativeTime } from "@/lib/utils";

export const Route = createFileRoute("/alerts")({
  component: AlertsPage,
});

function AlertsPage() {
  const alerts = useAppStore((s) => s.emailAlerts);
  const lastScanAt = useAppStore((s) => s.emailConnection?.lastScanAt);
  const scanEmailInbox = useAppStore((s) => s.scanEmailInbox);
  const markAlertRead = useAppStore((s) => s.markAlertRead);
  const markAllAlertsRead = useAppStore((s) => s.markAllAlertsRead);
  const dismissAlert = useAppStore((s) => s.dismissAlert);
  const navigate = useNavigate();

  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const unread = useMemo(() => unreadCount(alerts), [alerts]);

  // There is no connected inbox. Each scan is one request, made with a token
  // the agent pastes for that request.
  const scan = async () => {
    // The guest demo has no account, so the server would refuse this request.
    if (isDemoSession()) {
      toast.message(DEMO_LOCKED_MESSAGE);
      return;
    }
    const accessToken = token.trim();
    if (!accessToken) {
      setTokenError("Paste a Gmail access token first. Nothing is scanned without one.");
      return;
    }
    setTokenError(null);
    setBusy(true);
    // The token is held in this component, sent to our server for this one
    // scan, then cleared. It is never written to browser storage (ledger A-020).
    const r = await scanEmailInbox({ accessToken });
    setToken("");
    setBusy(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    toast.success(
      r.added > 0
        ? `Gmail scan finished. ${r.added} new ${r.added === 1 ? "alert" : "alerts"}.`
        : "Gmail scan finished. No new alerts.",
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 pb-24 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Email Alerts
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--color-fg-muted)]">
            Run a one-time scan of Gmail for deal emails such as signature
            requests, escrow, inspections and showings. No inbox stays
            connected and nothing is scanned automatically. Alerts you have not
            marked read are counted on the bell, in the menu and on the browser
            tab.
          </p>
        </div>
        <div className="flex gap-2">
          {unread > 0 && (
            <Button
              variant="outline"
              className="min-h-[44px]"
              onClick={() => {
                markAllAlertsRead();
                toast.message("All marked read");
              }}
            >
              <CheckCheck aria-hidden="true" className="h-4 w-4" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      <Card className="glass-card border-0">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail aria-hidden="true" className="h-4 w-4 text-[var(--color-primary)]" />
            One-time Gmail scan
          </CardTitle>
          <CardDescription>
            Sign-in with Google is not connected, so this page cannot open your
            inbox by itself. To run one scan, paste a Gmail access token (a key
            from Google that gives a program access to your Gmail). If you do
            not have one, you cannot run a scan. Outlook, iCloud and other email
            providers are not connected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="space-y-3"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void scan();
            }}
          >
            <div>
              <Label htmlFor="token">Gmail access token</Label>
              <PasswordInput
                id="token"
                secretLabel="access token"
                containerClassName="mt-1.5"
                className="h-11"
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                  setTokenError(null);
                }}
                placeholder="Paste a Gmail access token"
                autoComplete="off"
                aria-invalid={tokenError ? true : undefined}
                aria-describedby={tokenError ? "token-error token-help" : "token-help"}
              />
              {tokenError && (
                <p id="token-error" role="alert" className="mt-1 text-sm text-[var(--color-danger)]">
                  {tokenError}
                </p>
              )}
              <p id="token-help" className="mt-1 text-xs text-[var(--color-fg-subtle)]">
                The token is sent to our server, used for this one scan, and not
                saved by this app. Paste a new one each time you scan.
              </p>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--color-fg-muted)]">
              <li>
                Looks at up to 15 messages from the last 14 days: mail from
                DocuSign, mail whose subject mentions DocuSign, escrow,
                inspection, showing, appraisal, underwriting or invitation, and
                mail Gmail marks as important.
              </li>
              <li>
                Reads the sender, subject, date and the short preview Gmail
                provides. It does not open attachments, and it does not send,
                change or delete anything.
              </li>
              <li>
                Sorts matches into alerts with keyword rules. Messages that match
                no rule are left out.
              </li>
              <li>
                Alerts are saved in this browser only and stay as they were at the
                last scan. Nothing is scanned in the background.
              </li>
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" className="min-h-[44px] w-full sm:w-auto" disabled={busy}>
                {busy ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw aria-hidden="true" className="h-4 w-4" />
                )}
                {busy ? "Scanning Gmail…" : "Scan Gmail"}
              </Button>
              <span className="text-xs text-[var(--color-fg-subtle)]">
                {lastScanAt ? (
                  <>
                    Last scan <RelativeTime iso={lastScanAt} />
                  </>
                ) : (
                  "No scan has finished in this browser."
                )}
              </span>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {alerts.length === 0 && (
          <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-fg-muted)]">
            <Inbox className="mx-auto mb-2 h-8 w-8 opacity-40" />
            No alerts. Alerts appear here after a Gmail scan finds matching
            emails.
          </div>
        )}
        {alerts.map((a) => (
          <Card
            key={a.id}
            className={cn(
              "glass-card border-0 transition",
              !a.read && "ring-1 ring-[color-mix(in_oklab,var(--color-primary)_40%,transparent)]",
            )}
          >
            <CardContent className="flex gap-3 p-4">
              <div className="relative mt-1 shrink-0">
                <Bell className="h-5 w-5 text-[var(--color-primary)]" />
                {!a.read && (
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--color-danger)] ring-2 ring-[var(--color-bg)]" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      a.priority === "critical"
                        ? "danger"
                        : a.priority === "high"
                          ? "warning"
                          : "secondary"
                    }
                  >
                    {ALERT_KIND_LABEL[a.kind]}
                  </Badge>
                  <span className="text-[11px] text-[var(--color-fg-subtle)]">
                    {relativeTime(a.receivedAt)}
                  </span>
                </div>
                <div className="mt-1 font-medium text-[var(--color-fg)]">
                  {a.subject}
                </div>
                <div className="text-xs text-[var(--color-fg-muted)]">
                  {a.from}
                  {a.leadName ? ` · possible match with your lead ${a.leadName}` : ""}
                </div>
                <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
                  {a.snippet}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {/* An alert that points back at this page has nowhere to go. */}
                  {a.href.split("?")[0] !== "/alerts" && (
                    <Button
                      size="sm"
                      className="min-h-[40px]"
                      onClick={() => {
                        markAlertRead(a.id);
                        if (a.href.startsWith("/outreach")) {
                          void navigate({ to: "/outreach", search: Object.fromEntries(new URLSearchParams(a.href.split("?")[1] || "")) as { lead?: string; mode?: "instant" } });
                        } else {
                          void navigate({ to: a.href.split("?")[0] as "/alerts" });
                        }
                      }}
                    >
                      {a.actionLabel}
                    </Button>
                  )}
                  {!a.read && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-[40px]"
                      onClick={() => markAlertRead(a.id)}
                    >
                      Mark read
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-[40px]"
                    onClick={() => dismissAlert(a.id)}
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                    Dismiss
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
