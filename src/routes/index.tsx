import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Activity,
  AudioLines,
  DoorOpen,
  Droplets,
  Fan,
  Flame,
  Gauge,
  Lightbulb,
  Sun,
  Thermometer,
  Waves,
  Wind,
  Zap,
  Cloud,
  Radio,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Slider } from "@/components/ui/slider";
import { SensorTile, type Status } from "@/components/dashboard/SensorTile";
import { RelayCard } from "@/components/dashboard/RelayCard";
import { cn } from "@/lib/utils";
import {
  FAN_WATTS_PER_SPEED,
  LIGHT_MAX_WATTS,
  autoFanState,
  autoLightState,
  initialReadings,
  nextReadings,
  type Readings,
  type Relay,
} from "@/lib/iot";

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

type LogEntry = { id: number; time: string; text: string; tone: "on" | "off" | "alert" };
type Point = { t: string; temperature: number; humidity: number };

type State = {
  readings: Readings;
  fan: Relay;
  light: Relay;
  fanThreshold: number;
  luxThreshold: number;
  history: Point[];
  log: LogEntry[];
};

const initialState: State = {
  readings: initialReadings,
  fan: { on: false, auto: true, level: 2 },
  light: { on: false, auto: false, level: 70 },
  fanThreshold: 28,
  luxThreshold: 150,
  history: [],
  log: [],
};

let logId = 0;
const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const addLog = (log: LogEntry[], text: string, tone: LogEntry["tone"]) =>
  [{ id: ++logId, time: now(), text, tone }, ...log].slice(0, 30);

function tick(s: State): State {
  const readings = nextReadings(s.readings, s.fan, s.light);
  let { fan, light, log } = s;

  if (fan.auto) {
    const on = autoFanState(fan.on, readings.temperature, s.fanThreshold);
    if (on !== fan.on) {
      fan = { ...fan, on };
      log = addLog(log, `Fan auto ${on ? "on" : "off"} at ${readings.temperature} °C`, on ? "on" : "off");
    }
  }
  if (light.auto) {
    const on = autoLightState(readings.motion, readings.lux - (light.on ? (light.level / 100) * 300 : 0), s.luxThreshold);
    if (on !== light.on) {
      light = { ...light, on };
      log = addLog(log, `Light auto ${on ? "on" : "off"} (${on ? "motion in the dark" : "no motion / bright"})`, on ? "on" : "off");
    }
  }
  if (readings.leak && !s.readings.leak) log = addLog(log, "Water leak detected — Bathroom", "alert");
  if (readings.door && !s.readings.door) log = addLog(log, "Front door opened", "alert");

  const history = [...s.history, { t: now().slice(0, 5 + 3), temperature: readings.temperature, humidity: readings.humidity }].slice(-40);
  return { ...s, readings, fan, light, log, history };
}

function Dashboard() {
  const [s, setS] = useState<State>(initialState);
  const [clock, setClock] = useState("");

  useEffect(() => {
    setS((p) => ({ ...p, log: addLog(p.log, "Hub connected · 12 sensors online", "on") }));
    const id = setInterval(() => {
      setS(tick);
      setClock(now());
    }, 2000);
    setClock(now());
    return () => clearInterval(id);
  }, []);

  const r = s.readings;

  const setFan = (patch: Partial<Relay>, msg?: string) =>
    setS((p) => ({ ...p, fan: { ...p.fan, ...patch }, log: msg ? addLog(p.log, msg, patch.on === false ? "off" : "on") : p.log }));
  const setLight = (patch: Partial<Relay>, msg?: string) =>
    setS((p) => ({ ...p, light: { ...p.light, ...patch }, log: msg ? addLog(p.log, msg, patch.on === false ? "off" : "on") : p.log }));

  const tempStatus: Status = r.temperature >= 31 ? "alert" : r.temperature >= s.fanThreshold ? "warn" : "ok";
  const co2Status: Status = r.co2 >= 1200 ? "alert" : r.co2 >= 900 ? "warn" : "ok";
  const pmStatus: Status = r.pm25 >= 35 ? "alert" : r.pm25 >= 15 ? "warn" : "ok";
  const humStatus: Status = r.humidity > 70 || r.humidity < 35 ? "warn" : "ok";
  const alerts = [r.leak, r.smoke, r.door].filter(Boolean).length;

  const fanWatts = s.fan.on ? s.fan.level * FAN_WATTS_PER_SPEED : 0;
  const lightWatts = s.light.on ? (s.light.level / 100) * LIGHT_MAX_WATTS : 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="size-2 rounded-full bg-signal animate-pulse-dot" />
            <span className="readout">HUB-01 · live</span>
          </div>
          <h1 className="mt-2 text-4xl font-bold tracking-tight md:text-5xl">Homebase</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <Stat label="Local time" value={clock || "--:--:--"} />
          <Stat label="Total load" value={`${r.power} W`} />
          <Stat label="Alerts" value={String(alerts)} tone={alerts ? "alert" : "ok"} />
        </div>
      </header>

      {/* Relays */}
      <div className="grid gap-6 lg:grid-cols-2">
        <RelayCard
          title="Ceiling Fan"
          channel="Relay CH1 · Living room"
          relay={s.fan}
          watts={fanWatts}
          autoLabel={`Runs when temperature reaches ${s.fanThreshold} °C`}
          onToggle={() => setFan({ on: !s.fan.on }, `Fan switched ${s.fan.on ? "off" : "on"} manually`)}
          onAutoChange={(auto) => setFan({ auto }, `Fan auto mode ${auto ? "enabled" : "disabled"}`)}
          visual={
            <Fan
              className={cn("size-16", s.fan.on ? "animate-fan text-signal" : "text-muted-foreground")}
              style={{ ["--fan-duration" as string]: `${1.4 / s.fan.level}s` }}
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
                  onClick={() => setFan({ level: lvl })}
                  className={cn(
                    "readout rounded-lg border py-2 text-sm transition-colors",
                    s.fan.level === lvl ? "border-signal bg-signal/10 text-signal" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {["Low", "Mid", "High"][lvl - 1]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Auto threshold</span>
              <span className="readout text-muted-foreground">{s.fanThreshold} °C</span>
            </div>
            <Slider
              min={22}
              max={34}
              step={0.5}
              value={[s.fanThreshold]}
              onValueChange={([v]) => setS((p) => ({ ...p, fanThreshold: v }))}
            />
          </div>
        </RelayCard>

        <RelayCard
          title="Main Light"
          channel="Relay CH2 · Living room"
          relay={s.light}
          watts={lightWatts}
          autoLabel={`Turns on with motion when darker than ${s.luxThreshold} lx`}
          onToggle={() => setLight({ on: !s.light.on }, `Light switched ${s.light.on ? "off" : "on"} manually`)}
          onAutoChange={(auto) => setLight({ auto }, `Light auto mode ${auto ? "enabled" : "disabled"}`)}
          visual={
            <Lightbulb
              className={cn("size-16 transition-all duration-500", s.light.on ? "text-warning" : "text-muted-foreground")}
              style={
                s.light.on
                  ? { filter: `drop-shadow(0 0 ${8 + s.light.level / 4}px var(--warning))`, opacity: 0.4 + s.light.level / 170 }
                  : undefined
              }
            />
          }
        >
          <div className="flex flex-col gap-3">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Brightness</span>
              <span className="readout text-muted-foreground">{s.light.level}%</span>
            </div>
            <Slider min={5} max={100} step={5} value={[s.light.level]} onValueChange={([v]) => setLight({ level: v })} />
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Darkness threshold</span>
              <span className="readout text-muted-foreground">{s.luxThreshold} lx</span>
            </div>
            <Slider
              min={20}
              max={400}
              step={10}
              value={[s.luxThreshold]}
              onValueChange={([v]) => setS((p) => ({ ...p, luxThreshold: v }))}
            />
          </div>
        </RelayCard>
      </div>

      {/* Sensors */}
      <section className="flex flex-col gap-4">
        <SectionTitle title="Sensors" meta="12 online · refresh 2s" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          <SensorTile icon={Thermometer} label="Temperature" value={r.temperature.toFixed(1)} unit="°C" status={tempStatus} progress={(r.temperature - 18) / 18} hint="Living room" />
          <SensorTile icon={Droplets} label="Humidity" value={String(r.humidity)} unit="%" status={humStatus} progress={r.humidity / 100} hint="Comfort 40–60%" />
          <SensorTile icon={Cloud} label="CO₂" value={String(r.co2)} unit="ppm" status={co2Status} progress={r.co2 / 1600} hint={co2Status === "ok" ? "Fresh air" : "Ventilate soon"} />
          <SensorTile icon={Wind} label="PM2.5" value={String(r.pm25)} unit="µg/m³" status={pmStatus} progress={r.pm25 / 80} hint="Air quality" />
          <SensorTile icon={Sun} label="Light level" value={String(r.lux)} unit="lx" progress={r.lux / 900} hint={r.lux < s.luxThreshold ? "Dark" : "Bright"} />
          <SensorTile icon={AudioLines} label="Noise" value={String(r.noise)} unit="dB" status={r.noise > 65 ? "warn" : "ok"} progress={r.noise / 90} hint="Ambient sound" />
          <SensorTile icon={Gauge} label="Pressure" value={String(r.pressure)} unit="hPa" progress={(r.pressure - 980) / 60} hint="Barometric" />
          <SensorTile icon={Zap} label="Energy" value={String(r.power)} unit="W" status={r.power > 180 ? "warn" : "ok"} progress={r.power / 250} hint={`≈ ${((r.power * 24) / 1000).toFixed(1)} kWh / day`} />
          <SensorTile icon={Activity} label="Motion" value={r.motion ? "Detected" : "Clear"} status={r.motion ? "warn" : "ok"} hint="Hallway PIR" />
          <SensorTile icon={DoorOpen} label="Front door" value={r.door ? "Open" : "Closed"} status={r.door ? "alert" : "ok"} hint="Contact sensor" />
          <SensorTile icon={Flame} label="Smoke / Gas" value={r.smoke ? "Alarm" : "Normal"} status={r.smoke ? "alert" : "ok"} hint="Kitchen" />
          <SensorTile icon={Waves} label="Water leak" value={r.leak ? "Leak!" : "Dry"} status={r.leak ? "alert" : "ok"} hint="Bathroom floor" />
        </div>
      </section>

      {/* Chart + log */}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="panel flex flex-col gap-4 p-6 lg:col-span-2">
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

        <section className="panel flex flex-col gap-4 p-6">
          <SectionTitle title="Activity" meta={<Radio className="size-4" />} />
          <ul className="flex max-h-64 flex-col gap-3 overflow-y-auto pr-1">
            {s.log.length === 0 && <li className="text-sm text-muted-foreground">Waiting for events…</li>}
            {s.log.map((e) => (
              <li key={e.id} className="flex items-start gap-3 text-sm">
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    e.tone === "on" ? "bg-signal" : e.tone === "alert" ? "bg-destructive" : "bg-muted-foreground",
                  )}
                />
                <span className="flex-1">{e.text}</span>
                <span className="readout text-xs text-muted-foreground">{e.time}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
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

function SectionTitle({ title, meta }: { title: string; meta: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold">{title}</h2>
      <span className="readout text-xs text-muted-foreground">{meta}</span>
    </div>
  );
}
