import { useEffect, useSyncExternalStore } from "react";
import { simulateDevicePayload, type DevicePayload } from "@/lib/iot";

export type Device = { id: string; name: string; uid: number; simulate: boolean };
export type DeviceLogEntry = DevicePayload & { id: string; time: string };
type Hub = { devices: Device[]; log: DeviceLogEntry[]; selectedUid: number | null };

const KEY = "homebase.devices.v1";
const MAX_LOG = 300;
const empty: Hub = {
  devices: [{ id: "d-1", name: "Living room node", uid: 868225062598432, simulate: true }],
  log: [],
  selectedUid: null,
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

export const latestFor = (log: DeviceLogEntry[], uid: number) => log.find((e) => e.Uid === uid);

export const hub = {
  addDevice: (name: string, uid: number) =>
    set((h) => ({ ...h, devices: [...h.devices, { id: `d-${crypto.randomUUID().slice(0, 8)}`, name, uid, simulate: true }] })),
  removeDevice: (id: string) =>
    set((h) => {
      const d = h.devices.find((x) => x.id === id);
      return { ...h, devices: h.devices.filter((x) => x.id !== id), selectedUid: d && d.uid === h.selectedUid ? null : h.selectedUid };
    }),
  toggleSimulate: (id: string) => set((h) => ({ ...h, devices: h.devices.map((d) => (d.id === id ? { ...d, simulate: !d.simulate } : d)) })),
  pushPayload: (p: DevicePayload) =>
    set((h) => ({ ...h, log: [{ ...p, id: crypto.randomUUID(), time: new Date().toLocaleTimeString([], { hour12: false }) }, ...h.log].slice(0, MAX_LOG) })),
  clearLog: () => set((h) => ({ ...h, log: [] })),
  select: (uid: number | null) => set((h) => ({ ...h, selectedUid: uid })),
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
