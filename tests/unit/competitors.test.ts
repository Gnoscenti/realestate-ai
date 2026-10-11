import { describe, expect, it } from "vitest";
import {
  COMPETITORS,
  EDGE_PILLARS,
  SPEED_TO_LEAD_SLA_MINUTES,
  buildDailyEdgeBrief,
  slaStatus,
} from "@/lib/competitors";
import { buildFiveMinuteProtocol, buildMultiChannelPack } from "@/lib/edge-pack";
import type { Lead } from "@/data/seed";

const sampleLead = {
  id: "lead_1",
  name: "Alex Buyer",
  email: "alex@example.com",
  phone: "(858) 555-0100",
  status: "new",
  heat: "hot",
  score: 88,
  location: "Rancho Santa Fe",
  budgetMin: 2000000,
  budgetMax: 4000000,
  preferences: "Single level estate",
  propertyType: "House",
  lastContact: new Date().toISOString(),
  tags: [],
  notes: "",
  source: "Website",
  createdAt: new Date().toISOString(),
} as Lead;

describe("competitive matrix", () => {
  it("covers major agent platforms", () => {
    const names = COMPETITORS.map((c) => c.name).join(" ");
    expect(names).toMatch(/Follow Up Boss/);
    expect(names).toMatch(/kvCORE|BoldTrail/);
    expect(names).toMatch(/Ylopo/);
    expect(names).toMatch(/Zillow/);
    expect(EDGE_PILLARS.length).toBeGreaterThanOrEqual(6);
  });

  it("every competitor has a do-this and modules", () => {
    for (const c of COMPETITORS) {
      expect(c.doThis.length).toBeGreaterThan(10);
      expect(c.useModules.length).toBeGreaterThan(0);
      expect(c.ourCounter.length).toBeGreaterThan(20);
    }
  });
});

describe("SLA + packs", () => {
  it("uses 5-minute gold standard", () => {
    expect(SPEED_TO_LEAD_SLA_MINUTES).toBe(5);
    expect(slaStatus(1).tone).toBe("ok");
    expect(slaStatus(4).tone).toBe("warn");
    expect(slaStatus(12).tone).toBe("critical");
  });

  it("builds multi-channel pack and protocol", () => {
    const pack = buildMultiChannelPack(sampleLead, "Morgan");
    expect(pack.sms.length).toBeGreaterThan(20);
    expect(pack.emailBody.length).toBeGreaterThan(20);
    expect(pack.allInOne).toContain("SMS");
    const protocol = buildFiveMinuteProtocol(sampleLead);
    expect(protocol.steps).toHaveLength(5);
    expect(protocol.touches).toHaveLength(3);
  });

  it("daily brief mentions competitive actions", () => {
    const b = buildDailyEdgeBrief({
      agentName: "Morgan Hale",
      newLeadCount: 2,
      hotLeadCount: 1,
      listingCount: 3,
      openDealCount: 1,
      hasMlsConnection: false,
      hasWebsite: true,
    });
    expect(b).toMatch(/Morgan/);
    expect(b).toMatch(/FUB|Ylopo|MLS/i);
  });
});
