export type FeedbackTriggerEdge = "left" | "right";

export type FeedbackTriggerPosition = {
  edge: FeedbackTriggerEdge;
  yRatio: number;
};

export const FEEDBACK_TRIGGER_POSITION_KEY = "realestate-ai-beta-trigger-position-v1";

const MIN_Y_RATIO = 0.12;
const MAX_Y_RATIO = 0.84;

/**
 * Bottom corner, clear of the phone tab bar. Halfway up the edge the button sat
 * on top of page content at first paint, including the "Skip for now" control
 * on a new workspace. Testers who already placed it keep their saved position.
 */
export const DEFAULT_FEEDBACK_TRIGGER_POSITION: FeedbackTriggerPosition = {
  edge: "right",
  yRatio: MAX_Y_RATIO,
};

/** Half the trigger's 44px height: it is positioned by its centre line. */
export const FEEDBACK_TRIGGER_HALF_HEIGHT = 22;
/** Space kept between the trigger and the tab bar or the edge of the screen. */
export const FEEDBACK_TRIGGER_GAP = 8;

/**
 * Centre line of the trigger, in pixels from the top of the viewport.
 *
 * A share of the viewport height is not enough on its own: on a phone held
 * sideways 84% of the height is inside the tab bar. `bottomLimit` is the top
 * edge of whatever is fixed to the bottom of the screen (the tab bar), or null
 * when nothing is. The page reserves matching space under its last element;
 * see `.main-content` in styles.css.
 */
export function feedbackTriggerTop(input: {
  position: FeedbackTriggerPosition;
  viewportHeight: number;
  bottomLimit?: number | null;
}): number {
  const height = Math.max(1, input.viewportHeight);
  const floor = Math.min(height, input.bottomLimit ?? height);
  const reach = FEEDBACK_TRIGGER_HALF_HEIGHT + FEEDBACK_TRIGGER_GAP;
  const wanted = Math.round(height * clampFeedbackTriggerRatio(input.position.yRatio));
  // Never below the floor; and never off the top, even on a very short screen.
  return Math.max(reach, Math.min(wanted, Math.round(floor - reach)));
}

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
