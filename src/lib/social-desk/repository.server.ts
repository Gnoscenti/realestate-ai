import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import {
  socialContentSchema,
  socialCommandSchema,
  validatePostUrl,
  type SocialContent,
  type SocialDraft,
  type SocialCommand,
  type SocialPublication,
} from "./types";
import { hasBlockingFinding, reviewCaption } from "./fair-housing";
import {
  createPostizPost,
  getPostizPostStatus,
  loadPostizConnection,
  uploadMediaToPostiz,
  type PostizChannel,
} from "./postiz.server";

type Row = {
  id: string;
  revision: number;
  content: SocialContent | string;
  state: SocialDraft["state"];
  approved_by: string | null;
  approved_at: Date | string | null;
  post_url: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};
const iso = (value: Date | string) => new Date(value).toISOString();

function parseContent(value: SocialContent | string): SocialContent {
  const raw = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  // Older rows predate mediaUrls/origin; the schema fills defaults.
  return socialContentSchema.parse({ mediaUrls: [], origin: "", ...(raw as object) });
}

function toDraft(row: Row): SocialDraft {
  return {
    id: row.id,
    revision: row.revision,
    content: parseContent(row.content),
    state: row.state,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at ? iso(row.approved_at) : null,
    postUrl: row.post_url,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

type PublicationRow = {
  id: string;
  draft_id: string;
  revision: number;
  provider: "postiz";
  channel_id: string;
  channel_name: string | null;
  channel_platform: string | null;
  provider_post_id: string | null;
  status: SocialPublication["status"];
  scheduled_for: Date | string | null;
  release_url: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function toPublication(row: PublicationRow): SocialPublication {
  return {
    id: row.id,
    draftId: row.draft_id,
    revision: row.revision,
    provider: row.provider,
    channelId: row.channel_id,
    channelName: row.channel_name,
    channelPlatform: row.channel_platform,
    providerPostId: row.provider_post_id,
    status: row.status,
    scheduledFor: row.scheduled_for ? iso(row.scheduled_for) : null,
    releaseUrl: row.release_url,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

async function access(userId: string, workspaceId: string, sqlOverride?: Sql, roles?: ("owner" | "admin" | "member")[]) {
  const sql = sqlOverride || (await getSql());
  await requireWorkspaceAccess(userId, workspaceId, roles, sql);
  return sql;
}

export async function listSocialDrafts(userId: string, workspaceId: string, sqlOverride?: Sql): Promise<SocialDraft[]> {
  const sql = await access(userId, workspaceId, sqlOverride);
  const rows = await sql.query<Row>(
    "select * from social_drafts where workspace_id = $1 order by updated_at desc limit 100",
    [workspaceId],
  );
  return rows.map(toDraft);
}

export async function getSocialDraft(userId: string, workspaceId: string, id: string, sqlOverride?: Sql): Promise<SocialDraft> {
  z.uuid().parse(id);
  const sql = await access(userId, workspaceId, sqlOverride);
  const rows = await sql.query<Row>("select * from social_drafts where workspace_id = $1 and id = $2", [workspaceId, id]);
  if (!rows[0]) throw new Error("Draft not found");
  return toDraft(rows[0]);
}

export async function createSocialDraft(
  userId: string,
  workspaceId: string,
  input: SocialContent,
  sqlOverride?: Sql,
): Promise<SocialDraft> {
  const content = socialContentSchema.parse(input);
  const sql = await access(userId, workspaceId, sqlOverride, ["owner", "admin"]);
  const rows = await sql.query<Row>(
    `with changed as (
       insert into social_drafts (id, workspace_id, content) values ($1, $2, $3::jsonb) returning *
     ), event as (
       insert into social_draft_events (workspace_id, draft_id, revision, actor_user_id, action, snapshot)
       select workspace_id, id, revision, $4, 'create', to_jsonb(changed) from changed
     ) select * from changed`,
    [randomUUID(), workspaceId, JSON.stringify(content), userId],
  );
  return toDraft(rows[0]!);
}

export async function changeSocialDraft(
  userId: string,
  workspaceId: string,
  id: string,
  revision: number,
  input: SocialCommand,
  sqlOverride?: Sql,
): Promise<SocialDraft> {
  z.uuid().parse(id);
  z.number().int().positive().max(2147483646).parse(revision);
  const command = socialCommandSchema.parse(input);
  const sql = await access(userId, workspaceId, sqlOverride, ["owner", "admin"]);
  const rows = await sql.query<Row>("select * from social_drafts where workspace_id = $1 and id = $2", [workspaceId, id]);
  const current = rows[0];
  if (!current) throw new Error("Draft not found");
  if (current.revision !== revision) throw new Error("This draft changed in another tab. Reload before continuing.");
  if (command.action === "approve" && current.state !== "draft") throw new Error("Only a draft can be approved");
  if (command.action === "approve") {
    const findings = reviewCaption(parseContent(current.content).caption);
    if (hasBlockingFinding(findings))
      throw new Error("Resolve the blocking fair-housing findings before approving");
  }
  if ((command.action === "handoff" || command.action === "receipt") && current.state === "draft")
    throw new Error("Approve this revision first");
  if (command.action === "receipt" && current.state !== "handed_off")
    throw new Error("Prepare a handoff before recording a post");
  if (command.action === "handoff" && (current.state === "reported_posted" || current.state === "published" || current.state === "scheduled"))
    throw new Error("This revision was already posted; edit a new revision first");
  if (command.action === "edit" && current.state === "scheduled")
    throw new Error("This revision is scheduled with your scheduler. Cancel it there before editing.");
  const content = command.action === "edit" ? command.content : parseContent(current.content);
  const state =
    command.action === "edit"
      ? "draft"
      : command.action === "approve"
        ? "approved"
        : command.action === "handoff"
          ? "handed_off"
          : "reported_posted";
  const approvedBy = command.action === "edit" ? null : command.action === "approve" ? userId : current.approved_by;
  const approvedAt =
    command.action === "edit" ? null : command.action === "approve" ? new Date().toISOString() : current.approved_at;
  const postUrl = command.action === "receipt" ? validatePostUrl(content.platform, command.postUrl) : null;
  // Conditional mutation + audit event are one statement. A concurrent edit
  // cannot approve, export, or record a receipt for stale text.
  const changed = await sql.query<Row>(
    `with changed as (
       update social_drafts set content = $4::jsonb, state = $5, approved_by = $6,
         approved_at = $7, post_url = $8, revision = revision + 1, updated_at = now()
       where workspace_id = $1 and id = $2 and revision = $3 returning *
     ), event as (
       insert into social_draft_events (workspace_id, draft_id, revision, actor_user_id, action, snapshot)
       select workspace_id, id, revision, $9, $10, to_jsonb(changed) from changed
     ) select * from changed`,
    [workspaceId, id, revision, JSON.stringify(content), state, approvedBy, approvedAt, postUrl, userId, command.action],
  );
  if (!changed[0]) throw new Error("This draft changed in another tab. Reload before continuing.");
  return toDraft(changed[0]);
}

export async function socialDraftHistory(userId: string, workspaceId: string, id: string, sqlOverride?: Sql) {
  z.uuid().parse(id);
  const sql = await access(userId, workspaceId, sqlOverride);
  const rows = await sql.query<{ revision: number; action: string; created_at: Date | string }>(
    "select revision, action, created_at from social_draft_events where workspace_id = $1 and draft_id = $2 order by revision desc limit 100",
    [workspaceId, id],
  );
  return rows.map((row) => ({ revision: row.revision, action: row.action, createdAt: iso(row.created_at) }));
}

export async function listPublications(userId: string, workspaceId: string, sqlOverride?: Sql): Promise<SocialPublication[]> {
  const sql = await access(userId, workspaceId, sqlOverride);
  const rows = await sql.query<PublicationRow>(
    "select * from social_draft_publications where workspace_id = $1 order by created_at desc limit 200",
    [workspaceId],
  );
  return rows.map(toPublication);
}

export const publishRequestSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().positive(),
  channelId: z.string().trim().min(1).max(200),
  /** ISO timestamp; omit to publish as soon as the scheduler runs it. */
  scheduledFor: z.string().datetime().optional(),
});
export type PublishRequest = z.infer<typeof publishRequestSchema>;

export type PublishDependencies = {
  sql?: Sql;
  channels?: (connection: { apiUrl: string; apiKey: string }) => Promise<PostizChannel[]>;
  upload?: typeof uploadMediaToPostiz;
  create?: typeof createPostizPost;
};

/**
 * Publish or schedule an approved revision through the workspace's Postiz
 * connection. The draft moves to `scheduled` only after Postiz accepted it;
 * a rejected request is recorded as a failed publication and the draft stays
 * approved so nothing is lost.
 */
export async function publishSocialDraft(
  userId: string,
  workspaceId: string,
  request: PublishRequest,
  dependencies: PublishDependencies = {},
): Promise<{ draft: SocialDraft; publication: SocialPublication }> {
  const input = publishRequestSchema.parse(request);
  const sql = await access(userId, workspaceId, dependencies.sql, ["owner", "admin"]);
  const rows = await sql.query<Row>("select * from social_drafts where workspace_id = $1 and id = $2", [workspaceId, input.id]);
  const current = rows[0];
  if (!current) throw new Error("Draft not found");
  if (current.revision !== input.revision) throw new Error("This draft changed in another tab. Reload before continuing.");
  if (current.state !== "approved" && current.state !== "handed_off")
    throw new Error("Approve this revision before publishing");
  const content = parseContent(current.content);
  if (hasBlockingFinding(reviewCaption(content.caption)))
    throw new Error("Resolve the blocking fair-housing findings before publishing");
  const connection = await loadPostizConnection(userId, workspaceId, sql);
  if (!connection) throw new Error("Connect your Postiz workspace first (Social desk → Publishing)");
  const channels = await (dependencies.channels
    ? dependencies.channels(connection)
    : (await import("./postiz.server")).listPostizChannels(connection));
  const channel = channels.find((item) => item.id === input.channelId);
  if (!channel) throw new Error("That channel is no longer connected in Postiz");
  if (channel.disabled) throw new Error(`${channel.name} is disabled in Postiz`);
  if (channel.platform && channel.platform !== content.platform)
    throw new Error(`This draft is written for ${content.platform}; the channel is ${channel.platform}`);
  const scheduledFor = input.scheduledFor || new Date(Date.now() + 2 * 60_000).toISOString();
  if (Date.parse(scheduledFor) < Date.now() - 60_000) throw new Error("Choose a time in the future");

  const publicationId = randomUUID();
  try {
    const upload = dependencies.upload || uploadMediaToPostiz;
    const media: { id: string; path: string }[] = [];
    for (const url of content.mediaUrls) media.push(await upload(connection, url));
    const create = dependencies.create || createPostizPost;
    const result = await create(connection, {
      channelId: channel.id,
      content: content.caption,
      media,
      scheduledFor,
      mode: input.scheduledFor ? "schedule" : "now",
    });
    const publication = await sql.query<PublicationRow>(
      `insert into social_draft_publications (
         id, workspace_id, draft_id, revision, provider, channel_id, channel_name, channel_platform,
         provider_post_id, status, scheduled_for, response
       ) values ($1,$2,$3,$4,'postiz',$5,$6,$7,$8,'scheduled',$9,$10::jsonb) returning *`,
      [
        publicationId,
        workspaceId,
        input.id,
        current.revision,
        channel.id,
        channel.name,
        channel.platform,
        result.providerPostId,
        scheduledFor,
        JSON.stringify(result.raw ?? null),
      ],
    );
    const changed = await sql.query<Row>(
      `with changed as (
         update social_drafts set state = 'scheduled', revision = revision + 1, updated_at = now()
         where workspace_id = $1 and id = $2 and revision = $3 returning *
       ), event as (
         insert into social_draft_events (workspace_id, draft_id, revision, actor_user_id, action, snapshot)
         select workspace_id, id, revision, $4, 'schedule', to_jsonb(changed) from changed
       ) select * from changed`,
      [workspaceId, input.id, current.revision, userId],
    );
    if (!changed[0]) throw new Error("The draft changed while publishing; Postiz has the post — reload and refresh status.");
    return { draft: toDraft(changed[0]), publication: toPublication(publication[0]!) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publish failed";
    await sql.query(
      `insert into social_draft_publications (
         id, workspace_id, draft_id, revision, provider, channel_id, channel_name, channel_platform,
         status, scheduled_for, response
       ) values ($1,$2,$3,$4,'postiz',$5,$6,$7,'failed',$8,$9::jsonb)`,
      [publicationId, workspaceId, input.id, current.revision, channel.id, channel.name, channel.platform, scheduledFor, JSON.stringify({ error: message })],
    );
    // The failed publication row is the durable record; the draft revision is
    // untouched so the approved text is never lost.
    throw new Error(message);
  }
}

/** Ask Postiz whether a scheduled post went out; record the answer. */
export async function refreshPublication(
  userId: string,
  workspaceId: string,
  publicationId: string,
  dependencies: { sql?: Sql; status?: typeof getPostizPostStatus } = {},
): Promise<{ publication: SocialPublication; draft: SocialDraft }> {
  z.uuid().parse(publicationId);
  const sql = await access(userId, workspaceId, dependencies.sql, ["owner", "admin"]);
  const rows = await sql.query<PublicationRow>(
    "select * from social_draft_publications where workspace_id = $1 and id = $2",
    [workspaceId, publicationId],
  );
  const current = rows[0];
  if (!current) throw new Error("Publication not found");
  if (current.status !== "scheduled" || !current.provider_post_id) {
    return { publication: toPublication(current), draft: await getSocialDraft(userId, workspaceId, current.draft_id, sql) };
  }
  const connection = await loadPostizConnection(userId, workspaceId, sql);
  if (!connection) throw new Error("Postiz connection was removed");
  const status = await (dependencies.status || getPostizPostStatus)(connection, current.provider_post_id);
  let next: SocialPublication["status"] = "scheduled";
  let releaseUrl: string | null = current.release_url;
  if (status?.state === "PUBLISHED") {
    next = "published";
    releaseUrl = status.releaseUrl || releaseUrl;
  } else if (status?.state === "ERROR" || status === null) {
    next = "failed";
  }
  const updated = await sql.query<PublicationRow>(
    `update social_draft_publications set status = $3, release_url = $4, updated_at = now()
      where workspace_id = $1 and id = $2 returning *`,
    [workspaceId, publicationId, next, releaseUrl],
  );
  if (next !== "scheduled") {
    await sql.query(
      `with changed as (
         update social_drafts set state = $3, post_url = coalesce($4, post_url), revision = revision + 1, updated_at = now()
         where workspace_id = $1 and id = $2 and state = 'scheduled' returning *
       ), event as (
         insert into social_draft_events (workspace_id, draft_id, revision, actor_user_id, action, snapshot)
         select workspace_id, id, revision, $5, $6, to_jsonb(changed) from changed
       ) select * from changed`,
      [workspaceId, current.draft_id, next === "published" ? "published" : "failed", releaseUrl, userId, next === "published" ? "publish" : "fail"],
    );
  }
  return {
    publication: toPublication(updated[0]!),
    draft: await getSocialDraft(userId, workspaceId, current.draft_id, sql),
  };
}
