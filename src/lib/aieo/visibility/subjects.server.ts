import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import { saveSubjectSchema, subjectInputSchema, type SavedSubject, type SubjectInput } from "./subjects";

type Row = { input: SubjectInput; revision: number; updated_at: string | Date };
function record(row: Row): SavedSubject {
  return { input: subjectInputSchema.parse(row.input), revision: row.revision, updatedAt: new Date(row.updated_at).toISOString() };
}

export async function listSubjects(userId: string, workspaceId: string, sqlOverride?: Sql): Promise<SavedSubject[]> {
  const sql = sqlOverride ?? await getSql();
  await requireWorkspaceAccess(userId, workspaceId, undefined, sql);
  return (await sql.query<Row>(
    "select input, revision, updated_at from citelock_subjects where workspace_id=$1 order by updated_at desc, entity_kind",
    [workspaceId],
  )).map(record);
}

export async function saveSubject(
  userId: string, workspaceId: string, input: SubjectInput, expectedRevision: number, sqlOverride?: Sql,
): Promise<SavedSubject> {
  const sql = sqlOverride ?? await getSql();
  await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  const data = saveSubjectSchema.parse({ input, expectedRevision });
  const rows = data.expectedRevision === 0
    ? await sql.query<Row>(
      `insert into citelock_subjects (workspace_id,entity_kind,input,updated_by_user_id)
       values ($1,$2,$3::jsonb,$4) on conflict (workspace_id,entity_kind) do nothing
       returning input,revision,updated_at`,
      [workspaceId,data.input.entityKind,JSON.stringify(data.input),userId],
    )
    : await sql.query<Row>(
      `update citelock_subjects set input=$3::jsonb, revision=revision+1, updated_by_user_id=$4,updated_at=now()
       where workspace_id=$1 and entity_kind=$2 and revision=$5 returning input,revision,updated_at`,
      [workspaceId,data.input.entityKind,JSON.stringify(data.input),userId,data.expectedRevision],
    );
  if (!rows[0]) throw new Error("This subject changed in another session. Reload saved identities before saving again.");
  return record(rows[0]);
}
