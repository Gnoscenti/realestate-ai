# Premium missed-call assistant: beta architecture

## Scope and provider boundary

- [Retell](https://docs.retellai.com/) runs a disclosed, inbound-only voice
  agent and sends post-call analysis webhooks.
- A customer-controlled Twilio account owns each local number. Twilio Elastic
  SIP Trunking routes inbound PSTN calls to Retell at `sip:sip.retellai.com`.
- Provider credentials are read only from server environment variables. The
  database stores resource IDs and versions, never API keys.
- There is no outbound AI call, transfer, or SMS code path. Every Retell phone
  update explicitly clears outbound and SMS bindings.
- The authenticated `/voice` console covers activation, bounded prompt edits,
  carrier-safe forwarding guidance, field-readiness checks, and consent-gated
  call logs. A native push-delivery worker remains separate work.

The implementation tracks the current Retell REST contracts for
[secure webhooks](https://docs.retellai.com/features/secure-webhook),
[agent version publishing](https://docs.retellai.com/api-references/publish-agent-version),
[phone import](https://docs.retellai.com/api-references/import-phone-number),
and [privacy storage modes](https://docs.retellai.com/accounts/privacy-disable),
plus Twilio's [IncomingPhoneNumber](https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource)
and [SIP Trunking](https://www.twilio.com/docs/sip-trunking/api) APIs.

## Purchase and billing safety

`provisionMyVoiceAssistant` is an authenticated enqueue operation. It requires:

1. owner/admin workspace access;
2. the literal confirmation `PROVISION_NUMBER`;
3. a valid request idempotency key; and
4. a non-expired `active` or `trialing` voice entitlement carrying a Stripe
   subscription ID, price ID, billing event ID, and verification timestamp.

An `active` database row by itself is deliberately insufficient. Only the
signed Stripe lifecycle webhook may write the trusted billing fields. Checkout
return navigation never grants access, and provisioning stays fail-closed with
`VOICE_BILLING_SETUP_REQUIRED` until a verified supported event is applied.

The beta includes 200 completed inbound minutes per verified billing period.
Every provider step rechecks the allowance; the number-purchase step checks
again immediately before calling Twilio. Accepted completed-call usage invokes
a workspace-scoped policy reconciliation after its idempotent ledger write.
Once ledger usage reaches 12,000 seconds, new calls are paused without waiting
for cron. A call already in progress may finish, so this is not represented as
a real-time hard cap; no overage is charged. Stripe lifecycle changes run the
same reconciliation. Retell is rebound only after billing is verified and the
allowance is available. Twilio ownership is retained while paused.

### Stripe subscription lifecycle

The Voice Assistant is a separate recurring add-on from the app's existing
one-time $9.99 checkout. `STRIPE_VOICE_PRICE_ID` is server-only. Before opening
Checkout, the server retrieves that Price and requires an active, licensed,
per-unit, $79 USD monthly price. Checkout receives only the configured Price ID
and binds Better Auth `user_id`, the authorized `workspace_id`, product, and the
12,000-second completed-call allowance into Checkout and Subscription metadata.
Checkout creation uses a server-owned Stripe idempotency key derived from the
workspace, product, configured Price, and trusted webhook billing generation.
A verified cancellation advances that generation so a later resubscribe does
not reuse the prior Checkout attempt.

`POST /api/webhooks/stripe` reads the exact raw body and verifies it with
`STRIPE_WEBHOOK_SECRET`. It supports only:

- `customer.subscription.created`, `.updated`, and `.deleted`;
- `invoice.paid`; and
- `invoice.payment_failed`.

Every supported event is deduplicated by Stripe event ID, audited with a
SHA-256 payload digest rather than a copied billing payload, and order-guarded
before it may change `workspace_entitlements`. The signed metadata user must be
an owner/admin of the exact workspace. Customer, subscription, configured
Price, quantity, and Stripe test/live mode must agree. Canonical Stripe objects
are re-retrieved, including subscription state for deletion and invoice events.
The entitlement stores 12,000 seconds in both the included-unit and legacy
`hard_limit_units` fields; runtime semantics are the completed-call admission
threshold described above, not real-time call termination.
`overage_authorized = false`; there is no metered-overage path in this release.

Production billing setup still requires all of the following before activation:

1. Create an active recurring $79 USD monthly Stripe Price and set
   `STRIPE_VOICE_PRICE_ID`.
2. Set `STRIPE_SECRET_KEY` and a dedicated `STRIPE_WEBHOOK_SECRET`.
3. Register `https://<production-origin>/api/webhooks/stripe` for the five event
   families above in the same Stripe account and mode as the configured Price.
4. Enable and test Stripe Customer Portal cancellation and payment updates.
5. Complete sandbox checkout, renewal, failure, stale-event, replay, and cancel
   tests before enabling real voice-provider credentials.

## Crash-safe provisioning state machine

Activation never performs provider mutations. It creates one durable job keyed
to the assistant's stable `provisioning_identity`. Authenticated UI polling via
`progressMyVoiceProvisioning` advances at most one bounded step:

1. `create_llm`
2. `create_agent`
3. `configure_agent`
4. `publish_agent`
5. `reserve_number`
6. `configure_sip`
7. `bind_number`
8. `activate`

Each returned provider ID/version is persisted before the next step. A durable,
expiring workspace mutation lease with a heartbeat and token fence serializes
every provisioning/bind and policy bind/unbind step. Verified Stripe events
commit their monotonically ordered entitlement truth immediately, even while a
provider lease is busy; the event retains durable pending reconciliation work.
The lease holder reloads that truth after every provider mutation and
compensates a now-disallowed bind/unbind before committing local state. The
daily worker drains any remaining pending Stripe policy work. Per-claim worker
tokens prevent a reclaimed job from accepting a late state write. Jobs within
one workspace are serialized; terminal dead letters alert owner/admins but do
not head-of-line block newer authorized work.

Retell LLM creation and prompt-sync draft creation have no documented
idempotency key or safe list/reconcile field. The job records a durable provider
mutation intent before either call, then atomically stores the returned
ID/version and clears the intent before checking billing again. A crash, lost
lease, or ambiguous timeout that leaves an intent therefore dead-letters for
manual inventory review instead of blindly creating a possible duplicate.
Initial agent creation uses a stable `agent_name` marker and reconciles it with
Retell's list/get APIs.
Publishing treats Retell's successful empty response as `void` and retains the
submitted version. Twilio number purchase uses a stable FriendlyName and lists
before/after ambiguous purchase attempts. Before any Retell number bind, the
phone row records a bind intent. Cancellation and retry therefore issue an
idempotent, 404-tolerant unbind even if Retell succeeded but the completion
marker could not be written.

Prompt edits create immutable server-composed prompt versions. When durable
provider/provisioning evidence exists, every edit queues its own idempotent sync
job, including an edit at the final activation boundary or while billing is
paused. The job waits behind initial provisioning or policy blocking and is
resumed after reactivation. Sync updates the existing
Retell LLM, creates/configures/publishes a draft version of the same agent, and
rebinds the existing number. It never purchases another number.

An initial terminal dead letter is never retried by the normal provision
button. After checking Retell and Twilio inventory and resolving or deleting
any ambiguous provider resource, an owner/admin may invoke
`retryMyReviewedVoiceDeadLetter` with the exact confirmation
`RETRY_AFTER_PROVIDER_INVENTORY_REVIEW`; this resets the same job and stable
provider identity instead of silently creating a second job or number.

The daily Vercel cron is only a Hobby-compatible safety net. It retries expired
leases and webhook work, reconciles billing/allowance, and runs retention. Beta
launch requires a production queue or protected internal-worker schedule with
a reviewed cancellation SLO; otherwise a pending policy row left by a crashed
provider worker may wait for the daily safety net. The same durable steps can
move to a queue or Workflow without changing the state model.

## Prompt and consent controls

Users can customize only bounded business preferences and greeting text. The
system prompt is composed from the authenticated, server-owned agent profile
and fixed rules. The Retell `begin_message` contains only the AI identity,
recording/transcription disclosure, and consent question. The business greeting
and information collection happen only after an unambiguous affirmative reply;
declined, ambiguous, or unanswered consent ends the call without collection.

Consent evidence is the signed Retell post-call classification. The application
does not fabricate a consent timestamp: `consent_recorded_at` remains null until
the provider supplies reliable timestamped evidence. Only `accepted` analyzed
events may persist or expose transcript, temporary recording URL, caller name,
callback number, appointment request, urgency, or summary.

Retell is configured with `data_storage_setting: basic_attributes_only`, so it
does not retain call recordings or transcripts. Those artifacts may appear in
the signed webhook, and the signed recording URL expires in roughly ten
minutes. Declined/unknown content is redacted before it enters the durable app
inbox; after an analyzed event the basic provider call record is also flagged
for deletion. Broker/counsel approval of the disclosure and each served
jurisdiction remains a release gate.

## Webhook security and tenant isolation

`POST /api/webhooks/retell`:

- reads at most 1 MB of exact UTF-8 request bytes;
- verifies the official timestamped `X-Retell-Signature` HMAC using the
  designated Retell webhook API key;
- rejects signatures older than five minutes and compares digests in constant
  time;
- deduplicates by `(event type, Retell call ID)` before processing; and
- stores the verified event before any acknowledgement.

Agent and destination-number targets are resolved independently. If both are
present, both must resolve to the same workspace and assistant. Mismatches are
redacted and quarantined. A `retell_call_id` conflict can update only the same
workspace/assistant; cross-tenant conflicts return no row and quarantine.

After the inbox insert, the route runs a bounded database-only processor before
returning `204`, so accepted analyzed calls are visible immediately. Provider
deletion is never awaited on this path. A duplicate delivery also invokes the
processor to recover a previously accepted but unfinished event. Transient
failures retry; exhausted events dead-letter with explicit alert state. Raw
payload content is scrubbed after completion, quarantine, or dead-letter.

## Authenticated call-log API and retention

- TanStack server RPC: `listMyVoiceCalls`
- HTTP: `GET /api/voice/calls?workspaceId=...&limit=25&before=<opaque>`

Both require a workspace membership (`owner`, `admin`, or `member`), cap pages
at 100, and use an opaque `(created_at,id)` cursor so equal timestamps cannot
skip rows. Outputs defensively suppress all content unless consent is accepted.

Recording playback is explicitly ephemeral: a Retell signed URL is returned
only before the conservative local expiry marker and is never described as a
durable recording. The retention sweep clears expired URLs, clears consented
transcript, caller identifiers (including ANI), and extractions after 90 days;
declined/unknown ANI and content are removed before the durable inbox write.
The sweep also redacts accidental non-consented content, retries provider
deletion, and deletes scrubbed webhook audit rows after 30 days. Durable
playback stays setup-required until a separately
approved private-ingest design supplies authenticated short-lived links.

## Field activation console

The console keeps three states separate: verified paid entitlement, an active
provider number, and verified field readiness. It labels the assistant ready
only after an owner/admin confirms conditional forwarding, the AI and recording
disclosure, the declined-consent path, a consented test call and call log,
broker approval, and a carrier-confirmed rollback procedure.

Carrier and device guidance intentionally omits generic dial codes because
conditional-forwarding support and billing vary by plan and business phone
system. Users are directed to their carrier or phone administrator for the
exact activation and rollback steps. The prompt editor exposes only bounded
greeting and intake preferences; the server-owned safety prompt is never sent
to the browser.

Call details, transcript, and playback remain hidden unless the verified record
has affirmative consent. The UI accepts only HTTPS playback links and tells the
user that Retell's signed link expires in roughly ten minutes. A stored push
subscription is reported only as a saved capability: no push alert is claimed
without a delivery worker.

## Operations and remaining release gates

Required server environment variables are documented in `.env.example`.
Before beta activation, operators still need:

- a real, exactly configured Stripe $79 monthly Price, production webhook
  secret/endpoint, Customer Portal, and end-to-end sandbox lifecycle test;
- Retell/Twilio credentials, a designated Retell webhook key, a Retell voice,
  and a Twilio SIP trunk/domain;
- counsel-approved disclosure, recording, retention, and deletion policy;
- monitoring/manual remediation for provisioning and webhook dead letters;
- provider inventory cleanup for ambiguous LLM operations;
- a push-delivery implementation if native push is promised; and
- private recording ingest if playback beyond the ephemeral signed URL is
  promised.
