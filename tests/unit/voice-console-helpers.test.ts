import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FORWARDING_GUIDES,
  formatVoicePhone,
  isVoiceChecklistComplete,
  safeRecordingUrl,
} from "../../src/lib/voice/console";

const blankChecklist = {
  carrier: "other" as const,
  devicePlatform: "other" as const,
  conditionalForwardingConfigured: false,
  disclosureVerified: false,
  declinedConsentVerified: false,
  testCallCompleted: false,
  callLogVerified: false,
  rollbackUnderstood: false,
  brokerApprovalConfirmed: false,
};

describe("voice console policy helpers", () => {
  it("does not treat a partial field checklist as ready", () => {
    expect(isVoiceChecklistComplete(blankChecklist)).toBe(false);
    expect(
      isVoiceChecklistComplete({
        ...blankChecklist,
        conditionalForwardingConfigured: true,
        disclosureVerified: true,
        declinedConsentVerified: true,
        testCallCompleted: true,
        callLogVerified: true,
        rollbackUnderstood: true,
        brokerApprovalConfirmed: true,
      }),
    ).toBe(true);
  });

  it("provides cautious, account-specific forwarding guidance", () => {
    const allCopy = Object.values(FORWARDING_GUIDES)
      .flatMap((guide) => [...guide.steps, guide.caution])
      .join(" ");
    expect(allCopy).toContain("conditional forwarding");
    expect(allCopy).toContain("does not provide an unverified universal code");
    expect(allCopy).not.toMatch(/\*\d{2,}/);
  });

  it("formats US numbers and rejects unsafe recording schemes", () => {
    expect(formatVoicePhone("+15035550199")).toBe("(503) 555-0199");
    expect(safeRecordingUrl("https://media.example/call.mp3?sig=1")).toContain(
      "https://media.example/",
    );
    expect(safeRecordingUrl("http://media.example/call.mp3")).toBeNull();
    expect(safeRecordingUrl("javascript:alert(1)")).toBeNull();
  });

  it("keeps consent, expiring recordings, and push limitations explicit", () => {
    const source = readFileSync(
      new URL("../../src/components/voice/voice-console.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('call.consentState === "accepted"');
    expect(source).toContain("expire in roughly 10");
    expect(source).toContain("No push alert is claimed");
    expect(source).toContain("never calls out, sends SMS, transfers calls");
    expect(source).not.toContain('href={`tel:');
  });

  it("uses field-sized controls for the primary voice workflow", () => {
    const source = readFileSync(
      new URL("../../src/components/voice/voice-console.tsx", import.meta.url),
      "utf8",
    );
    expect(source.match(/min-h-\[44px\]/g)?.length ?? 0).toBeGreaterThan(10);
    expect(source).toContain('role="status"');
    expect(source).toContain('role="alert"');
  });
});
