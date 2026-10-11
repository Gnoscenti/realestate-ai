import sharp from "sharp";
import { createHash } from "node:crypto";
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const imageHash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export async function normalizeListingPhoto(bytes: Buffer) {
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES)
    throw new Error("Choose a photo up to 2 MB");
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isWebp =
    bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!isJpeg && !isPng && !isWebp) throw new Error("Choose a single JPEG, PNG, or WebP photo");
  const source = sharp(bytes, { limitInputPixels: 24_000_000, failOn: "warning" });
  const metadata = await source.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1)
    throw new Error("Choose a single JPEG, PNG, or WebP photo");
  const result = await source
    .rotate()
    .resize(2400, 2400, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer({ resolveWithObject: true });
  return {
    bytes: result.data,
    width: result.info.width,
    height: result.info.height,
    contentType: "image/jpeg" as const,
    originalHash: imageHash(bytes),
  };
}
const xml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] ?? "",
  );
export async function renderBuiltinImage(photo: Buffer, title: string, address: string) {
  const fitted = await sharp(photo, { limitInputPixels: 24_000_000 })
    .resize(1080, 780, { fit: "contain", background: "#f4f4f5" })
    .toBuffer();
  // Full photo, no invented rooms or surroundings. Only two audited text layers.
  const labels = Buffer.from(
    '<svg width="1080" height="300" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="1080" height="300" fill="#122c36"/>' +
      '<text x="60" y="94" font-family="sans-serif" font-size="40" fill="white">' +
      xml(title.slice(0, 40)) +
      "</text>" +
      '<text x="60" y="164" font-family="sans-serif" font-size="25" fill="#d5e7e9">' +
      xml(address.slice(0, 65)) +
      "</text>" +
      '<text x="60" y="248" font-family="sans-serif" font-size="19" fill="#d5e7e9">Property information supplied by the agent</text></svg>',
  );
  return sharp({ create: { width: 1080, height: 1080, channels: 3, background: "#f4f4f5" } })
    .composite([
      { input: fitted, top: 0, left: 0 },
      { input: labels, top: 780, left: 0 },
    ])
    .png()
    .toBuffer();
}
