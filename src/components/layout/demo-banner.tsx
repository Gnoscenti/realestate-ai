import { Eye, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { leaveDemo } from "@/lib/demo-mode";

/** Always-visible notice while a signed-out visitor explores the demo (sticky under the header). */
export function DemoBanner() {
  return (
    <div
      role="region"
      aria-label="Demo mode"
      data-testid="demo-banner"
      className="flex items-center gap-2 border-b border-[color-mix(in_oklab,var(--color-primary)_40%,var(--color-border))] bg-[color-mix(in_oklab,var(--color-primary)_16%,var(--color-bg))] px-3 py-1.5 text-sm text-[var(--color-fg)] sm:gap-3 sm:px-5 sm:py-2"
    >
      <Eye className="h-4 w-4 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
      <p className="min-w-0 flex-1 truncate leading-snug sm:whitespace-normal">
        <span className="font-semibold text-[var(--color-primary)]">Demo mode · sample data.</span>{" "}
        <span className="hidden sm:inline">
          Look around freely. Nothing is saved to an account, and AI drafting, live
          market data and phone setup need a free account.
        </span>
      </p>
      <div className="flex shrink-0 gap-1 sm:gap-2">
        <Button size="sm" className="min-h-[40px]" onClick={() => leaveDemo("signup")}>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          <span className="sm:hidden">Sign up</span>
          <span className="hidden sm:inline">Create free account</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="min-h-[40px] min-w-[40px]"
          aria-label="Exit demo"
          onClick={() => leaveDemo("login")}
        >
          <X className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Exit demo</span>
        </Button>
      </div>
    </div>
  );
}

/** Inline stand-in for a panel that needs a real account. */
export function DemoLockedNotice({ feature, children }: { feature: string; children?: React.ReactNode }) {
  return (
    <div
      role="note"
      data-testid="demo-locked-notice"
      className="rounded-[var(--radius-md)] border border-dashed border-[color-mix(in_oklab,var(--color-primary)_45%,var(--color-border))] bg-[var(--color-primary-soft)]/40 p-4 text-sm"
    >
      <p className="font-medium text-[var(--color-fg)]">{feature} works with your own account.</p>
      {children ? <div className="mt-1 text-[var(--color-fg-muted)]">{children}</div> : null}
      <Button size="sm" className="mt-3 min-h-[40px]" onClick={() => leaveDemo("signup")}>
        <UserPlus className="h-4 w-4" /> Create free account
      </Button>
    </div>
  );
}
