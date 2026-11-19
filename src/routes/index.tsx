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
import { latestValue, useDeviceHub } from "@/hooks/use-device-hub";
import { SENSOR_META } from "@/components/dashboard/sensorMeta";
import { cn } from "@/lib/utils";
import { fanWatts, isNumericText, isTruthyField, lightWatts, resolveRelayInputs, type Relay, type DataSource } from "@/lib/iot";
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
  const [loaded, setLoaded] = useState(false);
  const deviceHub = useDeviceHub();
  const reports = useRef(deviceHub.log);
  useEffect(() => { reports.current = deviceHub.log; }, [deviceHub.log]);

  useEffect(() => {
    const saved = parseSavedModules(localStorage.getItem(STORAGE_KEY));
    setS((p) => ({ ...p, modules: saved ?? p.modules, log: addLog(p.log, "Hub connected", "on") }));
    setLoaded(true);
    const id = setInterval(() => {
      setS((previous) => tick(previous, reports.current));
      setClock(clockNow());
    }, 2000);
    setClock(clockNow());
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(s.modules));
  }, [s.modules, loaded]);

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const [editTarget, setEditTarget] = useState<RelayModule | SensorModule | null>(null);
  const r = s.readings;
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
        ? { id, type: d.kind, name: d.name, room: d.room, hidden: false, sources: d.sources ?? {}, threshold: d.kind === "fan" ? 28 : 150, relay: { on: false, auto: false, level: d.kind === "fan" ? 2 : 70 } }
        : { id, type: "sensor", kind: d.kind, name: d.name, room: d.room, hidden: false, ...(d.source ? { source: d.source } : {}) };
    setS((p) => ({ ...p, modules: [...p.modules, m], log: addLog(p.log, `${d.name} added · ${d.room}`, "on") }));
  };

  const saveEdit = (d: NewDevice) => {
    if (!editTarget) return;
    update(editTarget.id, (m) => {
      const next = { ...m, name: d.name, room: d.room } as Module;
      if (next.type === "sensor") {
        if (d.source) next.source = d.source;
        else delete next.source;
      }
      if (next.type === "fan" || next.type === "light") next.sources = d.sources ?? {};
      return next;
    }, [`${d.name} updated`, "on"]);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setS((p) => {
      const from = p.modules.findIndex((m) => m.id === active.id);
      const to = p.modules.findIndex((m) => m.id === over.id);
      return { ...p, modules: arrayMove(p.modules, from, to) };
    });
  };

  const sensorValue = (m: SensorModule): number | boolean | string => {
    if (m.source) {
      const v = latestValue(deviceHub.log, m.source.uid, m.source.field);
      if (v === undefined) return m.kind === "custom" ? "no data" : 0;
      return BOOLEAN_SENSORS.includes(m.kind) ? isTruthyField(v) : v;
    }
    if (m.kind === "custom") return "no source";
    if (BOOLEAN_SENSORS.includes(m.kind)) return !!s.flags[m.id];
    return (r[m.kind] as number) + sensorOffset(m.id, m.kind);
  };

  const sourceSummary = (label: string, source: DataSource | undefined) => {
    if (!source) return `${label}: simulation`;
    const device = deviceHub.devices.find((d) => d.uid === source.uid);
    const value = latestValue(deviceHub.log, source.uid, source.field);
    return `${label}: ${device?.name ?? `UID ${source.uid}`} · ${source.field} · ${value ?? "no data"}`;
  };

  const renderModule = (m: Module): ReactNode => {
    if (m.type === "sensor") {
      const meta = SENSOR_META[m.kind];
      const v = sensorValue(m);
      const ctx = { fanThreshold, luxThreshold };
      // A device may send text ("online", "no data") — show it as it is instead of formatting it as a number.
      const plain = typeof v === "string" && !isNumericText(v);
      const num = v as number | boolean;
      return (
        <SensorTile
          icon={meta.icon}
          label={m.name}
          value={plain ? v : meta.format(num)}
          unit={meta.unit}
          status={plain ? "ok" : meta.status?.(num, ctx) ?? "ok"}
          progress={typeof v === "number" ? meta.progress?.(v) : undefined}
          hint={m.source
            ? `${deviceHub.devices.find((d) => d.uid === m.source?.uid)?.name ?? `UID ${m.source.uid}`} · ${m.source.field}${latestValue(deviceHub.log, m.source.uid, m.source.field) === undefined ? " · no data" : ""}`
            : meta.hint ? `${meta.hint(num, ctx)} · ${m.room}` : m.room}
        />
      );
    }
    if (m.type === "fan") {
      const threshold = m.sources?.threshold ? resolveRelayInputs(m.sources, deviceHub.log, {}).threshold : m.threshold;
      return (
        <RelayCard
          title={m.name}
          channel={`Relay · ${m.room}`}
          relay={m.relay}
          watts={fanWatts(m.relay)}
          autoLabel={threshold === undefined ? "Waiting for threshold data · auto stays off" : `Runs when temperature reaches ${threshold} °C`}
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
          {m.sources?.threshold
            ? <p className="break-words text-sm text-muted-foreground">{sourceSummary("Threshold", m.sources.threshold)}</p>
            : <ThresholdSlider label="Auto threshold" unit="°C" min={22} max={34} step={0.5} value={m.threshold}
              onChange={(v) => update(m.id, (x) => ({ ...(x as RelayModule), threshold: v }))} />}
          <p className="break-words text-xs text-muted-foreground">{sourceSummary("Temperature", m.sources?.temperature)}</p>
        </RelayCard>
      );
    }
    if (m.type === "light") {
      const threshold = m.sources?.threshold ? resolveRelayInputs(m.sources, deviceHub.log, {}).threshold : m.threshold;
      return (
        <RelayCard
          title={m.name}
          channel={`Relay · ${m.room}`}
          relay={m.relay}
          watts={lightWatts(m.relay)}
          autoLabel={threshold === undefined ? "Waiting for threshold data · auto stays off" : `Turns on with motion when darker than ${threshold} lx`}
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
          {m.sources?.threshold
            ? <p className="break-words text-sm text-muted-foreground">{sourceSummary("Threshold", m.sources.threshold)}</p>
            : <ThresholdSlider label="Darkness threshold" unit="lx" min={20} max={400} step={10} value={m.threshold}
              onChange={(v) => update(m.id, (x) => ({ ...(x as RelayModule), threshold: v }))} />}
          <div className="flex flex-col gap-1 break-words text-xs text-muted-foreground">
            <p>{sourceSummary("Motion", m.sources?.motion)}</p>
            <p>{sourceSummary("Light level", m.sources?.lux)}</p>
          </div>
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
                onEdit={m.type === "chart" || m.type === "activity" ? undefined : () => setEditTarget(m as RelayModule | SensorModule)}
                onRemove={m.type === "chart" || m.type === "activity" ? undefined : () => remove(m)}>
                {renderModule(m)}
              </ModuleShell>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <AddDeviceDialog
        trigger={null}
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        initial={editTarget ? { kind: editTarget.type === "sensor" ? editTarget.kind : editTarget.type, name: editTarget.name, room: editTarget.room, source: editTarget.type === "sensor" ? editTarget.source : undefined, sources: editTarget.type !== "sensor" ? editTarget.sources : undefined } : undefined}
        onAdd={saveEdit}
      />
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
