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
  it("records provider role data but leaves client-imported rows unattested", () => {
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
        trust: "client_import",
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

  it.each(["Canceled", "Withdrawn", "Expired", "Hold", "Temp", "Deleted", "Mystery"])(
    "fails closed for non-publishable MLS status %s",
    (status) => {
      const property = resoToProperty(
        {
          ListingId: `STATUS-${status}`,
          UnparsedAddress: "4 Status Way",
          ListPrice: 800_000,
          StandardStatus: status,
          ListAgentMlsId: "MINE",
          ListingURL: "https://mls.example.com/status",
        },
        { platform: "bridge", agentMlsId: "MINE" },
      );

      expect(property?.status).not.toBe("active");
      expect(property?.status).not.toBe("coming_soon");
    },
  );

  it("suppresses listings whose RESO internet-display flags forbid publication", () => {
    const property = resoToProperty(
      {
        ListingId: "PRIVATE",
        UnparsedAddress: "5 Private Way",
        ListPrice: 2_000_000,
        StandardStatus: "Active",
        ListAgentMlsId: "MINE",
        ListingURL: "https://mls.example.com/private",
        InternetEntireListingDisplayYN: false,
      },
      { platform: "bridge", agentMlsId: "MINE" },
    );

    expect(property?.visibility).toBe("suppressed");
  });

  it("does not treat an unbranded virtual tour as role-attribution evidence", () => {
    const property = resoToProperty(
      {
        ListingId: "TOUR",
        UnparsedAddress: "6 Tour Way",
        ListPrice: 2_000_000,
        StandardStatus: "Active",
        ListAgentMlsId: "MINE",
        VirtualTourURLUnbranded: "https://media.example.com/tour.mp4",
      },
      { platform: "bridge", agentMlsId: "MINE" },
    );

    expect(property?.source?.url).toBeUndefined();
  });

  it("keeps lease price semantics separate from a for-sale price", () => {
    const property = resoToProperty(
      {
        ListingId: "LEASE",
        UnparsedAddress: "7 Rental Way",
        ListPrice: 25_000,
        StandardStatus: "Active",
        PropertyType: "Residential Lease",
        LeaseAmountFrequency: "Monthly",
        ListAgentMlsId: "MINE",
        ListingURL: "https://mls.example.com/lease",
        InternetEntireListingDisplayYN: true,
        InternetAddressDisplayYN: true,
      },
      { platform: "bridge", agentMlsId: "MINE" },
    );

    expect(property).toMatchObject({
      transactionType: "lease",
      pricePeriod: "month",
      visibility: "public",
    });
  });

  it("preserves weekly lease frequency and classifies ordinary residential sale rows", () => {
    const weekly = resoToProperty(
      {
        ListingId: "WEEKLY",
        UnparsedAddress: "9 Weekly Rental Way",
        LeaseAmount: 12_000,
        LeaseAmountFrequency: "Weekly",
        StandardStatus: "Active",
        PropertyType: "Residential Lease",
      },
      { platform: "bridge" },
    );
    const sale = resoToProperty(
      {
        ListingId: "SALE",
        UnparsedAddress: "10 Residential Sale Way",
        ListPrice: 1_200_000,
        StandardStatus: "Active",
        PropertyType: "Residential",
      },
      { platform: "bridge" },
    );

    expect(weekly).toMatchObject({
      price: 12_000,
      transactionType: "lease",
      pricePeriod: "week",
    });
    expect(sale).toMatchObject({
      transactionType: "sale",
      pricePeriod: "total",
    });
  });

  it("does not interpret ambiguous internet-display values as permission", () => {
    const property = resoToProperty(
      {
        ListingId: "AMBIGUOUS-FLAGS",
        UnparsedAddress: "11 Permission Test Way",
        ListPrice: 1_000_000,
        StandardStatus: "Active",
        InternetEntireListingDisplayYN: "maybe",
        InternetAddressDisplayYN: "unknown",
      },
      { platform: "bridge" },
    );

    expect(property?.visibility).toBe("suppressed");
  });

  it("suppresses an otherwise active row when display permission is absent", () => {
    const property = resoToProperty(
      {
        ListingId: "NO-FLAGS",
        UnparsedAddress: "8 Permission Way",
        ListPrice: 1_000_000,
        StandardStatus: "Active",
        ListAgentMlsId: "MINE",
      },
      { platform: "bridge", agentMlsId: "MINE" },
    );

    expect(property?.visibility).toBe("suppressed");
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
