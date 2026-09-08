import { describe, expect, it } from "vitest";
import { buildRecognitionReport } from "@/lib/aieo/recognition-report";
import type { CiteRecognitionPublicCapture } from "@/lib/aieo/recognition-types";

const capture = (overrides: Partial<CiteRecognitionPublicCapture> = {}): CiteRecognitionPublicCapture => ({
  id: "current", scanId: "scan", subjectFingerprint: "a".repeat(64),
  panelVersion: "test-v2", queryId: "identity", prompt: "Who is Test Agent?",
  promptHash: "b".repeat(64), responseHash: "c".repeat(64),
  provider: "grok", model: "frozen-model", location: "San Diego",
  runDate: "2026-09-08", observedAt: "2026-09-08T12:00:00Z",
  status: "succeeded", responseText: "Test Agent", citations: [],
  mentioned: true, cited: false, correctIdentity: false, correctBrokerage: false,
  ...overrides,
});
describe("Recognition report", () => {
  it("separates provider failures from successful-answer denominators", () => {
    const result = buildRecognitionReport([capture(), capture({ id: "failed", queryId: "local", status: "failed" })]);
    expect(result.summaries[1]).toMatchObject({ attempted: 2, succeeded: 1, mentioned: 1 });
    expect(result.summaries[0].attempted).toBe(0);
  });
  it("compares only the same model, prompt, location, subject and panel", () => {
    const previous = capture({ id: "previous", runDate: "2026-09-07", observedAt: "2026-09-07T12:00:00Z", mentioned: false });
    const report = buildRecognitionReport([capture(), previous]);
    expect(report.summaries[1].comparisons[0].changes).toContain("Name now observed");
    for (const mismatch of [{ model: "different" }, { promptHash: "d".repeat(64) }, { location: "Los Angeles" }, { panelVersion: "other" }, { subjectFingerprint: "e".repeat(64) }]) {
      expect(buildRecognitionReport([capture(), { ...previous, ...mismatch }]).summaries[1].comparisons[0].previous).toBeUndefined();
    }
  });
  it("does not count duplicated records as additional observations", () => {
    const summary = buildRecognitionReport([capture(), capture({ id: "duplicate" })]).summaries[1];
    expect(summary.attempted).toBe(1);
  });
  it("does not compare against a failed prior request", () => {
    const report = buildRecognitionReport([capture(), capture({ id: "old", status: "failed", runDate: "2026-09-07", observedAt: "2026-09-07T12:00:00Z" })]);
    expect(report.summaries[1].comparisons[0].previous).toBeUndefined();
  });
});
