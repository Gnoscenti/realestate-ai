import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  Copy,
  FileText,
  Mail,
  MessageSquare,
  Phone,
  Send,
  Timer,
  User,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/lib/store";
import {
  generateBuyerAgreementOutline,
  generateClientBrief,
  generateInstantResponse,
  generateNurtureSequence,
  generateReactivation,
} from "@/lib/ai";
import { cn, formatCurrency } from "@/lib/utils";
import { buildFiveMinuteProtocol } from "@/lib/edge-pack";
import { SPEED_TO_LEAD_SLA_MINUTES } from "@/lib/competitors";

const searchSchema = z.object({
  lead: z.string().optional(),
  mode: z.enum(["instant", "nurture", "brief", "reactivate", "agreement"]).optional(),
});

export const Route = createFileRoute("/outreach")({
  validateSearch: searchSchema,
  component: OutreachPage,
});

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.message("Select text to copy");
  }
}

function OutreachPage() {
  const { lead: leadParam, mode: modeParam } = Route.useSearch();
  const leads = useAppStore((s) => s.leads);
  const properties = useAppStore((s) => s.properties);
  const deals = useAppStore((s) => s.deals);
  const touchLead = useAppStore((s) => s.touchLead);
  const pushActivity = useAppStore((s) => s.pushActivity);
  const profile = useAppStore((s) => s.agentProfile);
  const [slaClock, setSlaClock] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setSlaClock((n) => n + 1), 15000);
    return () => window.clearInterval(id);
  }, []);

  const activeLeads = useMemo(
    () =>
      leads
        .filter((l) => !["closed_won", "closed_lost"].includes(l.status))
        .sort((a, b) => b.score - a.score),
    [leads],
  );

  const [leadId, setLeadId] = useState(
    leadParam && leads.some((l) => l.id === leadParam)
      ? leadParam
      : activeLeads[0]?.id ?? "",
  );
  const [tab, setTab] = useState(modeParam ?? "instant");
  const [channel, setChannel] = useState<"sms" | "email" | "voicemail">("sms");

  useEffect(() => {
    if (leadParam && leads.some((l) => l.id === leadParam)) setLeadId(leadParam);
  }, [leadParam, leads]);
  useEffect(() => {
    if (modeParam) setTab(modeParam);
  }, [modeParam]);

  const lead = leads.find((l) => l.id === leadId) ?? activeLeads[0];

  const instant = useMemo(
    () => (lead ? generateInstantResponse(lead, channel) : null),
    [lead, channel],
  );
  const brief = useMemo(
    () => (lead ? generateClientBrief(lead, properties, deals) : ""),
    [lead, properties, deals],
  );
  const nurture = useMemo(
    () => (lead ? generateNurtureSequence(lead) : []),
    [lead],
  );
  const reactivate = useMemo(
    () => (lead ? generateReactivation(lead) : null),
    [lead],
  );
  const agreement = useMemo(() => generateBuyerAgreementOutline(), []);
  const protocol = useMemo(
    () => (lead ? buildFiveMinuteProtocol(lead) : null),
    [lead, slaClock],
  );

  const markSent = (label: string) => {
    if (!lead) return;
    touchLead(lead.id);
    pushActivity({
      type: "chat",
      title: label,
      description: `${label} · ${lead.name}`,
      badge: "Outreach",
    });
    toast.success(`Logged for ${lead.name}`);
  };

  if (!lead) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center text-[var(--color-fg-muted)]">
        No active leads.{" "}
        <Link to="/leads" className="text-[var(--color-primary)] underline">
          Add a lead
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="accent">
              <Timer className="h-3 w-3" />
              Speed-to-lead
            </Badge>
            <Badge variant="secondary">Research-backed</Badge>
          </div>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-3xl">
            Instant response
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-[var(--color-fg-muted)] leading-relaxed">
            Inman data: average agent reply takes ~15 hours. Sub-5-minute
            responses and AI first-touch lift capture ~40%. Draft SMS, email,
            nurture, and client briefs here — then send and log in one step.
          </p>
        </div>
        <div className="w-full max-w-xs">
          <Select value={lead.id} onValueChange={setLeadId}>
            <SelectTrigger>
              <User className="h-4 w-4 opacity-50" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {activeLeads.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name} · {l.heat} · {l.score}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <InsightCard
          label="Lead score"
          value={String(lead.score)}
          hint={lead.heat}
        />
        <InsightCard
          label="Budget"
          value={`${formatCurrency(lead.budgetMin, true)}–${formatCurrency(lead.budgetMax, true)}`}
          hint={lead.location}
        />
        <InsightCard
          label="Channel tip"
          value="< 5 min"
          hint="Target first response window"
        />
      </div>


      {protocol && (
        <Card className="glass-card border-0 overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Timer className="h-4 w-4 text-[var(--color-primary)]" />
                5-minute protocol
                <Badge
                  variant={
                    protocol.sla.tone === "ok"
                      ? "success"
                      : protocol.sla.tone === "warn"
                        ? "warning"
                        : "danger"
                  }
                >
                  {protocol.sla.label}
                </Badge>
              </CardTitle>
              <span className="text-xs text-[var(--color-fg-subtle)]">
                Open {Math.round(protocol.minutesOpen)}m · target {'<'}{SPEED_TO_LEAD_SLA_MINUTES}m
                {" · "}
                <Link to="/edge" className="text-[var(--color-primary)] underline-offset-2 hover:underline">
                  vs competitors
                </Link>
              </span>
            </div>
            <CardDescription>
              Counters Follow Up Boss speed culture: SMS → email → call/VM → log — all in one card.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="grid gap-2 sm:grid-cols-5">
              {protocol.steps.map((s) => (
                <li
                  key={s.n}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-2.5"
                >
                  <div className="text-[11px] font-semibold text-[var(--color-primary)]">
                    {s.n}. {s.label}
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-[var(--color-fg-muted)]">
                    {s.detail}
                  </p>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => void copyText(protocol.pack.sms)}
              >
                <Copy className="h-4 w-4" />
                Copy SMS
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void copyText(
                    `Subject: ${protocol.pack.emailSubject}\n\n${protocol.pack.emailBody}`,
                  )
                }
              >
                Copy email
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void copyText(protocol.pack.allInOne)}
              >
                Copy full pack
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => markSent("5-min multi-channel pack logged")}
              >
                <Check className="h-4 w-4" />
                Mark pack sent
              </Button>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
                3-touch plan (beats Structurely spray with your voice)
              </div>
              {protocol.touches.map((touch) => (
                <div
                  key={touch.step}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="secondary">Touch {touch.step}</Badge>
                    <span className="text-[var(--color-fg-muted)]">{touch.when}</span>
                    <span className="text-[var(--color-fg-subtle)]">· {touch.channel}</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">{touch.purpose}</p>
                  <p className="mt-2 text-sm text-[var(--color-fg)]">{touch.body}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="instant">Instant reply</TabsTrigger>
          <TabsTrigger value="brief">Call brief</TabsTrigger>
          <TabsTrigger value="nurture">Nurture sequence</TabsTrigger>
          <TabsTrigger value="reactivate">Sphere reactivate</TabsTrigger>
          <TabsTrigger value="agreement">Buyer agreement</TabsTrigger>
        </TabsList>

        <TabsContent value="instant" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["sms", "SMS", MessageSquare],
                ["email", "Email", Mail],
                ["voicemail", "Voicemail", Phone],
              ] as const
            ).map(([id, label, Icon]) => (
              <Button
                key={id}
                size="sm"
                variant={channel === id ? "default" : "outline"}
                onClick={() => setChannel(id)}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Button>
            ))}
          </div>
          {instant && (
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-[var(--color-primary)]" />
                    {channel === "email" ? "Email draft" : channel === "sms" ? "SMS draft" : "Voicemail script"}
                  </CardTitle>
                  <CardDescription className="mt-1">{instant.tip}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void copyText(
                        [instant.subject, instant.body].filter(Boolean).join("\n\n"),
                      )
                    }
                  >
                    <Copy className="h-4 w-4" />
                    Copy
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => markSent(`Instant ${channel} sent`)}
                  >
                    <Send className="h-4 w-4" />
                    Mark sent
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {instant.subject && (
                  <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm">
                    <span className="text-[var(--color-fg-subtle)]">Subject · </span>
                    {instant.subject}
                  </div>
                )}
                <pre className="whitespace-pre-wrap rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 text-sm leading-relaxed font-sans text-[var(--color-fg)]">
                  {instant.body}
                </pre>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="brief">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
              <div>
                <CardTitle>Pre-call client brief</CardTitle>
                <CardDescription>
                  CRM snapshot agents asked for before every conversation
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => void copyText(brief)}>
                <Copy className="h-4 w-4" />
                Copy brief
              </Button>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 text-sm leading-relaxed font-sans">
                {brief}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="nurture" className="space-y-3">
          {nurture.map((step) => (
            <Card key={step.day}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Day {step.day}</Badge>
                    <span className="text-xs text-[var(--color-fg-subtle)]">
                      {step.channel}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
                    {step.body}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void copyText(step.body)}
                >
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
              </CardContent>
            </Card>
          ))}
          <Button onClick={() => markSent("Nurture sequence started")}>
            <Check className="h-4 w-4" />
            Enroll in nurture
          </Button>
        </TabsContent>

        <TabsContent value="reactivate">
          {reactivate && (
            <Card>
              <CardHeader>
                <CardTitle>Sphere reactivation</CardTitle>
                <CardDescription>
                  Mine cold CRM contacts — cheaper than new portal leads (2026
                  brokerage playbook)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {reactivate.subject && (
                  <div className="text-sm">
                    <span className="text-[var(--color-fg-subtle)]">Subject · </span>
                    {reactivate.subject}
                  </div>
                )}
                <pre className="whitespace-pre-wrap rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 text-sm leading-relaxed font-sans">
                  {reactivate.body}
                </pre>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      void copyText(
                        [reactivate.subject, reactivate.body]
                          .filter(Boolean)
                          .join("\n\n"),
                      )
                    }
                  >
                    <Copy className="h-4 w-4" />
                    Copy
                  </Button>
                  <Button onClick={() => markSent("Reactivation sent")}>
                    <Send className="h-4 w-4" />
                    Mark sent
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="agreement">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[var(--color-primary)]" />
                {agreement.title}
              </CardTitle>
              <CardDescription>
                Post-NAR settlement: written buyer agreements and clear fees are
                table stakes. Use this outline with your brokerage counsel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {agreement.clauses.map((c) => (
                <div
                  key={c.heading}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4"
                >
                  <h3 className="text-sm font-semibold text-[var(--color-fg)]">
                    {c.heading}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-fg-muted)]">
                    {c.text}
                  </p>
                </div>
              ))}
              <Button
                variant="outline"
                onClick={() =>
                  void copyText(
                    agreement.clauses
                      .map((c) => `${c.heading}\n${c.text}`)
                      .join("\n\n"),
                  )
                }
              >
                <Copy className="h-4 w-4" />
                Copy outline
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InsightCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
        {label}
      </div>
      <div className={cn("mt-1.5 font-display text-xl font-semibold tabular")}>
        {value}
      </div>
      <div className="mt-0.5 text-xs capitalize text-[var(--color-fg-muted)]">
        {hint}
      </div>
    </div>
  );
}
