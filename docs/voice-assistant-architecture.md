# Premium missed-call assistant architecture

## Chosen provider boundary

- **Retell** runs the disclosed voice agent, transcription, and structured post-call analysis.
- **Twilio** owns the inbound local number and routes it to Retell over Elastic SIP.
- Provider API keys remain server-only environment variables. Database rows store provider resource IDs, never credentials.
- Number purchasing is not allowed until a verified recurring entitlement is active.

This foundation contains no outbound provider calls and cannot purchase a number. An unconfigured deployment must remain visibly unconfigured; it must never return a mock success.

## Tenant and authorization model

Every server request derives the Better Auth user through `authMiddleware`. The server creates one personal workspace lazily and verifies `workspace_memberships` before reading or writing tenant records. Browser-supplied user IDs are never accepted.

The schema supports team workspaces later, while the beta UI can remain single-agent.

## Provisioning state machine

1. A verified Stripe webhook marks the `voice_receptionist` entitlement active.
2. The server creates one `voice_provisioning_jobs` row using a stable idempotency key.
3. Twilio reserves a local number.
4. Retell creates or updates the agent from an immutable prompt version.
5. Twilio SIP routing and Retell inbound routing are attached.
6. The number is marked active only after a real test call succeeds.

Retries resume the same job. Partial failure releases any uncommitted phone number and records the provider error without exposing secrets.

## Consent and realtor guardrails

The first spoken turn identifies the system as AI and requests affirmative consent before recording or transcription. Declining consent routes to an unrecorded fallback or human callback request.

The assistant may collect a caller's name, callback details, intent, appointment request, urgency, and broker-approved factual information. It may not negotiate, provide valuations, interpret contracts or disclosures, offer legal/financial advice, steer by protected characteristics, or pretend to be human.

## Webhook processing

The Retell endpoint will verify the raw `X-Retell-Signature`, reject stale timestamps, and insert a unique provider event before returning a fast 2xx. Duplicate deliveries are acknowledged without repeating side effects. Post-call work then upserts the call, copies approved audio to private storage, records structured fields, applies retention dates, and creates a redacted notification.

Provider recording URLs are temporary transport references—not permanent public media links.

## Notifications and privacy

Lock-screen notifications contain only a generic completion/urgency message. Transcript, recording, caller identity, and property details require an authenticated in-app view. Push endpoints and keys must be encrypted before storage.

Initial retention target: 30 days for consented audio and 90 days for transcripts, with export and deletion controls. Final disclosure and retention language require broker/counsel approval before live activation.

## Listings and comparable sales

Agent inventory and verified sold comps are separate tables. Agent websites can provide attributable active inventory, but cannot become verified Closed/Sold evidence. A strict MLS-export CSV importer is the first honest sold-comp source; live RESO Closed/Sold queries require the owner's approved board, dataset, credentials, and permitted retention/display terms.
