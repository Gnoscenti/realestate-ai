import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PRODUCT_TOUR_STEPS, type TourStep } from "@/lib/product-tour";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type Rect = { top: number; left: number; width: number; height: number };

function measure(selector?: string): Rect | null {
  if (!selector || typeof document === "undefined") return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 && r.height < 2) return null;
  return {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
  };
}

function ArrowGlyph({
  placement,
}: {
  placement: TourStep["placement"];
}) {
  const cls = "h-5 w-5 text-[var(--color-primary)] drop-shadow-[0_0_12px_var(--color-primary)]";
  if (placement === "right") return <ArrowLeft className={cls} />;
  if (placement === "left") return <ArrowRight className={cls} />;
  if (placement === "top") return <ArrowDown className={cls} />;
  if (placement === "bottom") return <ArrowUp className={cls} />;
  return <Sparkles className={cls} />;
}

export function ProductTour() {
  const navigate = useNavigate();
  const active = useAppStore((s) => s.tourActive);
  const stepIndex = useAppStore((s) => s.tourStepIndex);
  const setTourStep = useAppStore((s) => s.setTourStep);
  const completeTour = useAppStore((s) => s.completeTour);
  const skipTour = useAppStore((s) => s.skipTour);

  const step = PRODUCT_TOUR_STEPS[stepIndex] ?? PRODUCT_TOUR_STEPS[0]!;
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardStyle, setCardStyle] = useState<React.CSSProperties>({});

  const refresh = useCallback(() => {
    const r = measure(step.target);
    setRect(r);
  }, [step.target]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const run = async () => {
      if (step.route) {
        await navigate({ to: step.route });
        // wait for route paint
        await new Promise((r) => setTimeout(r, 280));
      }
      if (!cancelled) refresh();
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [active, step.id, step.route, navigate, refresh]);

  useLayoutEffect(() => {
    if (!active) return;
    refresh();
    const onResize = () => refresh();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    const t = window.setInterval(refresh, 500);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      window.clearInterval(t);
    };
  }, [active, stepIndex, refresh]);

  useLayoutEffect(() => {
    if (!active) return;
    const pad = 16;
    const cardW = Math.min(340, window.innerWidth - 32);
    const cardH = 220;
    const placement = step.placement ?? "center";

    if (!rect || placement === "center") {
      setCardStyle({
        position: "fixed",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: cardW,
        zIndex: 80,
      });
      return;
    }

    let top = rect.top;
    let left = rect.left;

    if (placement === "right") {
      left = rect.left + rect.width + 18;
      top = rect.top + rect.height / 2 - cardH / 2;
    } else if (placement === "left") {
      left = rect.left - cardW - 18;
      top = rect.top + rect.height / 2 - cardH / 2;
    } else if (placement === "bottom") {
      left = rect.left + rect.width / 2 - cardW / 2;
      top = rect.top + rect.height + 18;
    } else if (placement === "top") {
      left = rect.left + rect.width / 2 - cardW / 2;
      top = rect.top - cardH - 18;
    }

    left = Math.max(pad, Math.min(left, window.innerWidth - cardW - pad));
    top = Math.max(pad, Math.min(top, window.innerHeight - cardH - pad));

    setCardStyle({
      position: "fixed",
      left,
      top,
      width: cardW,
      zIndex: 80,
    });
  }, [active, rect, step.placement]);

  if (!active) return null;

  const total = PRODUCT_TOUR_STEPS.length;
  const isLast = stepIndex >= total - 1;
  const holePad = 8;

  return (
    <div
      className="tour-root fixed inset-0 z-[70]"
      role="dialog"
      aria-modal="true"
      aria-label="Product tour"
    >
      {/* Dim + spotlight cutout via box-shadow on highlight ring */}
      <div className="pointer-events-auto absolute inset-0 bg-[rgb(6_8_14_/_0.55)] backdrop-blur-[2px]" />

      {rect && (
        <div
          className="tour-spotlight pointer-events-none absolute rounded-[var(--radius-lg)]"
          style={{
            top: rect.top - holePad,
            left: rect.left - holePad,
            width: rect.width + holePad * 2,
            height: rect.height + holePad * 2,
            boxShadow: "0 0 0 9999px rgb(6 8 14 / 0.62)",
            outline: "2px solid color-mix(in oklab, var(--color-primary) 70%, white)",
            outlineOffset: 2,
          }}
        />
      )}

      {/* Pulse ring */}
      {rect && (
        <div
          className="tour-pulse pointer-events-none absolute rounded-[var(--radius-lg)]"
          style={{
            top: rect.top - holePad - 4,
            left: rect.left - holePad - 4,
            width: rect.width + holePad * 2 + 8,
            height: rect.height + holePad * 2 + 8,
          }}
        />
      )}

      {/* Connector arrow near target */}
      {rect && step.placement && step.placement !== "center" && (
        <div
          className="pointer-events-none absolute z-[75] flex h-9 w-9 items-center justify-center rounded-full glass-chip animate-tour-bob"
          style={{
            top:
              step.placement === "bottom"
                ? rect.top + rect.height + 2
                : step.placement === "top"
                  ? rect.top - 40
                  : rect.top + rect.height / 2 - 18,
            left:
              step.placement === "right"
                ? rect.left + rect.width + 2
                : step.placement === "left"
                  ? rect.left - 40
                  : rect.left + rect.width / 2 - 18,
          }}
        >
          <ArrowGlyph placement={step.placement} />
        </div>
      )}

      {/* Glass coach card */}
      <div
        className="glass-panel tour-card pointer-events-auto p-4 shadow-[var(--shadow-lg)] animate-[tour-fade_0.28s_ease]"
        style={cardStyle}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
                Step {stepIndex + 1} of {total}
              </div>
              <h2 className="font-display text-base font-semibold text-[var(--color-fg)]">
                {step.title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            className="min-touch flex h-10 w-10 items-center justify-center rounded-full text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
            aria-label="Skip tour"
            onClick={() => skipTour()}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm leading-relaxed text-[var(--color-fg-muted)]">
          {step.body}
        </p>

        {step.tip && (
          <div className="mt-3 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--color-accent)_35%,transparent)] bg-[color-mix(in_oklab,var(--color-accent-soft)_70%,transparent)] px-3 py-2 text-xs text-[var(--color-fg)]">
            <span className="font-semibold text-[var(--color-accent)]">Tip · </span>
            {step.tip}
          </div>
        )}

        {/* Progress dots */}
        <div className="mt-4 flex items-center gap-1.5">
          {PRODUCT_TOUR_STEPS.map((s, i) => (
            <div
              key={s.id}
              className={cn(
                "h-1.5 rounded-full transition-all duration-200",
                i === stepIndex
                  ? "w-6 bg-[var(--color-primary)]"
                  : i < stepIndex
                    ? "w-1.5 bg-[var(--color-primary)]/50"
                    : "w-1.5 bg-[var(--color-border-strong)]",
              )}
            />
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <Button
            variant="ghost"
            className="min-h-[44px] flex-1"
            disabled={stepIndex === 0}
            onClick={() => setTourStep(Math.max(0, stepIndex - 1))}
          >
            Back
          </Button>
          <Button
            className="min-h-[44px] flex-[1.4]"
            onClick={() => {
              if (isLast) completeTour();
              else setTourStep(stepIndex + 1);
            }}
          >
            {isLast ? "Finish" : "Next"}
            {!isLast && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Floating help — restart tour */
export function TourHelpButton() {
  const startTour = useAppStore((s) => s.startTour);
  const tourCompleted = useAppStore((s) => s.tourCompleted);

  return (
    <button
      type="button"
      data-tour="help-btn"
      onClick={() => startTour()}
      className="glass-chip group fixed bottom-[calc(var(--ios-tab-height)+env(safe-area-inset-bottom,0px)+0.75rem)] right-4 z-40 flex min-h-[44px] items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium text-[var(--color-fg)] shadow-[var(--shadow-md)] transition hover:scale-[1.02] active:scale-[0.98] md:bottom-6"
      title="Replay guided tour"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-primary-fg)]">
        ?
      </span>
      <span className="pr-0.5">{tourCompleted ? "Help tour" : "Tour"}</span>
    </button>
  );
}
