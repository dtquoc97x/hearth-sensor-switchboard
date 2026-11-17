import { Activity, AudioLines, Cloud, DoorOpen, Droplets, Flame, Gauge, SlidersHorizontal, Sun, Thermometer, Waves, Wind, Zap, type LucideIcon } from "lucide-react";
import type { SensorKind } from "@/lib/modules";
import type { Status } from "./SensorTile";

type Ctx = { fanThreshold: number; luxThreshold: number };
type Meta = {
  label: string; icon: LucideIcon; unit?: string;
  format: (v: number | boolean) => string;
  status?: (v: number | boolean, c: Ctx) => Status;
  progress?: (v: number) => number;
  hint?: (v: number | boolean, c: Ctx) => string;
};
const n = (v: number | boolean) => v as number;

export const SENSOR_META: Record<SensorKind, Meta> = {
  temperature: { label: "Temperature", icon: Thermometer, unit: "°C", format: (v) => n(v).toFixed(1), status: (v, c) => (n(v) >= 31 ? "alert" : n(v) >= c.fanThreshold ? "warn" : "ok"), progress: (v) => (v - 18) / 18 },
  humidity: { label: "Humidity", icon: Droplets, unit: "%", format: (v) => String(Math.round(n(v))), status: (v) => (n(v) > 70 || n(v) < 35 ? "warn" : "ok"), progress: (v) => v / 100, hint: () => "Comfort 40–60%" },
  co2: { label: "CO₂", icon: Cloud, unit: "ppm", format: (v) => String(Math.round(n(v))), status: (v) => (n(v) >= 1200 ? "alert" : n(v) >= 900 ? "warn" : "ok"), progress: (v) => v / 1600, hint: (v) => (n(v) >= 900 ? "Ventilate soon" : "Fresh air") },
  pm25: { label: "PM2.5", icon: Wind, unit: "µg/m³", format: (v) => String(Math.round(n(v))), status: (v) => (n(v) >= 35 ? "alert" : n(v) >= 15 ? "warn" : "ok"), progress: (v) => v / 80 },
  lux: { label: "Light level", icon: Sun, unit: "lx", format: (v) => String(Math.round(n(v))), progress: (v) => v / 900, hint: (v, c) => (n(v) < c.luxThreshold ? "Dark" : "Bright") },
  noise: { label: "Noise", icon: AudioLines, unit: "dB", format: (v) => String(Math.round(n(v))), status: (v) => (n(v) > 65 ? "warn" : "ok"), progress: (v) => v / 90 },
  pressure: { label: "Pressure", icon: Gauge, unit: "hPa", format: (v) => String(Math.round(n(v))), progress: (v) => (v - 980) / 60 },
  power: { label: "Energy", icon: Zap, unit: "W", format: (v) => String(Math.round(n(v))), status: (v) => (n(v) > 180 ? "warn" : "ok"), progress: (v) => v / 250, hint: (v) => `≈ ${((n(v) * 24) / 1000).toFixed(1)} kWh / day` },
  motion: { label: "Motion", icon: Activity, format: (v) => (v ? "Detected" : "Clear"), status: (v) => (v ? "warn" : "ok") },
  door: { label: "Door", icon: DoorOpen, format: (v) => (v ? "Open" : "Closed"), status: (v) => (v ? "alert" : "ok") },
  smoke: { label: "Smoke / Gas", icon: Flame, format: (v) => (v ? "Alarm" : "Normal"), status: (v) => (v ? "alert" : "ok") },
  leak: { label: "Water leak", icon: Waves, format: (v) => (v ? "Leak!" : "Dry"), status: (v) => (v ? "alert" : "ok") },
  /** Any field a device sends that the hub has no built-in tile for: shown as-is, no unit. */
  custom: { label: "Any field", icon: SlidersHorizontal, format: (v) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : String(v)) },
};
