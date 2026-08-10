/**
 * Local email/password sign-in (this app's Better Auth DB — not the broker).
 *
 * Enabled so agents can use the same credentials on mobile and desktop when
 * they prefer not to use Google/X. Forms use `authClient.signUp.email` /
 * `authClient.signIn.email` from `@/lib/auth/client`.
 *
 * Do NOT edit `server.ts` for this — that file is frozen pre-wired config.
 */
export const emailAndPasswordEnabled = true;
