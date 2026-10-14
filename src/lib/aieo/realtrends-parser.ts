/** Source-reported production, never a ranking or an independently audited total. */
export type ProductionObservation = {
  claimScope: string;
  field: "transaction_volume" | "transaction_sides";
  value: string;
  note?: string;
};

function htmlLines(html: string): string[] {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/?(?:tr|td|th|div|p|br|li|h\d|span|section)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Only explicit production-year headings and exact metric labels supply context. */
export function parseRealTrendsProduction(html: string): ProductionObservation[] {
  const lines = htmlLines(html);
  const observations = new Map<string, ProductionObservation>();
  const ambiguous = new Set<string>();
  let year: string | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const heading = [line, lines[index + 1] || "", lines[index + 2] || ""].join(" ").match(/^Based On\s+(20\d{2})\s+Sales Data\b/i)
      || line.match(/^(20\d{2})\s+(?:Rankings|Sales Data)$/i);
    if (heading) { year = heading[1]; continue; }
    // Rankings, market widgets and footer dates cannot mutate production data.
    if (/^(?:National|State|City|Awards|Market Update\b|Copyright\b|©)/i.test(line)) year = undefined;
    const metric = line.match(/^(?:(20\d{2})\s+)?((?:Sales\s+)?Volume|(?:Transaction\s+)?Sides)(?:\s+(.+))?$/i);
    if (!metric) continue;
    const metricYear = metric[1] || year;
    if (!metricYear) continue;
    const raw = metric[3] || lines[index + 1] || "";
    const isVolume = /volume/i.test(metric[2]!);
    const amount = isVolume
      ? raw.match(/^\$\s*(\d[\d,]*(?:\.\d+)?)\s*(billion|million|thousand|bn|mm|[bmk])?$/i)
      : raw.match(/^(\d{1,4}(?:\.\d+)?)$/);
    if (!amount) continue;
    const multiplier = /^(?:b|bn|billion)$/i.test(amount[2] || "") ? 1e9
      : /^(?:m|mm|million)$/i.test(amount[2] || "") ? 1e6
      : /^(?:k|thousand)$/i.test(amount[2] || "") ? 1e3 : 1;
    const numeric = Number(amount[1]!.replaceAll(",", "")) * multiplier;
    if (!Number.isFinite(numeric) || numeric <= 0 || (!isVolume && (numeric >= 10_000 || /^20\d{2}$/.test(raw)))) continue;
    const claimScope = `sales-${isVolume ? "volume" : "sides"}:${metricYear}:full-year`;
    const observation: ProductionObservation = {
      claimScope,
      field: isVolume ? "transaction_volume" : "transaction_sides",
      value: isVolume ? `$${Math.round(numeric).toLocaleString("en-US")} in ${metricYear}` : `${numeric} sides in ${metricYear}`,
    };
    if (observations.has(claimScope) && observations.get(claimScope)!.value !== observation.value) ambiguous.add(claimScope);
    observations.set(claimScope, observation);
  }
  return [...observations.values()].filter(item => !ambiguous.has(item.claimScope))
    .sort((a, b) => a.claimScope.localeCompare(b.claimScope));
}
