/**
 * Beta Suggest drawer — right-edge tab for beta users.
 * Saves locally first, then submits to the server (GitHub Issues + Resend).
 * No owner email is ever present here. No FormSubmit.co.
 */
"use client";

import React, { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/lib/store";
import { hasFeedbackAccess } from "@/lib/billing";
import { resolvePageMeta } from "@/lib/beta-comments";
import {
  saveLocalBetaComment,
  loadLocalBetaInbox,
} from "@/lib/beta-comment-client";
import type { BetaCommentPayload } from "@/lib/beta-comments";
import { submitBetaComment } from "@/lib/beta-comments-api";

type Category = BetaCommentPayload["category"];

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "bug", label: "Bug" },
  { value: "ux", label: "UX / Design" },
  { value: "feature", label: "Feature request" },
  { value: "copy", label: "Copy / wording" },
  { value: "other", label: "Other" },
];

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "server";
  const key = "realestate-ai-beta-session";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `s_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

function getSessionNumber(): number {
  if (typeof window === "undefined") return 1;
  const key = "realestate-ai-beta-session-n";
  const n = Number(sessionStorage.getItem(key) || "0") + 1;
  sessionStorage.setItem(key, String(n));
  return n;
}

export function BetaCommentDrawer() {
  const billing = useAppStore((s) => s.billing);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<Category>("other");
  const [submitting, setSubmitting] = useState(false);

  const unlocked =
    hasFeedbackAccess(billing) && Boolean(billing?.redeemedCode);

  const history = unlocked ? loadLocalBetaInbox() : [];

  if (!unlocked) return null;

  const { title: pageTitle, module, pagePath } = resolvePageMeta(pathname);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    const sessionId = getOrCreateSessionId();
    const sessionNumber = getSessionNumber();
    const payload: BetaCommentPayload = {
      pagePath,
      pageTitle,
      module,
      body: body.trim(),
      category,
      sessionId,
      sessionNumber,
    };
    // Save locally first — never lose data
    saveLocalBetaComment(payload);
    setBody("");
    setOpen(false);
    try {
      const res = await submitBetaComment({ data: payload });
      if (res.issue) {
        toast.success(`Comment #${res.record.globalNumber} sent · GitHub #${res.issue.number}`);
        toast(`GitHub Issue: ${res.issue.url}`, {
          action: {
            label: "View",
            onClick: () => window.open(res.issue!.url, "_blank"),
          },
        });
      } else {
        toast.success(`Comment sent · saved to ${res.destinations.join(", ") || "device"}`);
      }
    } catch {
      toast.error("Saved locally — will sync when possible.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/* Right-edge tab trigger */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open beta feedback drawer"
        className="fixed right-0 top-1/2 z-50 -translate-y-1/2 translate-x-[calc(100%-24px)] rotate-90 origin-left rounded-t-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-md transition-transform hover:translate-x-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ writingMode: "horizontal-tb" }}
      >
        Suggest
      </button>
      <SheetContent side="right" className="w-[360px] sm:w-[420px] flex flex-col gap-4 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Beta Feedback</SheetTitle>
          <SheetDescription>
            Suggestions go directly to a GitHub Issue for engineering — no
            public email involved.{" "}
            <span className="text-muted-foreground text-xs">
              Delivery: GitHub Issue + device backup.
            </span>
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="text-xs text-muted-foreground">
            Page: <span className="font-medium">{pageTitle}</span>
          </div>
          <Select
            value={category}
            onValueChange={(v) => setCategory(v as Category)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Describe the issue or idea…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            maxLength={8000}
            required
            className="resize-none"
          />
          <Button type="submit" disabled={submitting || !body.trim()}>
            {submitting ? "Sending…" : "Send suggestion"}
          </Button>
        </form>
        {history.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-semibold text-muted-foreground mb-1">
              Your recent comments ({history.length})
            </p>
            <ul className="flex flex-col gap-2">
              {history.slice(0, 10).map((r) => (
                <li
                  key={r.id}
                  className="rounded border p-2 text-xs text-muted-foreground"
                >
                  <span className="font-medium">
                    #{r.globalNumber} [{r.category}]
                  </span>{" "}
                  {r.body.slice(0, 80)}
                  {r.body.length > 80 ? "…" : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
