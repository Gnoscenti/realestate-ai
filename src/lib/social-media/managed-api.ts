import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { manualSocialListingSchema, builtinImageSchema } from "./managed-types";

export const getManagedMediaWorkspace = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("@/lib/db");
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const { listManagedImages } = await import("./managed-media.server");
    const sql = await getSql();
    const workspace = await ensurePersonalWorkspace(context.userId, sql);
    const listings = await sql.query<{ id: string; title: string; address: string }>(
      "select id,title,coalesce(address_line1,'') as address from listings where workspace_id=$1 order by created_at desc limit 100",
      [workspace.id],
    );
    const images = await listManagedImages(context.userId, workspace.id, sql);
    const pending = await sql.query<{ count: number }>(
      "select count(*)::int as count from managed_media_delete_queue where workspace_id=$1",
      [workspace.id],
    );
    return { listings, images, pendingPublicDeletions: pending[0]?.count ?? 0 };
  });
export const createManualSocialListing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(manualSocialListingSchema)
  .handler(async ({ context, data }) => {
    const { randomUUID } = await import("node:crypto");
    const { getSql } = await import("@/lib/db");
    const { ensurePersonalWorkspace, requireWorkspaceAccess } =
      await import("@/lib/workspaces/repository.server");
    const sql = await getSql();
    const workspace = await ensurePersonalWorkspace(context.userId, sql);
    await requireWorkspaceAccess(context.userId, workspace.id, ["owner", "admin"], sql);
    const id = randomUUID();
    await sql.query(
      "insert into listings(id,workspace_id,title,address_line1,status,provenance,created_by_user_id) " +
        "values($1,$2,$3,$4,'unknown','agent_supplied:marketing_permission_confirmed',$5)",
      [id, workspace.id, data.title, data.address, context.userId],
    );
    return { id };
  });
export const uploadSocialPhoto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: FormData) => {
    if (!(data instanceof FormData)) throw new Error("Choose a photo to upload");
    return data;
  })
  .handler(async ({ context, data }) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const { uploadManagedPhoto } = await import("./managed-media.server");
    const file = data.get("photo");
    const listingId = data.get("listingId");
    if (
      !(file instanceof Blob) ||
      file.size > 2 * 1024 * 1024 ||
      file.size === 0 ||
      typeof listingId !== "string" ||
      !listingId ||
      listingId.length > 240
    )
      throw new Error("Choose a listing and a JPEG, PNG, or WebP photo up to 2 MB");
    const workspace = await ensurePersonalWorkspace(context.userId);
    return uploadManagedPhoto(
      context.userId,
      workspace.id,
      listingId,
      Buffer.from(await file.arrayBuffer()),
      data.get("rightsConfirmed") === "true",
      data.get("publicForRenderer") === "true",
    );
  });
export const createBuiltinSocialImage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(builtinImageSchema)
  .handler(async ({ context, data }) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const { generateBuiltinImage } = await import("./builtin.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    return generateBuiltinImage(context.userId, workspace.id, data);
  });

export const deleteStudioProperty = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ listingId: z.string().min(1).max(240) }))
  .handler(async ({ context, data }) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const { deleteManualSocialListing } = await import("./managed-media.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    return deleteManualSocialListing(context.userId, workspace.id, data.listingId);
  });
export const retryPublicMediaDeletion = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ensurePersonalWorkspace } = await import("@/lib/workspaces/repository.server");
    const { cleanupPublicMedia } = await import("./managed-media.server");
    const workspace = await ensurePersonalWorkspace(context.userId);
    return { pendingPublicDeletions: await cleanupPublicMedia(context.userId, workspace.id) };
  });
