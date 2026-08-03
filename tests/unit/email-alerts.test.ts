import { describe, expect, it } from "vitest";
import {
  buildDemoInboxScan,
  classifyEmail,
  messagesToAlerts,
  unreadCount,
} from "@/lib/email-alerts";
import type { Lead } from "@/data/seed";

const lead = {
  id: "l1",
  name: "Alex Buyer",
  email: "alex@example.com",
  phone: "1",
  status: "new",
  heat: "hot",
  score: 90,
  location: "RSF",
  budgetMin: 1,
  budgetMax: 2,
  preferences: "",
  propertyType: "House",
  lastContact: new Date().toISOString(),
  tags: [],
  notes: "",
  source: "Web",
  createdAt: new Date().toISOString(),
} as Lead;

describe("email alert classifier", () => {
  it("flags DocuSign as critical", () => {
    const a = classifyEmail({
      from: "DocuSign <dse@docusign.net>",
      subject: "Complete with DocuSign: Purchase Agreement",
      snippet: "Please DocuSign",
    });
    expect(a.kind).toBe("docusign");
    expect(a.priority).toBe("critical");
  });

  it("matches client emails to leads", () => {
    const a = classifyEmail(
      {
        from: "Alex Buyer <alex@example.com>",
        subject: "Re: tour this weekend",
        snippet: "Can we go Saturday?",
      },
      [lead],
    );
    expect(a.kind).toBe("client");
    expect(a.leadId).toBe("l1");
  });

  it("builds demo scan with docusign + client", () => {
    const msgs = buildDemoInboxScan([lead], "agent@broker.com");
    const alerts = messagesToAlerts(msgs, [lead], "gmail");
    expect(alerts.some((x) => x.kind === "docusign")).toBe(true);
    expect(alerts.some((x) => x.kind === "client")).toBe(true);
    expect(unreadCount(alerts.map((a) => ({ ...a, read: false })))).toBe(
      alerts.length,
    );
  });
});
