import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Status = "ok" | "warn" | "alert";

const statusStyles: Record<Status, string> = {
  ok: "bg-signal",
  warn: "bg-warning",
  alert: "bg-destructive animate-pulse-dot",
};

export function SensorTile({
  icon: Icon,
  label,
  value,
  unit,
  hint,
  status = "ok",
  progress,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string | undefined;
  hint?: string | undefined;
  status?: Status;
  progress?: number | undefined; // 0-1
}) {
  return (
    <div className={cn("panel flex flex-col gap-3 p-4", status === "alert" && "border-destructive/60")}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="size-4" />
          {label}
        </div>
        <span className={cn("size-2 rounded-full", statusStyles[status])} aria-label={status} />
      </div>
      <div className="flex items-baseline gap-1">
        <span className="readout text-3xl font-semibold">{value}</span>
        {unit && <span className="readout text-sm text-muted-foreground">{unit}</span>}
      </div>
      {progress !== undefined && (
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700",
              status === "ok" ? "bg-signal" : status === "warn" ? "bg-warning" : "bg-destructive",
            )}
            style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }}
          />
        </div>
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
