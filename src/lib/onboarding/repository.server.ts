import { createHash, randomUUID } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import type { AgentPageDiscovery } from "@/lib/website-scrape";
import {
  ensurePersonalWorkspace,
  getAgentProfile,
  saveAgentProfile,
} from "@/lib/workspaces/repository.server";
import type { AgentProfileRecord } from "@/lib/workspaces/types";
import {
  buildOnboardingPreview,
  onboardingConfirmationSchema,
  onboardingNamesMatch,
  onboardingProfileFieldsSchema,
  type OnboardingConfirmation,
  type OnboardingConflict,
  type OnboardingField,
  type OnboardingProfile,
  type OnboardingSnapshot,
  type OnboardingSource,
  type OnboardingSourceKind,
} from "./types";

export const ONBOARDING_SCAN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
interface ProfileRow {
  revision: number;
  profile: OnboardingProfile | null;
  conflicts: OnboardingConflict[];
  corrected_fields: OnboardingField[];
}

/** The core profile predates onboarding revisions. Expose its actual values for
 * review before the first confirmation, without inventing identity or dates. */
function legacyCoreProfile(core: AgentProfileRecord | null): OnboardingProfile | null {
  const name = onboardingProfileFieldsSchema.shape.name.safeParse(core?.displayName);
  if (!core || !name.success || !name.data) return null;
  const current: OnboardingProfile = {
    name: name.data,
    website: core.websiteUrl ?? "",
    areaOfOperations: core.areaOfOperations ?? "",
    mls: core.mlsBoard ?? "",
    ...(core.businessPhone ? { phone: core.businessPhone } : {}),
    ...(core.brokerage ? { brokerage: core.brokerage } : {}),
    ...(core.mlsAgentId ? { agentMlsId: core.mlsAgentId } : {}),
    ...(core.licenseNumber ? { license: core.licenseNumber } : {}),
    onboardedAt: "",
    onboardingRevision: 0,
    dataSource: "manual",
  };
  return {
    ...buildOnboardingPreview([], name.data, current).profile,
    onboardedAt: "",
    onboardingRevision: 0,
    dataSource: "manual",
  };
}

async function snapshot(
  workspaceId: string,
  row: ProfileRow,
  sql: Sql,
): Promise<OnboardingSnapshot | null> {
  if (!row.profile || !row.revision) return null;
  const sources = await sql.query<{ source: OnboardingSource }>(
    `select source from workspace_onboarding_sources
     where workspace_id = $1 and confirmed_revision is not null
     order by confirmed_revision, observed_at, id`,
    [workspaceId],
  );
  return {
    workspaceId,
    revision: row.revision,
    profile: row.profile,
    sources: sources.map(({ source }) => source),
    conflicts: row.conflicts,
    correctedFields: row.corrected_fields,
  };
}

/** Owner comes only from authMiddleware. No caller-selected workspace is accepted. */
export async function readOnboardingProfile(
  userId: string,
  sqlOverride?: Sql,
): Promise<OnboardingSnapshot | null> {
  const sql = sqlOverride ?? (await getSql());
  const workspace = await ensurePersonalWorkspace(userId, sql);
  const rows = await sql.query<ProfileRow>(
    `select revision, profile, conflicts, corrected_fields from workspace_onboarding_profiles where workspace_id = $1`,
    [workspace.id],
  );
  if (rows[0]?.profile && rows[0].revision > 0) return snapshot(workspace.id, rows[0], sql);
  const profile = legacyCoreProfile(await getAgentProfile(userId, workspace.id, sql));
  return profile
    ? {
        workspaceId: workspace.id,
        revision: 0,
        profile,
        sources: [],
        conflicts: [],
        correctedFields: [],
      }
    : null;
}

/** Internal server entry point: the public API obtains discovery directly from
 * the bounded safe fetch/parser. Browsers cannot submit evidence or timestamps. */
export async function stageOnboardingSource(
  userId: string,
  kind: OnboardingSourceKind,
  discovery: AgentPageDiscovery,
  sqlOverride?: Sql,
): Promise<OnboardingSource> {
  const sql = sqlOverride ?? (await getSql());
  const workspace = await ensurePersonalWorkspace(userId, sql);
  const source: OnboardingSource = { ...discovery, id: randomUUID(), kind };
  if (!Number.isFinite(Date.parse(source.observedAt)) || JSON.stringify(source).length > 240_000) {
    throw new Error("The page result could not be saved. Retry or continue with the other page.");
  }
  await sql.query(
    `insert into workspace_onboarding_sources (id, workspace_id, source, observed_at) values ($1,$2,$3::jsonb,$4::timestamptz)`,
    [source.id, workspace.id, JSON.stringify(source), source.observedAt],
  );
  return source;
}

function requestKey(input: OnboardingConfirmation): string {
  const canonical = {
    ...input,
    scanIds: [...input.scanIds].sort(),
    overrides: Object.fromEntries(
      Object.entries(input.overrides ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/** Confirmation is serialized with the core Outreach/assistant profile write.
 * Evidence is append-only; a rescan offers alternatives instead of undoing edits. */
export async function confirmOnboarding(
  userId: string,
  input: OnboardingConfirmation,
  nowISO = new Date().toISOString(),
  sqlOverride?: Sql,
): Promise<OnboardingSnapshot> {
  const data = onboardingConfirmationSchema.parse(input);
  if (
    data.overrides?.name !== undefined &&
    !onboardingNamesMatch(data.overrides.name, data.confirmedName)
  ) {
    throw new Error("Confirm the same person as the profile name before saving.");
  }
  const sql = sqlOverride ?? (await getSql());
  const workspace = await ensurePersonalWorkspace(userId, sql);
  const key = requestKey(data);
  return sql.transaction(async (tx) => {
    await tx.query(
      `insert into workspace_onboarding_profiles (workspace_id) values ($1) on conflict (workspace_id) do nothing`,
      [workspace.id],
    );
    const [current] = await tx.query<ProfileRow>(
      `select revision, profile, conflicts, corrected_fields from workspace_onboarding_profiles where workspace_id = $1 for update`,
      [workspace.id],
    );
    const replay = await tx.query(
      `select revision from workspace_onboarding_revisions where workspace_id = $1 and request_key = $2`,
      [workspace.id, key],
    );
    if (replay.length) return (await snapshot(workspace.id, current, tx))!;
    if (current.revision !== data.expectedRevision) {
      throw new Error("Your saved profile changed. Reload the latest profile before confirming.");
    }
    // Serialize against the older core profile editor as well as onboarding.
    // The same fallback is exposed by readOnboardingProfile for review in the UI.
    await tx.query(`select workspace_id from agent_profiles where workspace_id = $1 for update`, [
      workspace.id,
    ]);
    const existingCore = await getAgentProfile(userId, workspace.id, tx);
    const currentProfile = current.profile ?? legacyCoreProfile(existingCore);
    const selected: OnboardingSource[] = [];
    let newEvidence = false;
    for (const id of data.scanIds) {
      const [row] = await tx.query<{ source: OnboardingSource; confirmed_revision: number | null }>(
        `select source, confirmed_revision from workspace_onboarding_sources where id = $1 and workspace_id = $2`,
        [id, workspace.id],
      );
      // A foreign ID and an unknown ID have the same public error.
      if (!row) throw new Error("Page scan not found. Read the page again.");
      const age = Date.parse(nowISO) - Date.parse(row.source.observedAt);
      if (!Number.isFinite(age) || age < -60_000 || age > ONBOARDING_SCAN_MAX_AGE_MS) {
        throw new Error("This page scan has expired. Read the page again before confirming.");
      }
      selected.push(row.source);
      newEvidence ||= row.confirmed_revision === null;
    }
    selected.sort((a, b) => (a.kind === "website" ? 0 : 1) - (b.kind === "website" ? 0 : 1));
    const sameIdentity =
      !!currentProfile && onboardingNamesMatch(currentProfile.name, data.confirmedName);
    const preview = buildOnboardingPreview(selected, data.confirmedName, currentProfile);
    const fields = onboardingProfileFieldsSchema.parse({ ...preview.profile, ...data.overrides });
    if (!fields.name.trim()) throw new Error("Confirm your name before saving.");
    const correctedFields = [
      ...new Set([
        ...(sameIdentity ? current.corrected_fields : []),
        ...(Object.keys(data.overrides ?? {}) as OnboardingField[]),
      ]),
    ].sort();
    const conflicts = [
      ...(sameIdentity ? current.conflicts : []).filter(
        (old) => !preview.conflicts.some((next) => next.field === old.field),
      ),
      ...preview.conflicts,
    ].map((conflict) => ({ ...conflict, keptValue: fields[conflict.field] }));
    if (
      sameIdentity &&
      current.profile &&
      !newEvidence &&
      JSON.stringify(buildOnboardingPreview([], data.confirmedName, current.profile).profile) ===
        JSON.stringify(fields) &&
      JSON.stringify(current.corrected_fields) === JSON.stringify(correctedFields) &&
      JSON.stringify(current.conflicts) === JSON.stringify(conflicts)
    ) {
      return (await snapshot(workspace.id, current, tx))!;
    }
    const revision = current.revision + 1;
    const hasIdentity = selected.some(
      (source) =>
        source.ok &&
        source.candidates.some((candidate) =>
          onboardingNamesMatch(candidate.profile.name, data.confirmedName),
        ),
    );
    const profile: OnboardingProfile = {
      ...(sameIdentity ? currentProfile : {}),
      ...fields,
      onboardedAt: current.profile?.onboardedAt ?? nowISO,
      onboardingRevision: revision,
      dataSource: hasIdentity
        ? "website"
        : ((sameIdentity ? currentProfile?.dataSource : undefined) ?? "manual"),
      ...(hasIdentity ? { lastWebsiteScrapeAt: nowISO } : {}),
    };
    await tx.query(
      `update workspace_onboarding_profiles set revision=$2, profile=$3::jsonb, conflicts=$4::jsonb, corrected_fields=$5::jsonb, updated_at=$6::timestamptz where workspace_id=$1`,
      [
        workspace.id,
        revision,
        JSON.stringify(profile),
        JSON.stringify(conflicts),
        JSON.stringify(correctedFields),
        nowISO,
      ],
    );
    for (const source of selected) {
      await tx.query(
        `update workspace_onboarding_sources set confirmed_revision = coalesce(confirmed_revision, $3) where id=$1 and workspace_id=$2`,
        [source.id, workspace.id, revision],
      );
    }
    await tx.query(
      `insert into workspace_onboarding_revisions (workspace_id, revision, request_key, profile, conflicts, corrected_fields, source_ids, created_at)
       values ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::timestamptz)`,
      [
        workspace.id,
        revision,
        key,
        JSON.stringify(profile),
        JSON.stringify(conflicts),
        JSON.stringify(correctedFields),
        JSON.stringify(data.scanIds),
        nowISO,
      ],
    );
    await saveAgentProfile(
      userId,
      workspace.id,
      {
        displayName: profile.name,
        businessName: existingCore?.businessName ?? undefined,
        businessPhone: profile.phone,
        websiteUrl: profile.website,
        areaOfOperations: profile.areaOfOperations,
        brokerage: profile.brokerage,
        mlsBoard: profile.mls,
        mlsAgentId: profile.agentMlsId,
        licenseNumber: profile.license,
        timezone: existingCore?.timezone ?? "America/Los_Angeles",
      },
      tx,
    );
    return (await snapshot(
      workspace.id,
      { revision, profile, conflicts, corrected_fields: correctedFields },
      tx,
    ))!;
  });
}
