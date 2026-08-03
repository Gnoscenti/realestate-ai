import { describe, expect, it } from "vitest";
import {
  buildMlsQueryUrl,
  extractResoValues,
  mapPayloadToProperties,
  resoToProperty,
} from "@/lib/mls-sync";
import { getBoard, platformsForBoard } from "@/lib/mls-platforms";

describe("board → platforms", () => {
  it("maps Sandicor to Bridge + RESO + website", () => {
    const ids = platformsForBoard("sandicor").map((p) => p.id);
    expect(ids).toContain("bridge");
    expect(ids).toContain("reso_web");
    expect(ids).toContain("website");
  });

  it("maps MRED to MLS Grid", () => {
    const ids = platformsForBoard("mred").map((p) => p.id);
    expect(ids).toContain("mls_grid");
  });

  it("maps Miami to Spark", () => {
    expect(getBoard("miami").platforms).toContain("spark");
  });
});

describe("resoToProperty", () => {
  it("maps RESO fields to inventory", () => {
    const p = resoToProperty(
      {
        ListingId: "SDP2500999",
        UnparsedAddress: "100 Via de la Valle, Rancho Santa Fe",
        City: "Rancho Santa Fe",
        ListPrice: 4500000,
        BedroomsTotal: 4,
        BathroomsTotalInteger: 5,
        LivingArea: 4200,
        StandardStatus: "Active",
        PropertyType: "Residential",
        ListAgentMlsId: "01888777",
        ListAgentFullName: "Morgan Hale",
        PublicRemarks: "Covenant estate with guest house.",
      },
      { platform: "bridge", agentMlsId: "01888777", agentName: "Morgan Hale" },
    );
    expect(p).toBeTruthy();
    expect(p!.price).toBe(4500000);
    expect(p!.mlsNumber).toBe("SDP2500999");
    expect(p!.listingSide).toBe("mine");
    expect(p!.features).toContain("From MLS");
    expect(p!.beds).toBe(4);
  });

  it("marks other agents as market", () => {
    const p = resoToProperty(
      {
        ListingId: "X1",
        UnparsedAddress: "1 Main St",
        ListPrice: 900000,
        StandardStatus: "Active",
        ListAgentMlsId: "OTHER",
      },
      { platform: "reso_web", agentMlsId: "MINE" },
    );
    expect(p!.listingSide).toBe("market");
  });
});

describe("extractResoValues + mapPayload", () => {
  it("reads OData value arrays", () => {
    const rows = extractResoValues({
      value: [
        {
          ListingId: "A",
          UnparsedAddress: "10 Oak St",
          ListPrice: 1000000,
          StandardStatus: "Pending",
        },
      ],
    });
    expect(rows).toHaveLength(1);
    const props = mapPayloadToProperties("trestle", { value: rows }, {
      agentName: "A",
    });
    expect(props[0]!.status).toBe("pending");
  });
});

describe("buildMlsQueryUrl", () => {
  it("builds Bridge Property URL with agent filter", () => {
    const url = buildMlsQueryUrl({
      platform: "bridge",
      baseUrl: "https://api.bridgedataoutput.com/api/v2/OData",
      dataset: "sandicor",
      agentMlsId: "01888777",
    });
    expect(url).toContain("sandicor/Property");
    expect(url).toContain("ListAgentMlsId");
    expect(url).toContain("01888777");
    expect(url).toContain("%24filter"); // $filter encoded
  });

  it("builds Spark listings URL", () => {
    const url = buildMlsQueryUrl({
      platform: "spark",
      baseUrl: "https://sparkapi.com/v1",
      agentMlsId: "99",
    });
    expect(url).toContain("listings");
    expect(url).toContain("AgentId=99");
  });
});
