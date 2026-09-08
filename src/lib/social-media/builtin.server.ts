import { randomUUID } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import { builtinImageSchema } from "./managed-types";
import { imageHash, renderBuiltinImage } from "./image.server";
import { readManagedImage, storeManagedImage, managedMediaUrl } from "./managed-media.server";
import * as repository from "./repository.server";
export async function generateBuiltinImage(
  userId: string,
  workspaceId: string,
  raw: unknown,
  sqlOverride?: Sql,
) {
  const input = builtinImageSchema.parse(raw);
  const sql = sqlOverride ?? (await getSql());
  await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"], sql);
  const listing = (
    await sql.query<{ title: string; address: string }>(
      "select l.title,coalesce(l.address_line1,'') as address from listings l " +
        "join managed_listing_media m on m.listing_id=l.id and m.workspace_id=l.workspace_id " +
        "join listing_media lm on lm.id=m.id and lm.listing_id=l.id and lm.workspace_id=l.workspace_id " +
        "where l.id=$1 and l.workspace_id=$2 and m.id=$3 and m.kind='photo'",
      [input.listingId, workspaceId, input.mediaId],
    )
  )[0];
  if (!listing) throw new Error("Choose an uploaded photo from this listing");
  const intent = {
    listingId: input.listingId,
    kind: "image" as const,
    templateKey: "builtin-square-v1",
    mediaIds: [input.mediaId],
  };
  await repository.recoverInterruptedBuiltinJobs(sql, workspaceId, userId);
  const claimed = await repository.createSocialMediaJob(sql, {
    ...intent,
    id: input.requestId,
    workspaceId,
    userId,
    provider: "builtin",
    status: "processing",
  });
  if (!claimed) {
    if (await repository.mediaJobMatchesInput(sql, workspaceId, userId, input.requestId, intent)) {
      const job = await repository.getSocialMediaJob(sql, workspaceId, userId, input.requestId);
      if (job) return job;
    }
    const active = await repository.getActiveSocialMediaJobForIntent(
      sql,
      workspaceId,
      userId,
      intent,
    );
    if (active) return active;
    throw new Error("Request ID already used. Start a new image export.");
  }
  const quota = await sql.query<{ reserved: boolean }>(
    "with candidate as materialized (select id from social_media_jobs where id=$1 and workspace_id=$2 " +
      "and status='processing' and unit_count=0 for update), quota as (" +
      "insert into social_builtin_daily_quota(workspace_id,run_date,used_units) " +
      "select $2,(now() at time zone 'UTC')::date,1 from candidate " +
      "on conflict(workspace_id,run_date) do update set used_units=social_builtin_daily_quota.used_units+1 " +
      "where social_builtin_daily_quota.used_units<10 returning 1), charged as (" +
      "update social_media_jobs set unit_count=1 where id=$1 and workspace_id=$2 " +
      "and exists(select 1 from quota) returning 1) select exists(select 1 from charged) as reserved",
    [input.requestId, workspaceId],
  );
  if (!quota[0]?.reserved) {
    await repository.markSocialMediaJob(sql, workspaceId, input.requestId, {
      status: "blocked",
      errorCode: "quota_exhausted",
      errorMessage: "Ten free image exports are available per workspace per UTC day.",
      unitCount: 0,
    });
    const blocked = await repository.getSocialMediaJob(sql, workspaceId, userId, input.requestId);
    if (!blocked) throw new Error("Export status could not be confirmed");
    return blocked;
  }
  try {
    const source = await readManagedImage(userId, input.mediaId, sql);
    const bytes = await renderBuiltinImage(source.bytes, listing.title, listing.address);
    const assetId = randomUUID();
    await storeManagedImage(sql, {
      id: assetId,
      userId,
      workspaceId,
      listingId: input.listingId,
      kind: "render",
      bytes,
      contentType: "image/png",
      width: 1080,
      height: 1080,
      originalHash: imageHash(source.bytes),
    });
    if (
      !(await repository.completeSocialMediaImageJob(sql, {
        workspaceId,
        jobId: input.requestId,
        contentUrl: managedMediaUrl(assetId),
      }))
    )
      throw new Error("Image completion could not be confirmed");
    const job = await repository.getSocialMediaJob(sql, workspaceId, userId, input.requestId);
    if (!job?.asset) throw new Error("Image completion could not be confirmed");
    return job;
  } catch (error) {
    await repository.markSocialMediaJob(sql, workspaceId, input.requestId, {
      status: "failed",
      errorCode: "provider_unavailable",
      errorMessage: "Image export failed. Your original photo is retained; start a new export.",
    });
    const failed = await repository.getSocialMediaJob(sql, workspaceId, userId, input.requestId);
    if (!failed) throw error;
    return failed;
  }
}
