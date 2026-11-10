import { describe, expect, it } from "vitest";
import {
  DEFAULT_FEEDBACK_TRIGGER_POSITION,
  FEEDBACK_TRIGGER_GAP,
  FEEDBACK_TRIGGER_HALF_HEIGHT,
  FEEDBACK_TRIGGER_POSITION_KEY,
  feedbackTriggerPositionFromPointer,
  feedbackTriggerTop,
  parseFeedbackTriggerPosition,
} from "@/lib/beta-feedback-trigger-position";

describe("beta feedback trigger position", () => {
  it("uses a stable device-local storage key and safe default", () => {
    expect(FEEDBACK_TRIGGER_POSITION_KEY).toBe("realestate-ai-beta-trigger-position-v1");
    expect(parseFeedbackTriggerPosition(null)).toEqual(DEFAULT_FEEDBACK_TRIGGER_POSITION);
    expect(parseFeedbackTriggerPosition("not json")).toEqual(DEFAULT_FEEDBACK_TRIGGER_POSITION);
  });

  it("defaults to the lowest allowed spot on the right edge, clear of page content", () => {
    // The lowest position a saved placement can be clamped to is also the default.
    expect(DEFAULT_FEEDBACK_TRIGGER_POSITION).toEqual(
      parseFeedbackTriggerPosition('{"edge":"right","yRatio":10}'),
    );
    expect(DEFAULT_FEEDBACK_TRIGGER_POSITION.yRatio).toBeGreaterThan(0.75);
  });

  it("rejects malformed placements and clamps persisted vertical placement", () => {
    expect(parseFeedbackTriggerPosition('{"edge":"top","yRatio":0.5}')).toEqual(
      DEFAULT_FEEDBACK_TRIGGER_POSITION,
    );
    expect(parseFeedbackTriggerPosition('{"edge":"left","yRatio":10}')).toEqual({
      edge: "left",
      yRatio: 0.84,
    });
    expect(parseFeedbackTriggerPosition('{"edge":"right","yRatio":-1}')).toEqual({
      edge: "right",
      yRatio: 0.12,
    });
  });

  it("snaps a drag to the closest side and keeps its ratio viewport-relative", () => {
    expect(
      feedbackTriggerPositionFromPointer({
        clientX: 20,
        clientY: 600,
        viewportWidth: 400,
        viewportHeight: 800,
      }),
    ).toEqual({ edge: "left", yRatio: 0.75 });
    expect(
      feedbackTriggerPositionFromPointer({
        clientX: 380,
        clientY: 790,
        viewportWidth: 400,
        viewportHeight: 800,
      }),
    ).toEqual({ edge: "right", yRatio: 0.84 });
  });
});

describe("where the trigger is drawn", () => {
  const bottomEdge = (top: number) => top + FEEDBACK_TRIGGER_HALF_HEIGHT;

  it("uses the saved share of the height when nothing is fixed to the bottom", () => {
    expect(
      feedbackTriggerTop({ position: { edge: "left", yRatio: 0.5 }, viewportHeight: 800 }),
    ).toBe(400);
    expect(
      feedbackTriggerTop({ position: DEFAULT_FEEDBACK_TRIGGER_POSITION, viewportHeight: 900 }),
    ).toBe(756);
  });

  it("leaves a tall phone alone when the default already clears the tab bar", () => {
    const top = feedbackTriggerTop({
      position: DEFAULT_FEEDBACK_TRIGGER_POSITION,
      viewportHeight: 844,
      bottomLimit: 785,
    });
    expect(top).toBe(709);
    expect(bottomEdge(top)).toBeLessThanOrEqual(785 - FEEDBACK_TRIGGER_GAP);
  });

  it("stays above the tab bar on a phone held sideways", () => {
    // 84% of 375px is 315px: a 44px button centred there ends at 337px, inside
    // a tab bar whose top edge is at 316px.
    const top = feedbackTriggerTop({
      position: DEFAULT_FEEDBACK_TRIGGER_POSITION,
      viewportHeight: 375,
      bottomLimit: 316,
    });
    expect(bottomEdge(top)).toBeLessThanOrEqual(316 - FEEDBACK_TRIGGER_GAP);
    expect(top).toBe(286);
  });

  it("holds a position saved before the tab bar was taken into account above it too", () => {
    const top = feedbackTriggerTop({
      position: { edge: "left", yRatio: 0.84 },
      viewportHeight: 320,
      bottomLimit: 261,
    });
    expect(bottomEdge(top)).toBeLessThanOrEqual(261 - FEEDBACK_TRIGGER_GAP);
  });

  it("stays on screen when the viewport is shorter than the trigger needs", () => {
    const top = feedbackTriggerTop({
      position: DEFAULT_FEEDBACK_TRIGGER_POSITION,
      viewportHeight: 60,
      bottomLimit: 20,
    });
    expect(top - FEEDBACK_TRIGGER_HALF_HEIGHT).toBeGreaterThanOrEqual(0);
  });

  it("ignores a bottom limit that is not on screen", () => {
    expect(
      feedbackTriggerTop({
        position: DEFAULT_FEEDBACK_TRIGGER_POSITION,
        viewportHeight: 900,
        bottomLimit: null,
      }),
    ).toBe(756);
  });
});
