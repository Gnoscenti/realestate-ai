import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CalendarDays, Inbox, LoaderCircle, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  approveMyInboxDraft,
  editMyInboxDraft,
  getMyInboxDemo,
  refreshMyInboxDraft,
  resetMyInboxDemo,
  scanMyInboxDemo,
} from "@/lib/inbox-drafts/api";
import type { DemoDraft, DemoState } from "@/lib/inbox-drafts/engine";

type DemoOperation = () => Promise<DemoState | null>;

/** Changing accounts unmounts the entire inbox, including pending draft edits. */
export function InboxDraftDemo() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return <p role="status" className="text-sm text-[var(--color-fg-muted)]">Loading your workspace…</p>;
  }
  if (!user) {
    return <p className="text-sm text-[var(--color-fg-muted)]">Sign in to try your private inbox demo.</p>;
  }
  return <AccountInboxDemo key={user.id} ownerId={user.id} />;
}

function AccountInboxDemo({ ownerId }: { ownerId: string }) {
  const [state, setState] = useState<DemoState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewEpoch, setReviewEpoch] = useState(0);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const active = useRef(false);
  const requestId = useRef(0);
  const operationPending = useRef(false);

  const run = useCallback(async (operation: DemoOperation, discardLocalEdits = false) => {
    if (operationPending.current) return;
    operationPending.current = true;
    const request = ++requestId.current;
    setBusy(true);
    setError(null);
    setReviewEpoch((epoch) => epoch + 1);
    try {
      const result = await operation();
      if (!active.current || request !== requestId.current) return;
      // The server derives ownership from the session. Fail closed if the
      // response belongs to a different session after an account switch.
      if (result && result.ownerId !== ownerId) {
        setState(null);
        throw new Error("Your session changed. Reload this page to continue.");
      }
      setState(result);
      if (discardLocalEdits) setEditorEpoch((epoch) => epoch + 1);
    } catch (cause) {
      if (!active.current || request !== requestId.current) return;
      const message = cause instanceof Error ? cause.message : "The demo could not be updated.";
      const recovery = /calendar snapshot|timezone|working window/i.test(message)
        ? "Choose Start a fresh sample to rebuild the synthetic calendar."
        : "Reload the saved demo before trying again.";
      setError(`${message} ${recovery} Nothing was sent.`);
    } finally {
      if (active.current && request === requestId.current) {
        operationPending.current = false;
        setBusy(false);
        setLoading(false);
      }
    }
  }, [ownerId]);

  useEffect(() => {
    active.current = true;
    void run(() => getMyInboxDemo());
    return () => {
      active.current = false;
      requestId.current += 1;
      operationPending.current = false;
    };
  }, [run]);

  return (
    <Card data-testid="inbox-draft-demo" className="overflow-hidden border-[var(--color-primary)]/30">
      <CardHeader className="space-y-3 bg-[var(--color-bg-elevated)]">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent"><Inbox className="h-3 w-3" /> Inbox assistant</Badge>
          <Badge variant="secondary">Sample experience</Badge>
        </div>
        <CardTitle className="font-display text-xl sm:text-2xl">
          You show the home. Your next reply is ready for review.
        </CardTitle>
        <CardDescription className="max-w-2xl leading-relaxed">
          See an inquiry become a personalized draft with two open appointment times. No manual lead entry needed.
        </CardDescription>
        <p className="flex items-start gap-2 text-xs text-[var(--color-fg-muted)]">
          <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          Synthetic leads and appointments only. No live inbox or calendar is connected. Approval records your review; nothing is sent or booked.
        </p>
      </CardHeader>
      <CardContent className="space-y-5 pt-5" aria-busy={busy}>
        {loading ? (
          <p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />Loading your saved demo…</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || Boolean(error)} onClick={() => void run(() => scanMyInboxDemo())}>
              {busy ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Inbox aria-hidden="true" className="h-4 w-4" />}
              {state?.lastScannedAt ? "Scan sample inbox again" : "Try a sample inquiry"}
            </Button>
            {state && (
              <Button variant="outline" disabled={busy} onClick={() => void run(() => resetMyInboxDemo())}>
                Start a fresh sample
              </Button>
            )}
          </div>
        )}
        {error && (
          <div className="space-y-2 rounded-md border border-[var(--color-border)] p-3">
            <p role="alert" className="text-sm">{error}</p>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => getMyInboxDemo(), true)}>
              Reload saved demo
            </Button>
          </div>
        )}
        {state && (
          <>
            {state.lastScan && (
              <div role="status" data-testid="inbox-demo-summary" className="text-sm text-[var(--color-fg-muted)]">
                {state.drafts.length} {state.drafts.length === 1 ? "draft" : "drafts"} ready. Last scan: {state.lastScan.newDrafts} new, {state.lastScan.duplicates} duplicate {state.lastScan.duplicates === 1 ? "delivery" : "deliveries"} skipped, {state.lastScan.ignored} non-inquiry ignored.
              </div>
            )}
            <details className="rounded-md border border-[var(--color-border)] p-3 text-sm">
              <summary className="cursor-pointer font-medium">View sample inquiry sources</summary>
              <ul className="mt-3 space-y-3">
                {Array.from(new Map(state.messages.map((message) => [message.id, message])).values()).map((message) => (
                  <li key={message.id} className="space-y-1">
                    <p className="font-medium">{message.subject}</p>
                    <p className="text-xs text-[var(--color-fg-muted)]">From: {message.from}</p>
                    <p>{message.snippet}</p>
                    <p className="text-xs text-[var(--color-fg-muted)]">
                      {message.inquiry ? `Property inquiry · Customer reply address: ${message.inquiry.customerEmail}` : "Vendor proposal · Not a customer inquiry; no response prepared."}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
            {state.drafts.map((draft) => (
              <DraftReview
                key={`${draft.id}:${draft.revision}:${editorEpoch}`}
                draft={draft}
                busy={busy || Boolean(error)}
                reviewEpoch={reviewEpoch}
                onSave={(subject, body) => void run(() => editMyInboxDraft({ data: { draftId: draft.id, expectedRevision: draft.revision, subject, body } }))}
                onApprove={() => void run(() => approveMyInboxDraft({ data: { draftId: draft.id, expectedRevision: draft.revision } }))}
                onRefresh={() => void run(() => refreshMyInboxDraft({ data: { draftId: draft.id, expectedRevision: draft.revision } }))}
              />
            ))}
            {!state.drafts.length && (
              <p className="text-sm text-[var(--color-fg-muted)]">Your fresh sample is ready. Scan the sample inbox to prepare the response.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DraftReview({ draft, busy, reviewEpoch, onSave, onApprove, onRefresh }: {
  draft: DemoDraft;
  busy: boolean;
  reviewEpoch: number;
  onSave: (subject: string, body: string) => void;
  onApprove: () => void;
  onRefresh: () => void;
}) {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [reviewedAt, setReviewedAt] = useState<number | null>(null);
  const dirty = subject !== draft.subject || body !== draft.body;
  const reviewed = reviewedAt === reviewEpoch;
  const hasSlots = draft.slots.length >= 1 && draft.slots.length <= 2;
  const canReview = !busy && !dirty && hasSlots && draft.status === "draft";
  const subjectId = `${draft.id}-subject`;
  const bodyId = `${draft.id}-body`;

  return (
    <section data-testid="inbox-demo-draft" aria-label={`Draft for ${draft.customerName}`} className="space-y-4 rounded-xl border border-[var(--color-border)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{draft.customerName} · {draft.propertyLabel}</h3>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">To: <span data-testid="inbox-demo-recipient" className="font-medium text-[var(--color-fg)]">{draft.recipient}</span></p>
          <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">Recipient identified from the sample inquiry · Saved revision {draft.revision}</p>
        </div>
        <Badge variant={draft.status === "approved" && !dirty ? "success" : "secondary"}>
          {dirty ? "Unsaved edits" : draft.status === "approved" ? "Review approved" : "Needs your review"}
        </Badge>
      </div>
      <div className="rounded-lg bg-[var(--color-bg-elevated)] p-3">
        <h4 className="flex items-center gap-2 text-sm font-medium"><CalendarDays aria-hidden="true" className="h-4 w-4" /> Open times in the sample calendar</h4>
        {hasSlots ? (
          <ul className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            {draft.slots.map((slot) => <li key={slot.start} data-testid="inbox-demo-slot" className="rounded-md border border-[var(--color-border)] p-2">{slot.label}</li>)}
          </ul>
        ) : <p className="mt-2 text-sm">No available time could be verified. Approval stays blocked until availability is refreshed.</p>}
        {draft.slots.length === 1 && <p className="mt-2 text-sm">Only one appointment time is available in this sample calendar.</p>}
        <p className="mt-2 text-xs text-[var(--color-fg-muted)]">Times are checked against synthetic busy appointments. They are proposals, not reservations or verified property-access times.</p>
        <Button size="sm" variant="outline" className="mt-3" disabled={busy || dirty} onClick={onRefresh}>Recheck and regenerate draft</Button>
        <p className="mt-2 text-xs text-[var(--color-fg-muted)]">Rechecking regenerates the sample wording with current options and requires a new review.</p>
      </div>
      <div className="space-y-2">
        <label htmlFor={subjectId} className="block text-sm font-medium">Email subject</label>
        <input id={subjectId} value={subject} maxLength={240} disabled={busy} onChange={(event) => { setSubject(event.target.value); setReviewedAt(null); }} className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm" />
        <label htmlFor={bodyId} className="block text-sm font-medium">Response draft</label>
        <textarea id={bodyId} value={body} maxLength={8000} rows={9} disabled={busy} onChange={(event) => { setBody(event.target.value); setReviewedAt(null); }} className="w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm leading-relaxed" />
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="outline" disabled={busy || !dirty || !subject.trim() || !body.trim()} onClick={() => onSave(subject, body)}>Save draft changes</Button>
          <span className="text-xs text-[var(--color-fg-muted)]">{dirty ? "Save your edits before reviewing. Changes require a new approval." : "This is the saved text you will review."}</span>
        </div>
      </div>
      {draft.status === "approved" && !dirty ? (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-[var(--color-bg-elevated)] p-3 text-sm font-medium"><Check aria-hidden="true" className="h-4 w-4" />Approved demo draft — nothing sent</p>
      ) : (
        <div className="space-y-3 border-t border-[var(--color-border)] pt-4">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={reviewed && canReview} disabled={!canReview} onChange={(event) => setReviewedAt(event.target.checked ? reviewEpoch : null)} className="mt-0.5 h-4 w-4 shrink-0" />
            I reviewed the recipient, saved message, and available appointment times.
          </label>
          <Button disabled={!canReview || !reviewed} onClick={onApprove}><ShieldCheck aria-hidden="true" className="h-4 w-4" />Approve demo draft</Button>
          <p className="text-xs text-[var(--color-fg-muted)]">Your approval applies only to this saved revision. There is no send action in this demo.</p>
        </div>
      )}
    </section>
  );
}
