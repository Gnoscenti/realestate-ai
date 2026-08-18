import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Home,
  Send,
  Sparkles,
  Timer,
  TrendingUp,
  Users,
  BookOpen,
  Brain,
  Calendar,
  Wrench,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore } from "@/lib/store";
import { answerAssistant } from "@/lib/ai";
import { cn } from "@/lib/utils";

const QUICK = [
  {
    label: "Calendar",
    icon: Calendar,
    query: "What's on my calendar and what reminders are saved?",
  },
  {
    label: "Who needs a reply?",
    icon: Timer,
    query: "Who needs an instant response right now for speed-to-lead?",
  },
  {
    label: "Termite vendor",
    icon: Wrench,
    query: "Who's on my commonly used termite contractor list?",
  },
  {
    label: "Top leads",
    icon: Users,
    query: "Analyze my top leads and suggest next actions",
  },
  {
    label: "RSF comp rules",
    icon: BookOpen,
    query: "Covenant vs Bridges comps rules for Rancho Santa Fe",
  },
  {
    label: "CMA help",
    icon: TrendingUp,
    query: "How do I build a CMA and pricing strategy?",
  },
  {
    label: "Inventory",
    icon: Home,
    query: "Show me luxury estates in Rancho Santa Fe",
  },
  {
    label: "About me",
    icon: Brain,
    query: "What do you know about me and my voice?",
  },
];

export function AIAssistant({ className }: { className?: string }) {
  const chat = useAppStore((s) => s.chat);
  const pushChat = useAppStore((s) => s.pushChat);
  const leads = useAppStore((s) => s.leads);
  const properties = useAppStore((s) => s.properties);
  const deals = useAppStore((s) => s.deals);
  const rentals = useAppStore((s) => s.rentals);
  const profile = useAppStore((s) => s.agentProfile);
  const memory = useAppStore((s) => s.agentMemory);
  const appointments = useAppStore((s) => s.appointments);
  const contractors = useAppStore((s) => s.contractors);
  const recordSignal = useAppStore((s) => s.recordSignal);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  const send = (text: string) => {
    const q = text.trim();
    if (!q) return;
    setInput("");
    pushChat({ role: "user", content: q });
    const mem = useAppStore.getState().agentMemory;
    const apts = useAppStore.getState().appointments;
    const ctrs = useAppStore.getState().contractors;
    const reply = answerAssistant(q, {
      leads,
      properties,
      deals,
      rentals,
      profile,
      memory: mem,
      appointments: apts,
      contractors: ctrs,
    });
    pushChat({ role: "assistant", content: reply });
  };

  return (
    <Card
      className={cn(
        "flex h-[min(36rem,70dvh)] flex-col lg:h-[640px]",
        className,
      )}
    >
      <CardHeader className="flex-row items-center gap-2 space-y-0 border-b border-[var(--color-border)] pb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-primary-soft)]">
          <Bot className="h-4 w-4 text-[var(--color-primary)]" />
        </div>
        <CardTitle className="flex-1">Workspace assistant</CardTitle>
        <Badge
          variant="success"
          title="Rules-based beta using records saved in this browser"
        >
          <Sparkles className="h-3 w-3" />
          Rules beta
        </Badge>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <ScrollArea className="min-h-0 flex-1 pr-3">
          <div className="space-y-3 pb-2">
            {chat.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[92%] rounded-[var(--radius-md)] px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                    m.role === "user"
                      ? "rounded-br-sm bg-[var(--color-primary)] text-[var(--color-primary-fg)]"
                      : "rounded-bl-sm border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-fg)]",
                  )}
                >
                  {m.content}
                  {m.role === "assistant" && m.id !== "welcome" && (
                    <div className="mt-2 flex gap-2 border-t border-[var(--color-border)]/50 pt-2">
                      <button
                        type="button"
                        className="text-[10px] text-[var(--color-fg-subtle)] hover:text-[var(--color-success)]"
                        onClick={() => {
                          recordSignal({
                            kind: "feedback_up",
                            text: m.content.slice(0, 80),
                          });
                        }}
                      >
                        Helpful
                      </button>
                      <button
                        type="button"
                        className="text-[10px] text-[var(--color-fg-subtle)] hover:text-[var(--color-danger)]"
                        onClick={() => {
                          recordSignal({
                            kind: "feedback_down",
                            text: m.content.slice(0, 120),
                          });
                        }}
                      >
                        Missed
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((a) => (
            <Button
              key={a.label}
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => send(a.query)}
            >
              <a.icon className="h-3 w-3" />
              {a.label}
            </Button>
          ))}
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search records saved in this workspace…"
            className="flex-1"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim()}
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
