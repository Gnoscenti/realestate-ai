import { useEffect, useState } from "react";
import { relativeTime } from "@/lib/utils";

/** Renders relative time only after mount to avoid SSR clock skew. */
export function RelativeTime({
  iso,
  className,
}: {
  iso: string;
  className?: string;
}) {
  const [label, setLabel] = useState(() => {
    // Stable SSR fallback — absolute short date
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    } catch {
      return "—";
    }
  });

  useEffect(() => {
    setLabel(relativeTime(iso));
  }, [iso]);

  return <span className={className}>{label}</span>;
}
