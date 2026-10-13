import type { Property } from "@/data/seed";

export const MLS_OPTIONS = [
  {
    id: "sandicor",
    label: "Sandicor (San Diego)",
    region: "San Diego",
    prefix: "SDP",
  },
  {
    id: "crmls",
    label: "CRMLS (SoCal)",
    region: "Los Angeles",
    prefix: "CR",
  },
  {
    id: "bright",
    label: "Bright MLS (Mid-Atlantic)",
    region: "Washington DC",
    prefix: "BR",
  },
  {
    id: "onekey",
    label: "OneKey MLS (NY metro)",
    region: "New York",
    prefix: "OK",
  },
  {
    id: "nwmls",
    label: "NWMLS (Pacific Northwest)",
    region: "Seattle",
    prefix: "NW",
  },
  {
    id: "ntreis",
    label: "NTREIS (DFW / North Texas)",
    region: "Dallas",
    prefix: "NT",
  },
  {
    id: "actris",
    label: "ACTRIS (Austin / Central TX)",
    region: "Austin",
    prefix: "ATX",
  },
  {
    id: "miami",
    label: "MIAMI / BeachesMLS",
    region: "Miami",
    prefix: "MI",
  },
  {
    id: "mred",
    label: "MRED (Chicago)",
    region: "Chicago",
    prefix: "CH",
  },
  {
    id: "recolorado",
    label: "REColorado",
    region: "Denver",
    prefix: "CO",
  },
  {
    id: "other",
    label: "Other / Independent",
    region: "United States",
    prefix: "MLS",
  },
] as const;

export type MlsId = (typeof MLS_OPTIONS)[number]["id"];

export function normalizeWebsite(url: string): string {
  const t = url.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

export function getMlsLabel(mlsId: string): string {
  return MLS_OPTIONS.find((m) => m.id === mlsId)?.label ?? mlsId;
}

export function myListings(properties: Property[]): Property[] {
  return properties.filter(
    (p) =>
      p.listingSide === "mine" &&
      ["active", "coming_soon", "pending"].includes(p.status),
  );
}
