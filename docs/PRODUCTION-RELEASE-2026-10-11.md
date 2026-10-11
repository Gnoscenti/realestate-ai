# Production release — October 11, 2026

## Result and source

The startup branch was merged into current main while retaining newer CiteLock, Social Desk and TanStack security work. The production application was deployed and all nine live acceptance scenarios passed.

- Live application: https://cloud-realtor.vercel.app
- Merged PR: https://github.com/Gnoscenti/realestate-ai/pull/41
- Merge commit: `a21a91dbb3f52dabc415e8e9dcc33774fdc12221`
- Tested production deployment: `dpl_FD1eSrNpaPcFCyHma1Ha32XKu6SW`
- Deployment URL: https://cloud-realtor-jytvxvir5-blaines-projects-a6ff7e30.vercel.app
- Acceptance window: 2026-10-11 16:18:45–16:19:40 UTC.
- Previous production rollback reference: `dpl_FVv2XdSUcp7j2KZfccPEjMmj7cUJ`, main `c4c9e18a131a64167b74118323b73869db841d0b`.

The canonical alias was verified against the exact READY production deployment. The documentation-only closeout commit triggers a further deployment of identical application code; its final alias/persistence result belongs in the delivery message. No new migrations were introduced or executed by this release. No history rewrite or force push was used.

## What changed and why

The release retains safe recursive creation of the PGlite data directory and adds process-level regression coverage for a fresh first start and a subsequent start with persisted rows and migration records. Production continues to require PostgreSQL.

The reported `makeSerovalPlugin` SSR error was caused by an already-running Vite process retaining modules from before dependency synchronization. A clean lockfile install provided a consistent TanStack tree. The original development process was restarted with its original settings; the export resolved, the homepage returned HTTP 200, login rendered, and no Vite overlay or uncaught browser error appeared. The error overlay remains enabled.

Targeted compatible security updates were included in commit `7b6e5ac`:

| Dependency | Installed release |
| --- | --- |
| sharp | 0.35.5 |
| Capacitor iOS | 8.5.3 |
| brace-expansion | 1.1.21 and 5.0.12 |
| source-map-js | 1.2.2 |

Both full and production-only npm audits reported zero vulnerabilities at verification time. Main's existing TanStack security versions were retained. No broad framework upgrade was attempted.

Production configuration was inspected for the correct `cloud-realtor` project and team. Node 22, the Nitro/Vercel build configuration, enabled authentication, database/auth settings and required provider-secret presence were verified without displaying secret values. No production secret was replaced.

## Verification evidence

| Check | Result and scope |
| --- | --- |
| TypeScript | Passed, `tsc --noEmit` |
| ESLint | Passed repository-wide, zero warnings |
| Unit/integration | 439 tests across 56 files passed |
| Native PostgreSQL | 57 tests across 8 files passed in CI |
| Desktop/mobile browser suite | 20 scenarios passed in CI |
| Development authentication | 2 scenarios passed; production-only scenario intentionally not run in the development server |
| Compiled production/native PostgreSQL authentication | 3 scenarios passed |
| Production build | Passed locally and on Vercel |
| Local SSR browser | Homepage 200, login rendered, no overlay or uncaught errors |
| Live production acceptance | All 9 scenarios below passed |
| Secret scan | 342 tracked files at pre-merge verification and 343 including this report at closeout; zero matches |

Fresh pre-merge CI: https://github.com/Gnoscenti/realestate-ai/actions/runs/38154539355  
Main-commit CI: https://github.com/Gnoscenti/realestate-ai/actions/runs/38154825743

The production test used a synthetic account and normal email authentication and beta-code redemption. It did not grant access through direct database edits or disable authorization.

1. **Startup and anonymous access:** homepage HTTP 200; anonymous session null; Social Desk redirects to login.
2. **Login and session durability:** signup, reload, logout and subsequent login passed. Session cookies were secure/httpOnly with the `__Host-` prefix.
3. **Free CiteLock guide:** fetched Julie Pierce Casey's personal about page and RealTrends agent profile, matched her identity on both, produced three actionable steps, retained checked progress after reload and exported Markdown.
4. **Paid-access gate:** normal beta redemption unlocked the nine-step full guide and advanced workspace, preserving free-guide progress and enabling the full export.
5. **Saved subject:** an advanced brokerage subject survived a reload.
6. **Real social generation:** one production xAI request generated a 175-character caption from supplied inspection-advice facts. The UI identified `grok-4.3` and the facts used.
7. **Actual-photo output:** a repository photo attached to a synthetic listing produced a retained 1080×1080 PNG, authenticated HTTP 200/private-cache response and draft attachment.
8. **Durable social handoff:** the draft was saved, reviewed, approved, downloaded and marked for manual posting. Revision 3, text and approved image remained available after reload.
9. **Security boundaries:** foreign-origin sign-in returned 403, logout cleared the session, anonymous private-image access returned 401, and Social Desk required login again.

There were zero uncaught browser errors and zero same-origin HTTP 5xx responses in the acceptance run. Desktop and 390-pixel mobile screenshots were visually inspected, including a no-horizontal-overflow check.

The bounded Vercel runtime log sample contained the deliberate foreign-origin 403 and four PostgreSQL connection-string warnings on successful HTTP 200 requests. It contained no failed application request. The warning concerns a future driver major-version change: the installed driver currently treats `sslmode=require` as `verify-full`. Explicit `verify-full` configuration should be maintained when upgrading the driver; verification was not disabled.

## CiteLock output verified in production

The ranking wording was qualified to the source's population and reporting period:

> Julie Pierce Casey ranked No. 1 by transaction sides among RealTrends-ranked agents in Rancho Santa Fe, based on 2025 sales data.

The guide also flagged differing 2025 sales-volume figures: $44M on the personal site and $33.61M in RealTrends. It advised checking scope, transaction credit and reporting cutoff before comparison. The source-backed guide works without MLS access.

This is verified assessment and instructional output. It does not establish that the ranking applies to every agent outside the RealTrends population, and it does not prove that following the guide has already improved LLM visibility.

## Run and reproduce

Use WSL in the existing checkout:

```sh
cd ~/code/realestate-ai
npx --yes npm@12.0.0 ci
node --env-file=.env.local node_modules/vite/bin/vite.js dev --host 127.0.0.1 --port 8131
```

Stop the existing process before starting another on the same port/data directory. Restart Vite after changing branches or reinstalling dependencies. Without `DATABASE_URL`, development persists in ignored `.local-data/pglite`; only one process should use a given directory. Production requires PostgreSQL and its normal authentication configuration.

Release checks used:

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js . --max-warnings=0
node node_modules/vitest/vitest.mjs run --maxWorkers=1
node node_modules/vite/bin/vite.js build
npx --yes npm@12.0.0 audit
npx --yes npm@12.0.0 audit --omit=dev
```

The native PostgreSQL and browser CI commands are maintained in `.github/workflows/ci.yml`. The production acceptance harness, sanitized report and screenshots are retained locally under ignored `tmp/session9/production*`. Credentials, beta values, raw logs and account state are private and must not be committed.

## Limitations and remaining operational work

- No social content was published externally and no fabricated publication receipt was recorded. Postiz publication still needs its own authorized live acceptance.
- No Stripe payment was charged.
- The full paid multi-engine visibility measurement was not run in this release; the verified production CiteLock workflow was the source-backed free/full guide.
- Native iOS compilation and archive were not tested in this environment.
- A real customer publication followed by comparable later measurements is needed to demonstrate GEO/AIEO improvement.
- One synthetic account and its saved guide, listing, photo and handed-off draft remain for reproducible acceptance.
- Hosted backup retention/PITR was not re-audited. September 26 logical backup/restore evidence is preserved in the ledger and is not presented as a new October check.
- The Vercel log review was a bounded release check, not proof of an ongoing monitoring or alerting service.

Detailed history, decisions and earlier audit findings remain in [FLAGSHIP-LEDGER.md](FLAGSHIP-LEDGER.md). Application rollback should retain the expanded database schema and customer writes; use the prior deployment rather than restoring a historical database over newer data.
