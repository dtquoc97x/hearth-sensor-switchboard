import { useSyncExternalStore } from "react";
import type { DeviceUid } from "@/lib/iot";

/** Connection to the user's own home server (HTTP API + live WebSocket). Saved on this device only. */
export type ServerConn = { url: string; token?: string | undefined; username?: string | undefined; role?: string | undefined };
export type LinkStatus = "off" | "connecting" | "live" | "error";

const KEY = "homebase.server.v1";
export const DEFAULT_SERVER_URL = "http://localhost:8001";
let conn: ServerConn = { url: DEFAULT_SERVER_URL };
let status: LinkStatus = "off";
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try { const raw = localStorage.getItem(KEY); if (raw) conn = JSON.parse(raw); } catch { /* ignore */ }
}
export function setConn(next: ServerConn) {
  conn = next;
  localStorage.setItem(KEY, JSON.stringify(conn));
  emit();
}
export function setLinkStatus(s: LinkStatus) { if (s !== status) { status = s; emit(); } }
export const getConn = () => { load(); return conn; };

let snap: { conn: ServerConn; status: LinkStatus } = { conn, status };
const subscribe = (l: () => void) => { load(); listeners.add(l); return () => listeners.delete(l); };
const getSnap = () => { load(); if (snap.conn !== conn || snap.status !== status) snap = { conn, status }; return snap; };
const serverSnap = { conn: { url: DEFAULT_SERVER_URL } as ServerConn, status: "off" as LinkStatus };
export const useServerConn = () => useSyncExternalStore(subscribe, getSnap, () => serverSnap);

export const normalizeUrl = (u: string) => u.trim().replace(/\/+$/, "");

async function call<T>(path: string, init: RequestInit = {}, c: ServerConn = getConn()): Promise<T> {
  if (!c.url) throw new Error("No server address set.");
  const res = await fetch(`${c.url}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(c.token ? { Authorization: `Bearer ${c.token}` } : {}), ...init.headers },
  });
  if (res.status === 401) { setConn({ url: c.url }); throw new Error("Signed out — please sign in again."); }
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(body?.detail ? String(typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail)) : `Server replied ${res.status}`);
  return body as T;
}

export async function login(url: string, username: string, password: string) {
  const base = normalizeUrl(url);
  const r = await call<{ access_token: string; role: string; username: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }, { url: base });
  setConn({ url: base, token: r.access_token, username: r.username, role: r.role });
}
export const logout = () => setConn({ url: getConn().url });

export type ServerDevice = { uid: string; name: string; status?: string; last_seen_at?: string | null };
export const listDevices = () => call<ServerDevice[]>("/api/devices");

export const registerDevice = (uid: DeviceUid, name: string) =>
  call<{ uid: string; name: string }>("/api/devices", { method: "POST", body: JSON.stringify({ uid, name }) });

export const deleteDevice = (uid: DeviceUid) =>
  call<{ uid: string; name: string }>(`/api/devices/${encodeURIComponent(String(uid))}`, { method: "DELETE" });

/** Ask the server to switch one relay channel on a device. Needs the operator role. */
export const sendRelay = (uid: DeviceUid, channel: number, state: boolean) =>
  call<{ command_id: string; status: string }>(`/api/devices/${encodeURIComponent(String(uid))}/commands`, {
    method: "POST", body: JSON.stringify({ command: "set_relay", parameters: { channel, state } }),
  });

export const sendCommand = (uid: DeviceUid, command: string, parameters?: Record<string, unknown>) =>
  call<{ command_id: string; status: string }>(`/api/devices/${encodeURIComponent(String(uid))}/commands`, {
    method: "POST", body: JSON.stringify({ command, parameters }),
  });

export const wsUrl = (c: ServerConn) => `${c.url.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(c.token ?? "")}`;
