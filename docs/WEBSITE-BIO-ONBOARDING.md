# Website and brokerage biography onboarding

This implements the first concrete onboarding path from the
[PR #46 roadmap](LEAD-RESPONSE-ONBOARDING-VOICE-PLAN.md). It does not complete
every roadmap item or activate external accounts, communications, or data feeds.

## User flow

An empty workspace starts with **Your real-estate website** and **Your brokerage
biography page**, followed by **Build my workspace**. Normal pasted addresses are
normalized. Either page is sufficient. The two explicit sources are read
separately; a blocked or unparseable source does not discard the other result.

The agent chooses their own candidate before reviewing contact details,
biography, brokerage, market, social links, and separately labeled credentials.
A different signed-in name is disclosed, and multiple people remain choices.
Only a name is required to confirm. Market and MLS membership have no new-user
default. MLS / board context is requested when an individual member ID is entered.

**Continue without a page**, skip, retry, and later profile review remain
available. After confirmation, the empty workspace shows a business overview,
source links, a profile-based introduction draft, and choices to inspect
visibility or try the existing synthetic inbox scenario. The small workspace tip
is dismissible, handles Escape within the card, and can be restarted with focus.
The sample inquiry remains isolated from real records and sends nothing.

## Reused contracts and persistence

- `src/lib/scrape-site.server.ts` adds single-page discovery using the existing
  safe outbound fetch, redirect checks, timeout, HTML/content checks, and bounded
  response read. Onboarding does not crawl either supplied site's internal links.
- `src/lib/website-scrape.ts` discovers structured Person candidates, then the
  existing person-bound parser extracts each candidate's fields. Page-wide
  contacts and brokerage footer credentials do not become the agent's identity.
  A visible title/heading fallback can offer a name without borrowing contacts.
  Market evidence comes from the selected Person's explicit `areaServed`, not an
  office address. These remain source observations, not independent verification.
- `src/lib/onboarding/api.ts` uses the existing authentication and same-site
  middleware. The server supplies workspace ownership; clients send scan IDs,
  a confirmed name, the expected revision, and editable corrections. Clients
  cannot submit source evidence or observation timestamps.
- `src/lib/onboarding/repository.server.ts` stages source snapshots and stores
  confirmed profiles, conflicting observations, and revision history. The same
  transaction updates the existing `agent_profiles` contract consumed by
  Outreach and assistant context. A preexisting core profile is offered for
  review as revision zero before its first onboarding confirmation.
- The shell restores the confirmed server profile after selecting the signed-in
  browser storage scope. `hydrateConfirmedProfile` updates shared identity
  without resetting the browser's leads, appointments, listings, or other work.
  Name/market changes refresh profile-derived memory facts; user preferences,
  conversation history, and historical activity remain. The confirmed profile
  is authoritative for current identity, while past market-activity counts are
  retained as history. Reloading an unchanged identity does not add learning
  interactions.
  Existing profile consumers, including Social Desk and CiteLock, receive that
  confirmed identity. A failed refresh leaves the current browser workspace
  usable and exposes a retry action.

The confirmed profile and source history have server persistence. The browser's
client book and other existing local application state do **not** gain
cross-device synchronization through this change. A page scan also does not
import listings or establish agent representation of a property.

## Corrections and history

Saved values for the same person, including deliberate blanks, are preserved.
Absent fields can be enriched from new evidence; differing values are offered
as explicit choices. Editing the name re-evaluates person binding, and selecting
a different person does not automatically transfer the previous person's
inferred details. An inventory rescan cannot overwrite a confirmed onboarding
profile.

Confirmation is revision-checked and serialized. Repeating the same confirmation
is idempotent. A competing edit requires loading the latest profile before
retrying, and scans older than 24 hours must be read again. Request fences discard
late browser results after URLs change or the experience is closed. Server
queries isolate source and profile records by the authenticated personal
workspace. Previous confirmed evidence and revisions remain stored when the
profile is updated; this version does not add a full history browser.

## Current boundaries

JavaScript-only pages, blocked fetches, malformed data, and missing structured
Person fields can produce partial results or a name-only candidate. Unsupported
fields stay blank for review. Discovery is not proof of license validity,
brokerage approval, listing ownership, or measured AI visibility.

MLS member/agent ID, state license, and listing number remain different concepts.
Saving a member ID does not connect an MLS feed. This change does not add a
licensed MLS adapter, member-number lookup, automatic RapidAPI/Zillow agent
selection, or provider activation. Existing provider permissions and operational
gates remain separate work in the roadmap. Voice provisioning and live inbox,
calendar, and send integration are also outside this implementation.

## Database change

`migrations/0019_workspace_onboarding.sql` is additive. It introduces profile,
source-snapshot, and revision tables owned by existing workspaces. Raw page HTML
is not stored. Development PGlite uses the repository's normal migration loader;
PostgreSQL uses the existing explicit migration process.

This implementation has **not applied migration 0019 to production** and has not
deployed the application. Production migration and release require the normal
authorized deployment process, including inspection of the target migration
history. Do not use this document as authorization to run production migrations.

The review branch `feat/website-bio-onboarding` disables automatic Vercel
deployment through its branch-specific `git.deploymentEnabled` entry in
`vercel.json`. This keeps publishing the review branch within the roadmap's
no-deployment scope; deployment behavior for other branches is unchanged.

## Focused verification

Use the repository's supported Node.js 22+ runtime and installed dependencies.
The integration/browser tests use local fixtures, so their runner must be able to
connect to localhost. Use an isolated local test database, not production data.

```sh
npm run test:unit -- tests/unit/onboarding-discovery.test.ts tests/unit/website-scrape.test.ts tests/unit/scrape-integration.test.ts tests/unit/onboarding.test.ts tests/unit/onboarding-repository.test.ts tests/unit/store-hydration.test.ts
npm run test:e2e -- tests/e2e/onboarding-persistence.spec.ts tests/e2e/onboarding-website-scrape.spec.ts
npm run typecheck
```

These are verification commands, not a claim that every command or roadmap
acceptance item has passed in every environment. The focused cases cover parser
binding, reconciliation, persistence, and browser behavior; they do not establish
live provider access or production migration acceptance.

For manual acceptance on an entitled fresh local account:

1. Paste two fixture URLs naming the same person. Confirm the candidate, inspect
   source differences, save, and open **Prepare marketing**. The introduction
   should use confirmed facts without requiring a lead.
2. Repeat with only the website, then only the biography. Each usable page should
   support confirmation without the missing page becoming a requirement.
3. Use one blocked/unparseable page with one usable page. Keep the usable result,
   inspect the failure, and confirm or retry. With neither page usable, continue
   with signed-in details and a name; do not require market or MLS membership.
4. Use a page for another person and a page listing multiple agents. Confirm only
   the intended person. Check that brokerage footer contacts and licenses are
   absent unless directly bound to that person.
5. Correct a field, save, rescan a differing source, and verify that the saved
   correction remains until explicitly changed. Clear a field deliberately and
   repeat. Try changing URLs while a scan is pending and verify old results do
   not replace the newer request.
6. Reload after confirmation and repeat from a browser without the account's
   local profile cache. The confirmed profile should return; no browser-local
   client book should be fabricated. A second authenticated account must not
   read or confirm the first account's scan IDs or profile.
7. Repeat the first-use flow at an iPhone-sized viewport using keyboard focus,
   Escape, and the restart-tip control. Try the sample inquiry and confirm its
   visibly synthetic, unsent behavior.


## Production release hold after PR integration

Automatic Vercel deployment from `main` is temporarily disabled in `vercel.json`.
The PRs can merge without releasing the onboarding UI before its database is
ready. The existing production deployment remains available.

The Neon production path does not apply migrations at runtime, and the Vercel
build runs only `npm run build`. Before releasing this integration, an authorized
operator must inspect the target database's `_migrations` history, apply the
pending repository migrations using `npm run db:migrate` against the intended
production database, and verify that `0019_workspace_onboarding.sql` is recorded
and its three tables exist. Do not assume a successful application build applied
this migration. The local migration runner applies all pending files, so review
the full pending set before execution.

Then remove the `main: false` entry from `git.deploymentEnabled`, deploy the
reviewed revision, and verify authenticated profile save/reload and isolation
between two agents on a phone-sized viewport. These are release steps, not
proof already obtained by CI. If onboarding cannot load its server state, the
app preserves the existing workspace and shows retry/skip controls; new profile
scanning and saving remain unavailable until the database is ready.
