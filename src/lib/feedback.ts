/**
 * Pre-launch feedback board — sections map to product areas under optimization.
 */

import { uid } from "@/lib/utils";

export type FeedbackSectionId =
  | "command"
  | "outreach"
  | "cma"
  | "marketing"
  | "calendar"
  | "knowledge"
  | "onboarding"
  | "billing"
  | "mobile"
  | "other";

export type FeedbackPriority = "blocker" | "high" | "medium" | "nice";
export type FeedbackStatus = "open" | "planned" | "shipped" | "wontfix";

export type FeedbackComment = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
};

export type FeedbackItem = {
  id: string;
  section: FeedbackSectionId;
  title: string;
  body: string;
  author: string;
  priority: FeedbackPriority;
  status: FeedbackStatus;
  votes: number;
  createdAt: string;
  comments: FeedbackComment[];
};

export const FEEDBACK_SECTIONS: {
  id: FeedbackSectionId;
  label: string;
  hint: string;
}[] = [
  {
    id: "command",
    label: "Command Center",
    hint: "Priorities, action packs, daily ranking",
  },
  {
    id: "outreach",
    label: "Instant Response",
    hint: "Speed-to-lead scripts & compliance",
  },
  {
    id: "cma",
    label: "CMA Studio",
    hint: "Comparison data, source clarity, presentation polish",
  },
  {
    id: "marketing",
    label: "Content Agent",
    hint: "Social campaigns, brand voice, posts",
  },
  {
    id: "calendar",
    label: "Calendar & Vendors",
    hint: "Imports, AI reminders, contractors",
  },
  {
    id: "knowledge",
    label: "RSF Knowledge",
    hint: "Covenants, HOAs, neighborhood talk tracks",
  },
  {
    id: "onboarding",
    label: "Onboarding / MLS",
    hint: "Profile, area, website, MLS pull",
  },
  {
    id: "billing",
    label: "Billing & access",
    hint: "Checkout, codes, trial clarity",
  },
  {
    id: "mobile",
    label: "Mobile / iOS",
    hint: "Tabs, safe areas, touch targets",
  },
  {
    id: "other",
    label: "Other",
    hint: "Anything else before full launch",
  },
];

export function sectionLabel(id: FeedbackSectionId): string {
  return FEEDBACK_SECTIONS.find((s) => s.id === id)?.label ?? id;
}

export function createFeedbackItem(input: {
  section: FeedbackSectionId;
  title: string;
  body: string;
  author: string;
  priority?: FeedbackPriority;
}): FeedbackItem {
  return {
    id: uid("fb"),
    section: input.section,
    title: input.title.trim(),
    body: input.body.trim(),
    author: input.author.trim() || "Agent",
    priority: input.priority ?? "medium",
    status: "open",
    votes: 1,
    createdAt: new Date().toISOString(),
    comments: [],
  };
}

export function createComment(input: {
  author: string;
  body: string;
}): FeedbackComment {
  return {
    id: uid("fbc"),
    author: input.author.trim() || "Agent",
    body: input.body.trim(),
    createdAt: new Date().toISOString(),
  };
}

/** Seed prompts so the board isn’t empty for first beta testers */
export const SEED_FEEDBACK: FeedbackItem[] = [
  {
    id: "fb-seed-1",
    section: "command",
    title: "Make calendar prep cards jump higher before showings",
    body: "When I have a showing in <2h, the prep pack should outrank content gaps.",
    author: "Product",
    priority: "high",
    status: "planned",
    votes: 4,
    createdAt: "2026-07-28T16:00:00.000Z",
    comments: [
      {
        id: "fbc-1",
        author: "Product",
        body: "Tracking — calendar_prep kind already injects; will tune rank weights.",
        createdAt: "2026-07-28T17:00:00.000Z",
      },
    ],
  },
  {
    id: "fb-seed-2",
    section: "marketing",
    title: "IG carousel copy feels long for Covenant listings",
    body: "Need a ‘short luxury’ toggle that cuts hashtags and keeps estate tone.",
    author: "Product",
    priority: "medium",
    status: "open",
    votes: 2,
    createdAt: "2026-07-29T12:00:00.000Z",
    comments: [],
  },
  {
    id: "fb-seed-3",
    section: "mobile",
    title: "Bottom tabs great — add CMA as long-press shortcut?",
    body: "I open CMA daily; five tabs is tight. Long-press Home → CMA would help.",
    author: "Product",
    priority: "nice",
    status: "open",
    votes: 1,
    createdAt: "2026-07-30T09:00:00.000Z",
    comments: [],
  },
];
