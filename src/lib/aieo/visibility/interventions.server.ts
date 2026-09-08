/**
 * Interventions: the improvement package behind an observed opportunity.
 *
 * Content is drafted only from facts the agent has declared or CiteLock has
 * observed (scan evidence), is stored as `proposed`, must be approved by a
 * human, and — once the agent deploys it — is verified against the live page
 * before it can be called "verified". Nothing here publishes anywhere.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import { requireEntitlement } from "@/lib/billing/entitlement.server";
import { readResponseText, safeFetch } from "@/lib/safe-outbound-url.server";
import { completeJson, textGenerationConfigured } from "@/lib/ai-text.server";
import { getLatestCiteLockScan } from "../repository.server";
import { directoryLabel } from "./evaluate";
import type { VisibilitySubject } from "./basket";
import type { Opportunity } from "./report";

export const interventionKindSchema = z.enum(["site_page", "profile_claim", "faq", "social"]);
export type InterventionKind = z.infer<typeof interventionKindSchema>;

export type Intervention = {
  id: string;
  subjectFingerprint: string;
  opportunityKey: string;
  kind: InterventionKind;
  title: string;
  targetUrl: string | null;
  content: string;
  facts: string[];
  state: "proposed" | "approved" | "deployed" | "verified" | "dismissed";
  draftedWith: string | null;
  socialDraftId: string | null;
  approvedAt: string | null;
  deployedUrl: string | null;
  verifiedAt: string | null;
  verificationNote: string | null;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  subject_fingerprint: string;
  opportunity_key: string;
  kind: InterventionKind;
  title: string;
  target_url: string | null;
  content: string;
  facts: string[] | string;
  state: Intervention["state"];
  drafted_with: string | null;
  social_draft_id: string | null;
  approved_at: string | Date | null;
  deployed_url: string | null;
  verified_at: string | Date | null;
  verification_note: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

const iso = (value: string | Date | null) =>
  value ? (value instanceof Date ? value.toISOString() : new Date(value).toISOString()) : null;

function toIntervention(row: Row): Intervention {
  let facts: string[] = [];
  if (typeof row.facts === "string") {
    try {
      facts = JSON.parse(row.facts) as string[];
    } catch {
      facts = [];
    }
  } else facts = row.facts;
  return {
    id: row.id,
    subjectFingerprint: row.subject_fingerprint,
    opportunityKey: row.opportunity_key,
    kind: row.kind,
    title: row.title,
    targetUrl: row.target_url,
    content: row.content,
    facts,
    state: row.state,
    draftedWith: row.drafted_with,
    socialDraftId: row.social_draft_id,
    approvedAt: iso(row.approved_at),
    deployedUrl: row.deployed_url,
    verifiedAt: iso(row.verified_at),
    verificationNote: row.verification_note,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

/** Facts CiteLock can stand behind for this subject: evidence values + declared facts. */
export async function collectSubjectFacts(
  userId: string,
  workspaceId: string,
  subjectFingerprint: string,
  subject: VisibilitySubject,
  declaredFacts: string[],
  sql: Sql,
): Promise<string[]> {
  const facts = new Set<string>();
  facts.add(`Name: ${subject.name}`);
  facts.add(`Market served: ${subject.area}`);
  if (subject.brokerage) facts.add(`Brokerage: ${subject.brokerage}`);
  if (subject.websiteHost) facts.add(`Website: https://${subject.websiteHost}`);
  const scan = await getLatestCiteLockScan(userId, workspaceId, subjectFingerprint, sql);
  for (const item of scan?.evidence || []) {
    if (item.status === "verified" && item.field === "license")
      facts.add(`License ${item.value} verified with ${item.sourceLabel} on ${item.observedAt?.slice(0, 10) || "record date"}`);
    if (item.status === "verified" && item.field === "responsible_broker")
      facts.add(`Responsible broker of record: ${item.value}`);
    if (item.field === "listing_status" && item.claimScope?.startsWith("address:"))
      facts.add(`Listing observed on the agent website: ${item.claimScope.slice(8)} (${item.value})`);
  }
  if (scan?.profilePatch.bio) facts.add(`Published bio: ${scan.profilePatch.bio.slice(0, 400)}`);
  for (const fact of declaredFacts) {
    const trimmed = fact.trim();
    if (trimmed) facts.add(trimmed.slice(0, 400));
  }
  return [...facts].slice(0, 40);
}

const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    content: { type: "string" },
    factsUsed: { type: "array", items: { type: "string" } },
    unsupportedClaimsAvoided: { type: "array", items: { type: "string" } },
  },
  required: ["title", "content", "factsUsed", "unsupportedClaimsAvoided"],
} as const;

type DraftOutput = {
  title: string;
  content: string;
  factsUsed: string[];
  unsupportedClaimsAvoided: string[];
};

function checklistForDirectory(subject: VisibilitySubject, host: string, label: string): string {
  return [
    `# Claim and complete your ${label}`,
    "",
    `Engines cited ${host} when answering unbranded questions about ${subject.area}. A complete, consistent profile there is a source they can quote.`,
    "",
    "## Checklist",
    `- [ ] Claim the profile for ${subject.name}${subject.brokerage ? ` at ${subject.brokerage}` : ""}.`,
    `- [ ] Use the exact same name, brokerage, phone, and website${subject.websiteHost ? ` (https://${subject.websiteHost})` : ""} as your site.`,
    `- [ ] Set the service area to ${subject.area} and the neighborhoods you actually serve.`,
    "- [ ] Write a first-person description of how you work, using only facts you can support.",
    "- [ ] Add your license number where the profile allows it.",
    "- [ ] Link the profile from your website (sameAs) and paste the public URL back into CiteLock so the next batch can count it.",
    "",
    "Do not add reviews you did not receive, production figures you cannot document, or rankings.",
  ].join("\n");
}

export async function draftIntervention(
  userId: string,
  workspaceId: string,
  input: {
    subjectFingerprint: string;
    subject: VisibilitySubject;
    opportunity: Opportunity;
    kind: InterventionKind;
    declaredFacts: string[];
  },
  sqlOverride?: Sql,
): Promise<Intervention> {
  const sql = sqlOverride || (await getSql());
  const workspace = await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  await requireEntitlement(userId, workspace.id, sql);
  const facts = await collectSubjectFacts(
    userId,
    workspace.id,
    input.subjectFingerprint,
    input.subject,
    input.declaredFacts,
    sql,
  );

  let title = input.opportunity.title;
  let content: string;
  let draftedWith: string | null = null;
  let targetUrl: string | null = null;

  if (input.kind === "profile_claim") {
    const host = input.opportunity.targetHost || "the directory";
    const label = input.opportunity.targetLabel || directoryLabel(host) || host;
    content = checklistForDirectory(input.subject, host, label);
    targetUrl = `https://${host}`;
    draftedWith = "checklist";
  } else {
    if (!textGenerationConfigured())
      throw new Error("Drafting needs XAI_API_KEY on the server. Add it, or write the page yourself from the facts list.");
    const guidance =
      input.kind === "faq"
        ? "Write 4-6 question/answer pairs a prospective client would ask, each answer 2-4 sentences."
        : input.kind === "social"
          ? "Write one social post (max 900 characters) plus two alternative hooks."
          : "Write a first-person web page (500-800 words) with an H1, short sections with H2s, and a closing call to contact the agent.";
    const drafted = await completeJson<DraftOutput>({
      system: [
        "You draft factual marketing content for a licensed real estate agent.",
        "Use ONLY the facts provided. Never invent transactions, rankings, awards, reviews, testimonials, statistics, years of experience, or service claims not in the facts.",
        "If a useful claim is not supported by the facts, list it under unsupportedClaimsAvoided instead of writing it.",
        "Avoid any language that could violate fair-housing law: do not reference protected classes, family status, religion, or describe neighborhoods by who lives there.",
        "Write in plain, specific, first-person English. No hype adjectives.",
        guidance,
      ].join(" "),
      user: [
        `Opportunity: ${input.opportunity.title}`,
        `Why: ${input.opportunity.why}`,
        `Client intents this should answer: ${input.opportunity.clusterIds.join(", ")}`,
        "",
        "FACTS:",
        ...facts.map((fact) => `- ${fact}`),
      ].join("\n"),
      schemaName: "intervention_draft",
      schema: DRAFT_SCHEMA,
    });
    title = drafted.value.title.trim().slice(0, 160) || title;
    content = [
      drafted.value.content.trim(),
      "",
      "---",
      "Facts used:",
      ...drafted.value.factsUsed.map((fact) => `- ${fact}`),
      ...(drafted.value.unsupportedClaimsAvoided.length
        ? ["", "Claims deliberately NOT made (no supporting fact):", ...drafted.value.unsupportedClaimsAvoided.map((claim) => `- ${claim}`)]
        : []),
    ].join("\n");
    draftedWith = drafted.model;
    targetUrl = input.subject.websiteHost ? `https://${input.subject.websiteHost}` : null;
  }

  const rows = await sql.query<Row>(
    `insert into citelock_interventions (
       id, workspace_id, subject_fingerprint, opportunity_key, kind, title, target_url,
       content, facts, drafted_with, created_by_user_id
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11) returning *`,
    [
      randomUUID(),
      workspace.id,
      input.subjectFingerprint,
      input.opportunity.key,
      input.kind,
      title,
      targetUrl,
      content,
      JSON.stringify(facts),
      draftedWith,
      userId,
    ],
  );
  return toIntervention(rows[0]!);
}

export async function listInterventions(
  userId: string,
  workspaceId: string,
  subjectFingerprint: string,
  sqlOverride?: Sql,
): Promise<Intervention[]> {
  const sql = sqlOverride || (await getSql());
  const workspace = await requireWorkspaceAccess(userId, workspaceId, undefined, sql);
  const rows = await sql.query<Row>(
    `select * from citelock_interventions
      where workspace_id = $1 and subject_fingerprint = $2
      order by updated_at desc limit 100`,
    [workspace.id, subjectFingerprint],
  );
  return rows.map(toIntervention);
}

export const interventionCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), content: z.string().trim().min(1).max(20_000), title: z.string().trim().min(1).max(160) }),
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("dismiss") }),
  z.object({
    action: z.literal("deployed"),
    url: z.string().trim().url().max(1000),
  }),
]);
export type InterventionCommand = z.infer<typeof interventionCommandSchema>;

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Pick a distinctive sentence from approved content to look for on the live page. */
export function verificationSignature(content: string): string[] {
  const body = content.split("\n---\n")[0] || content;
  const sentences = body
    .replace(/^#+\s.*$/gm, "")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/[*_`#>-]/g, "").trim())
    .filter((sentence) => sentence.length >= 40 && sentence.length <= 220);
  return sentences.slice(0, 3);
}

export async function applyInterventionCommand(
  userId: string,
  workspaceId: string,
  id: string,
  command: InterventionCommand,
  dependencies: { sql?: Sql; fetchPage?: (url: string) => Promise<string> } = {},
): Promise<Intervention> {
  const sql = dependencies.sql || (await getSql());
  const workspace = await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  const rows = await sql.query<Row>(
    `select * from citelock_interventions where id = $1 and workspace_id = $2`,
    [id, workspace.id],
  );
  const current = rows[0];
  if (!current) throw new Error("Intervention not found");

  if (command.action === "edit") {
    if (current.state === "verified") throw new Error("A verified intervention cannot be edited; draft a new one.");
    const updated = await sql.query<Row>(
      `update citelock_interventions set title = $3, content = $4, state = 'proposed',
              approved_by = null, approved_at = null, deployed_url = null, verified_at = null,
              verification_note = null, updated_at = now()
        where id = $1 and workspace_id = $2 returning *`,
      [id, workspace.id, command.title, command.content],
    );
    return toIntervention(updated[0]!);
  }
  if (command.action === "approve") {
    if (current.state !== "proposed") throw new Error("Only a proposed draft can be approved");
    const updated = await sql.query<Row>(
      `update citelock_interventions set state = 'approved', approved_by = $3, approved_at = now(), updated_at = now()
        where id = $1 and workspace_id = $2 returning *`,
      [id, workspace.id, userId],
    );
    return toIntervention(updated[0]!);
  }
  if (command.action === "dismiss") {
    const updated = await sql.query<Row>(
      `update citelock_interventions set state = 'dismissed', updated_at = now()
        where id = $1 and workspace_id = $2 returning *`,
      [id, workspace.id],
    );
    return toIntervention(updated[0]!);
  }
  // deployed: fetch the live page and look for the approved content.
  if (current.state !== "approved" && current.state !== "deployed")
    throw new Error("Approve the draft before marking it deployed");
  const fetchPage =
    dependencies.fetchPage ||
    (async (url: string) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const { response } = await safeFetch(
          url,
          { signal: controller.signal, headers: { Accept: "text/html", "User-Agent": "CiteLock-Verification/2.0" } },
          { allowCrossOriginRedirects: false, maxRedirects: 2 },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return readResponseText(response, 2 * 1024 * 1024);
      } finally {
        clearTimeout(timer);
      }
    });
  let note: string;
  let verified = false;
  try {
    const html = await fetchPage(command.url);
    const page = normalizeForMatch(html);
    const signatures = verificationSignature(current.content).map(normalizeForMatch);
    const nameFound = page.includes(normalizeForMatch(current.title)) || signatures.length === 0;
    const matched = signatures.filter((signature) => signature && page.includes(signature));
    verified = signatures.length > 0 ? matched.length > 0 : nameFound;
    note = verified
      ? `Live page contains ${matched.length}/${signatures.length} approved sentences (checked ${new Date().toISOString().slice(0, 16)}Z).`
      : `Live page fetched, but none of ${signatures.length} approved sentences were found. Publish the approved text, then re-check.`;
  } catch (error) {
    note = `Could not fetch the page: ${error instanceof Error ? error.message : "unknown error"}`;
  }
  const updated = await sql.query<Row>(
    `update citelock_interventions
        set state = $3, deployed_url = $4, verified_at = case when $3 = 'verified' then now() else null end,
            verification_note = $5, updated_at = now()
      where id = $1 and workspace_id = $2 returning *`,
    [id, workspace.id, verified ? "verified" : "deployed", command.url, note],
  );
  return toIntervention(updated[0]!);
}
