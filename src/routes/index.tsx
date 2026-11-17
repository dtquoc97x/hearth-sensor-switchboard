import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Cpu, Eye, Fan, LayoutGrid, Lightbulb, Radio, RotateCcw } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { SensorTile } from "@/components/dashboard/SensorTile";
import { RelayCard } from "@/components/dashboard/RelayCard";
import { ModuleShell } from "@/components/dashboard/ModuleShell";
import { AddDeviceDialog, type NewDevice } from "@/components/dashboard/AddDeviceDialog";
import { DeviceSourceDialog } from "@/components/dashboard/DeviceSourceDialog";
import { latestFor, useDeviceHub } from "@/hooks/use-device-hub";
import { SENSOR_META } from "@/components/dashboard/sensorMeta";
import { cn } from "@/lib/utils";
import { fanWatts, lightWatts, type Relay } from "@/lib/iot";
import {
  BOOLEAN_SENSORS, addLog, clockNow, defaultModules, initialSim, moduleTitle, parseSavedModules, sensorOffset, tick,
  type Module, type RelayModule, type SensorModule, type SimState,
} from "@/lib/modules";

const STORAGE_KEY = "homebase.layout.v1";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Homebase — Smart Home IoT Dashboard" },
      {
        name: "description",
        content: "Live smart home sensors and relay control for your fan and light, with automatic rules.",
      },
      { property: "og:title", content: "Homebase — Smart Home IoT Dashboard" },
      {
        property: "og:description",
        content: "Monitor temperature, air quality, motion and more, and switch your fan and light relays.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [s, setS] = useState<SimState>(initialSim);
  const [clock, setClock] = useState("");
  const [editing, setEditing] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    const saved = parseSavedModules(localStorage.getItem(STORAGE_KEY));
    loaded.current = true;
    setS((p) => ({ ...p, modules: saved ?? p.modules, log: addLog(p.log, "Hub connected", "on") }));
    const id = setInterval(() => {
      setS(tick);
      setClock(clockNow());
    }, 2000);
    setClock(clockNow());
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (loaded.current) localStorage.setItem(STORAGE_KEY, JSON.stringify(s.modules));
  }, [s.modules]);

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const deviceHub = useDeviceHub();
  const picked = deviceHub.selectedUid != null ? latestFor(deviceHub.log, deviceHub.selectedUid) : undefined;
  const r = picked ? { ...s.readings, temperature: picked.Temperature, humidity: picked.Humidity } : s.readings;
  const visible = s.modules.filter((m) => !m.hidden);
  const hidden = s.modules.filter((m) => m.hidden);
  const fanThreshold = (s.modules.find((m) => m.type === "fan") as RelayModule | undefined)?.threshold ?? 28;
  const luxThreshold = (s.modules.find((m) => m.type === "light") as RelayModule | undefined)?.threshold ?? 150;
  const alerts = s.modules.filter((m) => m.type === "sensor" && ["door", "smoke", "leak"].includes(m.kind) && s.flags[m.id]).length;
  const online = s.modules.filter((m) => m.type !== "chart" && m.type !== "activity").length;

  const update = (id: string, fn: (m: Module) => Module, msg?: [string, "on" | "off" | "alert"]) =>
    setS((p) => ({ ...p, modules: p.modules.map((m) => (m.id === id ? fn(m) : m)), log: msg ? addLog(p.log, ...msg) : p.log }));
  const setRelay = (m: RelayModule, patch: Partial<Relay>, msg?: string) =>
    update(m.id, (x) => ({ ...(x as RelayModule), relay: { ...(x as RelayModule).relay, ...patch } }), msg ? [msg, patch.on === false ? "off" : "on"] : undefined);
  const setHidden = (id: string, value: boolean) => update(id, (m) => ({ ...m, hidden: value }));
  const remove = (m: Module) => setS((p) => ({ ...p, modules: p.modules.filter((x) => x.id !== m.id), log: addLog(p.log, `${moduleTitle(m)} removed`, "off") }));

  const addDevice = (d: NewDevice) => {
    const id = `${d.kind}-${crypto.randomUUID().slice(0, 8)}`;
    const m: Module =
      d.kind === "fan" || d.kind === "light"
        ? { id, type: d.kind, name: d.name, room: d.room, hidden: false, threshold: d.kind === "fan" ? 28 : 150, relay: { on: false, auto: false, level: d.kind === "fan" ? 2 : 70 } }
        : { id, type: "sensor", kind: d.kind, name: d.name, room: d.room, hidden: false };
    setS((p) => ({ ...p, modules: [...p.modules, m], log: addLog(p.log, `${d.name} added · ${d.room}`, "on") }));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setS((p) => {
      const from = p.modules.findIndex((m) => m.id === active.id);
      const to = p.modules.findIndex((m) => m.id === over.id);
      return { ...p, modules: arrayMove(p.modules, from, to) };
    });
  };

  const sensorValue = (m: SensorModule): number | boolean => {
    if (BOOLEAN_SENSORS.includes(m.kind)) return !!s.flags[m.id];
    if (picked && (m.kind === "temperature" || m.kind === "humidity")) return r[m.kind];
    return (r[m.kind] as number) + sensorOffset(m.id, m.kind);
  };

  const renderModule = (m: Module): ReactNode => {
    if (m.type === "sensor") {
      const meta = SENSOR_META[m.kind];
      const v = sensorValue(m);
      const ctx = { fanThreshold, luxThreshold };
      return (
        <SensorTile
          icon={meta.icon}
          label={m.name}
          value={meta.format(v)}
          unit={meta.unit}
          status={meta.status?.(v, ctx) ?? "ok"}
          progress={typeof v === "number" ? meta.progress?.(v) : undefined}
          hint={meta.hint ? `${meta.hint(v, ctx)} · ${m.room}` : m.room}
        />
      );
    }
    if (m.type === "fan") {
      return (
        <RelayCard
          title={m.name}
          channel={`Relay · ${m.room}`}
          relay={m.relay}
          watts={fanWatts(m.relay)}
          autoLabel={`Runs when temperature reaches ${m.threshold} °C`}
          onToggle={() => setRelay(m, { on: !m.relay.on }, `${m.name} switched ${m.relay.on ? "off" : "on"} manually`)}
          onAutoChange={(auto) => setRelay(m, { auto }, `${m.name} auto mode ${auto ? "enabled" : "disabled"}`)}
          visual={
            <Fan
              className={cn("size-16", m.relay.on ? "animate-fan text-signal" : "text-muted-foreground")}
              style={{ ["--fan-duration" as string]: `${1.4 / m.relay.level}s` }}
            />
          }
        >
          <div className="flex flex-col gap-3">
            <span className="text-sm font-medium">Speed</span>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setRelay(m, { level: lvl })}
                  className={cn(
                    "readout rounded-lg border py-2 text-sm transition-colors",
                    m.relay.level === lvl ? "border-signal bg-signal/10 text-signal" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {["Low", "Mid", "High"][lvl - 1]}
                </button>
              ))}
            </div>
          </div>
          <ThresholdSlider label="Auto threshold" unit="°C" min={22} max={34} step={0.5} value={m.threshold}
            onChange={(v) => update(m.id, (x) => ({ ...(x as RelayModule), threshold: v }))} />
        </RelayCard>
      );
    }
    if (m.type === "light") {
      return (
        <RelayCard
          title={m.name}
          channel={`Relay · ${m.room}`}
          relay={m.relay}
          watts={lightWatts(m.relay)}
          autoLabel={`Turns on with motion when darker than ${m.threshold} lx`}
          onToggle={() => setRelay(m, { on: !m.relay.on }, `${m.name} switched ${m.relay.on ? "off" : "on"} manually`)}
          onAutoChange={(auto) => setRelay(m, { auto }, `${m.name} auto mode ${auto ? "enabled" : "disabled"}`)}
          visual={
            <Lightbulb
              className={cn("size-16 transition-all duration-500", m.relay.on ? "text-warning" : "text-muted-foreground")}
              style={m.relay.on ? { filter: `drop-shadow(0 0 ${8 + m.relay.level / 4}px var(--warning))`, opacity: 0.4 + m.relay.level / 170 } : undefined}
            />
          }
        >
          <ThresholdSlider label="Brightness" unit="%" min={5} max={100} step={5} value={m.relay.level} onChange={(v) => setRelay(m, { level: v })} />
          <ThresholdSlider label="Darkness threshold" unit="lx" min={20} max={400} step={10} value={m.threshold}
            onChange={(v) => update(m.id, (x) => ({ ...(x as RelayModule), threshold: v }))} />
        </RelayCard>
      );
    }
    if (m.type === "chart") {
      return (
        <section className="panel flex flex-col gap-4 p-6">
          <SectionTitle title="Climate trend" meta="last 80 seconds" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={s.history} margin={{ left: -20, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="gTemp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gHum" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="t" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={40} />
                <YAxis yAxisId="t" domain={["dataMin - 1", "dataMax + 1"]} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="h" orientation="right" hide domain={[20, 100]} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)" }}
                />
                <Area yAxisId="t" type="monotone" dataKey="temperature" name="Temp °C" stroke="var(--chart-1)" fill="url(#gTemp)" strokeWidth={2} isAnimationActive={false} />
                <Area yAxisId="h" type="monotone" dataKey="humidity" name="Humidity %" stroke="var(--chart-2)" fill="url(#gHum)" strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      );
    }
    return (
      <section className="panel flex flex-col gap-4 p-6">
        <SectionTitle title="Activity" meta={<Radio className="size-4" />} />
        <ul className="flex max-h-64 flex-col gap-3 overflow-y-auto pr-1">
          {s.log.length === 0 && <li className="text-sm text-muted-foreground">Waiting for events…</li>}
          {s.log.map((e) => (
            <li key={e.id} className="flex items-start gap-3 text-sm">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", e.tone === "on" ? "bg-signal" : e.tone === "alert" ? "bg-destructive" : "bg-muted-foreground")} />
              <span className="flex-1">{e.text}</span>
              <span className="readout text-xs text-muted-foreground">{e.time}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  };

  const span = (m: Module) => (m.type === "sensor" ? "col-span-1" : "col-span-2");

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="size-2 rounded-full bg-signal animate-pulse-dot" />
            <span className="readout">HUB-01 · live · {online} devices</span>
          </div>
          <h1 className="mt-2 text-4xl font-bold tracking-tight md:text-5xl">Homebase</h1>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Stat label="Local time" value={clock || "--:--:--"} />
          <Stat label="Total load" value={`${r.power} W`} />
          <Stat label="Alerts" value={String(alerts)} tone={alerts ? "alert" : "ok"} />
          <DeviceSourceDialog />
          <Button variant="outline" asChild className="h-auto self-stretch"><Link to="/devices"><Cpu /> Devices</Link></Button>
          <Button variant={editing ? "default" : "outline"} onClick={() => setEditing((e) => !e)} className="h-auto self-stretch">
            {editing ? <Check /> : <LayoutGrid />} {editing ? "Done" : "Customize"}
          </Button>
        </div>
      </header>

      {editing && (
        <div className="panel flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Drag panels by their handle, hide the ones you don't need, or add new devices.</p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setS((p) => ({ ...p, modules: defaultModules() }))}>
                <RotateCcw /> Reset layout
              </Button>
              <AddDeviceDialog onAdd={addDevice} />
            </div>
          </div>
          {hidden.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <span className="text-xs text-muted-foreground">Hidden:</span>
              {hidden.map((m) => (
                <button key={m.id} type="button" onClick={() => setHidden(m.id, false)}
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs hover:border-signal hover:text-signal">
                  <Eye className="size-3.5" /> {moduleTitle(m)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visible.map((m) => m.id)} strategy={rectSortingStrategy}>
          <div className={cn("grid grid-flow-dense items-start grid-cols-2 gap-4 md:grid-cols-4 md:gap-6", editing && "gap-y-8 md:gap-y-10 pt-2")}>
            {visible.map((m) => (
              <ModuleShell key={m.id} id={m.id} title={moduleTitle(m)} editing={editing} span={span(m)}
                onHide={() => setHidden(m.id, true)}
                onRemove={m.type === "chart" || m.type === "activity" ? undefined : () => remove(m)}>
                {renderModule(m)}
              </ModuleShell>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {visible.length === 0 && <p className="text-center text-sm text-muted-foreground">All panels are hidden. Open Customize to bring them back.</p>}
    </main>
  );
}

function ThresholdSlider({ label, unit, min, max, step, value, onChange }: {
  label: string; unit: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="readout text-muted-foreground">{value} {unit}</span>
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={([v]) => v !== undefined && onChange(v)} />
    </div>
  );
}

function Stat({ label, value, tone = "ok" }: { label: string; value: string; tone?: "ok" | "alert" }) {
  return (
    <div className="panel px-4 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("readout text-lg font-semibold", tone === "alert" && "text-destructive")}>{value}</p>
    </div>
  );
}

function SectionTitle({ title, meta }: { title: string; meta: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold">{title}</h2>
      <span className="readout text-xs text-muted-foreground">{meta}</span>
    </div>
  );
}
