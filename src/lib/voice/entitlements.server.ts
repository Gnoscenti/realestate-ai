import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import {
  getVoiceAllowanceStatus,
  type VoiceAllowanceStatus,
} from "./policy.server";

export class VoiceEntitlementError extends Error {
  readonly code = "VOICE_ENTITLEMENT_REQUIRED";
  readonly status = 403;

  constructor(readonly reason = "VOICE_ENTITLEMENT_REQUIRED") {
    super(
      reason === "VOICE_BILLING_SETUP_REQUIRED"
        ? "Voice Assistant billing setup is not yet complete"
        : reason === "VOICE_ALLOWANCE_EXHAUSTED"
          ? "The 200-minute Voice Assistant allowance has been used"
          : "An active Voice Assistant add-on is required",
    );
    this.name = "VoiceEntitlementError";
  }
}

export async function requireActiveVoiceEntitlement(
  userId: string,
  workspaceId: string,
  sqlOverride?: Sql,
): Promise<VoiceAllowanceStatus> {
  const sql = sqlOverride ?? (await getSql());
  const workspace = await requireWorkspaceAccess(
    userId,
    workspaceId,
    ["owner", "admin"],
    sql,
  );
  const allowance = await getVoiceAllowanceStatus(workspace.id, sql);
  if (allowance.state !== "active") {
    throw new VoiceEntitlementError(allowance.reason ?? undefined);
  }
  return allowance;
}
