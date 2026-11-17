import { autoFanState, autoLightState, lightLux, nextReadings, initialReadings, type Readings, type Relay } from "./iot";

export type SensorKind =
  | "temperature" | "humidity" | "co2" | "pm25" | "lux" | "noise"
  | "pressure" | "power" | "motion" | "door" | "smoke" | "leak";

export const BOOLEAN_SENSORS: SensorKind[] = ["motion", "door", "smoke", "leak"];

type Base = { id: string; hidden: boolean };
export type RelayModule = Base & { type: "fan" | "light"; name: string; room: string; relay: Relay; threshold: number };
/** Where a sensor tile gets its value: the built-in simulation, or one field of one registered device. */
export type SensorSource = { uid: number; field: string };
export type SensorModule = Base & { type: "sensor"; kind: SensorKind; name: string; room: string; source?: SensorSource };
export type PanelModule = Base & { type: "chart" | "activity" };
export type Module = RelayModule | SensorModule | PanelModule;

export const moduleTitle = (m: Module): string =>
  m.type === "chart" ? "Climate trend" : "name" in m ? m.name : "Activity";

const sensor = (id: string, kind: SensorKind, name: string, room: string): SensorModule => ({
  id, type: "sensor", kind, name, room, hidden: false,
});

export function defaultModules(): Module[] {
  return [
    { id: "fan-1", type: "fan", name: "Ceiling Fan", room: "Living room", hidden: false, relay: { on: false, auto: true, level: 2 }, threshold: 28 },
    { id: "light-1", type: "light", name: "Main Light", room: "Living room", hidden: false, relay: { on: false, auto: false, level: 70 }, threshold: 150 },
    sensor("s-temp", "temperature", "Temperature", "Living room"),
    sensor("s-hum", "humidity", "Humidity", "Living room"),
    sensor("s-co2", "co2", "CO₂", "Living room"),
    sensor("s-pm", "pm25", "PM2.5", "Living room"),
    sensor("s-lux", "lux", "Light level", "Living room"),
    sensor("s-noise", "noise", "Noise", "Living room"),
    sensor("s-pres", "pressure", "Pressure", "Outdoor"),
    sensor("s-power", "power", "Energy", "Main meter"),
    sensor("s-motion", "motion", "Motion", "Hallway"),
    sensor("s-door", "door", "Front door", "Entrance"),
    sensor("s-smoke", "smoke", "Smoke / Gas", "Kitchen"),
    sensor("s-leak", "leak", "Water leak", "Bathroom"),
    { id: "chart", type: "chart", hidden: false },
    { id: "activity", type: "activity", hidden: false },
  ];
}

/** Small fixed per-device offset so several sensors of the same kind don't read identically. */
export function sensorOffset(id: string, kind: SensorKind): number {
  if (id.startsWith("s-")) return 0;
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  const unit = ((Math.abs(h) % 200) - 100) / 100; // -1..1
  const scale: Partial<Record<SensorKind, number>> = { temperature: 1.2, humidity: 6, co2: 80, pm25: 4, lux: 60, noise: 5, pressure: 1 };
  return +(unit * (scale[kind] ?? 0)).toFixed(1);
}

export type LogEntry = { id: number; time: string; text: string; tone: "on" | "off" | "alert" };
export type Point = { t: string; temperature: number; humidity: number };
export type SimState = { readings: Readings; flags: Record<string, boolean>; modules: Module[]; history: Point[]; log: LogEntry[] };

let logId = 0;
export const clockNow = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
export const addLog = (log: LogEntry[], text: string, tone: LogEntry["tone"]) =>
  [{ id: ++logId, time: clockNow(), text, tone }, ...log].slice(0, 30);

const flipChance: Record<string, [number, number]> = { motion: [0.18, 0.7], door: [0.05, 0.6], leak: [0.005, 0.8], smoke: [0, 0] };

export const initialSim = (): SimState => ({ readings: initialReadings, flags: {}, modules: defaultModules(), history: [], log: [] });

export function tick(s: SimState): SimState {
  const relays = (t: "fan" | "light") => s.modules.filter((m): m is RelayModule => m.type === t).map((m) => m.relay);
  const readings = nextReadings(s.readings, relays("fan"), relays("light"));
  let log = s.log;

  const flags: Record<string, boolean> = {};
  for (const m of s.modules) {
    if (m.type !== "sensor" || !BOOLEAN_SENSORS.includes(m.kind)) continue;
    const [start, stay] = flipChance[m.kind] ?? [0, 0];
    const prev = !!s.flags[m.id];
    const next = Math.random() < (prev ? stay : start);
    flags[m.id] = next;
    if (next && !prev && m.kind === "leak") log = addLog(log, `Water leak detected — ${m.room}`, "alert");
    if (next && !prev && m.kind === "door") log = addLog(log, `${m.name} opened`, "alert");
  }
  const motion = s.modules.some((m) => m.type === "sensor" && m.kind === "motion" && flags[m.id]);
  readings.motion = motion;
  const ambient = readings.lux - s.modules.reduce((a, m) => a + (m.type === "light" ? lightLux(m.relay) : 0), 0);

  const modules = s.modules.map((m) => {
    if ((m.type !== "fan" && m.type !== "light") || !m.relay.auto) return m;
    const on = m.type === "fan" ? autoFanState(m.relay.on, readings.temperature, m.threshold) : autoLightState(motion, ambient, m.threshold);
    if (on === m.relay.on) return m;
    log = addLog(
      log,
      m.type === "fan" ? `${m.name} auto ${on ? "on" : "off"} at ${readings.temperature} °C` : `${m.name} auto ${on ? "on" : "off"} (${on ? "motion in the dark" : "no motion / bright"})`,
      on ? "on" : "off",
    );
    return { ...m, relay: { ...m.relay, on } };
  });

  const history = [...s.history, { t: clockNow(), temperature: readings.temperature, humidity: readings.humidity }].slice(-40);
  return { readings, flags, modules, log, history };
}

/** Keep only well-formed saved modules; fall back to defaults when nothing usable is saved. */
export function parseSavedModules(raw: string | null): Module[] | null {
  if (!raw) return null;
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return null;
    const ok = list.filter((m) => m && typeof m.id === "string" && ["fan", "light", "sensor", "chart", "activity"].includes(m.type));
    return ok.length ? (ok as Module[]) : null;
  } catch {
    return null;
  }
}
