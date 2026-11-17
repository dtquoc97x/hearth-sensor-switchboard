export type Readings = {
  temperature: number; // °C
  humidity: number; // %
  co2: number; // ppm
  pm25: number; // µg/m³
  lux: number; // lx
  noise: number; // dB
  pressure: number; // hPa
  power: number; // W
  motion: boolean;
  door: boolean; // true = open
  smoke: boolean;
  leak: boolean;
};

export type Relay = {
  on: boolean;
  auto: boolean;
  level: number; // fan speed 1-3, light brightness 0-100
};

export const FAN_WATTS_PER_SPEED = 18;
export const LIGHT_MAX_WATTS = 12;
export const BASE_LOAD_WATTS = 85;

export const initialReadings: Readings = {
  temperature: 27.4,
  humidity: 58,
  co2: 640,
  pm25: 12,
  lux: 220,
  noise: 38,
  pressure: 1009,
  power: 140,
  motion: false,
  door: false,
  smoke: false,
  leak: false,
};

/** Fan auto rule: turn on at/above threshold, turn off once 1 °C below it (hysteresis). */
export function autoFanState(currentlyOn: boolean, temperature: number, threshold: number): boolean {
  if (temperature >= threshold) return true;
  if (temperature < threshold - 1) return false;
  return currentlyOn;
}

/** Light auto rule: on when motion is detected and the room is darker than the lux threshold. */
export function autoLightState(motion: boolean, lux: number, luxThreshold: number): boolean {
  return motion && lux < luxThreshold;
}

export const fanWatts = (fan: Relay) => (fan.on ? fan.level * FAN_WATTS_PER_SPEED : 0);
export const lightWatts = (light: Relay) => (light.on ? (light.level / 100) * LIGHT_MAX_WATTS : 0);
/** Lux a light adds to the room when on. */
export const lightLux = (light: Relay) => (light.on ? (light.level / 100) * 300 : 0);

export function powerDraw(fans: Relay[], lights: Relay[]): number {
  return BASE_LOAD_WATTS + fans.reduce((a, f) => a + fanWatts(f), 0) + lights.reduce((a, l) => a + lightWatts(l), 0);
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const drift = (v: number, step: number) => v + (Math.random() - 0.5) * step;

export function nextReadings(prev: Readings, fans: Relay[], lights: Relay[]): Readings {
  const fanLevel = fans.reduce((a, f) => a + (f.on ? f.level : 0), 0);
  const addedLux = Math.min(600, lights.reduce((a, l) => a + lightLux(l), 0));
  const fanOn = fanLevel > 0;
  const fan = { on: fanOn, level: Math.min(fanLevel, 4) };
  const light = { on: addedLux > 0, level: (addedLux / 300) * 100 };
  const cooling = fan.on ? fan.level * 0.06 : -0.04;
  const ambientLux = clamp(drift(prev.lux - addedLux, 40), 10, 600);
  return {
    temperature: +clamp(drift(prev.temperature, 0.35) - cooling, 22, 34).toFixed(1),
    humidity: Math.round(clamp(drift(prev.humidity, 2) - (fan.on ? 0.15 : 0), 30, 85)),
    co2: Math.round(clamp(drift(prev.co2, 40) - (fan.on ? 4 : -2), 400, 1600)),
    pm25: Math.round(clamp(drift(prev.pm25, 3), 2, 80)),
    lux: Math.round(ambientLux + (light.on ? (light.level / 100) * 300 : 0)),
    noise: Math.round(clamp(drift(prev.noise, 6) + (fan.on ? 0.4 : -0.4), 28, 75)),
    pressure: Math.round(clamp(drift(prev.pressure, 1.2), 995, 1025)),
    power: Math.round(powerDraw(fans, lights) + (Math.random() - 0.5) * 6),
    motion: Math.random() < (prev.motion ? 0.7 : 0.18),
    door: Math.random() < (prev.door ? 0.6 : 0.05),
    smoke: false,
    leak: Math.random() < (prev.leak ? 0.8 : 0.005),
  };
}

/** One reading as a device sends it: a number, or any text the device chooses to report. */
export type FieldValue = number | string;

/** Payload sent by a field device. Only a Uid is required; every other field is a reading with any name.
 *  e.g. {"Uid": 868225062598433, "Light level": 3, "Humidity": 15, "Temperature": 26} */
export type DevicePayload = { Uid: number; ts?: string; values: Record<string, FieldValue> };

/** "Light level", "light_level", "LIGHTLEVEL" and "lightlevel" all name the same field. */
export const normField = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Is this text just a number in disguise? */
export const isNumericText = (s: string) => s.trim() !== "" && Number.isFinite(Number(s));

/** true / "on" / 5 count as on; false / "off" / 0 / "no" count as off. */
export function isTruthyField(v: FieldValue): boolean {
  if (typeof v === "number") return v !== 0;
  return !["", "0", "false", "no", "off", "clear", "dry", "closed", "none"].includes(v.trim().toLowerCase());
}

/** The field a device reported that best matches the name we were asked for. */
export function findFieldName(values: Record<string, FieldValue>, wanted: string): string | undefined {
  if (wanted in values) return wanted;
  const w = normField(wanted);
  if (!w) return undefined;
  const keys = Object.keys(values);
  const exact = keys.find((k) => normField(k) === w);
  if (exact !== undefined) return exact;
  const partial = keys
    .filter((k) => normField(k).includes(w))
    .sort((a, b) => normField(a).length - normField(b).length);
  return partial[0];
}

/** Value of one field from one payload, whatever that field is actually called. */
export function findFieldValue(values: Record<string, FieldValue>, wanted: string): FieldValue | undefined {
  const key = findFieldName(values, wanted);
  return key === undefined ? undefined : values[key];
}

const asNumber = (v: FieldValue | undefined) =>
  typeof v === "number" ? v : typeof v === "string" && isNumericText(v) ? Number(v) : undefined;

/** Built-in sensor name → the field names devices usually send for it. */
const FIELD_ALIASES: Record<string, string[]> = {
  temperature: ["temperature", "temp", "temp_c", "temperature_c"],
  humidity: ["humidity", "hum", "rh"],
  co2: ["co2", "carbon dioxide", "carbon_dioxide", "co2 ppm"],
  pm25: ["pm25", "pm2.5", "pm 2.5", "dust"],
  lux: ["lux", "light level", "light", "illuminance", "brightness"],
  noise: ["noise", "sound", "db"],
  pressure: ["pressure", "pres", "barometric"],
  power: ["power", "energy", "watts", "watt", "w"],
  motion: ["motion", "pir", "presence"],
  door: ["door", "door state", "contact", "door_sensor"],
  smoke: ["smoke", "gas", "smoke state"],
  leak: ["leak", "water", "moisture", "water leak"],
};

/** Best-guess field name for a built-in sensor, from the fields a device has already reported. */
export function guessField(kind: string, fields: string[]): string {
  const bag: Record<string, FieldValue> = Object.fromEntries(fields.map((f) => [f, 0 as FieldValue]));
  for (const alias of FIELD_ALIASES[kind] ?? [kind]) {
    const hit = findFieldName(bag, alias);
    if (hit !== undefined) return hit;
  }
  return fields[0] ?? "";
}

function toPayload(o: unknown): DevicePayload | null {
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const rec = o as Record<string, unknown>;
  const uidKey = Object.keys(rec).find((k) => normField(k) === "uid");
  if (!uidKey) return null;
  const rawUid = rec[uidKey];
  const uid = typeof rawUid === "string" && rawUid.trim() !== "" ? Number(rawUid) : rawUid;
  if (typeof uid !== "number" || !Number.isFinite(uid)) return null;
  const tsKey = Object.keys(rec).find((k) => normField(k) === "ts");
  const values: Record<string, FieldValue> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (k === uidKey || k === tsKey) continue;
    if (typeof v === "number") { if (Number.isFinite(v)) values[k] = v; continue; }
    if (typeof v === "boolean") { values[k] = v ? 1 : 0; continue; }
    if (typeof v === "string") { const t = v.trim(); if (t) values[k] = isNumericText(t) ? Number(t) : t; continue; }
    // null, missing or nested values: nothing to display
  }
  return { Uid: uid, ...(tsKey !== undefined && rec[tsKey] != null ? { ts: String(rec[tsKey]) } : {}), values };
}

/** Parse one payload, a JSON array, or several comma-separated objects. Invalid items are dropped. */
export function parseDevicePayloads(raw: string): DevicePayload[] {
  const text = raw.trim().replace(/,\s*$/, "");
  let data: unknown;
  try { data = JSON.parse(text); } catch {
    try { data = JSON.parse(`[${text}]`); } catch { return []; }
  }
  const list = Array.isArray(data) ? data : [data];
  return list.map(toPayload).filter((p): p is DevicePayload => p !== null);
}

/** Simulated next payload for a device, drifting from its previous reading. */
export function simulateDevicePayload(uid: number, prev?: DevicePayload): DevicePayload {
  const t = prev?.values["Temperature"] ?? 24 + Math.random() * 4;
  const h = prev?.values["Humidity"] ?? 40 + Math.random() * 20;
  return {
    Uid: uid,
    ts: new Date().toISOString(),
    values: { Temperature: +clamp(drift(t, 0.6), 15, 40).toFixed(1), Humidity: Math.round(clamp(drift(h, 3), 5, 95)) },
  };
}
