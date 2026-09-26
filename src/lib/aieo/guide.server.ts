import { createHash, randomUUID } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import { getEntitlement } from "@/lib/billing/entitlement.server";
import { fetchPublicPage } from "./visibility/expertise.server";
import { nameAppears } from "./visibility/evaluate";
import { guideInputSchema, type GuideInput, type GuideAnalysis, type GuideSource, type RankingFact, type GuideStep, type GuideView } from "./guide";

const METHOD = "https://developers.google.com/search/docs/fundamentals/ai-optimization-guide";
const normalize = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const LIMITS = [
  "This is a source-informed implementation guide, not an observed LLM ranking or a promise of visibility gains.",
  "A matched name and locale indicate textual relevance, not verified ownership, licensure, source independence, or the truth of every statement.",
  "Transaction sides are not unique transactions, service quality, or proof of market-wide leadership. Keep the publisher, category, population, and production year with each ranking.",
  "Pages are point-in-time observations. Unavailable pages and conflicting figures remain unresolved; MLS access is not required.",
  "You or your authorized editor choose and publish each change. Completion checkmarks are self-reported, not publication verification.",
];

/** Narrow public profile parser: no inferred national rank, year, city, or count. */
export function readRealTrendsRanking(input: GuideInput, url: string, text: string): RankingFact | null {
  const u = new URL(url);
  if (!["realtrends.com", "www.realtrends.com"].includes(u.hostname) || !u.pathname.startsWith("/agent-profile/") || input.entityKind !== "agent") return null;
  // A profile heading must match; a name elsewhere in navigation/related profiles is insufficient.
  const about = text.match(/About\s+(.{2,150}?)\s+is a nationally/i);
  if (!about || !([normalize(input.name), normalize(input.name + " " + input.name)].includes(normalize(about[1])))) return null;
  const location = text.match(/Location\s+(.{2,160}?)\s+Country\s/i)?.[1]?.trim();
  const city = input.area.split(",")[0].trim();
  if (!location || normalize(location.split(",")[0]) !== normalize(city)) return null;
  const block = text.match(/RealTrends Verified Performance\s+Based On\s+(20\d{2})\s+Sales Data\s+Sides\s+([\d,]+)\s+Volume\s+\$([\d.,]+)M\b([\s\S]{0,500}?)(?:Awards|$)/i);
  if (!block) return null;
  const cityRank = block[4].match(/\bCity\s+Volume Rank\s+[\d,-]+\s+Sides Rank\s+(\d+)\b/i);
  const year = Number(block[1]), sides = Number(block[2].replaceAll(",", ""));
  const rank = Number(cityRank?.[1]);
  if (year > new Date().getUTCFullYear() || !Number.isSafeInteger(sides) || sides < 1 || !Number.isSafeInteger(rank) || rank < 1) return null;
  return { year, city: location.split(",")[0].trim(), sides, citySidesRank: rank, volumeMillions: Number(block[3].replaceAll(",", "")), url };
}

export function analyzeGuidePages(input: GuideInput, pages: Array<{ role: GuideSource["role"]; url: string; text?: string; error?: boolean }>, observedAt: string): GuideAnalysis {
  let ranking: RankingFact | null = null;
  const annualClaims: Array<{ amount: number; year: number; url: string }> = [];
  const sources = pages.map((page): GuideSource => {
    if (!page.text) return { role: page.role, url: page.url, status: "unavailable", observedAt, facts: [], note: "Could not read this public page. Check the URL and access permissions, then retry. No claims were inferred." };
    const text = page.text.replace(/\s+/g, " ");
    const city = normalize(input.area.split(",")[0]);
    const matched = nameAppears(text, input.name) && normalize(text).includes(city);
    const facts: string[] = [];
    if (matched) {
      facts.push("Name and target locale appear in the public text.");
      if (input.brokerage && normalize(text).includes(normalize(input.brokerage))) facts.push("The supplied brokerage name also appears.");
      const parsed = readRealTrendsRanking(input, page.url, text);
      if (parsed) {
        ranking = parsed;
        facts.push(`RealTrends reports city sides rank ${parsed.citySidesRank}, ${parsed.sides} sides and $${parsed.volumeMillions}M volume, based on ${parsed.year} sales data.`);
      }
      // Only a directly attached annual claim. Do not total listing prices or merge quarters/years.
      for (const match of text.matchAll(/\$([\d.]+)\s*(?:million|M)\s+(?:in\s+(?:sales\s+in\s+)?|for\s+)(20\d{2})\b/gi)) {
        const amount = Number(match[1]), year = Number(match[2]);
        if (amount > 0 && year <= new Date().getUTCFullYear() && !annualClaims.some(c => c.url === page.url && c.year === year && c.amount === amount)) {
          annualClaims.push({ amount, year, url: page.url });
          facts.push(`This page states $${amount}M for ${year}; attribution and coverage need confirmation.`);
        }
      }
    }
    return { role: page.role, url: page.url, observedAt, status: matched ? "matched" : "unmatched",
      note: matched ? "Text matched the supplied identity and locale. Statements retain their source attribution." : "The supplied name and locale did not both match. Inspect this page manually before using its claims.",
      contentHash: createHash("sha256").update(text).digest("hex"), facts: facts.slice(0, 6) };
  });
  // Assignment occurs inside the map; explicitly narrow the collected result.
  const rank = ranking as RankingFact | null;
  const conflicts = rank ? annualClaims.filter(c => c.year === rank.year && rank.volumeMillions !== undefined && Math.abs(c.amount - rank.volumeMillions) > 0.01)
    .map(c => `${c.url} states $${c.amount}M for ${c.year}; RealTrends reports $${rank.volumeMillions}M. Confirm reporting scope, credit, and cutoff before publishing a volume comparison.`) : [];
  return { input, sources, ranking: rank, conflicts, version: "guide-1.0",
    recommendedClaim: rank ? `${input.name} ranked No. ${rank.citySidesRank} by transaction sides among RealTrends-ranked agents in ${rank.city}, based on ${rank.year} sales data.` : null };
}

function buildSteps(a: GuideAnalysis): GuideStep[] {
  const { input: i, sources } = a;
  const matched = sources.filter(s => s.status === "matched");
  const urls = matched.map(s => s.url);
  const website = sources.find(s => s.role === "website");
  const broker = sources.find(s => s.role === "broker");
  const city = i.area.split(",")[0];
  const identity = `${i.name} | ${i.area}${i.brokerage ? " | " + i.brokerage : ""}`;
  return [
    {
      id: "claims", title: a.conflicts.length ? "Resolve conflicting numbers before amplifying them" : a.recommendedClaim ? "Turn your ranking into a precise, citable claim" : "Establish one defensible authority claim",
      priority: "First", owner: "Agent + broker reviewer", effort: "20–40 minutes",
      why: a.recommendedClaim ? "A scoped ranking is a concrete asset. Removing its year or ranking population changes its meaning." : "An unsupported superlative is not an authority signal. Start with a named source and the exact fact it supports.",
      instructions: [
        ...(a.conflicts.length ? a.conflicts : []),
        a.recommendedClaim ? "Use this source-attributed wording after your review: " + a.recommendedClaim : "Open your ranking, professional association, or brokerage profile. Record the named subject, fact, year, category, geography and source URL. If no award exists, use supported experience or an authorized case outcome; do not invent a rank.",
        a.ranking ? "Link the sentence directly to " + a.ranking.url + ". Keep the year and publisher visible next to it." : "Add the exact public source URL above and rebuild the guide. A broker profile can support affiliation even when it contains no ranking.",
        "Do not translate sides into unique transactions, 'most trusted,' best service, or more transactions than every agent. Have your broker review any comparative advertising.",
      ],
      doneWhen: "Each reused claim has a named source, a defined period and scope, and no unresolved numerical conflict.", sources: a.ranking ? [a.ranking.url] : urls,
    },
    {
      id: "identity", title: "Make your identity consistent across your strongest pages",
      priority: "First", owner: "Agent + broker profile editor", effort: "30–60 minutes",
      why: broker?.status === "matched" ? "Your supplied website and broker page offer two places to connect the same identity." : "A consistent personal-to-broker profile connection gives readers and retrieval systems an explicit identity trail.",
      instructions: [
        "Use this identity line as the starting point, after checking its details: " + identity + ".",
        "On " + i.website + ", put your name, actual service area, brokerage, contact information and required license disclosures in visible text.",
        broker?.status === "matched" ? "Ask the broker editor to reconcile the bio on " + broker.url + " with your current name, affiliation and website link." : "Find your exact profile on the brokerage website. Request a correction or a profile if it is missing; a brokerage homepage is not proof about an individual.",
        "Link your personal biography to the exact broker profile and your named ranking source. Request a reciprocal personal-site link where the broker permits it.",
      ],
      doneWhen: "A reader can follow the personal profile, broker profile and named evidence without guessing which person or period is intended.", sources: urls,
    },
    {
      id: "answer", title: "Build one useful local answer around an asset you can prove",
      priority: "Next", owner: "Agent + website editor", effort: "1–2 hours",
      why: "A fact becomes more useful when it helps a prospective client answer a specific question. A ranking alone does not explain how you work.",
      instructions: [
        `Choose one question a real client asks in ${city}, such as 'What should a seller prepare before listing a home in ${city}?'`,
        "Write a direct answer first, then 3–5 practical steps from your actual process. Add a named author, a reviewed date and links to the sources supporting factual claims.",
        a.recommendedClaim ? "Use the scoped ranking once in the author biography as context; explain the relevant process separately and support it with an authorized case." : "Use a permitted, specific example of your work. Separate the client's reported experience from facts documented by a third party.",
        "Link the page from your biography and a relevant service page. Keep the answer available as readable text, not only an image or downloadable brochure.",
      ],
      doneWhen: "One accessible page answers a genuine local question and distinguishes sourced facts from your advice.", sources: urls,
    },
    {
      id: "placement", title: "Place your evidence where an answer can cite it",
      priority: "Next", owner: "Website editor", effort: "45–90 minutes",
      why: "Clear fact-to-source placement makes it easier to check and quote the right claim without losing its qualifiers.",
      instructions: [
        "On the biography page at " + i.website + ", add a short 'Experience and recognition' section. Keep each achievement beside its source, category and year.",
        "If using production figures, state whether they count transaction sides, distinct sales, team results or individual credit. Do not sum sold-listing asking prices.",
        "Add a compact evidence table: claim | period | scope | publisher | source link | date reviewed. Leave unresolved entries unpublished.",
        "Request permission before reproducing award badges, client stories, reviews or brokerage-owned material. A link is not a license to copy.",
      ],
      doneWhen: "Every published numerical or comparative claim has an adjacent working link and its original qualifiers.", sources: urls,
    },
    {
      id: "technical", title: "Give your editor a practical discovery checklist",
      priority: "Next", owner: "Website administrator", effort: "45–90 minutes",
      why: website?.status === "matched" ? "CiteLock could read identity text from your page. That is not an indexing or crawler-access audit." : "CiteLock could not match usable identity text on the supplied website. Rendering and crawl access are worth checking first.",
      instructions: [
        "Ask the editor to test the exact biography and local-answer URLs for HTTP 200, readable text, a sensible canonical URL, internal links, and unintended noindex or robots restrictions.",
        "Use Google Search Console URL Inspection to check indexing and rendered content. Resolve the reported issue before requesting indexing; acceptance is not guaranteed.",
        "Check that any Person or Organization structured data matches visible facts and links only to your actual profiles. Do not add unsupported ratings or special 'AI ranking' markup.",
        "Check relevant AI search crawler policies deliberately. Do not assume allowing a crawler guarantees recommendation or citation; no special AI text file is required by Google's guidance.",
      ],
      doneWhen: "The editor records actual inspection results and fixes blockers on the exact target pages.", sources: [i.website, METHOD],
    },
    {
      id: "coverage", title: "Close the most valuable profile gaps",
      priority: "Then", owner: "Agent / office administrator", effort: "1–2 hours",
      why: "The strongest next profile is one clients or measured answers already use, with accurate information you can maintain.",
      instructions: [
        "Start with your brokerage profile, eligible Google Business Profile and the ranking publisher already naming you. Review affiliation, contact, locale and link accuracy.",
        "Use the optional 'Where you show up' measurement to see actual cited directories before paying for another placement. Prioritize a missing or incorrect profile that appears repeatedly in comparable answers.",
        "Request corrections through each publisher's official process. Keep the request date, changed URL and supporting evidence; do not create fake reviews or duplicate locations.",
        "Review quarterly and after a brokerage move or new ranking year. Treat syndicated copies as one underlying claim, not independent corroboration.",
      ],
      doneWhen: "Your three highest-priority profiles have an owner, correct facts and a recorded review date.", sources: urls,
    },
    {
      id: "social", title: "Use social posts to lead people to the evidence",
      priority: "Then", owner: "Agent / social editor", effort: "30–45 minutes",
      why: "A social post can explain a useful local answer and route people to the maintained source page. Posting alone does not establish LLM lift.",
      instructions: [
        "In Social Desk, create a short post from the local-answer page: one useful takeaway, one source-attributed fact if relevant, and the page URL.",
        "Retain the publisher and production year when referencing a ranking. Resolve any volume discrepancy before including figures.",
        "Use only authorized photos and client quotations. Review facts, housing-related language and image rights before approving.",
        "Publish manually or use an explicitly connected scheduler. Record the real post URL, referral clicks and qualified inquiries; do not count a saved draft as published reach.",
      ],
      doneWhen: "An approved post links to the actual evidence page and its real publication receipt is recorded.", sources: urls,
    },
    {
      id: "measurement", title: "Measure a baseline and repeat the same questions",
      priority: "Then", owner: "Agent / marketing analyst", effort: "30 minutes, then weekly",
      why: "A useful guide is not proof of a visibility increase. Comparable observations let you learn whether people and engines find your assets.",
      instructions: [
        `Before editing, save answers to the same unbranded local questions, such as 'Which real estate agents serve sellers in ${city}?' and 'How should I select an agent for a home sale in ${city}?'`,
        "Record the exact prompt, provider surface, model/preset, date, recommended names, cited URLs and failed answers. Report counts with denominators, not an invented GEO score.",
        "After the pages are live and available for crawling, repeat the same basket weekly for four weeks. Keep provider/model and identity definitions fixed; annotate every content change.",
        "Track source-page referrals and qualified leads alongside mention/citation counts. A before/after change is an observation, not proof your edit caused it.",
      ],
      doneWhen: "A dated baseline and at least one comparable follow-up include raw answers, citations and failures.", sources: [],
    },
    {
      id: "plan", title: "Run a four-week improvement cycle",
      priority: "Then", owner: "Agent + editor", effort: "Weekly review",
      why: "A small number of maintained, useful assets is a more manageable operating plan than mass-producing thin local pages.",
      instructions: [
        "Week 1: resolve disputed figures, reconcile identity and capture the baseline. Assign one owner and due date to each correction.",
        "Week 2: publish one reviewed local-answer page and its source-linked biography changes. Save exact URLs and publication dates.",
        "Week 3: complete the broker/profile correction requests and share the useful answer through your existing social audience.",
        "Week 4: review comparable measurements and client inquiries. Continue the changes with evidence of usefulness; revise unsupported assumptions and schedule the next source review.",
      ],
      doneWhen: "The workspace has a dated change log, completed actions and a documented next decision.", sources: urls,
    },
  ];
}

type Row = { id: string; analysis: GuideAnalysis; completed_step_ids: string[]; created_at: Date | string };
async function view(userId: string, workspaceId: string, row: Row, sql: Sql): Promise<GuideView> {
  const full = (await getEntitlement(userId, workspaceId, sql)).active;
  const all = buildSteps(row.analysis);
  const steps = full ? all : all.slice(0, 3);
  return { id: row.id, createdAt: new Date(row.created_at).toISOString(), tier: full ? "full" : "basic",
    analysis: row.analysis, steps, lockedStepCount: all.length - steps.length,
    completedStepIds: row.completed_step_ids.filter(id => steps.some(step => step.id === id)),
    limitations: LIMITS, methodologyUrl: METHOD };
}
export async function createGuide(userId: string, workspaceId: string, raw: GuideInput, deps: { sql?: Sql; fetchPage?: typeof fetchPublicPage } = {}) {
  const input = guideInputSchema.parse(raw);
  const sql = deps.sql || await getSql();
  await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  const quota = await sql.query(
    `insert into citelock_visibility_quota_buckets(scope,window_started_at,count) values($1,date_trunc('day',now()),1)
     on conflict(scope,window_started_at) do update set count=citelock_visibility_quota_buckets.count+1
     where citelock_visibility_quota_buckets.count<3 returning count`, [`workspace:${workspaceId}:guides`]);
  if (!quota.length) throw new Error("Guide limit reached: three source inspections per workspace per day. Your saved guides remain available.");
  const assets: Array<{role: GuideSource["role"]; url: string}> = [
    {role:"website",url:input.website},
    ...(input.brokerUrl ? [{role:"broker" as const,url:input.brokerUrl}] : []),
    ...(input.rankingUrl ? [{role:"ranking" as const,url:input.rankingUrl}] : []),
    ...(input.additionalUrl ? [{role:"additional" as const,url:input.additionalUrl}] : []),
  ];
  const cache = new Map<string, Promise<{text:string;url:string}>>();
  const pages = await Promise.all(assets.map(async asset => {
    try {
      if (!cache.has(asset.url)) cache.set(asset.url, (deps.fetchPage || fetchPublicPage)(asset.url));
      const page = await cache.get(asset.url)!;
      return { ...asset, url: page.url, text: page.text };
    } catch { return { ...asset, error: true }; }
  }));
  const analysis = analyzeGuidePages(input, pages, new Date().toISOString());
  const rows = await sql.query<Row>(
    "insert into citelock_guides(id,workspace_id,created_by_user_id,analysis) values($1,$2,$3,$4::jsonb) returning *",
    [randomUUID(), workspaceId, userId, JSON.stringify(analysis)]);
  return view(userId, workspaceId, rows[0], sql);
}
export async function listGuides(userId: string, workspaceId: string, sqlOverride?: Sql) {
  const sql = sqlOverride || await getSql();
  await requireWorkspaceAccess(userId, workspaceId, undefined, sql);
  const rows = await sql.query<Row>("select * from citelock_guides where workspace_id=$1 order by created_at desc,id desc limit 10", [workspaceId]);
  return Promise.all(rows.map(row => view(userId, workspaceId, row, sql)));
}
export async function setGuideStep(userId: string, workspaceId: string, id: string, stepId: string, complete: boolean, sqlOverride?: Sql) {
  const sql = sqlOverride || await getSql();
  await requireWorkspaceAccess(userId, workspaceId, ["owner","admin"], sql);
  return sql.transaction(async tx => {
    const rows = await tx.query<Row>("select * from citelock_guides where workspace_id=$1 and id=$2 for update", [workspaceId,id]);
    if (!rows[0]) throw new Error("Guide not found");
    const allowed = await view(userId,workspaceId,rows[0],tx);
    if (!allowed.steps.some(step => step.id === stepId)) throw new Error("This step requires full access or does not exist.");
    const done = new Set(rows[0].completed_step_ids);
    if (complete) done.add(stepId); else done.delete(stepId);
    const updated = await tx.query<Row>("update citelock_guides set completed_step_ids=$3::jsonb where workspace_id=$1 and id=$2 returning *", [workspaceId,id,JSON.stringify([...done])]);
    return view(userId,workspaceId,updated[0],tx);
  });
}


export async function getGuide(userId: string, workspaceId: string, id: string, sqlOverride?: Sql) {
  const sql=sqlOverride || await getSql();
  await requireWorkspaceAccess(userId,workspaceId,undefined,sql);
  const rows=await sql.query<Row>("select * from citelock_guides where workspace_id=$1 and id=$2",[workspaceId,id]);
  if(!rows[0]) throw new Error("Guide not found");
  return view(userId,workspaceId,rows[0],sql);
}
