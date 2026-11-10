import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Home,
  Lock,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
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
    label: "Revive a stale listing",
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
    label: "My listings",
    icon: Home,
    query:
      "Summarize my active server-saved listings using only objective property and transaction facts.",
  },
  {
    label: "My profile",
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
  const [rated, setRated] = useState<Record<string, "up" | "down">>({});
  const logRef = useRef<HTMLDivElement>(null);
  const seenMessages = useRef<{ count: number; thinking: boolean } | null>(null);

  // Follow the conversation inside the chat panel only. scrollIntoView() also
  // scrolls the page, which used to drag the Command Center past its own
  // heading on every load, so the panel's viewport is moved directly, and only
  // once the conversation actually changes.
  useEffect(() => {
    const previous = seenMessages.current;
    seenMessages.current = { count: chat.length, thinking };
    if (
      previous === null ||
      (previous.count === chat.length && previous.thinking === thinking)
    ) return;
    const viewport = logRef.current?.closest<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [chat, thinking]);

  const rate = (id: string, content: string, value: "up" | "down") => {
    if (rated[id]) return;
    setRated((current) => ({ ...current, [id]: value }));
    recordSignal({
      kind: value === "up" ? "feedback_up" : "feedback_down",
      text: content.slice(0, value === "up" ? 80 : 120),
    });
  };

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || thinking) return;
    setInput("");
    pushChat({ role: "user", content: q });
    setThinking(true);
    let reply = "The assistant is unavailable right now. Try again in a moment.";
    try {
      const { askLiveAssistant } = await import("@/lib/assistant-api");
      const live = await askLiveAssistant({
        data: { requestId: crypto.randomUUID(), question: q },
      });
      if (live.ok) {
        const sourceNote =
          live.source === "verified-sold-records"
            ? "From your verified Closed/Sold records, listed as-is. Not ranked as comps."
            : live.source === "workspace"
              ? "AI analysis of your saved workspace records. No public web or MLS lookup."
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
          ? "Your session ended. Sign in again to use the assistant."
          : "The assistant couldn't finish that request. Your question wasn't lost. Send it again in a moment.";
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
          title="Answers use only the records saved in your workspace"
        >
          <Lock aria-hidden="true" className="h-3 w-3" />
          Your data only
        </Badge>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <ScrollArea className="min-h-0 flex-1 pr-3">
          <div
            ref={logRef}
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
                    <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-[var(--color-border)]/50 pt-1">
                      {rated[m.id] ? (
                        // Confirm the tap: before this the buttons gave no sign they had worked.
                        <p role="status" className="flex min-h-11 items-center px-1 text-xs text-[var(--color-fg-muted)]">
                          {rated[m.id] === "up"
                            ? "Thanks. Marked as helpful."
                            : "Thanks. We'll use that to improve answers."}
                        </p>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="flex min-h-11 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-success)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                            onClick={() => rate(m.id, m.content, "up")}
                          >
                            <ThumbsUp aria-hidden="true" className="h-3.5 w-3.5" />
                            Helpful
                          </button>
                          <button
                            type="button"
                            className="flex min-h-11 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                            onClick={() => rate(m.id, m.content, "down")}
                          >
                            <ThumbsDown aria-hidden="true" className="h-3.5 w-3.5" />
                            Not helpful
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="flex justify-start">
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
          </div>
        </ScrollArea>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Suggested questions">
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
              <a.icon aria-hidden="true" className="h-3 w-3" />
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
            placeholder="Ask about your listings, sold records or strategy…"
            aria-label="Ask the AI assistant"
            className="min-h-11 flex-1"
          />
          <Button
            type="submit"
            size="icon"
            disabled={thinking || !input.trim()}
            aria-label="Send question"
            className="min-h-11 min-w-11"
          >
            <Send aria-hidden="true" className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
