/**
 * Global beta Suggest control. The trigger can be placed on either screen edge
 * and persists only that browser's UI preference. Submission always saves a
 * device-local backup before the authenticated review-only server intake.
 */
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical, SlidersHorizontal } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
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
import { resolvePageMeta, type BetaCommentPayload } from "@/lib/beta-comments";
import { hasFeedbackAccess } from "@/lib/billing";
import {
  loadLocalBetaInbox,
  reconcileLocalBetaComment,
  saveLocalBetaComment,
} from "@/lib/beta-comment-client";
import {
  DEFAULT_FEEDBACK_TRIGGER_POSITION,
  FEEDBACK_TRIGGER_POSITION_KEY,
  clampFeedbackTriggerRatio,
  feedbackTriggerPositionFromPointer,
  parseFeedbackTriggerPosition,
  type FeedbackTriggerPosition,
} from "@/lib/beta-feedback-trigger-position";
import { submitBetaComment } from "@/lib/beta-comments-api";

type Category = BetaCommentPayload["category"];

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
};

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
  const number = Number(sessionStorage.getItem(key) || "0") + 1;
  sessionStorage.setItem(key, String(number));
  return number;
}

function persistPosition(position: FeedbackTriggerPosition): void {
  try {
    localStorage.setItem(FEEDBACK_TRIGGER_POSITION_KEY, JSON.stringify(position));
  } catch {
    // Placement is a convenience only; the feedback form remains available.
  }
}

export function BetaCommentDrawer() {
  const billing = useAppStore((state) => state.billing);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<Category>("other");
  const [submitting, setSubmitting] = useState(false);
  const [triggerPosition, setTriggerPosition] = useState<FeedbackTriggerPosition>(
    DEFAULT_FEEDBACK_TRIGGER_POSITION,
  );
  const [viewportHeight, setViewportHeight] = useState(0);
  const [positionMenuOpen, setPositionMenuOpen] = useState(false);
  const drag = useRef<DragState | null>(null);
  const suppressTriggerClick = useRef(false);

  const unlocked = hasFeedbackAccess(billing);
  const history = unlocked ? loadLocalBetaInbox() : [];

  useEffect(() => {
    const applyViewport = () => setViewportHeight(window.innerHeight);
    try {
      setTriggerPosition(
        parseFeedbackTriggerPosition(localStorage.getItem(FEEDBACK_TRIGGER_POSITION_KEY)),
      );
    } catch {
      setTriggerPosition(DEFAULT_FEEDBACK_TRIGGER_POSITION);
    }
    applyViewport();
    window.addEventListener("resize", applyViewport);
    return () => window.removeEventListener("resize", applyViewport);
  }, []);

  const updatePosition = useCallback((next: FeedbackTriggerPosition, persist = true) => {
    const normalized = {
      edge: next.edge,
      yRatio: clampFeedbackTriggerRatio(next.yRatio),
    } satisfies FeedbackTriggerPosition;
    setTriggerPosition(normalized);
    if (persist) persistPosition(normalized);
  }, []);

  if (!unlocked) return null;

  const { title: pageTitle, module, pagePath } = resolvePageMeta(pathname);
  const triggerTop = Math.round(Math.max(1, viewportHeight || 800) * triggerPosition.yRatio);
  const positionStyle = {
    top: `${triggerTop}px`,
    transform: "translateY(-50%)",
    ...(triggerPosition.edge === "left"
      ? { left: "max(0.75rem, env(safe-area-inset-left))" }
      : { right: "max(0.75rem, env(safe-area-inset-right))" }),
  };

  function startDrag(event: React.PointerEvent<HTMLSpanElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  }

  function moveDrag(event: React.PointerEvent<HTMLSpanElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - current.startX, event.clientY - current.startY) >= 6;
    if (!moved && !current.moved) return;
    current.moved = true;
    event.preventDefault();
    updatePosition(
      feedbackTriggerPositionFromPointer({
        clientX: event.clientX,
        clientY: event.clientY,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }),
      false,
    );
  }

  function endDrag(event: React.PointerEvent<HTMLSpanElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drag.current = null;
    if (!current.moved) return;
    suppressTriggerClick.current = true;
    updatePosition(
      feedbackTriggerPositionFromPointer({
        clientX: event.clientX,
        clientY: event.clientY,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }),
    );
  }

  function cancelDrag(event: React.PointerEvent<HTMLSpanElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drag.current = null;
    if (current.moved) {
      suppressTriggerClick.current = true;
      persistPosition(triggerPosition);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    const payload: BetaCommentPayload = {
      pagePath,
      pageTitle,
      module,
      body: body.trim(),
      category,
      sessionId: getOrCreateSessionId(),
      sessionNumber: getSessionNumber(),
    };
    const localRecord = saveLocalBetaComment(payload);
    setBody("");
    setOpen(false);
    try {
      const response = await submitBetaComment({ data: payload });
      if (!response.ok) {
        toast.warning(
          response.reason === "rate_limited"
            ? "Too many suggestions just now — saved on this device. Try again in a few minutes."
            : "Your workspace access could not be verified — saved on this device only.",
        );
        return;
      }
      reconcileLocalBetaComment(localRecord.id, {
        ...response.record,
        globalNumber: localRecord.globalNumber,
        fileName: localRecord.fileName,
      });
      if (response.issue) {
        toast.success(
          `Suggestion logged for engineering review in GitHub #${response.issue.number}`,
        );
        toast("A maintainer can approve it for a draft PR.", {
          action: {
            label: "View",
            onClick: () => window.open(response.issue!.url, "_blank", "noopener,noreferrer"),
          },
        });
      } else {
        toast.warning(
          "Saved on this device. Engineering intake delivery is unavailable right now.",
        );
      }
    } catch (error) {
      const unauthorized = error instanceof Error && error.message === "Unauthorized";
      toast.warning(
        unauthorized
          ? "Saved on this device. Sign in to send it for engineering review."
          : "Saved on this device only — try sending again later.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <div
        className="fixed z-50 flex items-center gap-1"
        style={positionStyle}
        data-testid="beta-feedback-trigger"
      >
        <button
          type="button"
          aria-label="Open beta feedback drawer"
          onClick={() => {
            if (suppressTriggerClick.current) {
              suppressTriggerClick.current = false;
              return;
            }
            setOpen(true);
          }}
          className="flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span
            aria-hidden="true"
            className="-ml-1 flex h-7 w-5 touch-none items-center justify-center rounded-sm opacity-80 hover:bg-primary-foreground/15"
            title="Drag to place the feedback button"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={cancelDrag}
          >
            <GripVertical className="h-4 w-4" />
          </span>
          Suggest
        </button>
        <button
          type="button"
          aria-label="Position feedback button"
          aria-expanded={positionMenuOpen}
          onClick={() => setPositionMenuOpen((value) => !value)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
        {positionMenuOpen ? (
          <div
            role="dialog"
            aria-label="Position feedback button"
            className={`absolute z-10 w-44 overflow-y-auto rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg ${
              triggerPosition.yRatio > 0.5 ? "bottom-12" : "top-12"
            } ${triggerPosition.edge === "left" ? "left-0" : "right-0"}`}
            style={{
              maxHeight: Math.max(
                0,
                (triggerPosition.yRatio > 0.5
                  ? triggerTop
                  : (viewportHeight || 800) - triggerTop) - 40,
              ),
            }}
          >
            <p className="px-2 pb-1 text-xs text-muted-foreground">Place feedback</p>
            <div className="grid grid-cols-2 gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  updatePosition({ ...triggerPosition, yRatio: triggerPosition.yRatio - 0.1 })
                }
              >
                Move up
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  updatePosition({ ...triggerPosition, yRatio: triggerPosition.yRatio + 0.1 })
                }
              >
                Move down
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => updatePosition({ ...triggerPosition, edge: "left" })}
              >
                Left edge
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => updatePosition({ ...triggerPosition, edge: "right" })}
              >
                Right edge
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-1 w-full"
              onClick={() => {
                updatePosition(DEFAULT_FEEDBACK_TRIGGER_POSITION);
                setPositionMenuOpen(false);
              }}
            >
              Reset position
            </Button>
          </div>
        ) : null}
      </div>
      <SheetContent
        side={triggerPosition.edge}
        className="flex w-[360px] flex-col gap-4 overflow-y-auto sm:w-[420px]"
      >
        <SheetHeader>
          <SheetTitle>Beta Feedback</SheetTitle>
          <SheetDescription>
            Suggestions are saved on this device, then sent to a private GitHub engineering intake
            when configured. A maintainer reviews the issue before approving a coding agent to
            create a draft PR. Do not include client, transaction, or credential details.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="text-xs text-muted-foreground">
            Page: <span className="font-medium">{pageTitle}</span>
          </div>
          <Select value={category} onValueChange={(value) => setCategory(value as Category)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Describe the issue or idea…"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={6}
            maxLength={8000}
            required
            className="resize-none"
          />
          <Button type="submit" disabled={submitting || !body.trim()}>
            {submitting ? "Sending…" : "Send suggestion"}
          </Button>
        </form>
        {history.length > 0 ? (
          <div className="mt-2">
            <p className="mb-1 text-xs font-semibold text-muted-foreground">
              Your recent comments ({history.length})
            </p>
            <ul className="flex flex-col gap-2">
              {history.slice(0, 10).map((record) => (
                <li key={record.id} className="rounded border p-2 text-xs text-muted-foreground">
                  <span className="font-medium">
                    #{record.globalNumber} [{record.category}]
                  </span>{" "}
                  {record.body.slice(0, 80)}
                  {record.body.length > 80 ? "…" : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
