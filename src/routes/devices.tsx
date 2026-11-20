import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { hub, latestFor, useDeviceHub } from "@/hooks/use-device-hub";
import { parseDevicePayloads, toUid, type DeviceUid } from "@/lib/iot";

export const Route = createFileRoute("/devices")({
  head: () => ({
    meta: [
      { title: "Devices — Homebase" },
      { name: "description", content: "Manage your smart home devices by name and UID and watch their live data log." },
      { property: "og:title", content: "Devices — Homebase" },
      { property: "og:description", content: "Register devices by UID and see every temperature and humidity report." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DevicesPage,
});

function DevicesPage() {
  const h = useDeviceHub();
  const [name, setName] = useState("");
  const [uid, setUid] = useState("");
  const [raw, setRaw] = useState('{"Uid": 868225062598433, "Light level": 3, "Humidity": 15, "Temperature": 26},\n{"Uid": 868225062598432, "Temperature": 25, "Humidity": 15, "ts": "2026-11-17T10:00:00"}');
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<DeviceUid | "all">("all");
  const nameOf = (u: DeviceUid) => h.devices.find((d) => d.uid === u)?.name ?? "Unknown device";
  const rows = filter === "all" ? h.log : h.log.filter((e) => e.Uid === filter);

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Dashboard</Link>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">Devices</h1>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        <section className="panel flex flex-col gap-4 p-6 md:col-span-2">
          <h2 className="text-lg font-semibold">Registered devices</h2>
          <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || !uid.trim()) return setErr("Enter a name and a UID.");
            const n = toUid(uid);
            if (h.devices.some((d) => d.uid === n)) return setErr("A device with this UID already exists.");
            hub.addDevice(name.trim(), n); setName(""); setUid(""); setErr("");
          }}>
            <div className="flex flex-1 flex-col gap-2"><Label htmlFor="n">Name</Label><Input id="n" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bedroom node" /></div>
            <div className="flex flex-1 flex-col gap-2"><Label htmlFor="u">UID</Label><Input id="u" value={uid} onChange={(e) => setUid(e.target.value)} placeholder="868225062598432" /></div>
            <Button type="submit"><Plus /> Add</Button>
          </form>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <ul className="flex flex-col divide-y">
            {h.devices.length === 0 && <li className="py-3 text-sm text-muted-foreground">No devices yet.</li>}
            {h.devices.map((d) => {
              const last = latestFor(h.log, d.uid);
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-4 py-3">
                  <div className="min-w-40 flex-1">
                    <p className="font-medium">{d.name}</p>
                    <p className="readout text-xs text-muted-foreground">UID {d.uid}</p>
                  </div>
                  <p className="readout text-sm">{last ? Object.entries(last.values).map(([k, v]) => `${k} ${v}`).join(" · ") : "No data"}</p>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch checked={d.simulate} onCheckedChange={() => hub.toggleSimulate(d.id)} /> Simulate
                  </label>
                  <Button size="icon" variant="ghost" aria-label={`Remove ${d.name}`} onClick={() => hub.removeDevice(d.id)}><Trash2 /></Button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="panel flex flex-col gap-3 p-6">
          <h2 className="text-lg font-semibold">Send test data</h2>
          <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={6}
            className="readout rounded-md border bg-background p-3 text-sm" />
          <p className="text-xs text-muted-foreground">
            Any field names are accepted — only <span className="font-mono">Uid</span> is required.
            Send one item, a JSON array, or several items separated by commas.
          </p>
          <Button onClick={() => {
            const list = parseDevicePayloads(raw);
            if (!list.length) return setErr('Each item needs a numeric "Uid" plus at least one reading, e.g. {"Uid": 868225062598433, "Light level": 3}.');
            setErr(""); list.forEach(hub.pushPayload);
          }}><Send /> Send</Button>
        </section>
      </div>

      <section className="panel flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Data log</h2>
          <div className="flex items-center gap-2">
            <select value={String(filter)} onChange={(e) => setFilter(e.target.value === "all" ? "all" : toUid(e.target.value))}
              className="rounded-md border bg-background px-2 py-1.5 text-sm">
              <option value="all">All devices</option>
              {h.devices.map((d) => <option key={d.id} value={d.uid}>{d.name}</option>)}
            </select>
            <Button size="sm" variant="ghost" onClick={hub.clearLog}>Clear</Button>
          </div>
        </div>
        <div className="max-h-[28rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
              <tr><th className="py-2">Received</th><th>Device</th><th>ts</th><th>Data</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={4} className="py-3 text-muted-foreground">Waiting for data…</td></tr>}
              {rows.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="readout py-2 text-muted-foreground">{e.time}</td>
                  <td>{nameOf(e.Uid)}</td>
                  <td className="readout text-xs text-muted-foreground">{e.ts ?? "—"}</td>
                  <td className="readout text-xs">{JSON.stringify({ Uid: e.Uid, ...e.values, ...(e.ts ? { ts: e.ts } : {}) })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
