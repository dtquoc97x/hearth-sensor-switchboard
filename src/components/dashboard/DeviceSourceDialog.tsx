import { Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { hub, latestFor, useDeviceHub } from "@/hooks/use-device-hub";

export function DeviceSourceDialog() {
  const h = useDeviceHub();
  const current = h.devices.find((d) => d.uid === h.selectedUid);
  const options = [{ id: "sim", name: "Built-in simulation", uid: null as number | null }, ...h.devices];
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-auto self-stretch"><Cpu /> {current ? current.name : "Device"}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Show data from</DialogTitle>
          <DialogDescription>Temperature and humidity panels use the chosen device's latest report.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {options.map((d) => {
            const last = d.uid != null ? latestFor(h.log, d.uid) : undefined;
            const active = h.selectedUid === d.uid;
            return (
              <button key={d.id} type="button" onClick={() => hub.select(d.uid)}
                className={cn("flex items-center justify-between rounded-lg border p-3 text-left", active ? "border-signal bg-signal/10" : "hover:border-signal")}>
                <span>
                  <span className="block font-medium">{d.name}</span>
                  {d.uid != null && <span className="readout text-xs text-muted-foreground">UID {d.uid}</span>}
                </span>
                {d.uid != null && <span className="readout text-sm">{last ? `${last.Temperature} °C · ${last.Humidity} %` : "No data"}</span>}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
