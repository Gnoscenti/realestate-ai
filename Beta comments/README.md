# Beta comments

Feedback from signed-in beta testers, sent from the in-app **Suggest** control.

## Delivery path

A submission is handled in this order:

1. The browser writes a device-local record before any network request.
2. The server verifies the session and workspace entitlement, then creates a
   GitHub Issue in the private intake repository
   (`Gnoscenti/realestate-ai-feedback-intake` unless
   `BETA_FEEDBACK_GITHUB_REPOSITORY` overrides it) with the labels
   `feedback-intake`, a category label, and `module:<name>`.
3. The browser replaces the provisional record with the server record and
   stores whether the issue was created, so the history shows one entry with
   its delivery status.
4. In the intake repository, the "Notify owner of new feedback" workflow
   assigns and @mentions the owner on every new issue.

Feedback is review-gated. The issue is untrusted reporter input: a maintainer
reviews it and applies `ai-ready` before a coding agent may open a draft pull
request. The app never writes repository contents, sends no email, and ships no
owner address or GitHub credential in the browser bundle.

## Required configuration

On the deployed server (Vercel → Production):

```dotenv
GITHUB_TOKEN=github_pat_...
```

Use a fine-grained token whose **repository access is the intake repository**
(`Gnoscenti/realestate-ai-feedback-intake`) with **Issues: read and write**. A
token scoped only to `Gnoscenti/realestate-ai` cannot create intake issues and
every suggestion will stay on the tester's device.

Environment variables are bound when a deployment is built. After changing the
token, the change is live only once a deployment built **after** the change is
serving the production domain. Promoting an older build keeps the old token.

## Tester-visible states

Each entry in the drawer's history shows one of:

- **Sent · GitHub #N** — the intake issue exists.
- **Not sent to engineering** — the suggestion is saved on this device but no
  issue was created (network failure, rate limit, unverified access, or intake
  outage). **Send again** retries it in place.
- **Delivery not recorded** — saved before delivery tracking existed; the
  server accepted it but this device does not know whether an issue exists.
  **Send again** creates the issue if it is missing; close the duplicate if one
  already existed.

## Operating it

Verify delivery after any token, repository, or release change: submit a
clearly labeled test suggestion and confirm the issue appears in the intake
repository.

The server logs metadata only — never the token, the reporter text, or the
issue body:

- `[suggest-intake] issue delivered` with the issue number, module, and
  category.
- `[suggest-intake] issue delivery failed` with a `reason`:
  `token_not_configured`, `invalid_repository_config`, `network`, or
  `github_rejected` (plus the HTTP status, GitHub's request id, and GitHub's
  own error summary, for example `Bad credentials` or `Not Found`).

A `github_rejected` 401 means the token is expired or revoked; a 404 or 403
means it lacks Issues write on the intake repository.

## Alerts

The owner is alerted through GitHub: every intake issue assigns and @mentions
them. Whether that arrives by email or mobile push is controlled by the
owner's GitHub notification settings for "Participating, @mentions and
custom", not by this app.

## Legacy workflow

`.github/workflows/auto-assign-beta-to-copilot.yml` in this repository reacts
to a `beta-feedback` label on issues in **this** repository. The Suggest
control no longer creates issues here, so that workflow is not part of the
delivery path above.

## Security

If a personal access token has ever been pasted into chat, logs, an issue, or a
commit, revoke it immediately and replace every use of it. Never copy a token
into source, a Vite-prefixed environment variable, or a client-side request.
