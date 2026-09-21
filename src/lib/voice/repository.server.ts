import { randomUUID } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import {
  voicePromptCustomizationSchema,
  voicePromptInputSchema,
  type StoredVoicePromptCustomization,
  type VoiceAssistantRecord,
  type VoicePromptCustomization,
  type VoicePromptInput,
  type VoiceSetup,
} from "./types";

interface AssistantRow {
  id: string;
  workspace_id: string;
  provider: "retell";
  provider_agent_id: string | null;
  provider_llm_id: string | null;
  provider_llm_version: number | null;
  provider_agent_version: number | null;
  provisioning_identity: string;
  blocked_reason: string | null;
  status: VoiceAssistantRecord["status"];
  display_name: string;
  language: string;
}

function toAssistant(row: AssistantRow): VoiceAssistantRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    provider: row.provider,
    providerAgentId: row.provider_agent_id,
    providerLlmId: row.provider_llm_id,
    providerLlmVersion: row.provider_llm_version,
    providerAgentVersion: row.provider_agent_version,
    provisioningIdentity: row.provisioning_identity,
    blockedReason: row.blocked_reason,
    status: row.status,
    displayName: row.display_name,
    language: row.language,
  };
}

export async function ensureVoiceAssistantDraft(
  userId: string,
  workspaceId: string,
  sqlOverride?: Sql,
): Promise<VoiceAssistantRecord> {
  const sql = sqlOverride ?? (await getSql());
  const workspace = await requireWorkspaceAccess(
    userId,
    workspaceId,
    ["owner", "admin"],
    sql,
  );
  const id = `voice_${randomUUID()}`;
  const provisioningIdentity = `voice_identity_${randomUUID()}`;
  const rows = await sql.query<AssistantRow>(
    `insert into voice_assistants (
       id, workspace_id, provider, status, display_name, language,
       provisioning_identity
     ) values ($1, $2, 'retell', 'draft', 'Missed-call assistant', 'en-US', $3)
     on conflict (workspace_id) do update set updated_at = voice_assistants.updated_at
     returning id, workspace_id, provider, provider_agent_id, provider_llm_id,
               provider_llm_version,
               provider_agent_version, provisioning_identity, blocked_reason, status,
               display_name, language`,
    [id, workspace.id, provisioningIdentity],
  );
  const row = rows[0];
  if (!row) throw new Error("Voice assistant initialization failed");
  return toAssistant(row);
}

export async function getVoiceSetup(
  userId: string,
  workspaceId: string,
  sqlOverride?: Sql,
): Promise<VoiceSetup> {
  const sql = sqlOverride ?? (await getSql());
  const assistant = await ensureVoiceAssistantDraft(userId, workspaceId, sql);
  const phone = await sql.query<{ e164: string }>(
    `select e164 from voice_phone_numbers
      where workspace_id = $1 and assistant_id = $2
        and status in ('provisioning', 'active', 'paused')
      order by created_at desc limit 1`,
    [assistant.workspaceId, assistant.id],
  );
  const prompt = await sql.query<{
    version: number;
    provider_sync_state: VoiceSetup["promptSyncState"];
  }>(
    `select version, provider_sync_state from voice_prompt_versions
      where workspace_id = $1 and assistant_id = $2
      order by version desc limit 1`,
    [assistant.workspaceId, assistant.id],
  );
  const job = await sql.query<{ state: VoiceSetup["provisioningState"] }>(
    `select j.state
       from voice_provisioning_jobs j
       join voice_assistants a
         on a.provisioning_job_id = j.id and a.workspace_id = j.workspace_id
      where a.id = $1 and a.workspace_id = $2
      limit 1`,
    [assistant.id, assistant.workspaceId],
  );
  return {
    assistant,
    phoneNumber: phone[0]?.e164 ?? null,
    promptVersion: prompt[0]?.version ?? null,
    promptSyncState: prompt[0]?.provider_sync_state ?? null,
    provisioningState: job[0]?.state ?? null,
  };
}

export async function savePromptVersion(
  userId: string,
  workspaceId: string,
  input: VoicePromptInput,
  sqlOverride?: Sql,
  customization: VoicePromptCustomization = {},
): Promise<{ id: string; version: number }> {
  const sql = sqlOverride ?? (await getSql());
  const assistant = await ensureVoiceAssistantDraft(userId, workspaceId, sql);
  const data = voicePromptInputSchema.parse(input);
  const savedCustomization = voicePromptCustomizationSchema.parse(customization);

  // A unique (assistant_id, version) constraint protects concurrent writes.
  // Retry a colliding max(version)+1 insert rather than overwriting history.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = `prompt_${randomUUID()}`;
    try {
      const rows = await sql.query<{ id: string; version: number }>(
         `insert into voice_prompt_versions (
           id, workspace_id, assistant_id, version, system_prompt, greeting,
           recording_disclosure, allowed_capabilities, created_by_user_id,
           customization
         )
         select $1, $2, $3, coalesce(max(version), 0) + 1,
                $4, $5, $6, $7::jsonb, $8, $9::jsonb
           from voice_prompt_versions
          where assistant_id = $3
         returning id, version`,
        [
          id,
          assistant.workspaceId,
          assistant.id,
          data.systemPrompt,
          data.greeting,
          data.recordingDisclosure,
          JSON.stringify(data.allowedCapabilities),
          userId,
          JSON.stringify(savedCustomization),
        ],
      );
      const row = rows[0];
      if (row) return row;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "23505" || attempt === 2) throw error;
    }
  }
  throw new Error("Prompt version save failed");
}

export interface StoredVoicePrompt {
  id: string;
  workspaceId: string;
  assistantId: string;
  version: number;
  systemPrompt: string;
  greeting: string;
  recordingDisclosure: string;
  providerSyncState: "pending" | "synced" | "failed";
  customization: StoredVoicePromptCustomization;
}

function toStoredPrompt(row: {
  id: string;
  workspace_id: string;
  assistant_id: string;
  version: number;
  system_prompt: string;
  greeting: string;
  recording_disclosure: string;
  provider_sync_state: StoredVoicePrompt["providerSyncState"];
  customization: unknown;
}): StoredVoicePrompt {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    assistantId: row.assistant_id,
    version: row.version,
    systemPrompt: row.system_prompt,
    greeting: row.greeting,
    recordingDisclosure: row.recording_disclosure,
    providerSyncState: row.provider_sync_state,
    customization: voicePromptCustomizationSchema.parse(row.customization ?? {}),
  };
}

export async function getLatestPromptVersion(
  userId: string,
  workspaceId: string,
  sqlOverride?: Sql,
): Promise<StoredVoicePrompt | null> {
  const sql = sqlOverride ?? (await getSql());
  const assistant = await ensureVoiceAssistantDraft(userId, workspaceId, sql);
  const rows = await sql.query<{
    id: string;
    workspace_id: string;
    assistant_id: string;
    version: number;
    system_prompt: string;
    greeting: string;
    recording_disclosure: string;
    provider_sync_state: StoredVoicePrompt["providerSyncState"];
    customization: unknown;
  }>(
    `select id, workspace_id, assistant_id, version, system_prompt, greeting,
            recording_disclosure, provider_sync_state, customization
       from voice_prompt_versions
      where workspace_id = $1 and assistant_id = $2
      order by version desc limit 1`,
    [assistant.workspaceId, assistant.id],
  );
  return rows[0] ? toStoredPrompt(rows[0]) : null;
}

export async function getPromptVersionById(
  userId: string,
  workspaceId: string,
  promptId: string,
  sqlOverride?: Sql,
): Promise<StoredVoicePrompt | null> {
  const sql = sqlOverride ?? (await getSql());
  const assistant = await ensureVoiceAssistantDraft(userId, workspaceId, sql);
  const rows = await sql.query<{
    id: string;
    workspace_id: string;
    assistant_id: string;
    version: number;
    system_prompt: string;
    greeting: string;
    recording_disclosure: string;
    provider_sync_state: StoredVoicePrompt["providerSyncState"];
    customization: unknown;
  }>(
    `select id, workspace_id, assistant_id, version, system_prompt, greeting,
            recording_disclosure, provider_sync_state, customization
       from voice_prompt_versions
      where id = $1 and workspace_id = $2 and assistant_id = $3
      limit 1`,
    [promptId, assistant.workspaceId, assistant.id],
  );
  return rows[0] ? toStoredPrompt(rows[0]) : null;
}

export async function updateAssistantProviderState(
  userId: string,
  workspaceId: string,
  input: {
    providerAgentId: string;
    providerLlmId: string;
    providerAgentVersion: number;
    status: "provisioning" | "active" | "failed";
  },
  sqlOverride?: Sql,
): Promise<void> {
  const sql = sqlOverride ?? (await getSql());
  const assistant = await ensureVoiceAssistantDraft(userId, workspaceId, sql);
  await sql.query(
    `update voice_assistants
        set provider_agent_id = $1, provider_llm_id = $2,
            provider_agent_version = $3, status = $4, updated_at = now()
      where id = $5 and workspace_id = $6`,
    [
      input.providerAgentId,
      input.providerLlmId,
      input.providerAgentVersion,
      input.status,
      assistant.id,
      assistant.workspaceId,
    ],
  );
}

export async function markPromptProviderState(
  userId: string,
  workspaceId: string,
  promptId: string,
  state: "synced" | "failed",
  errorMessage: string | null,
  provider: {
    llmId?: string;
    agentId?: string;
    agentVersion?: number;
  } = {},
  sqlOverride?: Sql,
): Promise<void> {
  const sql = sqlOverride ?? (await getSql());
  const assistant = await ensureVoiceAssistantDraft(userId, workspaceId, sql);
  await sql.query(
    `update voice_prompt_versions
        set provider_sync_state = $1,
            provider_synced_at = case when $1 = 'synced' then now() else null end,
            provider_error = $2,
            provider_llm_id = coalesce($3, provider_llm_id),
            provider_agent_id = coalesce($4, provider_agent_id),
            provider_agent_version = coalesce($5, provider_agent_version)
      where id = $6 and workspace_id = $7 and assistant_id = $8`,
    [
      state,
      errorMessage,
      provider.llmId ?? null,
      provider.agentId ?? null,
      provider.agentVersion ?? null,
      promptId,
      assistant.workspaceId,
      assistant.id,
    ],
  );
}
