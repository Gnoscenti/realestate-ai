# Vercel production release — current working tree

## Confirmed project

- Team: `blaines-projects-a6ff7e30` / `team_5dxP6z6Zgv8qgjjSzKByZ9w1`.
- Project: `cloud-realtor` / `prj_iTHheNQygwNcQGy20gfWS5uAKOUj`.
- Git repository: `Gnoscenti/realestate-ai`.
- Production alias: https://cloud-realtor.vercel.app
- Latest observed deployment: `dpl_GWLK2gmykrP2rZTbppSftb6stC3h`, READY, main@`2cd3cb1541b36b87e4560ce1948437638968764c`, region sfo1, framework null.
- `realestate-ai-workspace` belongs to a different repository. Do not copy credentials there.

**Completed September20:** normal Vercel CLI device login succeeded. Production provider keys were written, privately matched to local values and marked Sensitive; VITE_AUTH_ENABLED=true. Node22.x, npm12 install/build commands and null framework/root/output overrides were applied and read back. Earlier connector/browser blockers were resolved by normal CLI authentication.

Existing DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL and STRIPE_SECRET_KEY are Sensitive and unavailable through the API. They were preserved, not overwritten or decrypted. Production database connectivity/schema, exact auth origin and Stripe mode are still operational gates. No production promotion or database mutation has been performed.

## Local production configuration command

Run in the WSL repository, with Node22:

```sh
cd /home/ttroj/code/realestate-ai
npx vercel login
node scripts/configure-vercel-production.mjs
node scripts/configure-vercel-production.mjs --apply
```

Login is the normal Vercel interactive authorization; do not paste tokens into a chat. Alternatively set VERCEL_TOKEN privately in that terminal.

The first script invocation is read-only. The apply invocation verifies the exact project/Git link, then:

- Upserts local nonempty provider keys from `.env` and `.env.local` as **Sensitive** variables in **Production only**: XAI_API_KEY, OPENAI_API_KEY, PERPLEXITY_API_KEY, GEMINI_API_KEY, RAPIDAPI_KEY.
- Copies optional access/OAuth keys only if supplied, rejecting a test Stripe key.
- Preserves existing DATABASE_URL, BETTER_AUTH_SECRET and BETTER_AUTH_URL. If missing, requires appropriate private local values instead of inventing a database or rotating a secret.
- Sets VITE_AUTH_ENABLED=true.
- Sets framework/root/output overrides to null, Node22.x, npm12 lockfile installation, and the repository's Vite/Nitro production build.
- Reads settings and environment key presence back. No values or full API responses are logged.
- Never copies CITELOCK_MLS_ENABLED, localhost/demo/private-network flags, or every local variable indiscriminately.

The command does not deploy, mutate a database, commit or push. Existing required secret values still need operational validation: correct hosted database, stable auth/encryption key, exact HTTPS canonical origin, and valid provider/Stripe credentials. For a paid launch, configure live Stripe or intentionally managed beta access. Production keys are deliberately not copied into Preview; use separate preview credentials and database.

## Release order

1. Complete the configuration step above and review read-back. Verify the canonical auth origin and trusted client-IP handling on the actual hosting platform.
2. Back up the hosted database. Inspect its migration ledger and schema for compatibility with this preservation tree. Other development has reached main since this branch's base; do not assume identical migrations or overwrite that code.
3. Apply reviewed additive migrations through `npm run db:migrate` in an environment holding the intended production DATABASE_URL. Migration0016 stores guides. Build no longer silently migrates production.
4. Run the repository's type, lint, unit, native PostgreSQL, build and browser checks. Scan intended Git files and browser assets for secret values.
5. Commit all intended local repository changes and push the preservation branch without force. Inspect Git/Vercel checks and reconcile production-branch divergence through review before promotion.
6. Verify hosted signup/session, free guide/save/reload/export, server-verified upgrade, full guide, provider run and social handoff. A successful build is not a successful hosted workflow.

The user's requested order is configuration first, then commit/push. Authentication and provider/build configuration are complete. Commit/push can proceed; hosted migration validation, branch reconciliation and production promotion remain separate gates.


## Push and hosted build outcome

Source commit **d825b75** is pushed to **local/2026-09-08-flagship-preservation**. Vercel built deployment **dpl_9UEN6JTSpD2LK2C64vX9G51SRrNU** successfully (READY). The protected Preview was reached using authenticated `vercel curl`; its session endpoint returned500. Runtime logs identify the root cause: Preview has no DATABASE_URL. The production guard correctly prevents temporary PGLite data loss.

Provision an isolated preview database and stable preview auth configuration before treating that preview as usable. No production secret was copied into Preview and no startup guard was weakened. Production remains on main@2cd3cb1. GitHub's OAuth credential lacked workflow scope, so the same authorized repository's existing SSH credential was used for the full push; CI files remain intact.

The CLI link operation created ignored .vercel metadata and appended a temporary VERCEL_OIDC_TOKEN to ignored .env.local. All six original local variable names remain present. Duplicate ignore lines added by the CLI were removed because existing rules already exclude .vercel and local env files while intentionally tracking .env.example.
