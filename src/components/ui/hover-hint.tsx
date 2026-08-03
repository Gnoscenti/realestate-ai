import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight hover / focus coach card (desktop hover, mobile long-press-ish via focus).
 */
export function HoverHint({
  label,
  children,
  side = "right",
  className,
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={cn(
            "glass-panel pointer-events-none absolute z-50 w-max max-w-[220px] px-2.5 py-1.5 text-left text-[11px] leading-snug text-[var(--color-fg-muted)] shadow-[var(--shadow-md)] animate-tour-in",
            side === "right" && "left-full top-1/2 ml-2 -translate-y-1/2",
            side === "left" && "right-full top-1/2 mr-2 -translate-y-1/2",
            side === "top" && "bottom-full left-1/2 mb-2 -translate-x-1/2",
            side === "bottom" && "top-full left-1/2 mt-2 -translate-x-1/2",
          )}
        >
          {label}
          <span
            className={cn(
              "absolute h-2 w-2 rotate-45 border border-[color-mix(in_oklab,var(--color-border)_80%,transparent)] bg-[color-mix(in_oklab,var(--color-surface)_55%,transparent)]",
              side === "right" &&
                "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 border-r-0 border-t-0",
              side === "left" &&
                "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 border-b-0 border-l-0",
              side === "top" &&
                "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 border-b-0 border-l-0",
              side === "bottom" &&
                "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 border-r-0 border-t-0",
            )}
          />
        </span>
      )}
    </span>
  );
}
