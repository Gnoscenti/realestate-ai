import { describe, expect, it } from "vitest";
import { parseLocalCalendarDate } from "@/lib/calendar-date";

describe("lease calendar dates", () => {
  it.each([null, "", "2026-13-01", "2026-00-01", "2026-02-29", "2026-04-31", "2026-01-00", "2026-1-01", "2026-09-26T00:00:00"])
    ("rejects missing, malformed, or impossible date %s", value => {
      expect(parseLocalCalendarDate(value)).toBeNull();
    });
  it.each(["2028-02-29", "2026-09-26", "2026-12-31"])("preserves a real local calendar date %s", value => {
    const date = parseLocalCalendarDate(value)!;
    expect([date.getFullYear(), date.getMonth() + 1, date.getDate()]).toEqual(value.split("-").map(Number));
    expect(() => date.toISOString()).not.toThrow();
  });
});
