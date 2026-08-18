import { getSql, type Sql } from "@/lib/db";
import {
  agentProfileInputSchema,
  type AgentProfileInput,
  type AgentProfileRecord,
  type WorkspaceContext,
  type WorkspaceRole,
} from "./types";

interface WorkspaceRow {
  id: string;
  name: string;
  kind: "personal" | "team";
  role: WorkspaceRole;
}

interface AgentProfileRow {
  workspace_id: string;
  display_name: string | null;
  business_name: string | null;
  brokerage: string | null;
  business_phone: string | null;
  website_url: string | null;
  area_of_operations: string | null;
  mls_board: string | null;
  mls_agent_id: string | null;
  license_number: string | null;
  timezone: string;
  provenance: AgentProfileRecord["provenance"];
}

function requireIdentifier(value: string, label: string): string {
  const trimmed = value.trim();
  if (
    value !== trimmed ||
    !value ||
    value.length > 240 ||
    /[\u0000-\u001f]/.test(value)
  ) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

export function personalWorkspaceId(userId: string): string {
  return `personal:${requireIdentifier(userId, "user id")}`;
}

function toWorkspace(row: WorkspaceRow): WorkspaceContext {
  return { id: row.id, name: row.name, kind: row.kind, role: row.role };
}

export async function ensurePersonalWorkspace(
  userId: string,
  sqlOverride?: Sql,
): Promise<WorkspaceContext> {
  const safeUserId = requireIdentifier(userId, "user id");
  const workspaceId = personalWorkspaceId(safeUserId);
  const sql = sqlOverride ?? (await getSql());

  await sql.query(
    `insert into workspaces (id, name, kind)
     values ($1, $2, 'personal')
     on conflict (id) do nothing`,
    [workspaceId, "My workspace"],
  );
  await sql.query(
    `insert into workspace_memberships (workspace_id, user_id, role)
     values ($1, $2, 'owner')
     on conflict (workspace_id, user_id) do nothing`,
    [workspaceId, safeUserId],
  );

  return requireWorkspaceAccess(safeUserId, workspaceId, undefined, sql);
}

export async function requireWorkspaceAccess(
  userId: string,
  workspaceId: string,
  allowedRoles?: WorkspaceRole[],
  sqlOverride?: Sql,
): Promise<WorkspaceContext> {
  const safeUserId = requireIdentifier(userId, "user id");
  const safeWorkspaceId = requireIdentifier(workspaceId, "workspace id");
  const sql = sqlOverride ?? (await getSql());
  const rows = await sql.query<WorkspaceRow>(
    `select w.id, w.name, w.kind, m.role
       from workspaces w
       join workspace_memberships m on m.workspace_id = w.id
      where w.id = $1 and m.user_id = $2
      limit 1`,
    [safeWorkspaceId, safeUserId],
  );
  const row = rows[0];
  if (!row || (allowedRoles?.length && !allowedRoles.includes(row.role))) {
    // Do not reveal whether another tenant's workspace exists.
    throw new Error("Workspace not found");
  }
  return toWorkspace(row);
}

export async function getAgentProfile(
  userId: string,
  workspaceId: string,
  sqlOverride?: Sql,
): Promise<AgentProfileRecord | null> {
  const sql = sqlOverride ?? (await getSql());
  const workspace = await requireWorkspaceAccess(
    userId,
    workspaceId,
    undefined,
    sql,
  );
  const rows = await sql.query<AgentProfileRow>(
    `select workspace_id, display_name, business_name, brokerage,
            business_phone, website_url, area_of_operations, mls_board,
            mls_agent_id, license_number, timezone, provenance
       from agent_profiles
      where workspace_id = $1`,
    [workspace.id],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    workspaceId: row.workspace_id,
    displayName: row.display_name,
    businessName: row.business_name,
    brokerage: row.brokerage,
    businessPhone: row.business_phone,
    websiteUrl: row.website_url,
    areaOfOperations: row.area_of_operations,
    mlsBoard: row.mls_board,
    mlsAgentId: row.mls_agent_id,
    licenseNumber: row.license_number,
    timezone: row.timezone,
    provenance: row.provenance,
  };
}

export async function saveAgentProfile(
  userId: string,
  workspaceId: string,
  input: AgentProfileInput,
  sqlOverride?: Sql,
): Promise<AgentProfileRecord> {
  const sql = sqlOverride ?? (await getSql());
  const workspace = await requireWorkspaceAccess(
    userId,
    workspaceId,
    ["owner", "admin"],
    sql,
  );
  const data = agentProfileInputSchema.parse(input);
  await sql.query(
    `insert into agent_profiles (
       workspace_id, display_name, business_name, brokerage, business_phone,
       website_url, area_of_operations, mls_board, mls_agent_id,
       license_number, timezone, provenance, updated_by_user_id
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'user_entered',$12)
     on conflict (workspace_id) do update set
       display_name = excluded.display_name,
       business_name = excluded.business_name,
       brokerage = excluded.brokerage,
       business_phone = excluded.business_phone,
       website_url = excluded.website_url,
       area_of_operations = excluded.area_of_operations,
       mls_board = excluded.mls_board,
       mls_agent_id = excluded.mls_agent_id,
       license_number = excluded.license_number,
       timezone = excluded.timezone,
       provenance = 'user_entered',
       updated_by_user_id = excluded.updated_by_user_id,
       updated_at = now()`,
    [
      workspace.id,
      data.displayName ?? null,
      data.businessName ?? null,
      data.brokerage ?? null,
      data.businessPhone ?? null,
      data.websiteUrl ?? null,
      data.areaOfOperations ?? null,
      data.mlsBoard ?? null,
      data.mlsAgentId ?? null,
      data.licenseNumber ?? null,
      data.timezone,
      userId,
    ],
  );
  const saved = await getAgentProfile(userId, workspace.id, sql);
  if (!saved) throw new Error("Profile save failed");
  return saved;
}
