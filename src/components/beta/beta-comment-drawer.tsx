import { useMemo, useState } from "react";
import { MessageSquarePlus, Send } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  getOrCreateSessionId,
  resolvePageMeta,
  type BetaCommentPayload,
} from "@/lib/beta-comments";
import {
  emailBetaCommentClient,
  loadLocalBetaInbox,
  saveLocalBetaComment,
} from "@/lib/beta-comment-client";
import { submitBetaComment } from "@/lib/beta-comments-api";

const CATEGORY_OPTIONS: {
  value: BetaCommentPayload["category"];
  label: string;
}[] = [
  { value: "feature", label: "Enhancement" },
  { value: "bug", label: "Bug" },
  { value: "ux", label: "UX" },
  { value: "copy", label: "Copy" },
  { value: "other", label: "General feedback" },
];

export function BetaCommentDrawer() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<BetaCommentPayload["category"]>("feature");
  const [submitting, setSubmitting] = useState(false);

  const meta = useMemo(() => resolvePageMeta(pathname), [pathname]);

  const onSubmit = async () => {
    const trimmed = body.trim();
    if (!trimmed) {
      toast.error("Add a suggestion before sending");
      return;
    }

    const sessionId = getOrCreateSessionId();
    const sessionNumber =
      loadLocalBetaInbox().filter((rec) => rec.sessionId === sessionId).length + 1;
    const payload: BetaCommentPayload = {
      pagePath: meta.pagePath,
      pageTitle: meta.title,
      module: meta.module,
      body: trimmed,
      category,
      sessionId,
      sessionNumber,
    };

    const localRecord = saveLocalBetaComment(payload);
    setSubmitting(true);

    try {
      const res = await submitBetaComment({ data: payload });
      if (res.issue?.number) {
        toast.success(`Suggestion saved · GitHub #${res.issue.number}`);
        if (res.issue.url) toast.message(res.issue.url);
      } else if (res.destinations.length) {
        toast.success(`Suggestion sent · ${res.destinations.join(" · ")}`);
      } else if (!res.ok) {
        const emailFallback = await emailBetaCommentClient(localRecord);
        if (emailFallback.error) toast.message(emailFallback.error);
      } else {
        toast.success("Suggestion saved locally");
      }

      setBody("");
      setCategory("feature");
      setOpen(false);
    } catch (e) {
      const emailFallback = await emailBetaCommentClient(localRecord);
      toast.success(
        emailFallback.ok
          ? `Suggestion saved locally · ${emailFallback.channel === "mailto" ? "mail draft opened" : "email sent"}`
          : "Suggestion saved locally",
      );
      if (emailFallback.error) {
        toast.message(emailFallback.error);
      } else if (e instanceof Error) {
        toast.message(e.message);
      }
      setOpen(false);
      setBody("");
      setCategory("feature");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="accent"
          className="fixed bottom-20 right-4 z-40 shadow-[var(--shadow-lg)] sm:bottom-6"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Suggest
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-[min(100%,30rem)] gap-0 p-0">
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-[var(--color-border)] px-5 py-4">
            <SheetTitle>Beta Suggest drawer</SheetTitle>
            <SheetDescription>
              Anonymous notes save locally, write a numbered beta comment, and can auto-create
              GitHub Issues for engineering follow-up.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">
              <div className="font-medium text-[var(--color-fg)]">{meta.title}</div>
              <div className="mt-1 text-[var(--color-fg-muted)]">
                {meta.pagePath} · module:{meta.module}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="beta-category">Category</Label>
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as BetaCommentPayload["category"])}
              >
                <SelectTrigger id="beta-category">
                  <SelectValue placeholder="Choose category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="beta-body">Suggestion</Label>
              <Textarea
                id="beta-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="What should we fix, improve, or clarify on this page?"
                className="min-h-[180px]"
                maxLength={8_000}
              />
              <p className="text-xs text-[var(--color-fg-muted)]">
                We keep an anonymous local backup and, when configured, also send this through
                GitHub Issues, the repo beta-comments file, and email.
              </p>
            </div>
          </div>

          <div className="border-t border-[var(--color-border)] px-5 py-4">
            <Button onClick={onSubmit} disabled={submitting || !body.trim()} className="w-full">
              <Send className="h-4 w-4" />
              {submitting ? "Sending…" : "Send suggestion"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
