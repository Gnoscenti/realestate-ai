import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Link2,
  Loader2,
  Plug,
  RefreshCw,
  Trash2,
  Unplug,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  MLS_BOARDS,
  MLS_PLATFORMS,
  getBoard,
  getPlatform,
  platformsForBoard,
  saveMlsSecret,
  clearMlsSecret,
  type MlsConnection,
  type MlsPlatformId,
} from "@/lib/mls-platforms";
import { useAppStore } from "@/lib/store";
import { uid } from "@/lib/utils";

export const Route = createFileRoute("/mls")({
  component: MlsHubPage,
});

function MlsHubPage() {
  const profile = useAppStore((s) => s.agentProfile);
  const connections = useAppStore((s) => s.mlsConnections);
  const upsert = useAppStore((s) => s.upsertMlsConnection);
  const remove = useAppStore((s) => s.removeMlsConnection);
  const syncOne = useAppStore((s) => s.syncMlsConnection);
  const syncAll = useAppStore((s) => s.syncAllMls);
  const properties = useAppStore((s) => s.properties);

  const boardId = profile?.mls || "sandicor";
  const board = getBoard(boardId);
  const availablePlatforms = platformsForBoard(boardId);

  const [platform, setPlatform] = useState<MlsPlatformId>(
    availablePlatforms[0]?.id ?? "reso_web",
  );
  const platformMeta = getPlatform(platform);
  const [baseUrl, setBaseUrl] = useState(
    board.endpointHints[platform] || platformMeta.defaultBaseUrl || "",
  );
  const [dataset, setDataset] = useState("");
  const [agentMlsId, setAgentMlsId] = useState(profile?.agentMlsId || "");
  const [accessToken, setAccessToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);

  const mlsProps = useMemo(
    () => properties.filter((p) => p.features?.includes("From MLS")),
    [properties],
  );

  const onPlatformChange = (id: MlsPlatformId) => {
    setPlatform(id);
    const meta = getPlatform(id);
    const hint = getBoard(boardId).endpointHints[id];
    setBaseUrl(hint || meta.defaultBaseUrl || "");
  };

  const connectAndSync = async () => {
    if (platform === "website") {
      const conn: MlsConnection = {
        id: uid("mlsconn"),
        boardId,
        platform: "website",
        label: `Website · ${profile?.website || "not set"}`,
        status: "connected",
        baseUrl: profile?.website || "",
        agentMlsId: agentMlsId || profile?.agentMlsId,
        hasCredentials: Boolean(profile?.website),
        createdAt: new Date().toISOString(),
      };
      upsert(conn);
      setBusy(true);
      const r = await syncOne(conn.id);
      setBusy(false);
      if (r.error) toast.message(r.error);
      else toast.success(`Website: ${r.listings} listing(s)`);
      return;
    }

    if (platform === "csv") {
      toast.message("Use Import on Leads/Properties or paste CSV in settings");
      return;
    }

    if (!baseUrl.trim()) {
      toast.error("Base URL required");
      return;
    }
    if (platformMeta.auth !== "none" && !accessToken.trim() && !(clientId && clientSecret)) {
      toast.error("Access token (or client id + secret for Trestle) required");
      return;
    }

    const id = uid("mlsconn");
    const conn: MlsConnection = {
      id,
      boardId,
      platform,
      label: `${platformMeta.short} · ${board.label}`,
      status: "connected",
      baseUrl: baseUrl.trim(),
      dataset: dataset.trim() || undefined,
      agentMlsId: agentMlsId.trim() || profile?.agentMlsId,
      clientId: clientId.trim() || undefined,
      hasCredentials: true,
      createdAt: new Date().toISOString(),
    };
    saveMlsSecret(id, {
      accessToken: accessToken.trim() || undefined,
      clientId: clientId.trim() || undefined,
      clientSecret: clientSecret.trim() || undefined,
    });
    upsert(conn);
    setBusy(true);
    const r = await syncOne(id);
    setBusy(false);
    if (r.error) {
      toast.error(r.error);
    } else {
      toast.success(`Synced ${r.listings} listing(s) from ${platformMeta.short}`);
      setAccessToken("");
      setClientSecret("");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 pb-24 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            MLS Hub
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--color-fg-muted)]">
            Connect the platforms your board actually uses — Bridge, Trestle, Spark,
            MLS Grid, or generic RESO Web API. Without credentials we use your
            website, never fake inventory.
          </p>
        </div>
        <Button
          variant="outline"
          className="min-h-[44px]"
          disabled={busy || connections.length === 0}
          onClick={() => {
            setBusy(true);
            void syncAll().then((r) => {
              setBusy(false);
              if (r.errors.length) toast.message(r.errors[0]);
              else toast.success(`Synced ${r.listings} listing(s)`);
            });
          }}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Sync all
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Board" value={board.label} />
        <Stat label="Connections" value={String(connections.length)} />
        <Stat label="MLS listings on book" value={String(mlsProps.length)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plug className="h-4 w-4 text-[var(--color-primary)]" />
              Connect a platform
            </CardTitle>
            <CardDescription>
              Platforms recommended for{" "}
              <span className="text-[var(--color-fg)]">{board.label}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Platform</Label>
              <Select
                value={platform}
                onValueChange={(v) => onPlatformChange(v as MlsPlatformId)}
              >
                <SelectTrigger className="mt-1.5 h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availablePlatforms.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                  {MLS_PLATFORMS.filter(
                    (p) => !availablePlatforms.some((a) => a.id === p.id),
                  ).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label} (other)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-xs text-[var(--color-fg-subtle)]">
                {platformMeta.blurb}
              </p>
            </div>

            {platform !== "website" && platform !== "csv" && (
              <>
                <div>
                  <Label htmlFor="baseUrl">API base URL</Label>
                  <Input
                    id="baseUrl"
                    className="mt-1.5 h-11 font-mono text-xs"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api…/odata"
                  />
                </div>
                {platform === "bridge" && (
                  <div>
                    <Label htmlFor="dataset">Dataset (Bridge)</Label>
                    <Input
                      id="dataset"
                      className="mt-1.5 h-11"
                      value={dataset}
                      onChange={(e) => setDataset(e.target.value)}
                      placeholder="e.g. sandicor, crmls"
                    />
                  </div>
                )}
                <div>
                  <Label htmlFor="agentMlsId">Your agent MLS ID</Label>
                  <Input
                    id="agentMlsId"
                    className="mt-1.5 h-11"
                    value={agentMlsId}
                    onChange={(e) => setAgentMlsId(e.target.value)}
                    placeholder={profile?.agentMlsId || "ListAgentMlsId"}
                  />
                </div>
                {(platformMeta.auth === "bearer" ||
                  platformMeta.auth === "oauth2") && (
                  <div>
                    <Label htmlFor="token">Access token</Label>
                    <Input
                      id="token"
                      type="password"
                      className="mt-1.5 h-11"
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      placeholder="Bearer token (stored locally only)"
                      autoComplete="off"
                    />
                  </div>
                )}
                {platform === "trestle" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="cid">Client ID</Label>
                      <Input
                        id="cid"
                        className="mt-1.5 h-11"
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="csec">Client secret</Label>
                      <Input
                        id="csec"
                        type="password"
                        className="mt-1.5 h-11"
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            <ul className="space-y-1 text-xs text-[var(--color-fg-subtle)]">
              {platformMeta.setupHints.map((h) => (
                <li key={h}>· {h}</li>
              ))}
            </ul>

            <Button
              className="min-h-[44px] w-full"
              disabled={busy}
              onClick={() => void connectAndSync()}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              Connect & sync
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-[var(--color-primary)]" />
              Active connections
            </CardTitle>
            <CardDescription>
              Tokens stay in this browser (session/local). Server fetch never invents
              listings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {connections.length === 0 && (
              <p className="text-sm text-[var(--color-fg-muted)]">
                No platforms connected. Pick Bridge / Trestle / Spark / MLS Grid / RESO
                for your board, or use Website fallback.
              </p>
            )}
            {connections.map((c) => {
              const meta = getPlatform(c.platform);
              return (
                <div
                  key={c.id}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-[var(--color-fg)]">
                        {c.label}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge variant="secondary">{meta.short}</Badge>
                        <StatusBadge status={c.status} />
                        {typeof c.listingCount === "number" && (
                          <Badge variant="outline">{c.listingCount} listings</Badge>
                        )}
                      </div>
                      {c.lastError && (
                        <p className="mt-1 flex items-start gap-1 text-xs text-[var(--color-warning)]">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                          {c.lastError}
                        </p>
                      )}
                      {c.lastSyncAt && (
                        <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                          Last sync {new Date(c.lastSyncAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-10 w-10"
                        title="Sync"
                        disabled={busy}
                        onClick={() => {
                          setBusy(true);
                          void syncOne(c.id).then((r) => {
                            setBusy(false);
                            if (r.error) toast.error(r.error);
                            else toast.success(`${r.listings} listing(s)`);
                          });
                        }}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-10 w-10"
                        title="Disconnect"
                        onClick={() => {
                          clearMlsSecret(c.id);
                          remove(c.id);
                          toast.message("Disconnected");
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Boards → platforms</CardTitle>
          <CardDescription>
            Your profile board is <strong>{board.label}</strong>. Other boards available
            when you change it in profile.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2">
            {MLS_BOARDS.map((b) => (
              <div
                key={b.id}
                className={`rounded-[var(--radius-sm)] border px-3 py-2 text-sm ${
                  b.id === boardId
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]"
                    : "border-[var(--color-border)]"
                }`}
              >
                <div className="font-medium text-[var(--color-fg)]">{b.label}</div>
                <div className="mt-0.5 text-xs text-[var(--color-fg-subtle)]">
                  {b.platforms
                    .map((pid) => getPlatform(pid).short)
                    .join(" · ")}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-[var(--color-fg)]">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: MlsConnection["status"] }) {
  if (status === "connected")
    return (
      <Badge className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Connected
      </Badge>
    );
  if (status === "syncing")
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Syncing
      </Badge>
    );
  if (status === "error")
    return (
      <Badge variant="danger" className="gap-1">
        <Unplug className="h-3 w-3" />
        Error
      </Badge>
    );
  return <Badge variant="outline">Disconnected</Badge>;
}
