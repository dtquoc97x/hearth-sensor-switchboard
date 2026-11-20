import { useEffect, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SENSOR_META } from "./sensorMeta";
import { fieldsFor, useDeviceHub } from "@/hooks/use-device-hub";
import { guessField, toUid, type RelaySources } from "@/lib/iot";
import { DataSourcePicker } from "./DataSourcePicker";
import type { RelayControl, SensorKind, SensorSource } from "@/lib/modules";

export type NewDevice = { kind: "fan" | "light" | SensorKind; name: string; room: string; source?: SensorSource | undefined; sources?: RelaySources | undefined; control?: RelayControl | undefined };

const SIM = "sim";

/** Add a new panel, or edit an existing one when `initial` is given (type is then fixed). */
export function AddDeviceDialog({ onAdd, initial, open: openProp, onOpenChange, trigger }: {
  onAdd: (d: NewDevice) => void; initial?: NewDevice | undefined; open?: boolean; onOpenChange?: (o: boolean) => void; trigger?: ReactNode;
}) {
  const hubState = useDeviceHub();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChange ?? setOpenState;
  const [kind, setKind] = useState<NewDevice["kind"]>(initial?.kind ?? "fan");
  const [name, setName] = useState(initial?.name ?? "");
  const [room, setRoom] = useState(initial?.room ?? "");
  const [srcUid, setSrcUid] = useState(initial?.source ? String(initial.source.uid) : SIM);
  const [field, setField] = useState(initial?.source?.field ?? "");
  const [sources, setSources] = useState<RelaySources>(initial?.sources ?? {});
  const [ctlUid, setCtlUid] = useState(initial?.control ? String(initial.control.uid) : "none");
  const [channel, setChannel] = useState(String(initial?.control?.channel ?? 1));
  const initialKey = JSON.stringify(initial);

  useEffect(() => {
    if (!open) return;
    const value: NewDevice | undefined = initialKey ? JSON.parse(initialKey) : undefined;
    setKind(value?.kind ?? "fan"); setName(value?.name ?? ""); setRoom(value?.room ?? "");
    setSrcUid(value?.source ? String(value.source.uid) : SIM); setField(value?.source?.field ?? "");
    setSources(value?.sources ?? {});
    setCtlUid(value?.control ? String(value.control.uid) : "none"); setChannel(String(value?.control?.channel ?? 1));
  }, [open, initialKey]);

  const isSensor = kind !== "fan" && kind !== "light";
  const isCustom = kind === "custom";
  const defaultName = kind === "fan" ? "Fan" : kind === "light" ? "Light" : isCustom ? field.trim() || "Any field" : SENSOR_META[kind].label;
  const fields = srcUid === SIM ? [] : fieldsFor(hubState.log, toUid(srcUid));
  const requiredInputs: (keyof RelaySources)[] = kind === "fan" ? ["temperature"] : kind === "light" ? ["motion", "lux"] : [];
  const canSubmit = (!isCustom || field.trim() !== "") && requiredInputs.every((key) => !sources[key] || sources[key]?.field.trim());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== null && (
        <DialogTrigger asChild>{trigger ?? <Button size="sm"><Plus /> Add device</Button>}</DialogTrigger>
      )}
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader><DialogTitle>{initial ? `Edit ${initial.name}` : "Add a device"}</DialogTitle></DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            const source = isSensor && srcUid !== SIM && field.trim() ? { uid: toUid(srcUid), field: field.trim() } : undefined;
            const relaySources = Object.fromEntries([...requiredInputs, "threshold" as const].flatMap((key) => {
              const selected = sources[key];
              return selected ? [[key, { ...selected, field: selected.field.trim() }]] : [];
            }));
            onAdd({ kind, name: name.trim() || defaultName, room: room.trim() || "Home", source, sources: isSensor ? undefined : relaySources,
              control: !isSensor && ctlUid !== "none" ? { uid: toUid(ctlUid), channel: Math.max(1, Math.round(Number(channel)) || 1) } : undefined });
            setOpen(false);
          }}
        >
          <div className="flex flex-col gap-2">
            <Label>Device type</Label>
            <Select value={kind} onValueChange={(v) => {
              const k = v as NewDevice["kind"];
              setKind(k);
              const first = hubState.devices[0];
              if (k === "custom" && srcUid === SIM && first) setSrcUid(String(first.uid));
            }} disabled={!!initial}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Relay control</SelectLabel>
                  <SelectItem value="fan">Fan</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Sensor</SelectLabel>
                  {(Object.keys(SENSOR_META) as SensorKind[]).map((k) => (
                    <SelectItem key={k} value={k}>{SENSOR_META[k].label}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dev-name">Name</Label>
            <Input id="dev-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={defaultName} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dev-room">Room</Label>
            <Input id="dev-room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. Bedroom" />
          </div>
          {!isSensor && (
            <div className="flex flex-col gap-4 border-t pt-4">
              <div className="grid grid-cols-[1fr_6rem] gap-3">
                <div className="flex min-w-0 flex-col gap-2">
                  <Label htmlFor="relay-ctl">Switch real relay on</Label>
                  <Select value={ctlUid} onValueChange={setCtlUid}>
                    <SelectTrigger id="relay-ctl" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nothing (dashboard only)</SelectItem>
                      {hubState.devices.map((d) => <SelectItem key={d.id} value={String(d.uid)}>{d.name} · {d.uid}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="relay-ch">Channel</Label>
                  <Input id="relay-ch" type="number" min={1} value={channel} disabled={ctlUid === "none"} onChange={(e) => setChannel(e.target.value)} />
                </div>
              </div>
              <h3 className="text-sm font-medium">Auto mode data</h3>
              {requiredInputs.map((key) => <DataSourcePicker key={key} id={`relay-${key}`}
                label={key === "lux" ? "Light level from" : key === "motion" ? "Motion from" : "Temperature from"}
                kind={key} source={sources[key]} devices={hubState.devices} log={hubState.log}
                onChange={(source) => setSources((previous) => {
                  const next = { ...previous };
                  if (source) next[key] = source;
                  else delete next[key];
                  return next;
                })} />)}
              <DataSourcePicker id="relay-threshold" label="Threshold from" kind="threshold" source={sources.threshold}
                fallbackLabel="Entered number" devices={hubState.devices} log={hubState.log}
                onChange={(source) => setSources((previous) => {
                  const next = { ...previous };
                  if (source) next.threshold = source;
                  else delete next.threshold;
                  return next;
                })} />
            </div>
          )}
          {isSensor && (
            <div className="flex flex-col gap-3 rounded-lg border p-3">
              <div className="flex flex-col gap-2">
                <Label>Data from</Label>
                <Select value={srcUid} onValueChange={(v) => {
                  setSrcUid(v);
                  if (v !== SIM && !isCustom) setField(guessField(kind, fieldsFor(hubState.log, toUid(v))));
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {!isCustom && <SelectItem value={SIM}>Built-in simulation</SelectItem>}
                    {hubState.devices.map((d) => (
                      <SelectItem key={d.id} value={String(d.uid)}>{d.name} · {d.uid}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {srcUid !== SIM && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="dev-field">Data field</Label>
                  <Input id="dev-field" list="dev-fields" value={field} onChange={(e) => setField(e.target.value)}
                    placeholder={isCustom ? "e.g. Light level" : "e.g. Temperature"} />
                  <datalist id="dev-fields">{fields.map((f) => <option key={f} value={f} />)}</datalist>
                  {fields.length > 0
                    ? <p className="text-xs text-muted-foreground">Reported so far: {fields.join(", ")}</p>
                    : <p className="text-xs text-muted-foreground">This device hasn't reported yet — type the field name it will send.</p>}
                </div>
              )}
              {isCustom && srcUid === SIM && <p className="text-xs text-muted-foreground">Pick a device to read this field from.</p>}
            </div>
          )}
          <DialogFooter><Button type="submit" disabled={!canSubmit || (!isSensor && !!sources.threshold && !sources.threshold.field.trim())}>{initial ? "Save" : "Add"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
