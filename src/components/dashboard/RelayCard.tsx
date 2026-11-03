import type { ReactNode } from "react";
import { Power } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Relay } from "@/lib/iot";

export function RelayCard({
  title,
  channel,
  relay,
  visual,
  watts,
  autoLabel,
  onToggle,
  onAutoChange,
  children,
}: {
  title: string;
  channel: string;
  relay: Relay;
  visual: ReactNode;
  watts: number;
  autoLabel: string;
  onToggle: () => void;
  onAutoChange: (auto: boolean) => void;
  children: ReactNode;
}) {
  return (
    <section className={cn("panel flex flex-col gap-6 p-6 transition-shadow duration-500", relay.on && "panel-on")}>
      <header className="flex items-start justify-between">
        <div>
          <p className="readout text-xs uppercase tracking-widest text-muted-foreground">{channel}</p>
          <h2 className="mt-1 text-2xl font-semibold">{title}</h2>
        </div>
        <span
          className={cn(
            "readout rounded-full border px-3 py-1 text-xs uppercase",
            relay.on ? "border-signal/50 text-signal" : "text-muted-foreground",
          )}
        >
          {relay.on ? "Closed · On" : "Open · Off"}
        </span>
      </header>

      <div className="flex items-center gap-6">
        <div className="grid size-28 shrink-0 place-items-center rounded-full border bg-surface">{visual}</div>
        <div className="flex flex-1 flex-col gap-1">
          <span className="readout text-4xl font-semibold">{watts.toFixed(1)}</span>
          <span className="text-sm text-muted-foreground">watts drawn</span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={relay.auto}
          aria-label={`Turn ${title} ${relay.on ? "off" : "on"}`}
          className={cn(
            "grid size-16 place-items-center rounded-full border-2 transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-40",
            relay.on
              ? "border-signal bg-signal text-primary-foreground shadow-[var(--shadow-glow)]"
              : "border-border bg-secondary text-muted-foreground hover:border-signal/60 hover:text-foreground",
          )}
        >
          <Power className="size-7" />
        </button>
      </div>

      <div className="flex flex-col gap-5 border-t pt-5">
        {children}
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-medium">Auto mode</span>
            <span className="block text-xs text-muted-foreground">{autoLabel}</span>
          </span>
          <Switch checked={relay.auto} onCheckedChange={onAutoChange} />
        </label>
      </div>
    </section>
  );
}
