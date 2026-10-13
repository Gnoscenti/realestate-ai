import type { CiteProperty } from "@/lib/aieo/provenance";
import type { ObservedListing, RapidQuery, RapidResult } from "./types";

type Row = Record<string, unknown>;
function obj(v: unknown): Row { return v && typeof v === "object" && !Array.isArray(v) ? v as Row : {}; }
function str(v: unknown): string { return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : ""; }
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" && typeof v !== "number") return null;
  const n = Number(typeof v === "string" ? v.replace(/[$,]/g,"") : v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function publicUrl(value: unknown, image = false): string | undefined {
  try {
    const u = new URL(str(value), "https://www.zillow.com");
    if (u.protocol !== "https:" || u.username || u.password) return undefined;
    const allowed = image ? ["zillowstatic.com"] : ["zillow.com"];
    if (!allowed.some(h => u.hostname === h || u.hostname.endsWith("." + h))) return undefined;
    u.search = ""; u.hash = "";
    return str(value) ? u.toString() : undefined;
  } catch { return undefined; }
}
function listing(value: unknown, query: RapidQuery, at: string): ObservedListing | null {
  const outer = obj(value);
  const r = { ...obj(obj(outer.hdpData).homeInfo), ...obj(outer.property), ...outer };
  const id = str(r.zpid || r.propertyId || r.id);
  if (!/^\d{1,20}$/.test(id)) return null;
  const a = obj(r.address);
  const street = str(r.streetAddress || a.streetAddress || r.addressStreet);
  const city = str(r.city || a.city || r.addressCity);
  const address = typeof r.address === "string" ? r.address : [street,city,str(a.state || r.state),str(a.zipcode || r.zipcode)].filter(Boolean).join(", ");
  const hidden = r.isUndisclosedAddress === true || r.isUnmappable === true;
  const status = str(r.homeStatus || r.statusType || r.status) || "UNKNOWN";
  const price = num(r.price ?? r.unformattedPrice ?? r.soldPrice);
  const beds = num(r.bedrooms ?? r.beds), baths = num(r.bathrooms ?? r.baths), sqft = num(r.livingArea ?? r.area);
  const url = publicUrl(r.detailUrl || r.url || r.homeUrl);
  const imageUrl = publicUrl(r.imgSrc || r.imageUrl || r.photoUrl, true);
  const typeMap: Record<string, CiteProperty["type"]> = {SINGLE_FAMILY:"house",CONDO:"condo",TOWNHOUSE:"townhouse",MULTI_FAMILY:"multi",LOT:"land"};
  const statusMap: Record<string, CiteProperty["status"]> = {FOR_SALE:"active",FOR_RENT:"active",RECENTLY_SOLD:"sold",SOLD:"sold",PENDING:"pending",COMING_SOON:"coming_soon"};
  const type = typeMap[str(r.homeType)];
  const mappedStatus = obj(r.listingSubType).is_comingSoon === true || obj(r.listing_sub_type).is_comingSoon === true ? "coming_soon" : statusMap[status];
  let property: CiteProperty | undefined;
  if (!hidden && street && city && url && type && mappedStatus && price !== null && beds !== null && baths !== null && sqft !== null) {
    const lease = status === "FOR_RENT" || query.operation === "rentals";
    property = {
      id: "rapidapi:zillow:" + id, title: address, address: street, city, neighborhood: "",
      price, beds, baths, sqft, yearBuilt: num(r.yearBuilt) || 0, type, status: mappedStatus,
      daysOnMarket: num(r.daysOnZillow) || 0, features: ["Zillow via RapidAPI", "Unverified representation"],
      description: "Aggregator observation. Agent representation and display permission have not been verified.",
      lat: typeof r.latitude === "number" ? r.latitude : 0,
      lng: typeof r.longitude === "number" ? r.longitude : 0,
      pricePerSqft: sqft > 0 ? Math.round(price / sqft) : 0,
      estimatedValue: num(r.zestimate) || 0, accent: "#5b8def", pattern: 1,
      imageUrl, photoUrls: imageUrl ? [imageUrl] : [],
      listingSide: "market", visibility: "private",
      transactionType: lease ? "lease" : "sale", pricePeriod: lease ? "unknown" : "total",
      source: {kind:"aggregator", provider:"Zillow via RapidAPI", url, observedAt:at, evidenceLevel:"site_published", trust:"client_import"},
      representation: {role:"unknown"},
    };
  }
  return { id, address:hidden ? "Address withheld" : address || "Address unavailable", url: hidden ? undefined : url,
    imageUrl:hidden ? undefined : imageUrl, status, price, beds, baths, sqft,
    zestimate:num(r.zestimate), rentZestimate:num(r.rentZestimate), property };
}
export function normalizeRapidResponse(json: unknown, query: RapidQuery, observedAt: string): RapidResult {
  const root = obj(json);
  if (root.status !== "OK" || root.data == null) throw new Error("The provider returned an unexpected response.");
  const data = root.data, d = obj(data);
  const result: RapidResult = {ok:true,operation:query.operation,page:query.page,observedAt,cached:false,listings:[],agents:[],hasMore:false,
    warnings:["Zillow via RapidAPI: aggregator observations; MLS status, agent representation, and redistribution rights are unverified."]};
  if (query.operation === "agents") {
    const rows = Array.isArray(data) ? data : d.agents;
    if (!Array.isArray(rows)) throw new Error("The provider changed its agent response format.");
    result.agents = rows.flatMap(value => {
      const r = obj(value);
      const id = str(r.encodedZuid || r.encoded_zuid);
      const name = str(r.fullName || r.name || r.displayName);
      return id && name ? [{id,name,brokerage:str(r.brokerageName || r.brokerage),url:publicUrl(r.profileUrl || r.profileLink || r.url)}] : [];
    });
    result.hasMore = rows.length >= 15 && query.page < 20;
    if (rows.length !== result.agents.length) result.warnings.push("Some agent rows lacked a usable ID or name and were omitted.");
  } else {
    const rows = Array.isArray(data) ? data : ["active","rentals"].includes(query.operation) ? d.listings :
      query.operation === "sold" ? d.sold_properties :
      ["details","address","zestimate"].includes(query.operation) ? [d] : undefined;
    if (!Array.isArray(rows)) throw new Error("The provider changed its listing response format.");
    const byId = new Map<string, ObservedListing>();
    for (const row of rows) {
      const item = listing(row,query,observedAt);
      if (item) byId.set(item.id,item);
    }
    result.listings = [...byId.values()];
    const paged = !["details","address","zestimate"].includes(query.operation);
    const pageSize = ["active","rentals","sold"].includes(query.operation) ? 5 : 41;
    const total = num(d.listing_count ?? d.total_sold_properties);
    result.hasMore = paged && query.page < 20 && (total !== null ? query.page * pageSize < total : rows.length >= pageSize);
    if (rows.length > byId.size) result.warnings.push("Duplicate or unsupported listing rows were omitted.");
  }
  return result;
}
