import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, LogIn, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hub } from "@/hooks/use-device-hub";
import { listDevices, login, logout, normalizeUrl, setConn, useServerConn } from "@/lib/server-api";

export const Route = createFileRoute("/server")({
  head: () => ({
    meta: [
      { title: "Home server — Homebase" },
      { name: "description", content: "Connect Homebase to your home server to get live device data and switch real relays." },
      { property: "og:title", content: "Home server — Homebase" },
      { property: "og:description", content: "Sign in to your home server for live telemetry and relay commands." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ServerPage,
});

function ServerPage() {
  const { conn, status } = useServerConn();
  const [url, setUrl] = useState(conn.url);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setUrl(conn.url), [conn.url]);
  const signedIn = !!conn.token;

  const sync = async () => {
    setBusy(true);
    try { const list = await listDevices(); hub.syncRemote(list.map((d) => ({ uid: d.uid, name: d.name }))); setMsg(`${list.length} devices loaded from the server.`); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-6 md:py-10">
      <div>
        <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Dashboard</Link>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">Home server</h1>
        <p className="readout mt-2 text-sm text-muted-foreground">Status: {signedIn ? `${status} · ${conn.username} (${conn.role})` : "not signed in"}</p>
      </div>
      <form className="panel flex flex-col gap-4 p-6" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setMsg("");
        try { await login(url, username, password); setPassword(""); setMsg("Signed in."); }
        catch (err) { setMsg(err instanceof TypeError ? "Can't reach the server. Check the address, that it is running, and that it allows this site (CORS)." : (err as Error).message); }
        finally { setBusy(false); }
      }}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="srv-url">Server address</Label>
          <Input id="srv-url" value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => !signedIn && setConn({ url: normalizeUrl(url) })} placeholder="http://localhost:8001" />
        </div>
        {!signedIn && <>
          <div className="flex flex-col gap-2"><Label htmlFor="srv-user">Username</Label><Input id="srv-user" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
          <div className="flex flex-col gap-2"><Label htmlFor="srv-pass">Password</Label><Input id="srv-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        </>}
        <div className="flex flex-wrap gap-2">
          {signedIn
            ? <>
                <Button type="button" onClick={sync} disabled={busy}><RefreshCw /> Reload devices</Button>
                <Button type="button" variant="outline" onClick={logout}><LogOut /> Sign out</Button>
              </>
            : <Button type="submit" disabled={busy || !url.trim() || !username || !password}><LogIn /> Sign in</Button>}
        </div>
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
        <p className="text-xs text-muted-foreground">
          Once signed in, server devices appear on the Devices page and their readings arrive live. To switch a real relay,
          edit a fan or light panel and pick the device and channel under “Switch real relay on” (needs the operator role).
        </p>
      </form>
    </main>
  );
}
