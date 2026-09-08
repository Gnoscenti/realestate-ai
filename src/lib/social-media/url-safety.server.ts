import { isIP } from "node:net";

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 168) ||
    a! >= 224
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    host === "::" ||
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    /^fe[89ab]/.test(host) ||
    host.startsWith("::ffff:127.") ||
    host.startsWith("::ffff:10.") ||
    host.startsWith("::ffff:192.168.")
  );
}

function configuredHosts(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function hostAllowed(hostname: string, allowed: string[]): boolean {
  if (!allowed.length) return false;
  return allowed.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
}

/** Accept only public HTTPS assets. This does not fetch or probe the URL. */
export function publicHttpsUrlFromAllowlist(
  value: string | null | undefined,
  allowlist: string | undefined,
): string | null {
  if (!value || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    ) {
      return null;
    }
    const hostname = url.hostname.toLowerCase();
    if (
      !hostname ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    ) {
      return null;
    }
    const ipVersion = isIP(hostname);
    if (
      (ipVersion === 4 && isPrivateIpv4(hostname)) ||
      (ipVersion === 6 && isPrivateIpv6(hostname))
    ) {
      return null;
    }
    // Production assets must be on an explicitly approved named origin. This
    // also avoids treating a database-imported public IP as a safe photo host.
    if (ipVersion || !hostname.includes(".")) return null;
    if (!hostAllowed(hostname, configuredHosts(allowlist))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Listing-photo URLs require a non-empty server-side host allowlist. */
export function publicHttpsUrl(
  value: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return publicHttpsUrlFromAllowlist(
    value,
    env.SOCIAL_MEDIA_PHOTO_HOST_ALLOWLIST,
  );
}
