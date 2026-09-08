import { describe, expect, it } from "vitest";
import { answerFaq } from "../../src/lib/faq-assistants";

describe("FAQ query matching", () => {
  it.each(["", "   ", "\n\t", "??", "a"])(
    "keeps an empty or non-substantive query on the fallback: %j",
    (query) => expect(answerFaq(query).matched).toBeNull(),
  );
  it("recognizes the intended question with surrounding whitespace", () => {
    const result = answerFaq("  Do I need a pre-approval before touring?  ");
    expect(result.matched?.question).toContain("pre-approval");
    expect(result.disclaimer).toBeTruthy();
  });
});
