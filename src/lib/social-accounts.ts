/**
 * Connected social accounts + per-network auto-post control (agent discretion).
 */

export type SocialNetworkId =
  | "instagram"
  | "facebook"
  | "linkedin"
  | "tiktok"
  | "x"
  | "youtube";

export type SocialAccountConnection = {
  id: SocialNetworkId;
  label: string;
  /** Connected handle / page name */
  handle: string;
  connected: boolean;
  /** Agent toggle: when on, approved posts may auto-queue/publish */
  autoPost: boolean;
  connectedAt?: string;
  lastPostAt?: string;
};

export const SOCIAL_NETWORKS: {
  id: SocialNetworkId;
  label: string;
  placeholder: string;
}[] = [
  { id: "instagram", label: "Instagram", placeholder: "@yourhandle" },
  { id: "facebook", label: "Facebook", placeholder: "Page name" },
  { id: "linkedin", label: "LinkedIn", placeholder: "Profile or company" },
  { id: "tiktok", label: "TikTok", placeholder: "@yourhandle" },
  { id: "x", label: "X (Twitter)", placeholder: "@yourhandle" },
  { id: "youtube", label: "YouTube", placeholder: "Channel name" },
];

export function defaultSocialAccounts(): SocialAccountConnection[] {
  return SOCIAL_NETWORKS.map((n) => ({
    id: n.id,
    label: n.label,
    handle: "",
    connected: false,
    autoPost: false,
  }));
}

export function networkForPlatform(
  platform: string,
): SocialNetworkId | null {
  if (platform === "stories") return "instagram";
  if (platform === "instagram") return "instagram";
  if (platform === "facebook") return "facebook";
  if (platform === "linkedin") return "linkedin";
  if (platform === "tiktok") return "tiktok";
  if (platform === "x") return "x";
  return null;
}
