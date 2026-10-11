import {
  Clock,
  FileText,
  MessageSquare,
  TrendingUp,
  Users,
  Megaphone,
  Briefcase,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/relative-time";
import { useAppStore } from "@/lib/store";

const ICONS = {
  lead: Users,
  valuation: TrendingUp,
  document: FileText,
  chat: MessageSquare,
  deal: Briefcase,
  marketing: Megaphone,
} as const;

export function RecentActivity() {
  const activity = useAppStore((s) => s.activity).slice(0, 6);

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Clock className="h-4 w-4 text-[var(--color-fg-subtle)]" />
        <CardTitle>Recent AI activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {activity.map((item) => {
          const Icon = ICONS[item.type] ?? Clock;
          return (
            <div
              key={item.id}
              className="flex gap-3 rounded-[var(--radius-md)] p-3 transition-colors hover:bg-[var(--color-bg-elevated)]"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)]">
                <Icon className="h-4 w-4 text-[var(--color-fg-muted)]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-medium text-[var(--color-fg)]">
                    {item.title}
                  </h4>
                  <Badge variant="outline" className="text-[10px]">
                    {item.badge}
                  </Badge>
                </div>
                <p className="mt-0.5 text-sm text-[var(--color-fg-muted)]">
                  {item.description}
                </p>
                <p className="mt-1 text-[11px] text-[var(--color-fg-subtle)]">
                  <RelativeTime iso={item.time} />
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
