import * as Tooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Short hint shown on hover or keyboard focus.
 *
 * The hint is rendered in a portal. It used to be an absolutely positioned
 * child of the trigger, and every place it is used sits inside a scrolling
 * list: `overflow-y: auto` also clips horizontally, so a hint that opened to
 * the side was cut off completely and never seen. A portal is outside that
 * clip, and Radix keeps it on screen and tied to the trigger for assistive
 * technology. It does not open on touch, where there is no hover to end it.
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
  return (
    // Not hoverable: it is a label, and it must go the moment the pointer leaves.
    <Tooltip.Provider delayDuration={250} skipDelayDuration={200} disableHoverableContent>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span className={cn("relative inline-flex", className)}>{children}</span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side={side}
            sideOffset={8}
            collisionPadding={8}
            data-testid="hover-hint"
            className="glass-panel pointer-events-none z-[60] w-max max-w-[220px] px-2.5 py-1.5 text-left text-xs leading-snug text-[var(--color-fg-muted)] shadow-[var(--shadow-md)] animate-tour-in"
          >
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
