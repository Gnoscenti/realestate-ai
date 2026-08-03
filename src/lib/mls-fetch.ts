/**
 * Server-side MLS fetch — credentials never log; used by createServerFn.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  buildMlsQueryUrl,
  mapPayloadToProperties,
  type MlsSyncRequest,
  type MlsSyncResponse,
} from "@/lib/mls-sync";
import type { MlsPlatformId } from "@/lib/mls-platforms";

const inputSchema = z.object({
  platform: z.enum([
    "bridge",
    "trestle",
    "spark",
    "mls_grid",
    "reso_web",
    "website",
    "csv",
  ]),
  baseUrl: z.string().min(4).max(500),
  accessToken: z.string().max(4000).optional(),
  clientId: z.string().max(200).optional(),
  clientSecret: z.string().max(400).optional(),
  dataset: z.string().max(120).optional(),
  agentMlsId: z.string().max(80).optional(),
  agentName: z.string().max(120).optional(),
  top: z.number().min(1).max(100).optional(),
});

async function fetchJson(
  url: string,
  headers: Record<string, string>,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string; status?: number }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      return {
        ok: false,
        error: `Non-JSON response (${res.status}) from MLS endpoint`,
        status: res.status,
      };
    }
    if (!res.ok) {
      const msg =
        (data &&
          typeof data === "object" &&
          ("error" in data || "message" in data) &&
          JSON.stringify(
            (data as { error?: unknown; message?: unknown }).error ??
              (data as { message?: unknown }).message,
          )) ||
        `HTTP ${res.status}`;
      return { ok: false, error: String(msg).slice(0, 300), status: res.status };
    }
    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "MLS fetch failed",
    };
  }
}

/** Optional OAuth client_credentials for Trestle-style platforms */
async function resolveAccessToken(
  req: MlsSyncRequest,
): Promise<{ token?: string; error?: string }> {
  if (req.accessToken) return { token: req.accessToken };
  if (
    req.platform === "trestle" &&
    req.clientId &&
    req.clientSecret &&
    req.baseUrl
  ) {
    // Common Trestle token endpoint pattern
    const tokenUrl =
      process.env.TRESTLE_TOKEN_URL ||
      "https://api-trestle.corelogic.com/trestle/oidc/connect/token";
    try {
      const body = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: req.clientId,
        client_secret: req.clientSecret,
        scope: "api",
      });
      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const json = (await res.json()) as { access_token?: string; error?: string };
      if (!res.ok || !json.access_token) {
        return {
          error: json.error || `Token request failed (${res.status})`,
        };
      }
      return { token: json.access_token };
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : "OAuth token failed",
      };
    }
  }
  return { error: "Access token required for this platform" };
}

export async function syncMlsPlatform(
  req: MlsSyncRequest,
): Promise<MlsSyncResponse> {
  const warnings: string[] = [];
  if (req.platform === "website" || req.platform === "csv") {
    return {
      ok: false,
      platform: req.platform,
      listings: [],
      rawCount: 0,
      warnings,
      error: "Use website scrape or CSV import for this source",
    };
  }

  if (!req.baseUrl) {
    return {
      ok: false,
      platform: req.platform,
      listings: [],
      rawCount: 0,
      warnings,
      error: "Base URL is required",
    };
  }

  const tokenRes = await resolveAccessToken(req);
  if (!tokenRes.token) {
    return {
      ok: false,
      platform: req.platform,
      listings: [],
      rawCount: 0,
      warnings,
      error: tokenRes.error || "Missing credentials",
    };
  }

  const endpoint = buildMlsQueryUrl(req);
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${tokenRes.token}`,
    "User-Agent": "RealEstateAI-MLS/1.0",
  };
  if (req.platform === "bridge" && req.dataset) {
    headers["X-Dataset"] = req.dataset;
  }

  const fetched = await fetchJson(endpoint, headers);
  if (!fetched.ok) {
    return {
      ok: false,
      platform: req.platform,
      listings: [],
      rawCount: 0,
      endpoint,
      warnings,
      error: fetched.error,
    };
  }

  const listings = mapPayloadToProperties(req.platform, fetched.data, {
    agentName: req.agentName,
    agentMlsId: req.agentMlsId,
  });

  if (listings.length === 0) {
    warnings.push(
      "Connected, but no listings matched. Check agent MLS ID filter or dataset name.",
    );
  }

  return {
    ok: true,
    platform: req.platform,
    listings,
    rawCount: listings.length,
    endpoint,
    warnings,
  };
}

export const fetchMlsListings = createServerFn({ method: "POST" })
  .validator(inputSchema)
  .handler(async ({ data }) => {
    return syncMlsPlatform({
      platform: data.platform as MlsPlatformId,
      baseUrl: data.baseUrl,
      accessToken: data.accessToken,
      clientId: data.clientId,
      clientSecret: data.clientSecret,
      dataset: data.dataset,
      agentMlsId: data.agentMlsId,
      agentName: data.agentName,
      top: data.top,
    });
  });
