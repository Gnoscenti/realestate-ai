import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Home,
  Send,
  Sparkles,
  TrendingUp,
  BookOpen,
  Brain,
  Megaphone,
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
import { cn } from "@/lib/utils";

const QUICK = [
  {
    label: "Sold records",
    icon: TrendingUp,
    query:
      "Show my verified Closed/Sold records as unranked source data, including close date and source. Do not call them comps or recommend a price.",
  },
  {
    label: "Sell stale listing",
    icon: Sparkles,
    query:
      "Give me creative, practical ideas to sell my longest-standing active listings — fresh marketing angles, not generic advice.",
  },
  {
    label: "CMA help",
    icon: BookOpen,
    query:
      "Explain the professional CMA workflow and what data I need before recommending a price.",
  },
  {
    label: "Inventory",
    icon: Home,
    query:
      "Summarize my active server-saved listings using only objective property and transaction facts.",
  },
  {
    label: "About me",
    icon: Brain,
    query: "Summarize the agent profile saved in my server workspace.",
  },
  {
    label: "Marketing plan",
    icon: Megaphone,
    query:
      "Create a concise marketing plan for one of my active server-saved listings without inventing property facts.",
  },
];

export function AIAssistant({ className }: { className?: string }) {
  const chat = useAppStore((s) => s.chat);
  const pushChat = useAppStore((s) => s.pushChat);
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
    let reply = "The AI assistant is temporarily unavailable. Please try again.";
    try {
      const { askLiveAssistant } = await import("@/lib/assistant-api");
      const live = await askLiveAssistant({
        data: { requestId: crypto.randomUUID(), question: q },
      });
      if (live.ok) {
        const sourceNote =
          live.source === "verified-sold-records"
            ? "Verified workspace Closed/Sold records · deterministic · unranked"
            : live.source === "workspace"
              ? "AI analysis · server-owned workspace records · no public web or MLS lookup"
              : null;
        reply = sourceNote
          ? `${live.answer}\n\n— ${sourceNote}`
          : live.answer;
      } else {
        reply = live.error;
      }
    } catch (e) {
      reply =
        e instanceof Error && e.message === "Unauthorized"
          ? "Sign in again to use the AI assistant."
          : "The AI assistant could not complete that request. Please try again.";
    } finally {
      pushChat({ role: "assistant", content: reply });
      setThinking(false);
    }
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
        <Badge
          variant="success"
          title="Authenticated AI using server-owned workspace records"
        >
          <Sparkles className="h-3 w-3" />
          Server-secured
        </Badge>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <ScrollArea className="min-h-0 flex-1 pr-3">
          <div
            className="space-y-3 pb-2"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
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
                        className="min-h-11 px-2 text-[10px] text-[var(--color-fg-subtle)] hover:text-[var(--color-success)]"
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
                        className="min-h-11 px-2 text-[10px] text-[var(--color-fg-subtle)] hover:text-[var(--color-danger)]"
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
              <div className="flex justify-start" aria-live="polite">
                <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-fg-muted)]">
                  <span className="inline-flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent"
                    />
                    Checking your workspace…
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
              className="min-h-11 text-xs"
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
            maxLength={2_000}
            placeholder="Ask about server-saved listings, Closed/Sold records, or strategy…"
            aria-label="Ask the AI assistant"
            className="min-h-11 flex-1"
          />
          <Button
            type="submit"
            size="icon"
            disabled={thinking || !input.trim()}
            aria-label="Send"
            className="min-h-11 min-w-11"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
