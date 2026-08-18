import { getSql, type Sql } from "@/lib/db";
import {
  getAgentProfile,
  requireWorkspaceAccess,
} from "@/lib/workspaces/repository.server";
import { isVoiceChecklistComplete } from "./console";
import { getVoiceBillingAvailability } from "./billing.server";
import { getVoiceAllowanceStatus } from "./policy.server";
import { getLatestPromptVersion, getVoiceSetup } from "./repository.server";
import {
  voicePromptCustomizationSchema,
  voiceSetupChecklistSchema,
  type VoiceConsoleState,
  type VoiceSetupChecklist,
} from "./types";

interface ChecklistRow {
  carrier: VoiceSetupChecklist["carrier"];
  device_platform: VoiceSetupChecklist["devicePlatform"];
  conditional_forwarding_configured: boolean;
  disclosure_verified: boolean;
  declined_consent_verified: boolean;
  test_call_completed: boolean;
  call_log_verified: boolean;
  rollback_understood: boolean;
  broker_approval_confirmed: boolean;
}

function toChecklist(row?: ChecklistRow): VoiceSetupChecklist {
  return voiceSetupChecklistSchema.parse(
    row
      ? {
          carrier: row.carrier,
          devicePlatform: row.device_platform,
          conditionalForwardingConfigured:
            row.conditional_forwarding_configured,
          disclosureVerified: row.disclosure_verified,
          declinedConsentVerified: row.declined_consent_verified,
          testCallCompleted: row.test_call_completed,
          callLogVerified: row.call_log_verified,
          rollbackUnderstood: row.rollback_understood,
          brokerApprovalConfirmed: row.broker_approval_confirmed,
        }
      : {},
  );
}

export async function getVoiceConsoleState(
  userId: string,
  workspaceId: string,
  sqlOverride?: Sql,
): Promise<VoiceConsoleState> {
  const sql = sqlOverride ?? (await getSql());
  const workspace = await requireWorkspaceAccess(
    userId,
    workspaceId,
    ["owner", "admin"],
    sql,
  );
  const [profile, setup, prompt, allowance, billing, checklistRows, pushRows] =
    await Promise.all([
      getAgentProfile(userId, workspace.id, sql),
      getVoiceSetup(userId, workspace.id, sql),
      getLatestPromptVersion(userId, workspace.id, sql),
      getVoiceAllowanceStatus(workspace.id, sql),
      getVoiceBillingAvailability(userId, workspace.id, sql),
      sql.query<ChecklistRow>(
        `select carrier, device_platform, conditional_forwarding_configured,
                disclosure_verified, declined_consent_verified,
                test_call_completed, call_log_verified, rollback_understood,
                broker_approval_confirmed
           from voice_setup_checklists
          where workspace_id = $1
          limit 1`,
        [workspace.id],
      ),
      sql.query<{ count: number }>(
        `select count(*)::bigint as count
           from push_subscriptions
          where workspace_id = $1 and user_id = $2 and revoked_at is null`,
        [workspace.id, userId],
      ),
    ]);

  const checklist = toChecklist(checklistRows[0]);
  const pushSaved = (pushRows[0]?.count ?? 0) > 0;

  return {
    workspaceId: workspace.id,
    profile: {
      ready: Boolean(profile?.businessName || profile?.displayName),
      label: profile?.businessName ?? profile?.displayName ?? null,
    },
    setup,
    entitlement: {
      ...allowance,
      canProvision: allowance.state === "active",
    },
    billing,
    customization: prompt?.customization ?? voicePromptCustomizationSchema.parse({}),
    checklist,
    readyForMissedCalls:
      allowance.state === "active" &&
      setup.assistant.status === "active" &&
      Boolean(setup.phoneNumber) &&
      setup.promptSyncState === "synced" &&
      isVoiceChecklistComplete(checklist),
    push: pushSaved
      ? {
          status: "subscription_saved_delivery_not_configured",
          message:
            "A device subscription is stored, but this release has no push delivery worker. Check Call Logs for completed calls.",
        }
      : {
          status: "not_configured",
          message:
            "Native push is not configured in this release. Completed calls still appear in Call Logs.",
        },
  };
}

export async function saveVoiceSetupChecklist(
  userId: string,
  workspaceId: string,
  rawChecklist: VoiceSetupChecklist,
  sqlOverride?: Sql,
): Promise<VoiceSetupChecklist> {
  const sql = sqlOverride ?? (await getSql());
  const workspace = await requireWorkspaceAccess(
    userId,
    workspaceId,
    ["owner", "admin"],
    sql,
  );
  const setup = await getVoiceSetup(userId, workspace.id, sql);
  const checklist = voiceSetupChecklistSchema.parse(rawChecklist);
  const complete = isVoiceChecklistComplete(checklist);
  const rows = await sql.query<ChecklistRow>(
    `insert into voice_setup_checklists (
       workspace_id, assistant_id, carrier, device_platform,
       conditional_forwarding_configured, disclosure_verified,
       declined_consent_verified, test_call_completed, call_log_verified,
       rollback_understood, broker_approval_confirmed, ready_at,
       updated_by_user_id
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
               case when $12 then now() else null end,$13)
     on conflict (workspace_id) do update set
       assistant_id = excluded.assistant_id,
       carrier = excluded.carrier,
       device_platform = excluded.device_platform,
       conditional_forwarding_configured = excluded.conditional_forwarding_configured,
       disclosure_verified = excluded.disclosure_verified,
       declined_consent_verified = excluded.declined_consent_verified,
       test_call_completed = excluded.test_call_completed,
       call_log_verified = excluded.call_log_verified,
       rollback_understood = excluded.rollback_understood,
       broker_approval_confirmed = excluded.broker_approval_confirmed,
       ready_at = case
         when $12 then coalesce(voice_setup_checklists.ready_at, now())
         else null
       end,
       updated_by_user_id = excluded.updated_by_user_id,
       updated_at = now()
     returning carrier, device_platform, conditional_forwarding_configured,
               disclosure_verified, declined_consent_verified,
               test_call_completed, call_log_verified, rollback_understood,
               broker_approval_confirmed`,
    [
      workspace.id,
      setup.assistant.id,
      checklist.carrier,
      checklist.devicePlatform,
      checklist.conditionalForwardingConfigured,
      checklist.disclosureVerified,
      checklist.declinedConsentVerified,
      checklist.testCallCompleted,
      checklist.callLogVerified,
      checklist.rollbackUnderstood,
      checklist.brokerApprovalConfirmed,
      complete,
      userId,
    ],
  );
  return toChecklist(rows[0]);
}
