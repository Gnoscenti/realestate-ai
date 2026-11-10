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
 * Only the `sslmode` value is touched; credentials, host and every other
 * parameter stay byte-identical. A URL that opts into libpq behaviour with
 * `uselibpqcompat=true`, or that has no `sslmode`, is returned unchanged.
 */
const WEAKENING_SSL_MODE = /([?&]sslmode=)(?:prefer|require|verify-ca)(?=&|$)/;
const LIBPQ_COMPAT = /[?&]uselibpqcompat=true(?=&|$)/;

export function pinVerifyFullSslMode(connectionString: string): string {
  const queryStart = connectionString.indexOf("?");
  if (queryStart < 0) return connectionString;
  const base = connectionString.slice(0, queryStart);
  const query = connectionString.slice(queryStart);
  if (LIBPQ_COMPAT.test(query)) return connectionString;
  return base + query.replace(WEAKENING_SSL_MODE, "$1verify-full");
}
