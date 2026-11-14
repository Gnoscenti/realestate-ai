import * as Progress from "@radix-ui/react-progress";
import * as Switch from "@radix-ui/react-switch";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Gem,
  House,
  LockKeyhole,
  Play,
  RotateCcw,
  ShieldCheck,
  Vault,
} from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SANDBOX_NOTICE } from "@/lib/compliance-ledger/types";
import {
  advanceSimulation,
  DEMO_ESCROW,
  formatUsd,
  SAMPLE_ASSET,
  SAMPLE_ASSET_ROW,
  SAMPLE_ROUND,
  SCENARIOS,
  startSimulation,
  type EscrowPlan,
  type Pipeline,
  type Scenario,
} from "@/lib/concierge-gateway/engine";
import { cn } from "@/lib/utils";

const STAGES = ["records", "wallet", "claim", "gate", "escrow"] as const;
const STAGE_NAMES = {
  records: "Initialize local asset record hooks",
  wallet: "Wallet Connection",
  claim: "Cryptographic KYC Claim Issuance",
  gate: "ERC-3643 Gatekeeper Check",
  escrow: "Simulate fractional deployment",
} satisfies Record<(typeof STAGES)[number], string>;
const STEP_DELAY_MS = 780;
const releaseLabels = {
  goal_and_approval: "Release when the round meets its funding goal and receives approval",
} satisfies Record<EscrowPlan["releaseCondition"], string>;
const refundLabels = {
  shortfall_at_close: "Refund if the goal is missed at close",
} satisfies Record<EscrowPlan["refundCondition"], string>;
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#e5caa1]";

function ListingSwitch({
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-semibold text-[#f5eee2]">
          {label}
        </label>
        <p id={id + "-description"} className="mt-0.5 text-xs leading-relaxed text-[#bdb5a8]">
          {description}
        </p>
      </div>
      <Switch.Root
        id={id}
        type="button"
        aria-describedby={id + "-description"}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full border border-[#70685e] bg-[#35312b] data-[state=checked]:border-[#e5caa1] data-[state=checked]:bg-[#e5caa1] disabled:opacity-55",
          focusRing,
        )}
      >
        <Switch.Thumb className="block size-5 translate-x-1 rounded-full bg-[#f5eee2] motion-safe:transition-transform data-[state=checked]:translate-x-6 data-[state=checked]:bg-[#201a14]" />
      </Switch.Root>
    </div>
  );
}

type StepState = "Waiting" | "Running" | "Passed" | "Blocked";
function PipelineStep({
  name,
  state,
  children,
}: {
  name: string;
  state: StepState;
  children: ReactNode;
}) {
  return (
    <li aria-current={state === "Running" ? "step" : undefined} className="min-w-0">
      <details className="group rounded-lg border border-[#38322b] bg-[#1d1a17]">
        <summary
          className={cn(
            "flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-sm [&::-webkit-details-marker]:hidden",
            focusRing,
          )}
        >
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 text-[#bdb5a8] group-open:rotate-180"
          />
          <span className="min-w-0 flex-1 basis-32 font-medium">{name}</span>
          <span
            className={cn("flex shrink-0 items-center gap-1 text-xs", {
              "text-[#bdb5a8]": state === "Waiting",
              "text-[#e5caa1]": state === "Running",
              "text-[#abcead]": state === "Passed",
              "text-[#ffb4a1]": state === "Blocked",
            })}
          >
            {state === "Passed" && <Check aria-hidden="true" className="size-3.5" />}
            {state}
          </span>
        </summary>
        <div className="border-t border-[#38322b] px-3 py-2.5 text-xs leading-relaxed text-[#bdb5a8]">
          {children}
        </div>
      </details>
    </li>
  );
}

/** Standalone demonstration. A host can supply its existing CiteLock workspace link. */
export function BespokeGatewayDashboard({ citeLockLink }: { citeLockLink?: ReactNode } = {}) {
  const id = useId();
  const listingsId = id + "-listings";
  const complianceId = id + "-compliance";
  const escrowId = id + "-escrow";
  const [asset, setAsset] = useState(SAMPLE_ASSET);
  const [scenario, setScenario] = useState<Scenario>("preapproved");
  const [pipeline, setPipeline] = useState<Pipeline>({ stage: "idle" });

  const stage = pipeline.stage;
  const activeIndex = STAGES.findIndex((step) => step === stage);
  const running = activeIndex !== -1;
  const completedSteps =
    stage === "complete"
      ? STAGES.length
      : stage === "blocked"
        ? STAGES.indexOf("gate")
        : Math.max(0, activeIndex);
  const wallet = "run" in pipeline ? pipeline.run.identity.walletAddress : null;
  const claim = "run" in pipeline ? pipeline.run.claim : null;
  const escrow = pipeline.stage === "complete" ? pipeline.escrow : DEMO_ESCROW;

  // Cleanup cancels pending work on unmount, reset, or stage change (including Strict Mode).
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => {
      setPipeline((current) => (current === pipeline ? advanceSimulation(current) : current));
    }, STEP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pipeline, running]);

  function stepState(step: (typeof STAGES)[number]): StepState {
    if (stage === "blocked" && step === "gate") return "Blocked";
    if (step === stage) return "Running";
    return STAGES.indexOf(step) < completedSteps ? "Passed" : "Waiting";
  }

  const announcement =
    pipeline.stage === "blocked"
      ? pipeline.reason
      : pipeline.stage === "complete"
        ? "Simulation complete. Escrow plan ready for review."
        : pipeline.stage === "idle"
          ? "Ready to run the simulation."
          : STAGE_NAMES[pipeline.stage] + " in progress.";

  return (
    <section
      aria-labelledby={id + "-title"}
      className="@container overflow-hidden rounded-2xl border border-[#41382e] bg-[#151310] text-[#f5eee2] shadow-xl shadow-black/30"
    >
      <div className="grid @4xl:grid-cols-[11rem_minmax(0,1fr)] @6xl:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="border-b border-[#38322b] bg-[#201c17] p-4 @4xl:border-r @4xl:border-b-0 @6xl:p-5">
          <div className="mb-4 flex items-center gap-2.5 text-sm font-semibold text-[#e5caa1] @4xl:mb-8">
            <Gem aria-hidden="true" className="size-5 shrink-0" />
            Agent command panel
          </div>
          <nav aria-label="Agent command panel" className="flex flex-wrap gap-1 @4xl:flex-col">
            {[
              { id: listingsId, icon: House, label: "Pocket listings" },
              { id: complianceId, icon: ShieldCheck, label: "AI compliance" },
              { id: escrowId, icon: Vault, label: "Escrow plan" },
            ].map(({ id: target, icon: Icon, label }) => (
              <a
                key={target}
                href={"#" + target}
                className={cn(
                  "flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-[#e3d8c7] hover:bg-[#302820]",
                  focusRing,
                )}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0 text-[#d1ad7d]" />
                {label}
              </a>
            ))}
            {citeLockLink}
          </nav>
        </aside>

        <div className="min-w-0 px-4 py-6 @lg:p-7 @6xl:p-8">
          <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
            <h2
              id={id + "-title"}
              className="font-serif text-4xl font-normal leading-none tracking-tight @lg:text-5xl"
            >
              Bespoke Gateway
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#5c4a36] px-2.5 py-1 text-xs font-medium text-[#e5caa1]">
              <LockKeyhole aria-hidden="true" className="size-3.5" /> Offline simulation
            </span>
          </header>

          <div className="grid items-start gap-x-6 gap-y-8 @6xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <section
              id={listingsId}
              aria-labelledby={listingsId + "-title"}
              className="min-w-0 scroll-mt-28"
            >
              <h3 id={listingsId + "-title"} className="mb-3 font-display text-xl font-semibold">
                Private Pocket Listings
              </h3>
              <article
                aria-labelledby={id + "-asset-title"}
                className="overflow-hidden rounded-xl border border-[#433a30] bg-[#201c17]"
              >
                <figure className="relative isolate">
                  <img
                    src="/images/rsf-aerial.jpg"
                    alt="Aerial view of hills and estates in Rancho Santa Fe"
                    width={1168}
                    height={784}
                    className="aspect-[16/9] w-full object-cover object-center"
                  />
                  <figcaption className="absolute right-2 bottom-2 rounded bg-[#151310]/90 px-2 py-1 text-xs text-[#f5eee2]">
                    Area photograph
                  </figcaption>
                </figure>
                <div className="p-4 @lg:p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h4 id={id + "-asset-title"} className="font-serif text-2xl leading-tight">
                      {asset.title}
                    </h4>
                    <span className="font-display text-xl font-semibold tabular-nums text-[#e5caa1]">
                      {formatUsd(asset.valuation)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-[#d6ccbd]">
                    {asset.address}, {SAMPLE_ASSET_ROW.target_locale}
                  </p>
                  <p className="mt-1 text-xs text-[#bdb5a8]">Sample listing</p>
                  <div className="mt-4 divide-y divide-[#38322b] border-t border-[#38322b]">
                    <ListingSwitch
                      label="Off-Market Status"
                      description={
                        asset.isOffMarket
                          ? "Marked off-market for this preview."
                          : "Off-market flag cleared in this preview."
                      }
                      checked={asset.isOffMarket}
                      disabled={running}
                      onCheckedChange={(checked) => {
                        setAsset((current) => ({ ...current, isOffMarket: checked }));
                        setPipeline({ stage: "idle" });
                      }}
                    />
                    <ListingSwitch
                      label="Bespoke Concierge Tier"
                      description={
                        asset.tier === "bespoke"
                          ? "Requires a pre-existing demo investor claim."
                          : "Standard tier accepts a claim issued during the run."
                      }
                      checked={asset.tier === "bespoke"}
                      disabled={running}
                      onCheckedChange={(checked) => {
                        setAsset((current) => ({
                          ...current,
                          tier: checked ? "bespoke" : "standard",
                        }));
                        setPipeline({ stage: "idle" });
                      }}
                    />
                  </div>
                </div>
              </article>
            </section>
            <section
              id={complianceId}
              aria-labelledby={complianceId + "-title"}
              className="min-w-0 scroll-mt-28"
            >
              <h3 id={complianceId + "-title"} className="mb-3 font-display text-xl font-semibold">
                AI Compliance Trigger
              </h3>
              <div className="space-y-4 rounded-xl border border-[#433a30] bg-[#201c17] p-4 @lg:p-5">
                <div>
                  <label htmlFor={id + "-scenario"} className="mb-1.5 block text-sm font-medium">
                    Investor scenario
                  </label>
                  <select
                    id={id + "-scenario"}
                    className={cn(
                      "min-h-10 w-full rounded-lg border border-[#70685e] bg-[#1d1a17] px-3 text-sm text-[#f5eee2] disabled:opacity-55",
                      focusRing,
                    )}
                    disabled={running}
                    value={scenario}
                    onChange={(event) => {
                      const next = SCENARIOS.find(
                        ({ id: value }) => value === event.currentTarget.value,
                      );
                      if (next) {
                        setScenario(next.id);
                        setPipeline({ stage: "idle" });
                      }
                    }}
                  >
                    {SCENARIOS.map(({ id: value, label }) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={running}
                    onClick={() => setPipeline(startSimulation(asset, scenario))}
                    className="bg-[#e5caa1] text-[#201a14] focus-visible:ring-[#e5caa1]"
                  >
                    <Play aria-hidden="true" />{" "}
                    {stage === "idle"
                      ? "Run compliance simulation"
                      : running
                        ? "Running simulation"
                        : "Run again"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={stage === "idle"}
                    onClick={() => setPipeline({ stage: "idle" })}
                    className="border-[#70685e] text-[#f5eee2] hover:bg-[#302820] focus-visible:ring-[#e5caa1]"
                  >
                    <RotateCcw aria-hidden="true" /> {running ? "Cancel run" : "Reset run"}
                  </Button>
                </div>

                <div>
                  <Progress.Root
                    aria-label="Compliance simulation progress"
                    value={completedSteps}
                    max={STAGES.length}
                    getValueLabel={(value, max) => value + " of " + max + " checks passed"}
                    className="h-1.5 overflow-hidden rounded-full bg-[#433a30]"
                  >
                    <Progress.Indicator
                      className="h-full rounded-full bg-[#e5caa1] motion-safe:transition-[width]"
                      style={{ width: (completedSteps / STAGES.length) * 100 + "%" }}
                    />
                  </Progress.Root>
                  <p
                    role="status"
                    aria-atomic="true"
                    className={cn(
                      "mt-2 min-h-5 text-sm leading-snug",
                      stage === "blocked" ? "text-[#ffb4a1]" : "text-[#d6ccbd]",
                    )}
                  >
                    {announcement}
                  </p>
                </div>

                <ol className="space-y-2" aria-label="Compliance pipeline">
                  <PipelineStep name={STAGE_NAMES.records} state={stepState("records")}>
                    Load the browser fixture shaped like <code>properties_luxury</code> and resolve
                    its linked round. The preview keeps this snapshot in memory.
                  </PipelineStep>
                  <li>
                    <fieldset className="min-w-0">
                      <legend className="mb-1.5 px-1 text-xs font-semibold text-[#d6ccbd]">
                        Investor ONCHAINID simulation
                      </legend>
                      <ol className="space-y-2">
                        <PipelineStep name={"1. " + STAGE_NAMES.wallet} state={stepState("wallet")}>
                          {wallet ? (
                            <code className="break-all">{wallet}</code>
                          ) : (
                            "Bind the fixture wallet to this run."
                          )}
                        </PipelineStep>
                        <PipelineStep name={"2. " + STAGE_NAMES.claim} state={stepState("claim")}>
                          {claim
                            ? (claim.preexisting
                                ? "Loaded pre-existing demo claim. "
                                : "Issued new demo claim. ") +
                              "Topics: " +
                              claim.topics.join(", ") +
                              "."
                            : "Load or simulate issuance of the investor claim for the selected scenario."}
                        </PipelineStep>
                        <PipelineStep name={"3. " + STAGE_NAMES.gate} state={stepState("gate")}>
                          {stage === "blocked"
                            ? announcement
                            : "Check wallet binding, KYC and AML topics, round status, and the tier’s claim timing rule."}
                        </PipelineStep>
                      </ol>
                    </fieldset>
                  </li>
                  <PipelineStep name={STAGE_NAMES.escrow} state={stepState("escrow")}>
                    Prepare the escrow plan for a Base L2 target after the simulated gate passes.
                  </PipelineStep>
                </ol>
              </div>
            </section>

            <section
              id={escrowId}
              aria-labelledby={escrowId + "-title"}
              className="min-w-0 scroll-mt-28 rounded-xl border border-[#433a30] bg-[#201c17] p-4 @lg:p-5 @6xl:col-span-2"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 id={escrowId + "-title"} className="font-display text-xl font-semibold">
                  Fractional round &amp; escrow
                </h3>
                <span className="text-xs font-medium text-[#e5caa1]">
                  {stage === "complete"
                    ? "Simulation passed"
                    : stage === "blocked"
                      ? "Blocked by gatekeeper"
                      : "Draft terms"}
                </span>
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-[#d6ccbd]">
                <ArrowUpRight aria-hidden="true" className="size-4" /> Base L2 target · chain{" "}
                {escrow.targetChainId} · {escrow.fundingWindowDays}-day funding window
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-[#433a30] py-3 @lg:grid-cols-3 @6xl:grid-cols-5">
                {[
                  ["Share supply", new Intl.NumberFormat("en-US").format(SAMPLE_ROUND.shareSupply)],
                  ["Price per share", formatUsd(SAMPLE_ROUND.pricePerShare)],
                  ["Minimum funding", formatUsd(escrow.minimumFundingGoal)],
                  ["Funding cap", formatUsd(escrow.fundingCap)],
                  ["Simulated funding", formatUsd(escrow.currentFunding)],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs text-[#bdb5a8]">{label}</dt>
                    <dd className="mt-1 break-words font-display text-lg font-semibold tabular-nums">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-sm text-[#d6ccbd]">
                {releaseLabels[escrow.releaseCondition]}. {refundLabels[escrow.refundCondition]}.
              </p>
            </section>
          </div>
          <p className="mt-5 max-w-prose text-xs leading-relaxed text-[#bdb5a8]">
            {SANDBOX_NOTICE}
          </p>
        </div>
      </div>
    </section>
  );
}
