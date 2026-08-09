# Beta comments

Anonymous, numbered feedback from free-code beta testers.

## Delivery paths (Aug 2026)

Each submit tries the following in order:

1. **Browser local inbox** — always written first; no send error for testers
2. **Server file** — `/tmp` or workspace `Beta comments/` when writable
3. **GitHub** — when `GITHUB_TOKEN` is set in the environment
4. **Email (FormSubmit)** — **bpcca@icloud.com** (override with `BETA_FEEDBACK_EMAIL`)
5. **mailto fallback** — if FormSubmit is not yet activated, the client opens a pre-filled mail draft so the tester can send the comment manually

## FormSubmit activation (one-time setup)

FormSubmit requires the destination inbox to be confirmed before it will
deliver messages. Until confirmed, AJAX returns a token/activation error and
the client falls back to opening a mailto: draft.

**Steps:**

1. Set `BETA_FEEDBACK_EMAIL` in your environment (`.env.local` or Vercel dashboard).
2. Deploy and submit any beta comment.
3. FormSubmit sends a confirmation to that address — click the link in the email (check spam).
4. Done — subsequent comments are delivered via AJAX with no tester action needed.

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
