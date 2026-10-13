import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getSql } from "@/lib/db";
import { ensurePersonalWorkspace } from "@/lib/workspaces/repository.server";
import { listSubjects, saveSubject } from "@/lib/aieo/visibility/subjects.server";
import { subjectInputSchema, type SubjectInput } from "@/lib/aieo/visibility/subjects";

const input: SubjectInput = { agentName: "Jordan Rivera", website: "https://jordan.example", area: "San Diego, CA", jurisdiction: "US-CA", entityKind: "agent" };
async function setup() {
  const userId = "subjects-" + randomUUID();
  const workspace = await ensurePersonalWorkspace(userId);
  return { userId, workspace };
}
describe("saved Citelock identities", () => {
  it("round-trips declared aliases and exact approved source settings without a schema migration", async () => {
    const { userId, workspace } = await setup();
    const declared = { ...input, nameAliases: ["Jordan R"], sourcePolicy: "non_listing" as const, sourceUrls: ["https://jordan.example/"] };
    await saveSubject(userId, workspace.id, declared, 0);
    expect((await listSubjects(userId, workspace.id))[0]?.input).toEqual(declared);
  });
  it("persists separate identities and rejects cross-workspace access or member edits", async () => {
    const { userId, workspace } = await setup();
    const agent = await saveSubject(userId, workspace.id, input, 0);
    const team = await saveSubject(userId, workspace.id, { ...input, entityKind: "team", agentName: "Coastal Team", website: "https://coastal.example" }, 0);
    const loaded = await listSubjects(userId, workspace.id);
    expect(loaded).toEqual(expect.arrayContaining([agent, team]));
    await expect(listSubjects("stranger", workspace.id)).rejects.toThrow("Workspace not found");
    await expect(saveSubject("stranger", workspace.id, input, 1)).rejects.toThrow("Workspace not found");
    const sql = await getSql();
    const member = "member-" + randomUUID();
    await sql.query("insert into workspace_memberships(workspace_id,user_id,role) values($1,$2,'member')",[workspace.id,member]);
    expect(await listSubjects(member, workspace.id)).toHaveLength(2);
    await expect(saveSubject(member,workspace.id,input,1)).rejects.toThrow("Workspace not found");
  });
  it("serializes competing first saves and rejects stale revisions without losing the winner", async () => {
    const { userId, workspace } = await setup();
    const first = await Promise.allSettled([saveSubject(userId,workspace.id,input,0),saveSubject(userId,workspace.id,input,0)]);
    expect(first.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const changes = await Promise.allSettled([
      saveSubject(userId,workspace.id,{...input,area:"San Diego County, CA"},1),
      saveSubject(userId,workspace.id,{...input,area:"Solana Beach, CA"},1),
    ]);
    expect(changes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const winner = changes.find(result => result.status === "fulfilled");
    expect((await listSubjects(userId,workspace.id))[0]).toEqual(winner?.status === "fulfilled" ? winner.value : undefined);
    await expect(saveSubject(userId,workspace.id,input,1)).rejects.toThrow(/another session/);
  });
  it("validates HTTPS, secret-free URLs and entity-specific licenses", () => {
    for (const patch of [
      { website:"not a URL" }, { website:"javascript:alert(1)" }, { website:"http://example.com" },
      { website:"https://example.com/?token=private" }, { area:"" },
      { entityKind:"team",license:"01234567" },
    ]) expect(subjectInputSchema.safeParse({...input,...patch}).success).toBe(false);
    expect(subjectInputSchema.parse({...input,agentName:" Jordan Rivera "}).agentName).toBe("Jordan Rivera");
  });
});
