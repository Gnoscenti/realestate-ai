import { describe, expect, it } from "vitest";
import {
  DEFAULT_FEEDBACK_TRIGGER_POSITION,
  FEEDBACK_TRIGGER_POSITION_KEY,
  feedbackTriggerPositionFromPointer,
  parseFeedbackTriggerPosition,
} from "@/lib/beta-feedback-trigger-position";

describe("beta feedback trigger position", () => {
  it("uses a stable device-local storage key and safe default", () => {
    expect(FEEDBACK_TRIGGER_POSITION_KEY).toBe("realestate-ai-beta-trigger-position-v1");
    expect(parseFeedbackTriggerPosition(null)).toEqual(DEFAULT_FEEDBACK_TRIGGER_POSITION);
    expect(parseFeedbackTriggerPosition("not json")).toEqual(DEFAULT_FEEDBACK_TRIGGER_POSITION);
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
