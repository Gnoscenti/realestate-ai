import { createHash } from "node:crypto";
import type { SocialMediaTemplateView } from "./types";

export const SOCIAL_VIDEO_TEMPLATE: SocialMediaTemplateView = {
  key: "cutcli-slideshow",
  label: "Property photo slideshow",
  maxPhotos: 12,
  outputSize: "1080x1080",
};

export const VIDEO_SETUP_REQUIRED_MESSAGE =
  "Social video rendering is not live yet. No video was created, uploaded, or queued.";

export interface VideoProviderInput {
  jobId: string;
  listingId: string;
  mediaIds: string[];
}

export interface VideoProviderResult {
  status: "setup_required";
  referenceId: string;
  message: string;
}

export interface SocialVideoProvider {
  prepare(input: VideoProviderInput): Promise<VideoProviderResult>;
}

/**
 * Deterministic development/test seam. It never performs network I/O and never
 * returns a media URL. Keeping this result unavailable is intentional until a
 * current CutCLI SDK/account render has been smoke-tested on Vercel.
 */
export class SetupRequiredVideoProvider implements SocialVideoProvider {
  async prepare(input: VideoProviderInput): Promise<VideoProviderResult> {
    const referenceId = createHash("sha256")
      .update(
        [input.jobId, input.listingId, ...input.mediaIds].join("\u0000"),
        "utf8",
      )
      .digest("hex")
      .slice(0, 24);
    return {
      status: "setup_required",
      referenceId: `video-setup-${referenceId}`,
      message: VIDEO_SETUP_REQUIRED_MESSAGE,
    };
  }
}

export function getSocialVideoProvider(): SocialVideoProvider {
  return new SetupRequiredVideoProvider();
}
