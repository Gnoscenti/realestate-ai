/**
 * Pin strict TLS verification for node-postgres connection strings.
 *
 * `pg` currently treats `sslmode=prefer`, `require` and `verify-ca` as aliases
 * for `verify-full` and warns that its next major version will switch them to
 * libpq semantics, which do not verify the server hostname. Managed providers
 * hand out `sslmode=require` URLs, so rewrite those three modes to the explicit
 * `verify-full` they already mean today. This changes nothing now and keeps
 * hostname verification after the driver upgrade.
 *
 * Only `sslmode` parameters are rewritten; credentials, host and every other
 * parameter stay byte-identical. A URL that opts into libpq behaviour with
 * `uselibpqcompat=true`, or that has no weakening `sslmode`, is returned
 * unchanged.
 */
const WEAKENING_SSL_MODES = new Set(["prefer", "require", "verify-ca"]);

/** Decode one query component the way the driver's URL parser reads it. */
function decodeQueryComponent(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

export function pinVerifyFullSslMode(connectionString: string): string {
  // Only the first "?" starts the query; a later one is part of a value.
  const queryStart = connectionString.indexOf("?");
  if (queryStart < 0) return connectionString;
  const fragmentStart = connectionString.indexOf("#", queryStart);
  const queryEnd = fragmentStart < 0 ? connectionString.length : fragmentStart;
  const parameters = connectionString
    .slice(queryStart + 1, queryEnd)
    .split("&")
    .map((raw) => {
      const separator = raw.indexOf("=");
      return {
        raw,
        key: decodeQueryComponent(separator < 0 ? raw : raw.slice(0, separator)),
        value: separator < 0 ? "" : decodeQueryComponent(raw.slice(separator + 1)),
      };
    });

  // An explicit opt-in to libpq semantics is the operator's decision.
  if (parameters.some(({ key, value }) => key === "uselibpqcompat" && value === "true")) {
    return connectionString;
  }
  // The driver keeps the last duplicate, so every occurrence must be pinned.
  let changed = false;
  const pinned = parameters.map(({ raw, key, value }) => {
    if (key !== "sslmode" || !WEAKENING_SSL_MODES.has(value)) return raw;
    changed = true;
    return "sslmode=verify-full";
  });
  if (!changed) return connectionString;
  return (
    connectionString.slice(0, queryStart + 1) + pinned.join("&") + connectionString.slice(queryEnd)
  );
}
