import { z } from "zod";
import type { CiteProperty } from "@/lib/aieo/provenance";

export const RAPIDAPI_ENDPOINTS = {
  search: "/zillow/search",
  agents: "/zillow/agent-search",
  active: "/zillow/agent-properties-for-sale",
  sold: "/zillow/agent-properties-sold",
  rentals: "/zillow/agent-properties-for-rent",
  details: "/zillow/property-details",
  address: "/zillow/property-details-address",
  zestimate: "/zillow/zestimate",
  coordinates: "/zillow/search-coordinates",
  polygon: "/zillow/search-polygon",
} as const;
export type RapidOperation = keyof typeof RAPIDAPI_ENDPOINTS;
export const rapidQuerySchema = z.object({
  operation: z.enum(Object.keys(RAPIDAPI_ENDPOINTS) as [RapidOperation, ...RapidOperation[]]),
  query: z.string().trim().max(5000).default(""),
  name: z.string().trim().max(120).optional(),
  page: z.number().int().min(1).max(20).default(1),
  homeStatus: z.enum(["FOR_SALE", "FOR_RENT", "RECENTLY_SOLD"]).default("FOR_SALE"),
  lat: z.number().min(-90).max(90).optional(),
  long: z.number().min(-180).max(180).optional(),
  diameter: z.number().min(1).max(100).default(1),
}).superRefine((v, ctx) => {
  const issue = (message: string) => ctx.addIssue({code:"custom",message});
  if (v.operation === "coordinates") {
    if (v.lat === undefined || v.long === undefined) issue("Enter latitude and longitude.");
  } else if (!v.query) issue("Enter a search value.");
  if (["active","sold","rentals"].includes(v.operation) && !/^[A-Za-z0-9_-]{5,100}$/.test(v.query))
    issue("Use an encodedZuid from Agent Search.");
  if (["details","zestimate"].includes(v.operation) && !/^\d{1,20}$/.test(v.query))
    issue("Enter a numeric Zillow property ID (zpid).");
  if (v.operation === "agents" && !/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(v.query))
    issue("Use a location slug, for example san-diego-ca.");
  if (v.operation === "polygon") {
    // Provider example uses longitude latitude despite its prose saying lat/lng.
    const points = v.query.split(",").map(p => p.trim().split(/\s+/).map(Number));
    if (points.length < 4 || points.length > 50 ||
        points.some(p => p.length !== 2 || !p.every(Number.isFinite) || Math.abs(p[0]!)>180 || Math.abs(p[1]!)>90) ||
        JSON.stringify(points[0]) !== JSON.stringify(points.at(-1))) issue("Use 4–50 longitude latitude pairs, with the first pair repeated at the end.");
  }
});
export type RapidQuery = z.infer<typeof rapidQuerySchema>;
export type ObservedListing = {
  id: string; address: string; url?: string; imageUrl?: string;
  status: string; price: number | null; beds: number | null; baths: number | null;
  sqft: number | null; zestimate: number | null; rentZestimate: number | null;
  property?: CiteProperty;
};
export type ObservedAgent = { id: string; name: string; brokerage?: string; url?: string };
export type RapidResult = {
  ok: boolean; operation: RapidOperation; page: number;
  observedAt: string; cached: boolean; listings: ObservedListing[]; agents: ObservedAgent[];
  hasMore: boolean; warnings: string[]; error?: string; retryAfterSeconds?: number;
};
