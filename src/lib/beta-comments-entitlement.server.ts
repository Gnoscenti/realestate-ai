import { getEntitlement } from "@/lib/billing/entitlement.server";
import { ensurePersonalWorkspace } from "@/lib/workspaces/repository.server";

/** Resolve the active server-owned entitlement for a user's personal workspace. */
export async function getFeedbackEntitlement(userId: string): Promise<{
  active: boolean;
  workspaceId: string;
}> {
  const workspace = await ensurePersonalWorkspace(userId);
  const entitlement = await getEntitlement(userId, workspace.id);
  return { active: entitlement.active, workspaceId: workspace.id };
}
