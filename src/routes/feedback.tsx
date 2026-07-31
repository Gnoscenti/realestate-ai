import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronUp,
  Lock,
  MessageSquarePlus,
  MessagesSquare,
  Send,
  ThumbsUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FEEDBACK_SECTIONS,
  sectionLabel,
  type FeedbackPriority,
  type FeedbackSectionId,
} from "@/lib/feedback";
import { hasFeedbackAccess } from "@/lib/billing";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/feedback")({
  component: FeedbackPage,
});

const PRIORITIES: FeedbackPriority[] = [
  "blocker",
  "high",
  "medium",
  "nice",
];

function FeedbackPage() {
  const billing = useAppStore((s) => s.billing);
  const feedback = useAppStore((s) => s.feedback);
  const profile = useAppStore((s) => s.agentProfile);
  const addFeedback = useAppStore((s) => s.addFeedback);
  const voteFeedback = useAppStore((s) => s.voteFeedback);
  const addFeedbackComment = useAppStore((s) => s.addFeedbackComment);

  const unlocked = hasFeedbackAccess(billing);
  const [section, setSection] = useState<FeedbackSectionId>("command");
  const [filter, setFilter] = useState<FeedbackSectionId | "all">("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<FeedbackPriority>("medium");
  const [openId, setOpenId] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  const items = useMemo(() => {
    const list =
      filter === "all"
        ? feedback
        : feedback.filter((f) => f.section === filter);
    return [...list].sort((a, b) => b.votes - a.votes);
  }, [feedback, filter]);

  if (!unlocked) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <Lock className="mx-auto h-8 w-8 text-[var(--color-fg-subtle)]" />
        <h1 className="mt-4 font-display text-xl font-semibold">
          Feedback board locked
        </h1>
        <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
          Redeem one of the 5 free beta codes or start the $9.99 intro to unlock
          feedback and comments before full launch.
        </p>
        <Button asChild className="mt-6">
          <Link to="/">Get access</Link>
        </Button>
      </div>
    );
  }

  const submit = () => {
    if (!title.trim() || !body.trim()) {
      toast.error("Title and details are required");
      return;
    }
    const item = addFeedback({
      section,
      title,
      body,
      priority,
      author: profile?.name,
    });
    setTitle("");
    setBody("");
    setOpenId(item.id);
    toast.success("Thanks — logged for pre-launch optimization");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-[var(--color-accent)]">
          <MessagesSquare className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            Pre-launch
          </span>
        </div>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
          Feedback & comments
        </h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Help us prioritize sections before public launch. Your notes map to
          Command, CMA, Content, Calendar, RSF Knowledge, and more.
          {billing.redeemedCode ? (
            <span className="ml-1 text-[var(--color-primary)]">
              Code {billing.redeemedCode} active.
            </span>
          ) : null}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquarePlus className="h-4 w-4 text-[var(--color-primary)]" />
            New note
          </CardTitle>
          <CardDescription>
            Be specific — which screen, what broke, what would save you time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Section</Label>
              <Select
                value={section}
                onValueChange={(v) => setSection(v as FeedbackSectionId)}
              >
                <SelectTrigger className="mt-1.5 h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEEDBACK_SECTIONS.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as FeedbackPriority)}
              >
                <SelectTrigger className="mt-1.5 h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="fb-title">Title</Label>
            <Input
              id="fb-title"
              className="mt-1.5 h-11"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short summary"
            />
          </div>
          <div>
            <Label htmlFor="fb-body">Details</Label>
            <Textarea
              id="fb-body"
              className="mt-1.5 min-h-[100px]"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What happened / what you need…"
            />
          </div>
          <Button className="min-h-[44px]" onClick={submit}>
            <Send className="h-4 w-4" />
            Submit feedback
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label="All"
        />
        {FEEDBACK_SECTIONS.map((s) => (
          <FilterChip
            key={s.id}
            active={filter === s.id}
            onClick={() => setFilter(s.id)}
            label={s.label}
          />
        ))}
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const open = openId === item.id;
          return (
            <div key={item.id} className="surface-card overflow-hidden">
              <button
                type="button"
                className="flex w-full items-start gap-3 p-4 text-left"
                onClick={() => setOpenId(open ? null : item.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {sectionLabel(item.section)}
                    </Badge>
                    <Badge
                      variant={
                        item.priority === "blocker" ||
                        item.priority === "high"
                          ? "danger"
                          : "outline"
                      }
                    >
                      {item.priority}
                    </Badge>
                    <span className="text-[11px] text-[var(--color-fg-subtle)]">
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-1.5 font-medium text-[var(--color-fg)]">
                    {item.title}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--color-fg-muted)]">
                    {item.body}
                  </p>
                  <div className="mt-2 text-[11px] text-[var(--color-fg-subtle)]">
                    {item.author} · {item.comments.length} comments ·{" "}
                    {item.votes} votes
                  </div>
                </div>
                {open ? (
                  <ChevronUp className="h-4 w-4 shrink-0 text-[var(--color-fg-subtle)]" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-[var(--color-fg-subtle)]" />
                )}
              </button>
              {open && (
                <div className="border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-3">
                  <p className="text-sm text-[var(--color-fg-muted)]">
                    {item.body}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="min-h-[40px]"
                      onClick={() => {
                        voteFeedback(item.id);
                        toast.message("Vote counted");
                      }}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                      Upvote ({item.votes})
                    </Button>
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
                      Comments
                    </div>
                    {item.comments.length === 0 && (
                      <p className="text-xs text-[var(--color-fg-subtle)]">
                        No comments yet — add the first.
                      </p>
                    )}
                    {item.comments.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
                      >
                        <div className="text-[11px] font-medium text-[var(--color-fg)]">
                          {c.author}
                        </div>
                        <p className="mt-0.5 text-sm text-[var(--color-fg-muted)]">
                          {c.body}
                        </p>
                      </div>
                    ))}
                    <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                      <Input
                        value={openId === item.id ? comment : ""}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Add a comment…"
                        className="h-11 flex-1"
                      />
                      <Button
                        className="min-h-[44px]"
                        disabled={!comment.trim()}
                        onClick={() => {
                          addFeedbackComment(
                            item.id,
                            comment,
                            profile?.name,
                          );
                          setComment("");
                          toast.success("Comment added");
                        }}
                      >
                        Comment
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-[36px] rounded-full px-3 text-xs font-medium transition-colors",
        active
          ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)]"
          : "bg-[var(--color-surface-2)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
      )}
    >
      {label}
    </button>
  );
}
