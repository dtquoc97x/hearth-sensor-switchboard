import { useEffect, useRef } from "react";
import { hub, useDeviceHub } from "@/hooks/use-device-hub";
import { serverEventToPayload } from "@/lib/iot";
import { listDevices, setLinkStatus, useServerConn, wsUrl } from "@/lib/server-api";

/** Keeps the live feed from the home server flowing into the device log while signed in. Renders nothing. */
export function ServerLink() {
  const { conn } = useServerConn();
  const { devices } = useDeviceHub();
  const remoteKey = devices.filter((d) => d.remote).map((d) => String(d.uid)).sort().join("|");
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!conn.url || !conn.token) { setLinkStatus("off"); return; }
    listDevices().then((list) => hub.syncRemote(list.map((d) => ({ uid: d.uid, name: d.name })))).catch(() => setLinkStatus("error"));
  }, [conn.url, conn.token]);

  useEffect(() => {
    if (!conn.url || !conn.token) return;
    let stop = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    const open = () => {
      setLinkStatus("connecting");
      const sock = new WebSocket(wsUrl(conn));
      ws.current = sock;
      sock.onopen = () => {
        setLinkStatus("live");
        sock.send(JSON.stringify({ action: "subscribe", devices: remoteKey ? remoteKey.split("|") : [], entities: [] }));
        ping = setInterval(() => sock.readyState === 1 && sock.send(JSON.stringify({ action: "ping" })), 25000);
      };
      sock.onmessage = (m) => {
        try {
          const ev = JSON.parse(String(m.data));
          const kind = ev.type ?? ev.event;
          if (kind && kind !== "telemetry" && kind !== "snapshot") return;
          const p = serverEventToPayload(ev);
          if (p) hub.pushPayload(p);
        } catch { /* ignore malformed message */ }
      };
      sock.onclose = (e) => {
        clearInterval(ping);
        if (stop) return;
        setLinkStatus("error");
        if (e.code !== 1008) retry = setTimeout(open, 5000);
      };
    };
    open();
    return () => { stop = true; clearTimeout(retry); clearInterval(ping); ws.current?.close(); };
  }, [conn, remoteKey]);

  return null;
}
