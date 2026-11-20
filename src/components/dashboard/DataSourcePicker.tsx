import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fieldsFor, type Device, type DeviceLogEntry } from "@/hooks/use-device-hub";
import { guessField, toUid, type DataSource } from "@/lib/iot";

export function DataSourcePicker({ id, label, kind, source, onChange, devices, log, fallbackLabel = "Built-in simulation" }: {
  id: string; label: string; kind: string; source: DataSource | undefined;
  onChange: (source: DataSource | undefined) => void; devices: Device[]; log: DeviceLogEntry[];
  fallbackLabel?: string;
}) {
  const fields = source ? fieldsFor(log, source.uid) : [];
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={`${id}-device`}>{label}</Label>
      <Select value={source ? String(source.uid) : "sim"} onValueChange={(value) => {
        onChange(value === "sim" ? undefined : { uid: toUid(value), field: guessField(kind, fieldsFor(log, toUid(value))) });
      }}>
        <SelectTrigger id={`${id}-device`} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="sim">{fallbackLabel}</SelectItem>
          {source && !devices.some((d) => d.uid === source.uid) && <SelectItem value={String(source.uid)}>Unavailable · {source.uid}</SelectItem>}
          {devices.map((d) => <SelectItem key={d.id} value={String(d.uid)}>{d.name} · {d.uid}</SelectItem>)}
        </SelectContent>
      </Select>
      {source && <>
        <Label htmlFor={`${id}-field`}>Data field</Label>
        <Input id={`${id}-field`} list={`${id}-fields`} value={source.field} placeholder={kind === "lux" ? "e.g. Light level" : kind === "motion" ? "e.g. Presence" : "e.g. Temperature"}
          onChange={(e) => onChange({ ...source, field: e.target.value })} />
        <datalist id={`${id}-fields`}>{fields.map((f) => <option key={f} value={f} />)}</datalist>
      </>}
    </div>
  );
}