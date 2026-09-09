import { getVercelOidcTokenSync } from "@vercel/oidc";

/**
 * Resolve for each invocation: Vercel Functions supply their rotating OIDC
 * credential in the trusted request context, not the build environment.
 * Keep an explicitly configured static Gateway key as the first choice.
 */
export function assistantGatewayToken(): string | null {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (apiKey) return apiKey;

  try {
    // The official helper reads Vercel's request context before the local
    // VERCEL_OIDC_TOKEN fallback. Never cache or expose the returned token.
    return getVercelOidcTokenSync().trim() || null;
  } catch {
    return null;
  }
}
