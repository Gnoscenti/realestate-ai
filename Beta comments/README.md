# Beta comments

Anonymous, numbered feedback from free-code beta testers.

## Delivery (fixed Aug 2026)

Comments no longer rely only on the server disk (which fails on Vercel). Each submit tries:

1. **Browser local inbox** — always (no send error for testers)
2. **Server file** — `/tmp` or workspace `Beta comments/` when writable
3. **GitHub** — when `GITHUB_TOKEN` is set
4. **Email** — **bpcca@icloud.com** (override with `BETA_FEEDBACK_EMAIL`)

FormSubmit powers the email path. The **first** message to a new address may require you to click a one-time confirmation link from FormSubmit in that inbox.

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
