# Beta comments

Anonymous feedback from free-code beta testers.

## Active delivery path

A submission is handled in this order:

1. The browser writes a device-local record before any network request.
2. The server attempts to create a GitHub Issue labeled `beta-feedback`.
3. The browser replaces the provisional local record with the server record, so
   the history contains one suggestion rather than a local/server duplicate.
4. The server also attempts best-effort markdown mirrors (disk and GitHub
   Contents) and, when configured, a server-only Resend email copy.

FormSubmit and client-side `mailto:` delivery are intentionally not used. No
owner email address or GitHub credential is shipped in the browser bundle.

## Required configuration

On the deployed server (for example, Vercel):

```dotenv
GITHUB_TOKEN=github_pat_...
```

Use a fine-grained token scoped to `Gnoscenti/realestate-ai` with Issues
read/write. Add Contents read/write only if the markdown mirror is wanted.

Create the repository label `beta-feedback`. The Suggest API keeps that label
on its 422 fallback so `.github/workflows/auto-assign-beta-to-copilot.yml` can
assign the coding agent.

Optional server-only email copy:

```dotenv
RESEND_API_KEY=re_...
BETA_FEEDBACK_EMAIL=you@example.com
# ALERT_EMAIL=alerts@example.com  # overrides BETA_FEEDBACK_EMAIL
```

Do not add `VITE_BETA_FEEDBACK_EMAIL`: Vite-prefixed values are public.

For the auto-assignment workflow, add the repository Actions secret
`COPILOT_ASSIGN_TOKEN` using a newly rotated, least-privilege token. GitHub
secret values cannot be verified from the repository contents.

## Tester-visible states

- **Sent to GitHub #N** — the engineering issue exists and automation is
  reachable.
- **Saved on this device and server** — a server backup exists, but the
  engineering issue was not created.
- **Saved on this device only** — network/server delivery failed; the suggestion
  remains in the local inbox.

## Security

If a personal access token has ever been pasted into chat, logs, an issue, or a
commit, revoke it immediately and replace every use of it. Never copy a token
into source, a Vite-prefixed environment variable, or a client-side request.
