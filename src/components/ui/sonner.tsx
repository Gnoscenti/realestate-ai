import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-fg)] shadow-[var(--shadow-md)]",
          description: "text-[var(--color-fg-muted)]",
          actionButton:
            "bg-[var(--color-primary)] text-[var(--color-primary-fg)]",
          cancelButton:
            "bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]",
        },
      }}
    />
  );
}
