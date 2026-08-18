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
    label: "Comps search",
    icon: TrendingUp,
    query:
      "Search recent comparable sales near my market and tell me how to price/position an active listing. Use the web.",
  },
  {
    label: "Sell stale listing",
    icon: Sparkles,
    query:
      "Give me creative, practical ideas to sell my longest-standing active listings — fresh marketing angles, not generic advice.",
  },
  {
    label: "Who needs a reply?",
    icon: Timer,
    query: "Who needs an instant response right now for speed-to-lead?",
  },
  {
    label: "Top leads",
    icon: Users,
    query: "Analyze my top leads and suggest next actions",
  },
  {
    label: "Calendar",
    icon: Calendar,
    query: "What's on my calendar and what reminders did AI pick up?",
  },
  {
    label: "CMA help",
    icon: BookOpen,
    query: "How do I build a CMA and pricing strategy for a listing that has sat?",
  },
  {
    label: "Inventory",
    icon: Home,
    query: "Summarize my active listings and who they are best for",
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
  const recordSignal = useAppStore((s) => s.recordSignal);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, thinking]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || thinking) return;
    setInput("");
    pushChat({ role: "user", content: q });
    setThinking(true);
    const mem = useAppStore.getState().agentMemory;
    const apts = useAppStore.getState().appointments;
    const ctrs = useAppStore.getState().contractors;

    let reply: string | null = null;
    try {
      const { askLiveAssistant } = await import("@/lib/assistant-api");
      const live = await askLiveAssistant({
        data: {
          question: q,
          profileName: profile?.name,
          areaOfOperations: profile?.areaOfOperations,
          website: profile?.website,
          listings: properties.slice(0, 15).map((p) => ({
            title: p.title,
            address: p.address,
            city: p.city,
            neighborhood: p.neighborhood,
            price: p.price,
            beds: p.beds,
            baths: p.baths,
            sqft: p.sqft,
            daysOnMarket: p.daysOnMarket,
            status: p.status,
            features: p.features?.slice(0, 6),
          })),
          hotLeadNames: leads
            .filter((l) => l.heat === "hot")
            .slice(0, 8)
            .map((l) => l.name),
          memoryNotes: mem?.learnedFacts?.slice(0, 8).join("; "),
        },
      });
      if (live.ok) {
        reply = live.usedWebSearch
          ? `${live.answer}\n\n— _Live web-connected assistant_`
          : live.answer;
      }
    } catch {
      /* local fallback */
    }

    if (!reply) {
      await new Promise((r) => setTimeout(r, 350 + Math.random() * 250));
      reply = answerAssistant(q, {
        leads,
        properties,
        deals,
        rentals,
        profile,
        memory: mem,
        appointments: apts,
        contractors: ctrs,
      });
    }

    pushChat({ role: "assistant", content: reply });
    setThinking(false);
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
        <CardTitle className="flex-1">AI assistant</CardTitle>
        <Badge variant="success" title="Learns from your usage">
          <Sparkles className="h-3 w-3" />
          {memory.familiarityScore}/100
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
            {thinking && (
              <div className="flex justify-start">
                <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-fg-muted)]">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
                    Thinking — web + your book…
                  </span>
                </div>
              </div>
            )}
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
              disabled={thinking}
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
            void send(input);
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask for comps, sell ideas, calendar, or “remember that …”"
            disabled={thinking}
            className="flex-1"
          />
          <Button
            type="submit"
            size="icon"
            disabled={thinking || !input.trim()}
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
