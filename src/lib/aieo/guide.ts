import { z } from "zod";

// Click-tracking parameters added by social, ad and email platforms. They never
// identify the page, so they are removed instead of rejecting a pasted link.
const TRACKING_PARAM = /^(?:utm_[a-z0-9_]+|fbclid|gclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|_hsenc|_hsmi)$/i;

/**
 * Normalize a pasted page address: trim, assume https:// when no scheme was
 * typed, drop click-tracking parameters and a bare trailing "?" or "#".
 * Anything else (credentials, other query parameters, http://) is left for
 * validation to reject with a clear message.
 */
export function normalizePublicUrlInput(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  let value = raw.trim();
  if (!value) return value;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = "https://" + value.replace(/^\/+/, "");
  if (!URL.canParse(value)) return value;
  const url = new URL(value);
  for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  url.search = url.searchParams.toString() ? "?" + url.searchParams.toString() : "";
  return url.href.replace(/[?#]+$/, "");
}

const publicUrl = z.preprocess(normalizePublicUrlInput, z.string().trim().url().max(1000).refine(value => {
  if (!URL.canParse(value)) return false;
  const u = new URL(value);
  return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash;
}, "Use a public HTTPS page without credentials, query parameters, or fragments."));
export const guideInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  area: z.string().trim().min(2).max(160),
  entityKind: z.enum(["agent", "team", "brokerage"]).default("agent"),
  website: publicUrl,
  brokerage: z.string().trim().max(160).default(""),
  brokerUrl: z.union([publicUrl, z.literal("")]).default(""),
  rankingUrl: z.union([publicUrl, z.literal("")]).default(""),
  additionalUrl: z.union([publicUrl, z.literal("")]).default(""),
});
export type GuideInput = z.infer<typeof guideInputSchema>;
export type GuideSourceFailure = "blocked" | "not_found" | "redirect" | "no_text" | "not_html" | "unreachable";
export type GuideSource = {
  url: string;
  role: "website" | "broker" | "ranking" | "additional";
  status: "matched" | "unmatched" | "unavailable";
  /** Why an unavailable page could not be read. Absent on guides created before guide-1.1. */
  reason?: GuideSourceFailure;
  note: string;
  observedAt: string;
  contentHash?: string;
  facts: string[];
};
export type RankingFact = { year: number; city: string; sides: number; citySidesRank: number; volumeMillions?: number; url: string };
export type GuideAnalysis = {
  input: GuideInput;
  sources: GuideSource[];
  ranking: RankingFact | null;
  conflicts: string[];
  recommendedClaim: string | null;
  version: "guide-1.0" | "guide-1.1";
};
export type GuideStep = {
  id: string; title: string; priority: "First" | "Next" | "Then";
  owner: string; effort: string; why: string; instructions: string[];
  doneWhen: string; sources: string[];
};
export type GuideView = {
  id: string; createdAt: string; tier: "basic" | "full"; analysis: GuideAnalysis;
  steps: GuideStep[]; lockedStepCount: number; completedStepIds: string[];
  limitations: string[]; methodologyUrl: string;
};
const SMALL_WORDS = new Set(["a","an","and","at","by","de","del","du","for","la","le","of","on","the","to","van","von"]);
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function titleCaseSegment(segment: string, first: boolean): string {
  return segment.split(/(\s+)/).map((word, index) => {
    if (!word.trim()) return word;
    const lower = word.toLowerCase();
    if (index > 0 && SMALL_WORDS.has(lower)) return lower;
    // Capitalize after hyphens and apostrophes too: o'neil -> O'Neil, smith-jones -> Smith-Jones.
    return lower.replace(/(^|[-'’])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
  }).join("").replace(/^\p{Ll}/u, ch => (first ? ch.toUpperCase() : ch));
}
/**
 * Choose how a name or locale is displayed in the guide.
 *
 * Prefers the capitalization observed on the supplied public pages (evidence
 * over typing), ignoring ALL-CAPS headings. Otherwise, text typed entirely in
 * lower case is title-cased and two-letter region codes after a comma are
 * upper-cased ("san diego, ca" -> "San Diego, CA"). Mixed-case input that does
 * not appear on a page is kept exactly as typed.
 */
export function displayCase(value: string, observedTexts: string[] = []): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;
  return trimmed.split(/\s*,\s*/).map((segment, index) => {
    const pattern = new RegExp("(?<![\\p{L}\\p{N}])" + escapeRegExp(segment).replace(/ /g, "\\s+") + "(?![\\p{L}\\p{N}])", "giu");
    for (const text of observedTexts) {
      for (const match of text.matchAll(pattern)) {
        const seen = match[0].replace(/\s+/g, " ");
        if (seen !== seen.toUpperCase() && seen !== seen.toLowerCase()) return seen;
      }
    }
    if (index > 0 && /^[a-z]{2}$/i.test(segment)) return segment.toUpperCase();
    return segment === segment.toLowerCase() ? titleCaseSegment(segment, true) : segment;
  }).join(", ");
}

export function guideMarkdown(guide: GuideView) {
  const a = guide.analysis;
  return [
    "# CiteLock visibility guide", a.input.name + " · " + a.input.area,
    "Generated " + guide.createdAt + " · " + guide.tier + " · " + a.version,
    "", "## Source findings",
    ...a.sources.map(s => "- " + s.role + ": " + s.url + " — " + s.status + ". " + s.note + " " + s.facts.join(" ")),
    ...a.conflicts.map(c => "- Resolve before publication: " + c),
    ...(a.recommendedClaim ? ["", "## Source-attributed wording", a.recommendedClaim] : []),
    "", "## Your action plan",
    ...guide.steps.flatMap((step, i) => [
      "", "### " + (i + 1) + ". " + step.title,
      step.priority + " · " + step.owner + " · " + step.effort,
      step.why, ...step.instructions.map(t => "- " + t),
      "Done when: " + step.doneWhen,
      ...step.sources.map(url => "Source: " + url),
      guide.completedStepIds.includes(step.id) ? "Marked complete by your workspace." : "Not marked complete.",
    ]),
    "", "## Measurement limits", ...guide.limitations.map(l => "- " + l),
    "Methodology reference: " + guide.methodologyUrl,
    ...(guide.lockedStepCount ? ["", String(guide.lockedStepCount) + " additional steps require full access."] : []),
  ].join("\n");
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/**
 * A self-contained, print-ready HTML version of a guide (the browser's Print
 * dialog can save it as PDF). Every value is escaped; no remote assets load.
 */
export function guidePrintHtml(guide: GuideView): string {
  const a = guide.analysis;
  const e = escapeHtml;
  const created = new Date(guide.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const sources = a.sources.map(s => `<li><strong>${e(s.role)}</strong> · ${e(s.status === "matched" ? "identity text matched" : s.status)}<br><span class="url">${e(s.url)}</span><br>${e(s.note)}${s.facts.length ? "<ul>" + s.facts.map(f => `<li>${e(f)}</li>`).join("") + "</ul>" : ""}</li>`).join("");
  const steps = guide.steps.map((step, i) => `<section class="step"><h3><span class="box">${guide.completedStepIds.includes(step.id) ? "&#10003;" : ""}</span>${i + 1}. ${e(step.title)}</h3>
<p class="meta">${e(step.priority)} · ${e(step.effort)} · Owner: ${e(step.owner)}</p><p>${e(step.why)}</p>
<ul>${step.instructions.map(line => `<li>${e(line)}</li>`).join("")}</ul><p class="done"><strong>Done when:</strong> ${e(step.doneWhen)}</p></section>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>CiteLock visibility guide · ${e(a.input.name)}</title>
<style>
@page{margin:16mm}body{font:11pt/1.45 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#111;max-width:760px;margin:0 auto;padding:24px}
h1{font-size:20pt;margin:0}h2{font-size:13pt;margin:22px 0 8px;border-bottom:1px solid #ccc;padding-bottom:4px}h3{font-size:11.5pt;margin:0 0 4px}
.sub{color:#444;margin:4px 0 0}.meta{color:#555;font-size:9.5pt;margin:0 0 6px}.url{word-break:break-all;color:#1d4ed8}
.step{break-inside:avoid;border:1px solid #ddd;border-radius:8px;padding:10px 12px;margin:0 0 10px}.done{background:#f4f4f5;padding:6px 8px;border-radius:6px}
.box{display:inline-block;width:12px;height:12px;border:1.5px solid #111;margin-right:8px;font-size:9pt;line-height:12px;text-align:center;vertical-align:-1px}
.claim{background:#eef2ff;padding:8px 10px;border-radius:6px}.limits{color:#555;font-size:9pt}ul{padding-left:18px}li{margin:2px 0}
</style></head><body>
<h1>CiteLock visibility guide</h1><p class="sub">${e(a.input.name)} · ${e(a.input.area)}${a.input.brokerage ? " · " + e(a.input.brokerage) : ""}</p>
<p class="meta">Prepared ${e(created)} · ${guide.tier === "full" ? "Full guide" : "Free basic guide"} · ${e(a.version)}</p>
<h2>What your sources support</h2><ul>${sources}</ul>
${a.conflicts.map(c => `<p class="claim"><strong>Resolve before publishing:</strong> ${e(c)}</p>`).join("")}
${a.recommendedClaim ? `<p class="claim"><strong>Suggested source-attributed wording:</strong> ${e(a.recommendedClaim)}</p>` : ""}
<h2>Your action plan</h2>${steps}
${guide.lockedStepCount ? `<p class="meta">${guide.lockedStepCount} additional steps are available with full access.</p>` : ""}
<h2>Measurement limits</h2><ul class="limits">${guide.limitations.map(l => `<li>${e(l)}</li>`).join("")}</ul>
<p class="limits">Methodology reference: ${e(guide.methodologyUrl)}</p>
</body></html>`;
}
