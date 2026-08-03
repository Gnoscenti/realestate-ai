import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CheckCheck,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Trash2,
  Link2,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ALERT_KIND_LABEL,
  type EmailProviderId,
  unreadCount,
} from "@/lib/email-alerts";
import { useAppStore } from "@/lib/store";
import { cn, relativeTime } from "@/lib/utils";

export const Route = createFileRoute("/alerts")({
  component: AlertsPage,
});

function AlertsPage() {
  const alerts = useAppStore((s) => s.emailAlerts);
  const conn = useAppStore((s) => s.emailConnection);
  const connectEmail = useAppStore((s) => s.connectEmail);
  const disconnectEmail = useAppStore((s) => s.disconnectEmail);
  const scanEmailInbox = useAppStore((s) => s.scanEmailInbox);
  const markAlertRead = useAppStore((s) => s.markAlertRead);
  const markAllAlertsRead = useAppStore((s) => s.markAllAlertsRead);
  const dismissAlert = useAppStore((s) => s.dismissAlert);
  const profile = useAppStore((s) => s.agentProfile);
  const navigate = useNavigate();

  const [provider, setProvider] = useState<EmailProviderId>("gmail");
  const [email, setEmail] = useState(conn?.email || profile?.email || "");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  const unread = useMemo(() => unreadCount(alerts), [alerts]);

  useEffect(() => {
    if (conn?.email) setEmail(conn.email);
  }, [conn?.email]);

  const connectAndScan = async () => {
    if (!email.trim() || !email.includes("@")) {
      toast.error("Enter the inbox email address");
      return;
    }
    connectEmail(provider, email.trim());
    if (token.trim()) {
      sessionStorage.setItem("realestate-ai-email-token", token.trim());
      localStorage.setItem("realestate-ai-email-token", token.trim());
    }
    setBusy(true);
    const r = await scanEmailInbox({
      accessToken: token.trim() || undefined,
      forceDemo: !token.trim(),
    });
    setBusy(false);
    if (r.mode.startsWith("demo")) {
      toast.message(
        r.error
          ? "Live token unavailable — showing rule-based scan (DocuSign, clients, escrow…)"
          : "Inbox connected · smart scan loaded (DocuSign, clients, escrow…)",
      );
    } else {
      toast.success(`Scanned live inbox · ${r.added} new alert(s)`);
    }
    setToken("");
  };

  const rescan = async () => {
    setBusy(true);
    const r = await scanEmailInbox({});
    setBusy(false);
    toast.success(
      r.added ? `${r.added} new alert(s)` : `Scan complete · ${r.total} unread`,
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
            Scans your connected inbox for DocuSign, client replies, escrow,
            inspections, showings, and more. Unread count shows as a red dot on
            the app icon and menu.
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
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </Button>
          )}
          <Button
            className="min-h-[44px]"
            disabled={busy || !conn}
            onClick={() => void rescan()}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Scan now
          </Button>
        </div>
      </div>

      <Card className="glass-card border-0">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-[var(--color-primary)]" />
            Connect inbox
          </CardTitle>
          <CardDescription>
            Gmail, Outlook, or iCloud. Optional access token enables live API
            scan; otherwise we run the same alert rules on a smart demo pass
            (and match your real lead emails).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {conn ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
              <div>
                <div className="font-medium text-[var(--color-fg)]">
                  {conn.email}
                </div>
                <div className="text-xs text-[var(--color-fg-subtle)]">
                  {conn.provider.toUpperCase()} ·{" "}
                  {conn.lastScanAt
                    ? `Last scan ${relativeTime(conn.lastScanAt)}`
                    : "Not scanned yet"}
                  {unread > 0 ? ` · ${unread} unread` : ""}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  disconnectEmail();
                  toast.message("Inbox disconnected");
                }}
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Provider</Label>
                  <Select
                    value={provider}
                    onValueChange={(v) => setProvider(v as EmailProviderId)}
                  >
                    <SelectTrigger className="mt-1.5 h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gmail">Gmail</SelectItem>
                      <SelectItem value="outlook">Outlook</SelectItem>
                      <SelectItem value="icloud">iCloud / Apple</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="inbox-email">Inbox email</Label>
                  <Input
                    id="inbox-email"
                    className="mt-1.5 h-11"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@brokerage.com"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="token">Access token (optional — live Gmail)</Label>
                <Input
                  id="token"
                  type="password"
                  className="mt-1.5 h-11"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste OAuth token if you have one"
                  autoComplete="off"
                />
                <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                  Without a token we still flag DocuSign, escrow, inspection,
                  showings, and any email from leads already in your book.
                </p>
              </div>
              <Button
                className="min-h-[44px] w-full sm:w-auto"
                disabled={busy}
                onClick={() => void connectAndScan()}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                Connect & scan
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        {alerts.length === 0 && (
          <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-fg-muted)]">
            <Inbox className="mx-auto mb-2 h-8 w-8 opacity-40" />
            No alerts yet. Connect an inbox and scan to surface DocuSign and
            client messages.
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
                  {a.leadName ? ` · matched client ${a.leadName}` : ""}
                </div>
                <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
                  {a.snippet}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
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
                    <Trash2 className="h-4 w-4" />
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
