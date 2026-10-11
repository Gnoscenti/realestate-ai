import { describe, expect, it } from "vitest";
import { runSocialContentAgent, getAgentPipeline } from "@/lib/social-agent";

describe("campaign factual boundaries", () => {
  const input = {
    goal: "open_house" as const,
    platforms: ["instagram" as const],
    voice: "Professional",
  };
  it("requires an explicitly supplied open-house schedule", () => {
    expect(() => runSocialContentAgent(input)).toThrow("confirmed open-house");
    expect(() => runSocialContentAgent({ ...input, openHouseWhen: "   " })).toThrow(
      "confirmed open-house",
    );
    const plan = runSocialContentAgent({
      ...input,
      openHouseWhen: "12 September 2026, 11am–2pm Pacific",
    });
    expect(
      plan.posts.some((post) => post.hook.includes("12 September 2026, 11am–2pm Pacific")),
    ).toBe(true);
    expect(JSON.stringify(plan)).not.toContain("Sat 1–4 PM");
    expect(plan.calendarNote).toContain("No posts are scheduled or published");
  });
  it("leaves compliance as an explicit human review requirement", () => {
    const review = getAgentPipeline("open_house").find((step) => step.id === "qa");
    expect(review?.status).toBe("pending");
    expect(review?.detail).toContain("not an automated compliance approval");
  });
});
