# Inbox-to-draft rehearsal

This change is a synthetic-only workflow in **Outreach** (`/outreach`). It works
with an empty real lead book. It does not connect Gmail, read a real calendar,
import real leads, send messages, book appointments, or enable a background agent.

## Try it

1. Sign in and open Outreach. Choose **Try a sample inquiry**.
2. Inspect the inquiry source and customer reply address. The notification
   sender is not the customer. A vendor pitch is ignored; a repeated delivery
   creates no second draft.
3. Inspect the two proposed phone-consultation times. The sample has an existing
   showing and a 15-minute buffer; proposals exclude both. These times do not
   establish availability or access at the property itself.
4. Edit the subject or response, save, then review the saved recipient, wording
   and times. Approval is unavailable while edits are unsaved.
5. Check the review box and choose **Approve demo draft**. The saved receipt
   binds the exact text, recipient, slots and revision. The result is explicitly
   **nothing sent**. Editing or regenerating the draft invalidates that approval.
6. Scan again to verify duplicate handling, or choose **Start a fresh sample**
   to rehearse again. Reset affects only this account's synthetic scenario.

The sample calendar is complete only for its declared synthetic working windows.
Its freshness window is 15 minutes. Approval rechecks those stored appointments,
notice and buffers; the regenerate action rereads the fixed synthetic fixture.
No third-party availability or cross-calendar completeness is claimed. Zero or
one available slot is returned honestly; no second option is fabricated.

## Scope and reuse

The workflow reuses `RawEmailMessage`, `CalendarAppointment` and `AgentProfile`
contracts, the existing showing-response module's salutation and draft-building
surface, verified session middleware and the transactional SQL adapter. It adds
an Outreach panel instead of another app or an external automation service.

The existing Gmail scanner is metadata/snippet-oriented and matches transaction
alerts. Its fuzzy contact matching and sender/subject/hour alert deduplication
are deliberately not used as recipient authority for this flow. Synthetic
portal inquiries arrive with explicit structured contact evidence. A supported
live portal parser, authenticated mailbox ownership, MIME/Reply-To validation,
durable Gmail history ingestion and real lead matching remain activation work.
The sample creates no records in the real CRM/book and consumes no Gmail token.

## Authorization and state

- All server entry points use `authMiddleware`; the user ID comes from the
  verified session. There is no client-supplied owner, mailbox token, calendar,
  recipient, approval receipt or replacement state input.
- One bounded JSONB row per authenticated user is stored in `inbox_draft_demo`.
  Every read and mutation scopes by that user. Read/edit/approve/refresh cannot
  look up another agent's draft by guessing its ID.
- Scan/edit/reset/approval run in a database transaction with a row lock.
  Message identity contains owner, mailbox, provider and message ID. The scenario
  has a fresh identifier after reset, so old requests cannot approve new content.
- Approvals require an exact saved revision and recheck availability. Replays of
  the same approved revision return the historical receipt without a new action.
- The client unmounts the entire inbox when accounts change and discards late
  results. Demo recipients must use `.test` domains. No dispatch function exists.
- This is a bounded rehearsal store, not the durable live inbox/outbox design.
  Live deployment requires normalized uniqueness, connector state, retention,
  notification delivery, dispatch reconciliation and separately approved scopes.

Migration `0018_inbox_draft_demo.sql` is additive and was not applied to
production by this task. Coordinate its filename with the deferred voice branch
at integration time; do not renumber already-applied migrations by assumption.

## Verification

Regression suites cover conservative recipient handling, message identity,
overlaps/buffers/cancelled and all-day appointments, explicit offsets and DST,
stale snapshots, revision/approval invalidation, reset replay, concurrent
transactions and another user's inability to read or mutate a draft. Repository
tests are included in the native PostgreSQL suite as well as normal unit tests.
The browser test starts with no manual leads and verifies the review/approval
experience and persistence.

For the separate whole-app onboarding and phone-assistant to-do list, see
[the roadmap](./LEAD-RESPONSE-ONBOARDING-VOICE-PLAN.md). Current open PRs reviewed:
#44 and #45 overlap in CiteLock source parsing/claim qualification; #29 is the
deferred voice beta. None already delivers this inbox-to-draft experience. This
branch does not merge or duplicate those changes.
