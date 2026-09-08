import { z } from "zod";
export const manualSocialListingSchema = z.object({
  title: z.string().trim().min(1).max(100),
  address: z.string().trim().min(1).max(180),
  rightsConfirmed: z.literal(true),
});
export const builtinImageSchema = z.object({
  requestId: z.uuid(),
  listingId: z.string().min(1).max(240),
  mediaId: z.uuid(),
});
export interface ManagedPhotoView {
  id: string;
  listingId: string;
  title: string;
  kind: "photo" | "render";
  url: string;
  sha256: string;
  byteSize: number;
  width: number;
  height: number;
}
