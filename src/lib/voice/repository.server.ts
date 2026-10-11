import { randomUUID } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import {
  voicePromptInputSchema,
  type VoiceAssistantRecord,
  type VoicePromptInput,
  type VoiceSetup,
} from "./types";

interface AssistantRow {
  id: string;
  workspace_id: string;
  provider: "retell";
  provider_agent_id: string | null;
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
  const rows = await sql.query<AssistantRow>(
    `insert into voice_assistants (
       id, workspace_id, provider, status, display_name, language
     ) values ($1, $2, 'retell', 'draft', 'Missed-call assistant', 'en-US')
     on conflict (workspace_id) do update set updated_at = voice_assistants.updated_at
     returning id, workspace_id, provider, provider_agent_id, status,
               display_name, language`,
    [id, workspace.id],
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
  const prompt = await sql.query<{ version: number }>(
    `select version from voice_prompt_versions
      where workspace_id = $1 and assistant_id = $2
      order by version desc limit 1`,
    [assistant.workspaceId, assistant.id],
  );
  return {
    assistant,
    phoneNumber: phone[0]?.e164 ?? null,
    promptVersion: prompt[0]?.version ?? null,
  };
}

export async function savePromptVersion(
  userId: string,
  workspaceId: string,
  input: VoicePromptInput,
  sqlOverride?: Sql,
): Promise<{ id: string; version: number }> {
  const sql = sqlOverride ?? (await getSql());
  const assistant = await ensureVoiceAssistantDraft(userId, workspaceId, sql);
  const data = voicePromptInputSchema.parse(input);

  // A unique (assistant_id, version) constraint protects concurrent writes.
  // Retry a colliding max(version)+1 insert rather than overwriting history.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = `prompt_${randomUUID()}`;
    try {
      const rows = await sql.query<{ id: string; version: number }>(
        `insert into voice_prompt_versions (
           id, workspace_id, assistant_id, version, system_prompt, greeting,
           recording_disclosure, allowed_capabilities, created_by_user_id
         )
         select $1, $2, $3, coalesce(max(version), 0) + 1,
                $4, $5, $6, $7::jsonb, $8
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
