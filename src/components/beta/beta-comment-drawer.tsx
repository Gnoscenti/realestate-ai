import { useMemo, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  ChevronLeft,
  Loader2,
  MessageSquarePlus,
  Send,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  getOrCreateSessionId,
  resolvePageMeta,
} from "@/lib/beta-comments";
import { submitBetaComment } from "@/lib/beta-comments-api";
import {
  CLIENT_BETA_EMAIL,
  emailBetaCommentClient,
  saveLocalBetaComment,
} from "@/lib/beta-comment-client";
import { useAppStore } from "@/lib/store";
import { hasFeedbackAccess } from "@/lib/billing";
import { cn } from "@/lib/utils";

type LocalComment = {
  globalNumber: number;
  fileName: string;
  pageTitle: string;
  body: string;
  at: string;
};

/**
 * Persistent right-edge tab + drawer for free-code beta testers.
 * Multi-path delivery: local inbox → server (disk/GitHub) → email to owner.
 * Never shows a hard send error if the device can store the comment.
 */
export function BetaCommentDrawer() {
  const billing = useAppStore((s) => s.billing);
  const unlocked = hasFeedbackAccess(billing) && Boolean(billing.redeemedCode);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const page = useMemo(() => resolvePageMeta(pathname), [pathname]);

  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<
    "bug" | "ux" | "feature" | "copy" | "other"
  >("ux");
  const [busy, setBusy] = useState(false);
  const [sessionCount, setSessionCount] = useState(() => {
    if (typeof window === "undefined") return 0;
    return Number(sessionStorage.getItem("realestate-ai-beta-n") || "0");
  });
  const [history, setHistory] = useState<LocalComment[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(
        sessionStorage.getItem("realestate-ai-beta-hist") || "[]",
      ) as LocalComment[];
    } catch {
      return [];
    }
  });

  if (!unlocked) return null;

  const submit = async () => {
    const text = body.trim();
    if (text.length < 3) {
      toast.error("Write a short suggestion first");
      return;
    }
    setBusy(true);

    const sessionId = getOrCreateSessionId();
    const sessionNumber = sessionCount + 1;
    const payload = {
      pagePath: page.pagePath,
      pageTitle: page.title,
      module: page.module,
      body: text,
      category,
      sessionId,
      sessionNumber,
    };

    // 1) Always save on-device first so nothing is lost
    let rec = saveLocalBetaComment(payload);
    let emailed = false;
    let mailDraftOpened = false;
    let destinations: string[] = ["device"];

    try {
      // 2) Server: disk + GitHub + email
      const res = await submitBetaComment({ data: payload });
      if (res?.record) {
        rec = saveLocalBetaComment(payload, {
          globalNumber: res.record.globalNumber,
          fileName: res.record.fileName,
          id: res.record.id,
          createdAt: res.record.createdAt,
        });
        destinations = [
          "device",
          ...(Array.isArray(res.destinations) ? res.destinations : []),
        ];
        if (res.emailedTo) emailed = true;
      }
    } catch {
      /* server unavailable — fall through to client email */
    }

    // 3) Single client email attempt (opens mailto on fail)
    if (!emailed) {
      const mail = await emailBetaCommentClient(rec, { openMailtoOnFail: true });
      if (mail.ok) {
        if (mail.channel === "formsubmit") {
          emailed = true;
          destinations.push(`email:${CLIENT_BETA_EMAIL}`);
        } else if (mail.channel === "mailto") {
          mailDraftOpened = true;
          destinations.push("mailto");
        }
      }
    }

    setSessionCount(sessionNumber);
    sessionStorage.setItem("realestate-ai-beta-n", String(sessionNumber));
    const entry: LocalComment = {
      globalNumber: rec.globalNumber,
      fileName: rec.fileName,
      pageTitle: page.title,
      body: text,
      at: rec.createdAt,
    };
    const nextHist = [entry, ...history].slice(0, 20);
    setHistory(nextHist);
    sessionStorage.setItem(
      "realestate-ai-beta-hist",
      JSON.stringify(nextHist),
    );
    setBody("");

    const num = `#${String(rec.globalNumber).padStart(4, "0")}`;
    if (emailed) {
      toast.success(`Comment ${num} sent · emailed to ${CLIENT_BETA_EMAIL}`);
    } else if (mailDraftOpened) {
      toast.success(
        `Comment ${num} saved · mail draft opened — send it to complete delivery`,
      );
    } else {
      toast.success(
        `Comment ${num} saved on device · email to ${CLIENT_BETA_EMAIL} (FormSubmit activation may be needed — check inbox/spam)`,
      );
    }

    setBusy(false);
  };

  return (
    <>
      {/* Persistent side tab — all pages */}
      <button
        type="button"
        aria-label="Open beta suggestions"
        data-tour="beta-suggest-tab"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed right-0 top-1/2 z-[60] flex -translate-y-1/2 flex-col items-center gap-1 rounded-l-[var(--radius-md)]",
          "border border-r-0 border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-primary)_88%,#0a0c12)]",
          "px-2 py-3 text-[var(--color-primary-fg)] shadow-[var(--shadow-md)]",
          "transition hover:brightness-110 active:scale-[0.98]",
          "min-h-[88px] min-w-[40px]",
        )}
      >
        <MessageSquarePlus className="h-4 w-4" />
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          Suggest
        </span>
        {sessionCount > 0 && (
          <span className="mt-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-bold">
            {sessionCount}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-[min(100%,22rem)] sm:w-[min(100%,24rem)]"
        >
          <SheetHeader className="border-b border-[var(--color-border)] px-4 pb-3 pt-4 pr-10">
            <SheetTitle className="flex items-center gap-2 font-display text-base">
              <Sparkles className="h-4 w-4 text-[var(--color-primary)]" />
              Beta suggestion
            </SheetTitle>
            <SheetDescription className="text-xs leading-relaxed">
              Anonymous & numbered. Goes to{" "}
              <strong className="text-[var(--color-fg)]">Beta comments</strong>{" "}
              for Grok, and is emailed to{" "}
              <strong className="text-[var(--color-fg)]">{CLIENT_BETA_EMAIL}</strong>{" "}
              so nothing is lost.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 text-xs">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
                This page
              </div>
              <div className="mt-1 font-medium text-[var(--color-fg)]">
                {page.title}
              </div>
              <div className="mt-0.5 text-[var(--color-fg-muted)]">
                Module <code>{page.module}</code> · path{" "}
                <code>{page.pagePath}</code>
              </div>
            </div>

            <div>
              <Label htmlFor="beta-cat">Type</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as typeof category)}
              >
                <SelectTrigger id="beta-cat" className="mt-1.5 h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ux">UX / polish</SelectItem>
                  <SelectItem value="bug">Bug</SelectItem>
                  <SelectItem value="feature">Feature idea</SelectItem>
                  <SelectItem value="copy">Copy / wording</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="beta-body">Your suggestion</Label>
              <Textarea
                id="beta-body"
                className="mt-1.5 min-h-[140px] text-base md:text-sm"
                placeholder="What should change on this screen? Be specific — Grok reads this next."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={8000}
              />
              <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                No name is stored. Delivery: device backup → server file → email
                via FormSubmit (requires one-time activation of owner inbox) →
                mailto fallback if FormSubmit is not yet active.
              </p>
            </div>

            <Button
              className="min-h-[48px] w-full"
              disabled={busy || body.trim().length < 3}
              onClick={() => void submit()}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send suggestion
            </Button>

            {history.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
                  This session
                </div>
                {history.map((h) => (
                  <div
                    key={h.fileName + h.at}
                    className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        #{String(h.globalNumber).padStart(4, "0")}
                      </Badge>
                      <span className="truncate text-[var(--color-fg-muted)]">
                        {h.pageTitle}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[var(--color-fg)]">
                      {h.body}
                    </p>
                    <p className="mt-1 text-[10px] text-[var(--color-fg-subtle)]">
                      Beta comments/{h.fileName}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-[var(--color-border)] p-3">
            <Button
              variant="ghost"
              className="w-full min-h-[44px]"
              onClick={() => setOpen(false)}
            >
              <ChevronLeft className="h-4 w-4" />
              Close
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
