import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { ManagedPhotoView } from "@/lib/social-media/managed-types";
import type { SocialMediaJobView } from "@/lib/social-media/types";

type Workspace = {
  pendingPublicDeletions: number;
  listings: Array<{ id: string; title: string; address: string }>;
  images: ManagedPhotoView[];
};
export function ActualPhotoStudio() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [listingId, setListingId] = useState("");
  const [photoId, setPhotoId] = useState("");
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [rights, setRights] = useState(false);
  const [publicDelivery, setPublicDelivery] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<SocialMediaJobView | null>(null);
  const request = useRef<{ intent: string; id: string } | null>(null);
  async function reload() {
    const { getManagedMediaWorkspace } = await import("@/lib/social-media/managed-api");
    setWorkspace(await getManagedMediaWorkspace());
  }
  useEffect(() => {
    void reload().catch(() =>
      setError("Sign in to load your saved property photos, or retry if the connection failed."),
    );
  }, []);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The action could not be completed. Your saved photos remain available.",
      );
    } finally {
      setBusy(false);
    }
  }
  const photos =
    workspace?.images.filter((i) => i.kind === "photo" && i.listingId === listingId) ?? [];
  return (
    <Card aria-label="Actual-photo image studio">
      <CardHeader>
        <CardTitle>Actual-photo image studio</CardTitle>
        <CardDescription>
          Upload a property photo and export a 1080 × 1080 image with your supplied title and
          address. Free beta: 10 exports per UTC day and 100 MB of retained media per workspace.
          Photos are kept until you delete the saved property or workspace. No automatic publishing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <div role="alert" className="rounded border border-destructive p-3">
            <p>{error}</p>
            <Button variant="outline" disabled={busy} onClick={() => void action(reload)}>
              Reload saved photos
            </Button>
          </div>
        )}
        {notice && <p role="status">{notice}</p>}
        {!workspace && !error && <p role="status">Loading saved property photos…</p>}
        {workspace && (
          <fieldset disabled={busy} className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="studio-title">Property title</Label>
                <Input
                  id="studio-title"
                  maxLength={100}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="studio-address">Property address</Label>
                <Input
                  id="studio-address"
                  maxLength={180}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={rights}
                onChange={(e) => setRights(e.target.checked)}
              />
              I have permission to market this property and use these actual photos. This does not
              verify an MLS listing role.
            </label>
            <Button
              variant="outline"
              disabled={!rights || !title.trim() || !address.trim()}
              onClick={() =>
                void action(async () => {
                  const { createManualSocialListing } =
                    await import("@/lib/social-media/managed-api");
                  const saved = await createManualSocialListing({
                    data: { title, address, rightsConfirmed: true },
                  });
                  await reload();
                  setListingId(saved.id);
                  setPhotoId("");
                  setJob(null);
                  setTitle("");
                  setAddress("");
                  setNotice("Property saved. Add an actual photo below.");
                })
              }
            >
              Save property for photos
            </Button>
            <div>
              <Label htmlFor="studio-listing">Property for image export</Label>
              <select
                id="studio-listing"
                className="mt-1 block w-full rounded border bg-background p-2"
                value={listingId}
                onChange={(e) => {
                  setListingId(e.target.value);
                  setPhotoId("");
                  setJob(null);
                  request.current = null;
                }}
              >
                <option value="">Choose a saved property</option>
                {workspace.listings.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title} — {l.address}
                  </option>
                ))}
              </select>
              {!workspace.listings.length && (
                <p className="mt-2 text-sm text-muted-foreground">
                  No properties saved yet. Add the property details above.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="studio-photo">Actual property photo</Label>
              <Input
                id="studio-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                JPEG, PNG or WebP, up to 2 MB. The server verifies the image and removes location
                metadata.
              </p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={publicDelivery}
                onChange={(e) => setPublicDelivery(e.target.checked)}
              />
              Also create a public photo URL for the paid renderer (requires configured Blob
              storage). Leave unchecked for private built-in exports.
            </label>
            <Button
              disabled={!listingId || !file || !rights}
              onClick={() =>
                void action(async () => {
                  if (!file) return;
                  const data = new FormData();
                  data.set("photo", file);
                  data.set("listingId", listingId);
                  data.set("rightsConfirmed", "true");
                  data.set("publicForRenderer", String(publicDelivery));
                  const { uploadSocialPhoto } = await import("@/lib/social-media/managed-api");
                  const uploaded = await uploadSocialPhoto({ data });
                  await reload();
                  setPhotoId(uploaded.id);
                  setJob(null);
                  setNotice(
                    uploaded.deliveryWarning ??
                      "Photo saved with server-verified dimensions and checksum.",
                  );
                })
              }
            >
              Upload actual photo
            </Button>
            {listingId && (
              <Button
                variant="outline"
                onClick={() => {
                  if (
                    !window.confirm(
                      "Delete this studio property and all its retained photos and image exports?",
                    )
                  )
                    return;
                  void action(async () => {
                    const { deleteStudioProperty } = await import("@/lib/social-media/managed-api");
                    const result = await deleteStudioProperty({ data: { listingId } });
                    setListingId("");
                    setPhotoId("");
                    setJob(null);
                    request.current = null;
                    await reload();
                    setNotice(
                      result.pendingPublicDeletions
                        ? "Private photos deleted. Public copies still need deletion; retry below."
                        : "Property and retained photos deleted.",
                    );
                  });
                }}
              >
                Delete studio property and photos
              </Button>
            )}
            {workspace.pendingPublicDeletions > 0 && (
              <div role="status">
                <p>
                  {workspace.pendingPublicDeletions} public photo deletions are pending. Those
                  public URLs may remain accessible until deletion succeeds.
                </p>
                <Button
                  variant="outline"
                  onClick={() =>
                    void action(async () => {
                      const { retryPublicMediaDeletion } =
                        await import("@/lib/social-media/managed-api");
                      const result = await retryPublicMediaDeletion();
                      await reload();
                      setNotice(
                        result.pendingPublicDeletions
                          ? "Public deletion remains pending. Check the storage connection."
                          : "Public copies deleted.",
                      );
                    })
                  }
                >
                  Retry public photo deletion
                </Button>
              </div>
            )}
            {listingId && !photos.length && (
              <p className="text-sm text-muted-foreground">
                No uploaded photos for this property yet.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {photos.map((photo) => (
                <label key={photo.id} className="space-y-2 rounded border p-2">
                  <img
                    src={photo.url}
                    alt={"Uploaded property photo: " + photo.title}
                    className="aspect-square w-full rounded object-contain"
                  />
                  <span className="flex gap-2 text-xs">
                    <input
                      type="radio"
                      name="studio-selected-photo"
                      value={photo.id}
                      checked={photoId === photo.id}
                      onChange={() => {
                        setPhotoId(photo.id);
                        setJob(null);
                        request.current = null;
                      }}
                    />
                    Use this photo · {photo.width} × {photo.height}
                  </span>
                </label>
              ))}
            </div>
            <Button
              disabled={!photoId || !listingId}
              onClick={() =>
                void action(async () => {
                  const intent = listingId + ":" + photoId;
                  if (request.current?.intent !== intent)
                    request.current = { intent, id: crypto.randomUUID() };
                  const { createBuiltinSocialImage } =
                    await import("@/lib/social-media/managed-api");
                  const result = await createBuiltinSocialImage({
                    data: { requestId: request.current!.id, listingId, mediaId: photoId },
                  });
                  setJob(result);
                  await reload();
                  if (result.status === "completed")
                    setNotice("Image exported and retained. Review it before posting.");
                  else
                    setNotice(
                      result.errorMessage ??
                        "The export is processing. Reload saved photos to check its status.",
                    );
                })
              }
            >
              {busy ? "Working…" : "Export square image"}
            </Button>
            {job?.asset && (
              <div className="space-y-2">
                <img
                  src={job.asset.contentUrl}
                  alt="Actual-photo image export"
                  className="w-full max-w-md rounded border"
                />
                <Button asChild>
                  <a href={job.asset.contentUrl} download="property-social.png">
                    Download PNG
                  </a>
                </Button>
              </div>
            )}
            {workspace.images.some((i) => i.kind === "render") && (
              <details>
                <summary>Retained image exports</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {workspace.images
                    .filter((i) => i.kind === "render")
                    .map((i) => (
                      <div key={i.id} className="rounded border p-2">
                        <img
                          src={i.url}
                          alt={"Retained image: " + i.title}
                          className="aspect-square w-full object-contain"
                        />
                        <a
                          href={i.url}
                          download="property-social.png"
                          className="text-sm underline"
                        >
                          Download {i.title}
                        </a>
                        <p className="break-all text-[10px] text-muted-foreground">
                          SHA-256: {i.sha256}
                        </p>
                      </div>
                    ))}
                </div>
              </details>
            )}
          </fieldset>
        )}
        <p className="text-xs text-muted-foreground">
          The built-in template keeps the whole uploaded photo and adds only your title and address.
          It does not verify ownership, pricing, listing status, or brokerage claims. Video: Setup
          required. Direct publishing: Planned.
        </p>
      </CardContent>
    </Card>
  );
}
