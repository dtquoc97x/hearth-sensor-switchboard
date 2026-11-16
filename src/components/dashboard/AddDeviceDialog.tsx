import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SENSOR_META } from "./sensorMeta";
import type { SensorKind } from "@/lib/modules";

export type NewDevice = { kind: "fan" | "light" | SensorKind; name: string; room: string };

export function AddDeviceDialog({ onAdd }: { onAdd: (d: NewDevice) => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<NewDevice["kind"]>("fan");
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const defaultName = kind === "fan" ? "Fan" : kind === "light" ? "Light" : SENSOR_META[kind].label;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus /> Add device</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add a device</DialogTitle></DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onAdd({ kind, name: name.trim() || defaultName, room: room.trim() || "Home" });
            setName(""); setRoom(""); setOpen(false);
          }}
        >
          <div className="flex flex-col gap-2">
            <Label>Device type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as NewDevice["kind"])}>
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
          <DialogFooter><Button type="submit">Add</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
