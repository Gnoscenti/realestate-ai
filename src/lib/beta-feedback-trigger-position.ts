export type FeedbackTriggerEdge = "left" | "right";

export type FeedbackTriggerPosition = {
  edge: FeedbackTriggerEdge;
  yRatio: number;
};

export const FEEDBACK_TRIGGER_POSITION_KEY = "realestate-ai-beta-trigger-position-v1";

export const DEFAULT_FEEDBACK_TRIGGER_POSITION: FeedbackTriggerPosition = {
  edge: "right",
  yRatio: 0.5,
};

const MIN_Y_RATIO = 0.12;
const MAX_Y_RATIO = 0.84;

export function clampFeedbackTriggerRatio(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FEEDBACK_TRIGGER_POSITION.yRatio;
  return Math.min(MAX_Y_RATIO, Math.max(MIN_Y_RATIO, value));
}

export function normalizeFeedbackTriggerPosition(value: unknown): FeedbackTriggerPosition {
  if (!value || typeof value !== "object") {
    return DEFAULT_FEEDBACK_TRIGGER_POSITION;
  }
  const candidate = value as Partial<FeedbackTriggerPosition>;
  if (candidate.edge !== "left" && candidate.edge !== "right") {
    return DEFAULT_FEEDBACK_TRIGGER_POSITION;
  }
  return {
    edge: candidate.edge,
    yRatio: clampFeedbackTriggerRatio(Number(candidate.yRatio)),
  };
}

export function parseFeedbackTriggerPosition(value: string | null): FeedbackTriggerPosition {
  if (!value) return DEFAULT_FEEDBACK_TRIGGER_POSITION;
  try {
    return normalizeFeedbackTriggerPosition(JSON.parse(value));
  } catch {
    return DEFAULT_FEEDBACK_TRIGGER_POSITION;
  }
}

export function feedbackTriggerPositionFromPointer(input: {
  clientX: number;
  clientY: number;
  viewportWidth: number;
  viewportHeight: number;
}): FeedbackTriggerPosition {
  const { clientX, clientY, viewportWidth, viewportHeight } = input;
  const edge: FeedbackTriggerEdge = clientX < Math.max(1, viewportWidth) / 2 ? "left" : "right";
  return {
    edge,
    yRatio: clampFeedbackTriggerRatio(clientY / Math.max(1, viewportHeight)),
  };
}
