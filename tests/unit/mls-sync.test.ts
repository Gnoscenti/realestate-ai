import { describe, expect, it } from "vitest";
import {
  buildMlsQueryUrl,
  extractResoValues,
  mapPayloadToProperties,
  resoToProperty,
} from "@/lib/mls-sync";
import { getBoard, platformsForBoard } from "@/lib/mls-platforms";

describe("board to platforms", () => {
  it("maps the configured boards to supported providers", () => {
    const sandicor = platformsForBoard("sandicor").map((platform) => platform.id);
    expect(sandicor).toContain("bridge");
    expect(sandicor).toContain("reso_web");
    expect(sandicor).toContain("website");
    expect(platformsForBoard("mred").map((platform) => platform.id)).toContain("mls_grid");
    expect(getBoard("miami").platforms).toContain("spark");
  });
});

describe("resoToProperty", () => {
  it("records exact primary-agent ID matches as provider-verified listing roles", () => {
    const property = resoToProperty(
      {
        ListingId: "SDP2500999",
        UnparsedAddress: "100 Via de la Valle, Rancho Santa Fe",
        City: "Rancho Santa Fe",
        ListPrice: 4_500_000,
        BedroomsTotal: 4,
        BathroomsTotalInteger: 5,
        LivingArea: 4_200,
        StandardStatus: "Active",
        PropertyType: "Residential",
        ListAgentMlsId: "01888777",
        ListAgentFullName: "Morgan Hale",
        ModificationTimestamp: "2026-08-19T12:00:00.000Z",
        ListingURL: "https://mls.example.com/SDP2500999",
        PublicRemarks: "Covenant estate with guest house.",
      },
      { platform: "bridge", agentMlsId: "01888777", agentName: "Morgan Hale" },
    );

    expect(property).toMatchObject({
      price: 4_500_000,
      mlsNumber: "SDP2500999",
      listingSide: "mine",
      representation: {
        role: "listing",
        matchedAgentId: "01888777",
        matchedAgentName: "Morgan Hale",
        verifiedAt: "2026-08-19T12:00:00.000Z",
      },
      source: {
        kind: "mls",
        provider: "bridge",
        url: "https://mls.example.com/SDP2500999",
        modifiedAt: "2026-08-19T12:00:00.000Z",
        evidenceLevel: "provider_verified",
      },
    });
    expect(property!.features).toContain("From MLS");
  });

  it("records an exact co-list ID match without promoting it to primary", () => {
    const property = resoToProperty(
      {
        ListingId: "CO1",
        UnparsedAddress: "1 Co-list Way",
        ListPrice: 1_200_000,
        StandardStatus: "Active",
        ListAgentMlsId: "PRIMARY",
        ListAgentFullName: "Primary Agent",
        CoListAgentMlsId: "MINE",
        CoListAgentFullName: "Morgan Hale",
      },
      { platform: "trestle", agentMlsId: "MINE", agentName: "Morgan Hale" },
    );

    expect(property).toMatchObject({
      listingSide: "mine",
      representation: {
        role: "co_listing",
        matchedAgentId: "MINE",
        matchedAgentName: "Morgan Hale",
      },
    });
  });

  it("never fills missing source-agent fields from the expected agent", () => {
    const property = resoToProperty(
      {
        ListingId: "UNKNOWN",
        UnparsedAddress: "2 Unknown Way",
        ListPrice: 900_000,
        StandardStatus: "Active",
      },
      { platform: "reso_web", agentName: "Morgan Hale" },
    );

    expect(property?.listingSide).toBe("market");
    expect(property?.representation).toMatchObject({ role: "market" });
    expect(property?.representation?.matchedAgentName).toBeUndefined();
  });

  it("does not match on a shared first name", () => {
    const property = resoToProperty(
      {
        ListingId: "COLLISION",
        UnparsedAddress: "3 Collision Way",
        ListPrice: 800_000,
        StandardStatus: "Active",
        ListAgentFullName: "Morgan Smith",
      },
      { platform: "reso_web", agentName: "Morgan Hale" },
    );
    expect(property?.listingSide).toBe("market");
  });
});

describe("extractResoValues and mapPayload", () => {
  it("reads OData arrays without inventing a role", () => {
    const rows = extractResoValues({
      value: [
        {
          ListingId: "A",
          UnparsedAddress: "10 Oak St",
          ListPrice: 1_000_000,
          StandardStatus: "Pending",
        },
      ],
    });
    expect(rows).toHaveLength(1);
    const properties = mapPayloadToProperties("trestle", { value: rows }, { agentName: "A" });
    expect(properties[0]).toMatchObject({ status: "pending", listingSide: "market" });
  });
});

describe("buildMlsQueryUrl", () => {
  it("builds Bridge and Spark agent queries", () => {
    const bridge = buildMlsQueryUrl({
      platform: "bridge",
      baseUrl: "https://api.bridgedataoutput.com/api/v2/OData",
      dataset: "sandicor",
      agentMlsId: "01888777",
    });
    expect(bridge).toContain("sandicor/Property");
    expect(bridge).toContain("ListAgentMlsId");
    expect(bridge).toContain("CoListAgentMlsId");
    expect(bridge).toContain("01888777");
    expect(bridge).toContain("%24filter");

    const spark = buildMlsQueryUrl({
      platform: "spark",
      baseUrl: "https://sparkapi.com/v1",
      agentMlsId: "99",
    });
    expect(spark).toContain("listings");
    expect(spark).toContain("AgentId=99");
  });
});
