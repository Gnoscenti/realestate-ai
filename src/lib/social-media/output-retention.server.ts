import sharp from "sharp";
import { randomUUID } from "node:crypto";
import type { Sql } from "@/lib/db";
import { safeFetch } from "@/lib/safe-outbound-url.server";
import { publicHttpsUrlFromAllowlist } from "./url-safety.server";
import { imageHash } from "./image.server";
import { storeManagedImage, managedMediaUrl } from "./managed-media.server";
export async function retainOrshotOutput(
  sql: Sql,
  input: {
    userId: string;
    workspaceId: string;
    listingId: string;
    url: string;
  },
) {
  if (!publicHttpsUrlFromAllowlist(input.url, process.env.ORSHOT_OUTPUT_HOST_ALLOWLIST))
    throw new Error("Provider output host is not approved");
  const { response } = await safeFetch(
    input.url,
    { signal: AbortSignal.timeout(20_000) },
    { maxRedirects: 0 },
  );
  if (!response.ok || !response.body) throw new Error("Provider output could not be retained");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.length;
      if (total > 6 * 1024 * 1024) throw new Error("Provider output exceeds retention limit");
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const raw = Buffer.concat(chunks);
  const decoder = sharp(raw, { limitInputPixels: 25_000_000, failOn: "warning" });
  const meta = await decoder.metadata();
  if (
    meta.format !== "png" ||
    !meta.width ||
    !meta.height ||
    meta.width > 5000 ||
    meta.height > 5000 ||
    (meta.pages ?? 1) !== 1
  )
    throw new Error("Provider output is not a supported PNG");
  const bytes = await decoder.png().toBuffer();
  const id = randomUUID();
  await storeManagedImage(sql, {
    ...input,
    id,
    kind: "render",
    bytes,
    contentType: "image/png",
    width: meta.width,
    height: meta.height,
    originalHash: imageHash(raw),
  });
  return managedMediaUrl(id);
}
