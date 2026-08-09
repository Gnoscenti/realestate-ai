# Beta comments

Anonymous, numbered feedback from free-code beta testers.

## Delivery paths (Aug 2026)

A submission follows this durability sequence:

1. **Browser local inbox** — written before any network request.
2. **Server file** — `/tmp` or workspace `Beta comments/` when writable.
3. **GitHub** — attempted when `GITHUB_TOKEN` is configured.
4. **Email (FormSubmit)** — attempted using the configured destination.
5. **Mail-app fallback** — requested after any FormSubmit failure, including
   activation, endpoint configuration, or network errors.

A successful server response reconciles the initial browser record with the
server-assigned number instead of adding a duplicate.

## Configure the destination

Set both variables to the same inbox:

```dotenv
BETA_FEEDBACK_EMAIL=you@example.com
VITE_BETA_FEEDBACK_EMAIL=you@example.com
```

- `BETA_FEEDBACK_EMAIL` is server-only.
- `VITE_BETA_FEEDBACK_EMAIL` is public client configuration used for direct
  FormSubmit and mail-app fallback.
- If both are unset, the current default is `bpcca@icloud.com`.

## FormSubmit activation (one-time setup)

1. Configure both destination variables.
2. Deploy and submit one beta comment.
3. Open FormSubmit's confirmation email and activate the form (check spam).
4. Submit again and confirm automatic delivery.

Until activation succeeds, the API reports `emailNeedsActivation: true`. The
client keeps the comment locally and requests a pre-filled mail-app handoff.
A bare HTTP 404 without activation text is treated as endpoint/configuration
failure, not activation.

## For Grok / engineering

1. Read each `####-module.md` file when present in git.
2. Or open emails titled `[Beta #NNNN] Page · module`.
3. Implement the **Suggestion** section.

## File naming

```
0001-outreach.md
0002-command-center.md
session-s_xxxxx.md
```

No tester name or email is stored — only a random session id.
