import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type PublicUrlOptions = {
  allowPrivateNetwork?: boolean;
};

export type SafeFetchOptions = PublicUrlOptions & {
  maxRedirects?: number;
  allowCrossOriginRedirects?: boolean;
};

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home.arpa",
  ".lan",
  ".test",
  ".example",
  ".invalid",
] as const;

function bareHostname(hostname: string): string {
  return hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
}

/** True only for globally routable IP addresses. */
export function isPublicIpAddress(rawAddress: string): boolean {
  const address = bareHostname(rawAddress).split("%")[0] ?? "";
  const version = isIP(address);

  if (version === 4) {
    const octets = address.split(".").map(Number);
    if (
      octets.length !== 4 ||
      octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
    ) {
      return false;
    }
    const [a, b, c] = octets as [number, number, number, number];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 0 && c === 0) return false;
    if (a === 192 && b === 0 && c === 2) return false;
    if (a === 192 && b === 168) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }

  if (version === 6) {
    const normalized = address.toLowerCase();
    // Reject IPv4-mapped addresses rather than trying to reason about both
    // textual representations. Native public IPv4 URLs remain supported.
    if (normalized.includes("ffff:")) return false;
    if (normalized.startsWith("2001:db8")) return false;
    const first = Number.parseInt(normalized.split(":")[0] || "0", 16);
    // Public unicast is 2000::/3. Everything else includes loopback, ULA,
    // link-local, multicast, unspecified, and other non-global ranges.
    return first >= 0x2000 && first <= 0x3fff;
  }

  return false;
}

/**
 * The loopback exemption exists only for the Playwright mock realtor site.
 * Production cannot enable it, even if the flag is accidentally copied there.
 */
export function privateNetworkFetchAllowedForTests(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.VITE_AUTH_ENABLED === "false" &&
    process.env.ALLOW_PRIVATE_SCRAPE_FOR_TESTS === "1"
  );
}

/** Validate scheme, host, port, and every currently-resolved DNS address. */
export async function assertPublicHttpUrl(
  rawUrl: string | URL,
  options: PublicUrlOptions = {},
): Promise<URL> {
  const url = rawUrl instanceof URL ? new URL(rawUrl) : new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }
  if (url.username || url.password) {
    throw new Error("URLs containing credentials are not allowed");
  }

  const hostname = bareHostname(url.hostname);
  if (!hostname) throw new Error("URL hostname is required");

  if (!options.allowPrivateNetwork) {
    const explicitPort = url.port;
    if (
      explicitPort &&
      !(
        (url.protocol === "http:" && explicitPort === "80") ||
        (url.protocol === "https:" && explicitPort === "443")
      )
    ) {
      throw new Error("Non-standard URL ports are not allowed");
    }

    const ipVersion = isIP(hostname);
    if (ipVersion) {
      if (!isPublicIpAddress(hostname)) {
        throw new Error("Private or reserved network addresses are not allowed");
      }
    } else {
      if (
        !hostname.includes(".") ||
        BLOCKED_HOST_SUFFIXES.some(
          (suffix) =>
            hostname === suffix.slice(1) || hostname.endsWith(suffix),
        )
      ) {
        throw new Error("Local or reserved hostnames are not allowed");
      }
      let records: Array<{ address: string; family: number }>;
      try {
        records = await lookup(hostname, { all: true, verbatim: true });
      } catch {
        throw new Error("Website hostname could not be resolved");
      }
      if (
        records.length === 0 ||
        records.some((record) => !isPublicIpAddress(record.address))
      ) {
        throw new Error("Website resolves to a private or reserved network");
      }
    }
  }

  url.hash = "";
  return url;
}

function isRedirect(response: Response): boolean {
  return response.status >= 300 && response.status < 400;
}

/**
 * Fetch a validated URL while checking each redirect before following it.
 * Redirects for POST/PUT-style requests are rejected so bodies and credentials
 * are never replayed to a different endpoint.
 */
export async function safeFetch(
  rawUrl: string | URL,
  init: RequestInit = {},
  options: SafeFetchOptions = {},
): Promise<{ response: Response; finalUrl: URL }> {
  const maxRedirects = options.maxRedirects ?? 3;
  let current = await assertPublicHttpUrl(rawUrl, options);
  const method = (init.method || "GET").toUpperCase();

  for (let hop = 0; ; hop += 1) {
    const response = await fetch(current, { ...init, redirect: "manual" });
    const location = response.headers.get("location");
    if (!isRedirect(response) || !location) {
      return { response, finalUrl: current };
    }

    if (hop >= maxRedirects) {
      await response.body?.cancel();
      throw new Error("Too many redirects");
    }
    if (method !== "GET" && method !== "HEAD") {
      await response.body?.cancel();
      throw new Error("Redirects are not allowed for this request");
    }

    const next = new URL(location, current);
    if (
      !options.allowCrossOriginRedirects &&
      next.origin !== current.origin
    ) {
      await response.body?.cancel();
      throw new Error("Cross-origin redirects are not allowed");
    }

    await response.body?.cancel();
    current = await assertPublicHttpUrl(next, options);
  }
}

/** Read a response body with a hard byte limit, including chunked responses. */
export async function readResponseText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new Error("Invalid response size limit");
  }
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new Error("Remote response is too large");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Remote response is too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}
