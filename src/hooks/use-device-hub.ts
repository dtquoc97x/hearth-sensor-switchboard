import { useEffect, useSyncExternalStore } from "react";
import { findFieldValue, simulateDevicePayload, type DevicePayload, type DeviceUid, type FieldValue } from "@/lib/iot";

export type Device = { id: string; name: string; uid: DeviceUid; simulate: boolean; remote?: boolean };
export type DeviceLogEntry = DevicePayload & { id: string; time: string };
type Hub = { devices: Device[]; log: DeviceLogEntry[] };

const KEY = "homebase.devices.v2";
const MAX_LOG = 300;
const empty: Hub = {
  devices: [{ id: "d-1", name: "Living room node", uid: 868225062598432, simulate: true }],
  log: [],
};
let state: Hub = empty;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...empty, ...JSON.parse(raw) };
  } catch { /* ignore */ }
}
function set(fn: (h: Hub) => Hub) {
  state = fn(state);
  localStorage.setItem(KEY, JSON.stringify(state));
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { load(); listeners.add(l); return () => listeners.delete(l); };

/** Every reading field a device has reported so far. */
export const fieldsFor = (log: DeviceLogEntry[], uid: DeviceUid) =>
  [...new Set(log.filter((e) => e.Uid === uid).flatMap((e) => Object.keys(e.values)))];
/** Latest value of one field from one device, whatever the field is actually called in the payload. */
export const latestValue = (log: DeviceLogEntry[], uid: DeviceUid, field: string): FieldValue | undefined => {
  for (const e of log) {
    if (e.Uid !== uid) continue;
    const v = findFieldValue(e.values, field);
    if (v !== undefined) return v;
  }
  return undefined;
};
export const latestFor = (log: DeviceLogEntry[], uid: DeviceUid) => log.find((e) => e.Uid === uid);

export const hub = {
  addDevice: (name: string, uid: DeviceUid) =>
    set((h) => ({ ...h, devices: [...h.devices, { id: `d-${crypto.randomUUID().slice(0, 8)}`, name, uid, simulate: true }] })),
  removeDevice: (id: string) =>
    set((h) => {
      return { ...h, devices: h.devices.filter((x) => x.id !== id) };
    }),
  toggleSimulate: (id: string) => set((h) => ({ ...h, devices: h.devices.map((d) => (d.id === id ? { ...d, simulate: !d.simulate } : d)) })),
  pushPayload: (p: DevicePayload) =>
    set((h) => ({ ...h, log: [{ ...p, id: crypto.randomUUID(), time: new Date().toLocaleTimeString([], { hour12: false }) }, ...h.log].slice(0, MAX_LOG) })),
  /** Add or rename devices registered on the home server; their data comes from the server, not simulation. */
  syncRemote: (list: { uid: DeviceUid; name: string }[]) =>
    set((h) => {
      const devices = [...h.devices];
      for (const r of list) {
        const i = devices.findIndex((d) => d.uid === r.uid);
        if (i >= 0) devices[i] = { ...devices[i]!, name: r.name, remote: true, simulate: false };
        else devices.push({ id: `d-${crypto.randomUUID().slice(0, 8)}`, name: r.name, uid: r.uid, simulate: false, remote: true });
      }
      return { ...h, devices };
    }),
  clearLog: () => set((h) => ({ ...h, log: [] })),
};

let timer: ReturnType<typeof setInterval> | null = null;
let users = 0;

/** Shared device store (saved on this device) with a simulated feed for devices that have simulation on. */
export function useDeviceHub(): Hub {
  const h = useSyncExternalStore(subscribe, () => state, () => empty);
  useEffect(() => {
    load();
    users++;
    if (!timer) {
      timer = setInterval(() => {
        state.devices.filter((d) => d.simulate).forEach((d) => hub.pushPayload(simulateDevicePayload(d.uid, latestFor(state.log, d.uid))));
      }, 3000);
    }
    return () => { users--; if (!users && timer) { clearInterval(timer); timer = null; } };
  }, []);
  return h;
}
