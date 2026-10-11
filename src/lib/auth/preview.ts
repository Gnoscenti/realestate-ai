/**
 * Shared live-preview OAuth client configuration (server-only).
 *
 * Production deployments use per-app GROK_AUTH_* credentials. Sandbox previews
 * may opt into the shared preview client by providing
 * GROK_PREVIEW_CLIENT_SECRET as a server-side secret. No credential belongs in
 * this public repository.
 */
export const PREVIEW_CLIENT_ID =
  process.env.GROK_PREVIEW_CLIENT_ID?.trim() || "grok_preview";
export const PREVIEW_CLIENT_SECRET =
  process.env.GROK_PREVIEW_CLIENT_SECRET?.trim() || "";

/** The shared auth broker issuer (OIDC discovery lives under it). */
export const GROK_ISSUER_DEFAULT = "https://auth.grok.me";

/** Dynamic sandbox hosts accepted by the preview OAuth client. */
export const PREVIEW_ALLOWED_HOSTS = ["*.grok-sandbox.com"] as const;
