import type { Property } from "@/data/seed";
export function propertySummary(property: Property): string {
  const amount = (value: number) => Number.isFinite(value) && value > 0 ? value.toLocaleString("en-US") : "Not supplied";
  return [
    property.title || "Property summary", [property.address,property.city].filter(Boolean).join(", "),
    "As recorded in your local listing book. Confirm availability, price and details with the listing agent before sharing.",
    "Price (USD): " + amount(property.price),
    "Beds: " + amount(property.beds), "Baths: " + amount(property.baths), "Square feet: " + amount(property.sqft),
    "Status: " + property.status.replace(/_/g," "), "Type: " + property.type,
    ...(property.listAgentName ? ["Listing agent as supplied: " + property.listAgentName] : []),
    ...(property.mlsNumber ? ["Listing reference as supplied: " + property.mlsNumber] : []),
    property.description, property.features.length ? "Features as supplied: " + property.features.join(", ") : "",
    "Exported: " + new Date().toISOString(),
  ].filter(Boolean).join("\n\n");
}
