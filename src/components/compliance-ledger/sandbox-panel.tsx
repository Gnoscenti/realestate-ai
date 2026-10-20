import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Download, FlaskConical, LoaderCircle, LockKeyhole } from "lucide-react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createMyComplianceSandbox, getMyComplianceEvents, getMyComplianceSandbox, updateMyComplianceSandbox } from "@/lib/compliance-ledger/api";
import { formatMicro, identityCurrent } from "@/lib/compliance-ledger/engine";
import { SANDBOX_NOTICE, commandSchema, eligibleListingStatus, type SandboxCase, type SandboxCommand, type SandboxEvent, type SandboxWorkspace } from "@/lib/compliance-ledger/types";

const ACTIONS: Record<SandboxCommand["kind"], string> = {
  verify_mock_identity: "Mock identity approved", revoke_mock_identity: "Mock identity revoked",
  deposit: "Test funds recorded", allocate: "Simulated units allocated", refund: "Test funds refunded",
};
export function ComplianceSandboxPanel() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <p role="status">Loading your workspace…</p>;
  if (!user) return <p>Sign in to open your private fractionalization sandbox.</p>;
  return <AccountSandbox key={user.id} ownerId={user.id} />;
}
function AccountSandbox({ ownerId }: { ownerId: string }) {
  const [workspace, setWorkspace] = useState<SandboxWorkspace | null>(null);
  const [selected, setSelected] = useState("");
  const [events, setEvents] = useState<SandboxEvent[]>([]);
  const [wallet, setWallet] = useState("0x1111111111111111111111111111111111111111");
  const [amount, setAmount] = useState("250");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const mounted = useRef(false);
  const pending = useRef(false);
  const current = workspace?.cases.find(row => row.listingId === selected);
  const caseId = current?.id;
  const revision = current?.revision;
  const investor = current?.state.investors.find(row => row.wallet === wallet.trim().toLowerCase());
  const approved = investor?.mockIdentity === "approved" && identityCurrent(investor.claimExpiresAt);
  const activeListing = eligibleListingStatus(workspace?.listings.find(row => row.id === selected)?.status ?? current?.listingStatus ?? "");

  const load = useCallback(async () => {
    const result = await getMyComplianceSandbox();
    if (!mounted.current) return;
    if (result.ownerId !== ownerId) throw new Error("Your session changed. Reload this page.");
    setWorkspace(result);
    setSelected(value => value || result.cases[0]?.listingId || result.listings[0]?.id || "");
  }, [ownerId]);
  const run = useCallback(async (task: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError(""); setStatus("");
    try { await task(); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "The sandbox could not be updated."); }
    finally { if (mounted.current) { pending.current = false; setBusy(false); } }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void run(load);
    return () => { mounted.current = false; pending.current = false; };
  }, [load, run]);
  useEffect(() => {
    let canceled = false;
    setEvents([]);
    if (caseId) void getMyComplianceEvents({ data: { caseId } }).then(result => {
      if (!canceled) setEvents(result);
    }).catch(() => { if (!canceled) setError("The audit history could not be loaded. Reload the saved sandbox."); });
    return () => { canceled = true; };
  }, [caseId, revision]); // The history belongs to the selected saved revision.
  function accept(saved: SandboxCase) {
    if (!mounted.current) return;
    setWorkspace(previous => previous && ({ ...previous, cases: [saved, ...previous.cases.filter(row => row.id !== saved.id)] }));
    setSelected(saved.listingId);
  }
  function action(kind: SandboxCommand["kind"]) {
    if (!current) return;
    void run(async () => {
      const base = { caseId: current.id, operationId: crypto.randomUUID(), expectedRevision: current.revision, wallet, kind };
      const parsed = commandSchema.safeParse(["deposit", "allocate", "refund"].includes(kind) ? { ...base, amount } : base);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the form.");
      const saved = await updateMyComplianceSandbox({ data: parsed.data });
      accept(saved);
      if (mounted.current) setStatus(`${ACTIONS[kind]}. Saved as revision ${saved.revision}.`);
    });
  }
  async function exportLedger() {
    if (!current) return;
    const history = (await getMyComplianceEvents({ data: { caseId: current.id } })).filter(event => event.revision <= current.revision);
    if (!mounted.current) return;
    const text = ["# Fractionalization sandbox", SANDBOX_NOTICE,
      `Property reference: ${current.listingTitle}`, `Listing ID: ${current.listingId}`,
      `Revision: ${current.revision} • Local simulation; no deployed contract.`,
      "Illustrative ratio: one test USDC = one simulated unit. This is not a valuation or an ownership percentage.",
      ...current.state.investors.map(row => `- ${row.wallet}: mock claim ${row.mockIdentity}, expires ${row.claimExpiresAt}; test escrow ${formatMicro(row.escrowMicro)}; simulated units ${formatMicro(row.allocatedMicro)}.`),
      "## Audit history", ...history.slice().reverse().map(event => `- ${event.createdAt} • r${event.revision} • ${ACTIONS[event.kind]} • ${event.wallet}${event.amount ? ` • ${event.amount}` : ""}`),
    ].join("\n\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "fractionalization-sandbox.md"; anchor.click();
    URL.revokeObjectURL(url);
  }
  const locked = busy || Boolean(error);
  const steps = [
    { label: "Property reference", done: Boolean(current), detail: "Your saved listing" },
    { label: "Mock identity", done: Boolean(approved), detail: "24-hour simulated claim" },
    { label: "Test escrow", done: BigInt(investor?.escrowMicro ?? "0") > 0n, detail: "No real funds" },
    { label: "Simulated allocation", done: BigInt(investor?.allocatedMicro ?? "0") > 0n, detail: "No ownership issued" },
  ];
  return <Card data-testid="compliance-sandbox" className="overflow-hidden">
    <CardHeader className="space-y-4 bg-[var(--color-bg-elevated)]">
      <div className="flex flex-wrap items-center gap-2"><Badge variant="accent"><FlaskConical className="h-3 w-3" /> Fractionalization lab</Badge><Badge variant="secondary">Simulation only</Badge></div>
      <CardTitle className="font-display text-2xl">Explore the next step for a property.</CardTitle>
      <CardDescription className="max-w-2xl">Connect a listing to a private eligibility and allocation walkthrough. Every step is saved, reversible where applicable, and visible in your audit history.</CardDescription>
      <p className="max-w-3xl text-xs text-[var(--color-fg-muted)]">{SANDBOX_NOTICE}</p>
      <div className="flex flex-wrap items-center gap-2 text-sm"><Link to="/aieo" className="underline">Discover with CiteLock</Link><ArrowRight className="h-4 w-4" /><Link to="/marketing" className="underline">Enhance in Social Desk</Link><ArrowRight className="h-4 w-4" /><span>Explore fractionalization</span></div>
    </CardHeader>
    <CardContent className="space-y-6 pt-6" aria-busy={busy}>
      <div role="status" aria-live="polite" className="text-sm">{busy ? <span className="flex gap-2"><LoaderCircle className="h-4 w-4 animate-spin" />Saving or loading your sandbox…</span> : status}</div>
      {error && <div role="alert" className="space-y-2 rounded-lg border border-[var(--color-warning)] p-3 text-sm"><p>{error} Reload the saved sandbox before trying another action.</p><Button variant="outline" disabled={busy} onClick={() => void run(load)}>Reload saved sandbox</Button></div>}
      {workspace && !workspace.enabled && <p>The fractionalization sandbox is not enabled for this environment.</p>}
      {workspace?.enabled && <>
        {!workspace.listings.length && !workspace.cases.length ? <div className="rounded-lg border border-dashed p-6"><h3 className="font-medium">Start with a property reference</h3><p className="mt-2 text-sm text-[var(--color-fg-muted)]">Add a listing with a title and address in Social Desk. It will appear here; a listing reference does not establish ownership or issuing rights.</p><Link to="/marketing" className="mt-3 inline-block text-sm underline">Open Social Desk</Link><Button variant="outline" className="ml-3" disabled={busy} onClick={() => void run(load)}>Refresh listings</Button></div> : <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-2"><Label htmlFor="fractional-listing">Property reference</Label><select id="fractional-listing" className="h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm" value={selected} disabled={busy} onChange={event => { setSelected(event.target.value); setError(""); setStatus(""); }}>
              {[...workspace.listings, ...workspace.cases.filter(row => !workspace.listings.some(listing => listing.id === row.listingId)).map(row => ({ id: row.listingId, title: row.listingTitle, status: row.listingStatus }))].map(listing => <option value={listing.id} key={listing.id}>{listing.title} · {listing.status}</option>)}
            </select></div>
            {!current && <Button disabled={locked || !selected || !activeListing} onClick={() => void run(async () => { accept(await createMyComplianceSandbox({ data: { listingId: selected } })); if (mounted.current) setStatus("Simulation created. No contract was deployed."); })}>Generate Fractional Compliance Engine</Button>}
            {current && <Button variant="outline" disabled={locked} onClick={() => void run(exportLedger)}><Download className="h-4 w-4" />Export simulation</Button>}
          </div>
          {!activeListing && <p className="text-sm text-[var(--color-warning)]">This property is inactive. Existing test balances may be refunded and mock claims revoked.</p>}
          {current && <>
            <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{steps.map((step, index) => <li key={step.label} className={`rounded-xl border p-4 ${step.done ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]/20" : "border-[var(--color-border)]"}`}><div className="mb-3 flex h-7 w-7 items-center justify-center rounded-full border text-xs">{step.done ? <Check className="h-4 w-4" /> : index + 1}</div><h3 className="text-sm font-medium">{step.label}</h3><p className="mt-1 text-xs text-[var(--color-fg-muted)]">{step.detail}</p></li>)}</ol>
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="space-y-4 rounded-xl border p-4"><h3 className="font-medium">Investor walkthrough</h3><p className="text-xs text-[var(--color-fg-muted)]">Use the fictional wallet below or another test address. This does not prove wallet control. No personal documents are collected.</p>
                <div className="space-y-2"><Label htmlFor="fractional-wallet">Test wallet address</Label><Input id="fractional-wallet" value={wallet} disabled={busy} onChange={event => setWallet(event.target.value)} className="font-mono text-xs" /></div>
                <div className="flex flex-wrap gap-2"><Button disabled={locked || !activeListing} onClick={() => action("verify_mock_identity")}>{approved ? "Renew mock identity" : "Run mock identity check"}</Button><Button variant="outline" disabled={locked || !investor || investor.mockIdentity === "revoked"} onClick={() => action("revoke_mock_identity")}>Revoke mock claim</Button></div>
                {investor && <p className="text-xs">Mock claim: {approved ? "approved" : "revoked or expired"} · expires {new Date(investor.claimExpiresAt).toLocaleString()}</p>}
                <div className="space-y-2"><Label htmlFor="fractional-amount">Amount in test USDC</Label><Input id="fractional-amount" inputMode="decimal" value={amount} disabled={busy} onChange={event => setAmount(event.target.value)} /></div>
                <div className="flex flex-wrap gap-2"><Button disabled={locked || !approved || !activeListing} onClick={() => action("deposit")}>Simulate deposit</Button><Button disabled={locked || !approved || !activeListing || BigInt(investor?.escrowMicro ?? "0") === 0n} onClick={() => action("allocate")}>Simulate allocation</Button><Button variant="outline" disabled={locked || BigInt(investor?.escrowMicro ?? "0") === 0n} onClick={() => action("refund")}>Simulate refund</Button></div>
              </section>
              <section className="space-y-4 rounded-xl border p-4"><h3 className="font-medium">Saved simulation</h3><div className="grid grid-cols-2 gap-4"><div><p className="text-xs text-[var(--color-fg-muted)]">Available test escrow</p><p data-testid="sandbox-balance" className="mt-1 text-2xl font-semibold tabular-nums">{formatMicro(investor?.escrowMicro ?? "0")}</p></div><div><p className="text-xs text-[var(--color-fg-muted)]">Simulated units</p><p data-testid="sandbox-units" className="mt-1 text-2xl font-semibold tabular-nums">{formatMicro(investor?.allocatedMicro ?? "0")}</p></div></div>
                <p className="text-xs text-[var(--color-fg-muted)]">Illustrative ratio: one test USDC = one simulated unit. This is not a valuation or an ownership percentage. App billing stays separate.</p>
                <div className="rounded-lg bg-[var(--color-bg-elevated)] p-3 text-xs"><p className="flex items-center gap-2 font-medium"><LockKeyhole className="h-4 w-4" />Live issuance is not connected</p><p className="mt-2">Contract: not deployed. The separate ERC-3643 developer harness runs locally. A live offering needs an issuer, approved terms, verified identity provider, custody arrangements, and reviewed contracts.</p></div>
                <p className="text-xs text-[var(--color-fg-muted)]">Saved revision {current.revision} · {current.state.investors.length} test investor(s)</p>
              </section>
            </div>
            <section className="space-y-3"><h3 className="font-medium">Audit history</h3>{!events.length ? <p className="text-sm text-[var(--color-fg-muted)]">Your first simulated action will appear here.</p> : <ol className="max-h-64 space-y-2 overflow-auto">{events.map(event => <li key={event.operationId} className="rounded-lg border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span>{ACTIONS[event.kind]}{event.amount ? ` · ${event.amount}` : ""}</span><span className="text-xs text-[var(--color-fg-muted)]">r{event.revision} · {new Date(event.createdAt).toLocaleString()}</span></div><p className="mt-1 break-all font-mono text-xs text-[var(--color-fg-muted)]">{event.wallet}</p></li>)}</ol>}</section>
          </>}
        </>}
      </>}
    </CardContent>
  </Card>;
}
