import { hasBlockingFinding, reviewCaption } from "./fair-housing";
import type { Sql } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/workspaces/repository.server";
import { managedMediaUrl } from "@/lib/social-media/managed-media.server";

/** Never accept a browser URL as proof that a photo belongs to this workspace. */
export async function resolveManagedAttachments(userId: string, workspaceId: string, ids: string[] | undefined, sql: Sql) {
  if (!ids?.length) return [];
  await requireWorkspaceAccess(userId, workspaceId, undefined, sql);
  const rows = await sql.query<{ id: string; title: string; content_type: string; sha256: string; kind: string; overlay_text: string | null }>(
    "select m.id,l.title,m.content_type,m.sha256,m.kind,m.overlay_text from managed_listing_media m " +
    "join listings l on l.id=m.listing_id and l.workspace_id=m.workspace_id " +
    "where m.workspace_id=$1 and m.id=any($2::text[])", [workspaceId, ids],
  );
  const ordered = ids.map(id => rows.find(row => row.id === id));
  if (ordered.some(row => !row)) throw new Error("A saved photo is unavailable. Remove it or choose a retained photo from this workspace.");
  for (const row of ordered) {
    if (row!.kind !== "render") continue; // Raw photo pixels have not been reviewed by OCR.
    if (!row!.overlay_text?.trim())
      throw new Error("This saved image has no retained text review. Generate a new image export before attaching or publishing it.");
    if (hasBlockingFinding(reviewCaption(row!.overlay_text)))
      throw new Error("This image contains a blocking fair-housing phrase. Correct the title or address and generate a new image export.");
  }
  return ordered.map(row => ({ id: row!.id, title: row!.title, contentType: row!.content_type,
    sha256: row!.sha256, url: managedMediaUrl(row!.id) }));
}
