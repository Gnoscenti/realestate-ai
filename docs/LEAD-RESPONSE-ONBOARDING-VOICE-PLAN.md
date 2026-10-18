# Lead response, simpler onboarding, and phone assistant

Audit date: October 17, 2026 (Pacific). Repository: `Gnoscenti/realestate-ai`.

This document separates the focused synthetic lead-response implementation from
the next onboarding and voice work. It does not authorize account connections,
customer communication, number purchases, billing changes, or deployment.

## Product direction and delivery order

1. Complete the reviewable inbox-to-draft workflow using synthetic inquiries and
   appointments. The agent reviews the exact recipient, text, and proposed
   appointments; no customer message is sent by this demonstration.
2. Simplify onboarding for the **whole application**: enter the realtor's
   website and brokerage biography URL, extract the existing information, then
   confirm a populated profile. Add the MLS member/agent number for supported
   data matching. Do not make manual lead entry or a CiteLock-only journey the
   first experience.
3. Reuse the existing inbound voice beta in PR #29 for a dedicated assistant
   number and optional carrier no-answer forwarding. Complete its integration
   and live acceptance separately.

The second item supersedes the earlier name/region-only, CiteLock-first proposal.
CiteLock remains an important capability populated by the shared profile.

## What current main actually contains

| Area | Existing implementation | Remaining work |
| --- | --- | --- |
| First visit | `src/routes/index.tsx` leads with Add a lead, Connect listings, and Add appointment. Empty Action Desk asks for manual data. | Replace this first-use experience with automatic business setup and useful output. |
| Profile setup | `onboarding-wizard.tsx` accepts name, free-text market, website, brokerage and MLS label; name, market and MLS are required to finish. MLS defaults to `sandicor`. | Two URL inputs, extraction/confirmation, incremental missing-field prompts, no assumed MLS membership. |
| Website extraction | Authenticated `scrapeAgentWebsite` reuses safe outbound fetch, bounded HTML reads, identity parsing, profile observations and listing observations. | Orchestrate both URLs, reconcile provenance/conflicts and save durable shared profile data. |
| Brokerage biography | Parser can read public person data, but the scanner follows only the supplied site's internal links. | Treat the brokerage biography as a second explicit source; do not assume a personal-site scan reads it. |
| Identity binding | `personBoundProfile` requires an `agentNameHint` and strict person-name match before profile credentials cross the server boundary. | Discover candidate identity from supplied pages or reuse the signed-in name, then confirm the person; do not remove the identity boundary to accept page-wide contacts. |
| RapidAPI | Authenticated, owner/admin and entitlement-gated Zillow observations; workspace cache, quota and request lease already exist. | Add a supported matching flow from confirmed agent identity; verify provider access in an authorized environment. |
| MLS | `src/routes/mls.tsx` explicitly has no licensed MLS credential entry/live feed. Existing sources are website, CSV and labeled aggregator observations. | An MLS number alone is not an API credential. Use a licensed adapter only where actual provider access and agent attribution exist. |
| CiteLock | Source-backed guide, saved workspace identities, observations and content workflow exist. The October 11 release report records live guide acceptance. | Populate these from the shared confirmed profile; distinguish source findings from measured visibility or demonstrated lift. |
| Email | `email-scan.ts` scans Gmail with the caller's supplied session token; current query mainly targets transaction/important mail. | Durable per-agent OAuth, verified mailbox binding, lead-specific history ingestion, monitoring and explicitly approved send integration. |
| Calendar | Validated browser-local appointments, notes and calendar-file export. | Authorized provider free/busy, refresh/expiry, busy-calendar selection and final recheck. |
| Voice | Main contains the voice foundation. Draft PR #29 contains the expanded Retell/Twilio inbound implementation. | Reconcile current main, migrations and operational gates; live calls are not established by unit tests. |

Repository evidence: `README.md`, `src/components/onboarding/onboarding-wizard.tsx`,
`src/lib/scrape-site.ts`, `src/lib/scrape-site.server.ts`,
`src/lib/website-scrape.ts`, `src/lib/rapidapi/types.ts`,
`src/lib/rapidapi/adapter.server.ts`, `src/routes/mls.tsx`,
`docs/PRODUCTION-RELEASE-2026-10-11.md`, and
`docs/activation-and-blocker-register.md`.

## Next PR: whole-app onboarding without manual lead entry

### 1. A short, clear first screen

- [ ] Ask for **Your real-estate website** and **Your brokerage biography page**.
  Accept normal pasted URLs, normalize them and show a single **Build my
  workspace** action. Provide a useful fallback if the agent has only one page.
- [ ] Reuse signed-in name/email where available. Do not ask for CRM records,
  client contacts, a listing spreadsheet, or MLS membership before showing value.
- [ ] Show real progress stages: reading website, matching brokerage profile,
  preparing workspace. Failed sources must leave usable partial results.
- [ ] Retain a skip/retry path. Do not force a long form because a website blocks
  automated retrieval or has no parseable person data.

### 2. Extract, reconcile, confirm and persist

- [ ] Reuse safe fetch and parsing for both explicit pages. Preserve source URL,
  observed time, source kind, identity match and conflicting field values.
- [ ] Add a candidate-discovery step before the existing person-bound extraction:
  currently an absent name hint yields no bound profile. Display the candidate's
  name, photo, brokerage and public contact details for one-tap confirmation.
  Ask for a name only when needed to distinguish candidates.
- [ ] Populate name, phone, email, photo, brokerage, biography, title, website,
  public social links, market and properly labeled credentials where supported.
  Keep absent data blank and conflicts visible. A brokerage footer is not the
  individual agent's contact or license.
- [ ] Infer market from supported source evidence; let the agent correct it
  using a searchable region dropdown. Do not silently default every agent to
  San Diego or to one MLS.
- [ ] Save the confirmed profile and sources through authenticated,
  workspace-owned server persistence, then hydrate existing browser state.
  Current browser-scoped state alone does not give cross-device continuity.
- [ ] Remove the onboarding fallback that copies `profile.mlsNumber` into
  `license`. Preserve the parser's distinction between MLS identity and state
  license throughout profile, assistant and CiteLock flows.
- [ ] Revision updates must preserve intentional user corrections and keep
  older evidence, rather than silently overwriting it on every rescan.

### 3. Reuse the available data adapters accurately

| User-facing input / provider field | Meaning | Correct use |
| --- | --- | --- |
| MLS member/agent ID | Person's local identifier within an originating MLS | Match with MLS/board context; do not assume globally unique. |
| State license / California DRE number | Regulatory license identifier | Keep jurisdiction and person binding; never substitute for member ID. |
| Listing MLS number | Property/listing identifier | Look up that listing through a supporting provider; not the agent's identity. |
| Zillow `encodedZuid` | Zillow agent identity used by the existing adapter | Obtained from agent search, then used for active/sold/rental observations. |
| Zillow `zpid` | Zillow property identity | Existing property-details/zestimate paths; not an MLS member number. |

- [ ] Ask for **MLS member/agent ID** after the first profile result, prefilled
  if reliably discovered. Label it distinctly from license and listing number.
  Request the MLS/board only when it cannot be established from supported data.
- [ ] Use existing `agents` search with confirmed name and location; retain
  the selected `encodedZuid`, then reuse `active`, `sold` and `rentals` operations
  as permitted observations. `include_team=false` is already sent for active
  and rental requests. Do not infer individual sales volume from team results.
- [ ] The current RapidAPI allowlist has no member-number lookup operation.
  Do not pass an MLS member number as `encodedZuid`, fabricate an endpoint, or
  label aggregator observations as a verified MLS sync.
- [ ] Where a licensed MLS/RESO adapter is actually configured, match member ID
  plus originating system and person, then retrieve permitted listing-side data.
  Verify credentials, permitted use, coverage and field mapping before enabling.
  Unsupported MLS lookup should leave the rest of onboarding complete.
- [ ] Populate content drafting, Social Desk, assistant context and CiteLock
  from confirmed shared identity and permitted data. Do not turn an observed
  website listing into a server-verified representation claim.

### 4. A class-ready first minute

- [ ] After confirmation, show a populated business overview with source links
  and a short choice of useful actions: prepare marketing, inspect visibility,
  or try the inbox-to-draft scenario. The user chooses the desired outcome.
- [ ] Use a small dismissible coach card anchored to the next action. Include
  keyboard focus, Escape, mobile viewport handling and a restart-tour option.
  Avoid an overlay sequence that blocks the app or asks users to type leads.
- [ ] Keep synthetic inquiries clearly labeled and isolated from real records.
  A sample scenario can show the reply and calendar conflict handling immediately.
- [ ] Prepare repeatable class fixtures and a reset control limited to demo data.
  Test on a fresh account and iPhone-sized viewport, not only a populated account.
- [ ] Acceptance: the agent can paste the two URLs, confirm a profile, and reach
  useful personalized output without typing a lead. Missing pages and provider
  failures still offer a useful, truthful next action. Test wrong-person pages,
  broker footer confusion, duplicate import, stale scan results, saved corrections,
  resume/reload and a second agent's inability to read the first agent's data.

## Voice: reuse PR #29 rather than starting another assistant

[PR #29](https://github.com/Gnoscenti/realestate-ai/pull/29) was open, draft and
reported unmergeable when inspected. Its reported head was
`9fdf79c7a1bba1554ccc4e4212bbe3eafd8b5ac2`, based on older main
`b083b38b95a326572efcd90a88afd4a4a3ab55ff`. Its reported 346 passing unit tests
and 15 browser tests are historical isolated checks, not newly run results or
proof of functioning live telephony.

The existing beta includes a voice console, bounded prompts, workspace-scoped
calls, durable provisioning jobs and mutation fencing, signed Retell/Stripe
webhooks, usage reconciliation and carrier-aware forwarding guidance. Retell
handles voice; a customer-controlled Twilio number routes inbound calls over
Elastic SIP. The branch deliberately has no outbound AI calling, SMS or call
transfer path. Native push delivery is separate work.

- [ ] Reconcile the branch against then-current main while preserving newer
  onboarding, CiteLock, billing and security work. Do not merge its older router
  or migration numbering over current main.
- [ ] Inspect production `_migrations` and deployment history before renaming
  the six voice migration files. If never applied, choose the next unused names
  at integration time; if applied, design an explicit transition. The old PR's
  suggested numeric range must not be assumed still free.
- [ ] Confirm the intended narrow product: dedicated inbound number, caller
  disclosure, factual approved business information, callback details and
  appointment requests routed to the agent. Treat the Manus experience as a UX
  reference; do not claim Manus integration or equivalent capabilities.
- [ ] Configure authorized Retell/Twilio accounts and restricted server-only
  credentials in an isolated pilot. Verify number ownership, inbound routing,
  webhook signature/replay controls, provider privacy settings and account limits.
- [ ] Obtain explicit approval before purchasing a number, changing billing or
  forwarding an agent's existing line. Recheck the branch's hard-coded $79/month
  and included-minute assumptions before any commercial launch; they are code
  configuration, not a newly approved offer.
- [ ] For existing mobile numbers, document carrier-specific no-answer/busy
  forwarding and its undo procedure. Test the actual ring delay, voicemail
  interaction and caller-ID behavior. Do not promise exactly four rings across
  carriers or use an unverified universal dial code.
- [ ] Complete a protected durable worker cadence and recovery monitoring.
  The daily cron in #29 is a safety net, not proof of prompt cancellation or
  recovery after a crashed provider mutation.
- [ ] Add a private notification to the shared review queue with a generic
  lock-screen message. Open caller details only after authentication.
- [ ] Keep requests as requests until calendar availability is rechecked and
  the agent approves the commitment. Live booking/transfer would be separate
  functionality requiring its own implementation and activation decision.
- [ ] Run authorized test calls: accepted/declined/ambiguous consent, interruption,
  caller asks for a human, urgent situations, wrong property, dropped call,
  provider outage, duplicate webhook, cancellation, quota exhaustion and two
  different agents. Verify retention/deletion and rollback before a limited pilot.

## Live lead-response activation prerequisites

| Component | Work and approval required before activation |
| --- | --- |
| Gmail access | Agent-specific OAuth consent and verified mailbox identity bound to the signed-in workspace. Encrypted server token storage, refresh/revoke/disconnect, deletion and exact account selection. Review Google verification/security-assessment requirements for restricted scopes and the intended deployment. Do not connect Julie from a forwarded email or reuse another user's token. |
| Gmail detection | Configure Pub/Sub publisher/subscriber permissions, authenticated delivery, durable history cursor, idempotent message ingestion, daily watch renewal and recovery for lost notifications. The existing session-token scan is not an always-on inbox watcher. |
| Lead identity | Treat email text as untrusted input. Establish supported portal/source patterns from authorized examples; retain message/thread IDs and source evidence. Forwarded vendor pitches, mailing lists and ambiguous inquiries need review, not automatic lead or recipient creation. |
| Calendar | Agent authorizes exact calendars and working hours/timezone. Use the narrow suitable free/busy scope, aggregate every selected busy calendar and fail closed on a per-calendar error. Recheck before offering/sending and before booking; include notice, duration and travel buffers. An agent's free time is not proof that a listed property's showing is available. |
| Approval and send | Separate permission to read from permission to send. Bind approval to exact recipient, text, draft revision and appointment snapshot. Changes invalidate approval. Serialize dispatch; preserve provider receipt; ambiguous timeout requires reconciliation instead of blind replay. Synthetic approval remains visibly unsent. |
| Notifications | Explicit device/channel opt-in, workspace-owned subscriptions, authenticated deep links, generic lock-screen copy, retry/deduplication and revocation. Browser toast alone is not a reliable background notification. iOS web push requires the supported Home Screen web-app flow and a user permission gesture. |
| Brokerage | Approval for the customer-facing use case, response templates, permitted factual claims, licensed data use, disclosure, privacy/retention, human escalation and phone scripts. Confirm approved processors and operator responsibility. These are operational release items, not a claim that one legal rule covers all jurisdictions. |
| Pilot | An expressly approved account/calendar/notification destination and, later, bounded test recipients or phone callers; a monitored rollback path. Do not activate autonomous customer communications. |

`gmail.readonly` is a restricted scope. Keeping application drafts internally
avoids needing Gmail draft-write permission for the initial preview. Gmail's
`gmail.compose` also permits sending; it is not a provider-enforced draft-only
permission. Any eventual send ability therefore still needs an application-level
approval boundary.

## Official contracts checked for this plan

- [Gmail push notifications](https://developers.google.com/workspace/gmail/api/guides/push):
  Pub/Sub, watch expiry/renewal, history and missed-notification recovery.
- [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes):
  restricted read/compose scopes and verification requirements.
- [Google Calendar free/busy](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query):
  available scopes, explicit interval/timezone, per-calendar errors and busy ranges.
- [Retell with Twilio SIP](https://docs.retellai.com/deploy/twilio):
  customer-owned numbers, inbound origination and real-call validation.
- [Retell secure webhooks](https://docs.retellai.com/features/secure-webhook):
  raw-body signature verification with the webhook-enabled key.
- [Retell data storage](https://docs.retellai.com/accounts/privacy-disable):
  verify provider storage behavior as part of the approved recording policy.
- [Twilio Dial](https://www.twilio.com/docs/voice/twiml/dial):
  no-answer status and timeout semantics for a future app-controlled ringing
  route; this does not configure a mobile carrier's forwarding rule.
- [Apple call forwarding](https://support.apple.com/en-au/guide/iphone/iph7405291c4/ios):
  conditional forwarding availability and setup depend on the carrier.
- [WebKit iOS web push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/):
  Home Screen web apps and user-initiated notification permission.
- [RESO Member MLS ID](https://dd.reso.org/DD2.1/MemberStateLicense/MemberMlsId/):
  local originating-system identifier, potentially non-unique in aggregates.
- [MLS Grid access documentation](https://docs.mlsgrid.com/) and
  [licensing/resources](https://www.mlsgrid.com/resources): access follows the
  licensed subscription/MLS approval process; permitted AI use has separate
  published material. A member number does not grant a feed.

No vendor purchase, account connection, live message, number provision or phone
forwarding change was made for this plan.
