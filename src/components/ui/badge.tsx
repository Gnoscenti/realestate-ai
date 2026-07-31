import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--color-primary-soft)] text-[var(--color-primary)]",
        secondary:
          "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]",
        outline: "border-[var(--color-border-strong)] text-[var(--color-fg-muted)]",
        success:
          "border-transparent bg-[var(--color-success-soft)] text-[var(--color-success)]",
        warning:
          "border-transparent bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
        danger:
          "border-transparent bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
        hot: "border-transparent bg-[var(--color-danger-soft)] text-[var(--color-hot)]",
        warm: "border-transparent bg-[var(--color-warning-soft)] text-[var(--color-warm)]",
        cold: "border-transparent bg-[var(--color-primary-soft)] text-[var(--color-cold)]",
        accent:
          "border-transparent bg-[var(--color-accent-soft)] text-[var(--color-accent)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
