/**
 * Postiz scheduler connection — the agent's own Postiz workspace holds the
 * platform OAuth grants; we hold only the agent-supplied API key, encrypted at
 * rest with a key derived from the server secret and never returned.
 *
 * Public API (verified from docs.postiz.com, 2026-09-07):
 *   base   https://api.postiz.com/public/v1   (self-hosted: <api url>/public/v1)
 *   auth   Authorization: <api key>
 *   GET    /integrations                      -> [{ id, name, identifier, picture, disabled, profile }]
 *   POST   /upload   (multipart "file")       -> { id, path }
 *   POST   /posts    { type, date, shortLink, tags, posts:[{ integration:{id}, value:[{content,image}], settings }] }
 *   GET    /posts?startDate&endDate           -> [{ id, content, publishDate, releaseURL, state, integration }]
 *
 * Nothing here is live-verified in this repository (no Postiz account in this
 * environment); every response is parsed leniently and every failure is
 * recorded, never converted into a success.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import { readResponseBytes, readResponseText, safeFetch } from "@/lib/safe-outbound-url.server";
import { POSTIZ_PLATFORM_MAP, type SocialPlatform } from "./types";

export const POSTIZ_DEFAULT_API_URL = "https://api.postiz.com";

function encryptionKey(): Buffer {
  const secret =
    process.env.SOCIAL_CONNECTION_SECRET?.trim() || process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production")
      throw new Error("SOCIAL_CONNECTION_SECRET or BETTER_AUTH_SECRET is required to store scheduler credentials");
    return createHash("sha256").update("local-dev-only-social-connection").digest();
  }
  return createHash("sha256").update(`social-connection:${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${body.toString("base64url")}`;
}

export function decryptSecret(ciphertext: string): string {
  const [version, iv, tag, body] = ciphertext.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Unrecognized ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

export type PostizChannel = {
  id: string;
  name: string;
  identifier: string;
  platform: SocialPlatform | null;
  picture?: string;
  profile?: string;
  disabled: boolean;
};

export type PostizConnectionSummary = {
  provider: "postiz";
  apiUrl: string;
  connectedAt: string;
  channels: PostizChannel[];
  error?: string;
};

type ConnectionRow = {
  api_url: string;
  api_key_ciphertext: string;
  created_at: string | Date;
  updated_at: string | Date;
};

export class PostizError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message || code);
    this.name = "PostizError";
  }
}

function normalizeApiUrl(raw: string): string {
  const url = new URL(raw || POSTIZ_DEFAULT_API_URL);
  if (url.protocol !== "https:") throw new PostizError("postiz_api_url_https", "Postiz API URL must use https");
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/+$/, "");
}

async function postizFetch(
  connection: { apiUrl: string; apiKey: string },
  path: string,
  init: RequestInit = {},
  fetchImpl: typeof safeFetch = safeFetch,
): Promise<{ status: number; json: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const { response } = await fetchImpl(
      `${connection.apiUrl}/public/v1${path}`,
      {
        ...init,
        headers: { Authorization: connection.apiKey, Accept: "application/json", ...(init.headers || {}) },
        signal: controller.signal,
      },
      { allowCrossOriginRedirects: false, maxRedirects: 0 },
    );
    const text = await readResponseText(response, 2 * 1024 * 1024);
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 300) };
    }
    return { status: response.status, json };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new PostizError("postiz_timeout");
    throw new PostizError("postiz_network", error instanceof Error ? error.message : undefined);
  } finally {
    clearTimeout(timer);
  }
}

function assertOk(status: number, json: unknown, context: string): void {
  if (status >= 200 && status < 300) return;
  const message = (json as { message?: string } | null)?.message;
  if (status === 401) throw new PostizError("postiz_auth", "Postiz rejected the API key");
  if (status === 429) throw new PostizError("postiz_rate_limited", "Postiz rate limit reached (90 posts/hour)");
  throw new PostizError(`postiz_http_${status}`, `${context}: ${message || `HTTP ${status}`}`);
}

export function parseChannels(json: unknown): PostizChannel[] {
  const list = Array.isArray(json) ? json : Array.isArray((json as { integrations?: unknown })?.integrations)
    ? ((json as { integrations: unknown[] }).integrations)
    : [];
  return list.flatMap((item) => {
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    const identifier = String(record.identifier || record.providerIdentifier || "").toLowerCase();
    if (!id) return [];
    return [
      {
        id,
        name: String(record.name || record.profile || identifier),
        identifier,
        platform: POSTIZ_PLATFORM_MAP[identifier] || null,
        picture: typeof record.picture === "string" ? record.picture : undefined,
        profile: typeof record.profile === "string" ? record.profile : undefined,
        disabled: Boolean(record.disabled),
      },
    ];
  });
}

export async function listPostizChannels(
  connection: { apiUrl: string; apiKey: string },
  fetchImpl?: typeof safeFetch,
): Promise<PostizChannel[]> {
  const { status, json } = await postizFetch(connection, "/integrations", {}, fetchImpl);
  assertOk(status, json, "List channels");
  return parseChannels(json);
}

/** Save (or replace) the workspace's Postiz connection after a live channel check. */
export async function savePostizConnection(
  userId: string,
  workspaceId: string,
  input: { apiKey: string; apiUrl?: string },
  dependencies: { sql?: Sql; fetchImpl?: typeof safeFetch } = {},
): Promise<PostizConnectionSummary> {
  const sql = dependencies.sql || (await getSql());
  const workspace = await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  const apiUrl = normalizeApiUrl(input.apiUrl || POSTIZ_DEFAULT_API_URL);
  const apiKey = input.apiKey.trim();
  if (apiKey.length < 8) throw new PostizError("postiz_key_invalid", "Enter the API key from Postiz → Settings");
  const channels = await listPostizChannels({ apiUrl, apiKey }, dependencies.fetchImpl);
  await sql.query(
    `insert into social_publish_connections (workspace_id, provider, api_url, api_key_ciphertext, created_by_user_id)
     values ($1, 'postiz', $2, $3, $4)
     on conflict (workspace_id) do update set api_url = excluded.api_url,
       api_key_ciphertext = excluded.api_key_ciphertext, updated_at = now()`,
    [workspace.id, apiUrl, encryptSecret(apiKey), userId],
  );
  return { provider: "postiz", apiUrl, connectedAt: new Date().toISOString(), channels };
}

export async function removePostizConnection(userId: string, workspaceId: string, sqlOverride?: Sql): Promise<void> {
  const sql = sqlOverride || (await getSql());
  const workspace = await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  await sql.query(`delete from social_publish_connections where workspace_id = $1`, [workspace.id]);
}

export async function loadPostizConnection(
  userId: string,
  workspaceId: string,
  sqlOverride?: Sql,
): Promise<{ apiUrl: string; apiKey: string; connectedAt: string } | null> {
  const sql = sqlOverride || (await getSql());
  const workspace = await requireWorkspaceAccess(userId, workspaceId, undefined, sql);
  const rows = await sql.query<ConnectionRow>(
    `select api_url, api_key_ciphertext, created_at, updated_at from social_publish_connections where workspace_id = $1`,
    [workspace.id],
  );
  const row = rows[0];
  if (!row) return null;
  const at = row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString();
  return { apiUrl: row.api_url, apiKey: decryptSecret(row.api_key_ciphertext), connectedAt: at };
}

export async function getPostizSummary(
  userId: string,
  workspaceId: string,
  dependencies: { sql?: Sql; fetchImpl?: typeof safeFetch } = {},
): Promise<PostizConnectionSummary | null> {
  const connection = await loadPostizConnection(userId, workspaceId, dependencies.sql);
  if (!connection) return null;
  try {
    const channels = await listPostizChannels(connection, dependencies.fetchImpl);
    return { provider: "postiz", apiUrl: connection.apiUrl, connectedAt: connection.connectedAt, channels };
  } catch (error) {
    return {
      provider: "postiz",
      apiUrl: connection.apiUrl,
      connectedAt: connection.connectedAt,
      channels: [],
      error: error instanceof Error ? error.message : "Postiz is unreachable",
    };
  }
}

/** Upload a public image URL into Postiz (providers reject external URLs). */
export async function uploadMediaToPostiz(
  connection: { apiUrl: string; apiKey: string },
  imageUrl: string,
  fetchImpl: typeof safeFetch = safeFetch,
): Promise<{ id: string; path: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let bytes: Uint8Array<ArrayBuffer>;
  let contentType: string;
  try {
    const { response } = await fetchImpl(imageUrl, { signal: controller.signal }, { maxRedirects: 2, allowCrossOriginRedirects: true });
    if (!response.ok) throw new PostizError("media_fetch_failed", `HTTP ${response.status} fetching image`);
    contentType = response.headers.get("content-type") || "application/octet-stream";
    if (!/^image\//.test(contentType)) throw new PostizError("media_not_image", `Not an image: ${contentType}`);
    bytes = await readResponseBytes(response, 15 * 1024 * 1024);
  } finally {
    clearTimeout(timer);
  }
  const form = new FormData();
  const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  form.append("file", new Blob([bytes], { type: contentType }), `${randomUUID()}.${extension}`);
  const { status, json } = await postizFetch(connection, "/upload", { method: "POST", body: form }, fetchImpl);
  assertOk(status, json, "Upload media");
  const record = json as { id?: string; path?: string } | null;
  if (!record?.path) throw new PostizError("postiz_upload_invalid", "Postiz upload returned no path");
  return { id: record.id || record.path, path: record.path };
}

export type PostizCreateResult = { providerPostId: string | null; raw: unknown };

export function parseCreatePostResponse(json: unknown): string | null {
  if (Array.isArray(json)) {
    const first = json[0] as { postId?: string; id?: string } | undefined;
    return first?.postId || first?.id || null;
  }
  const record = json as { postId?: string; id?: string; posts?: { id?: string }[] } | null;
  return record?.postId || record?.id || record?.posts?.[0]?.id || null;
}

export async function createPostizPost(
  connection: { apiUrl: string; apiKey: string },
  input: {
    channelId: string;
    content: string;
    media: { id: string; path: string }[];
    scheduledFor: string;
    mode: "schedule" | "now";
  },
  fetchImpl?: typeof safeFetch,
): Promise<PostizCreateResult> {
  const body = {
    type: input.mode,
    date: input.scheduledFor,
    shortLink: false,
    tags: [],
    posts: [
      {
        integration: { id: input.channelId },
        value: [{ content: input.content, image: input.media }],
        settings: {},
      },
    ],
  };
  const { status, json } = await postizFetch(
    connection,
    "/posts",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    fetchImpl,
  );
  assertOk(status, json, "Create post");
  return { providerPostId: parseCreatePostResponse(json), raw: json };
}

export type PostizPostStatus = { state: string; releaseUrl: string | null; publishDate: string | null };

export async function getPostizPostStatus(
  connection: { apiUrl: string; apiKey: string },
  providerPostId: string,
  fetchImpl?: typeof safeFetch,
): Promise<PostizPostStatus | null> {
  const { status, json } = await postizFetch(connection, `/posts/${encodeURIComponent(providerPostId)}`, {}, fetchImpl);
  if (status === 404) return null;
  assertOk(status, json, "Get post");
  const record = (json as { posts?: unknown[] } | null)?.posts?.[0] ?? json;
  const item = record as { state?: string; releaseURL?: string; releaseUrl?: string; publishDate?: string } | null;
  if (!item) return null;
  return {
    state: String(item.state || "UNKNOWN"),
    releaseUrl: item.releaseURL || item.releaseUrl || null,
    publishDate: item.publishDate || null,
  };
}
