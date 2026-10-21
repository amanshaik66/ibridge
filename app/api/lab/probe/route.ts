import { NextRequest, NextResponse } from "next/server";
import net from "node:net";
import { Client } from "ssh2";
import { guard } from "@/lib/auth";
import { validateHost, DEFAULT_HOST } from "@/lib/ibmi";

// Temporary diagnostics (API-key protected): can Vercel reach a given
// host:port at all, what banner answers, and which SSH auth methods does
// the host offer? Uses a deliberately fake account — never a real login.

function tcpProbe(host: string, port: number): Promise<unknown> {
  return new Promise((resolve) => {
    const started = Date.now();
    const sock = new net.Socket();
    let banner = "";
    let done = false;
    const finish = (data: unknown) => { if (!done) { done = true; sock.destroy(); resolve(data); } };
    sock.setTimeout(9000);
    sock.on("connect", () => {
      // Give servers that speak first (SSH, 5250, host servers) a moment.
      setTimeout(() => finish({ port, connected: true, ms: Date.now() - started, banner: banner.slice(0, 120) }), 2500);
    });
    sock.on("data", (d) => { banner += d.toString("latin1"); });
    sock.on("timeout", () => finish({ port, connected: false, ms: Date.now() - started, error: "timeout" }));
    sock.on("error", (e: NodeJS.ErrnoException) => finish({ port, connected: false, ms: Date.now() - started, error: e.code || e.message }));
    sock.on("close", () => { if (banner) finish({ port, connected: true, ms: Date.now() - started, banner: banner.slice(0, 120), closedEarly: true }); });
    sock.connect(port, host);
  });
}

function sshProbe(host: string, port: number): Promise<unknown> {
  return new Promise((resolve) => {
    const logs: string[] = [];
    const conn = new Client();
    const timer = setTimeout(() => { conn.end(); resolve({ ssh: true, result: "timeout", logs: logs.slice(0, 60) }); }, 30000);
    conn
      .on("keyboard-interactive", (_n, _i, _l, prompts, finishCb) => {
        logs.push(`KI prompts: ${JSON.stringify(prompts.map((p) => p.prompt))}`);
        finishCb(["probeinvalid1"]);
      })
      .on("banner", (m) => logs.push(`banner: ${m.slice(0, 120)}`))
      .on("ready", () => { clearTimeout(timer); conn.end(); resolve({ ssh: true, result: "READY (unexpected for fake user)", logs: logs.slice(0, 60) }); })
      .on("error", (e: Error & { level?: string }) => {
        clearTimeout(timer);
        resolve({ ssh: true, result: `${e.message} · level: ${e.level ?? "?"}`, logs: logs.slice(0, 60) });
      })
      .connect({
        host, port,
        username: "probeinvalid",
        password: "probeinvalid1",
        tryKeyboard: true,
        readyTimeout: 20000,
        debug: (m: string) => { if (/auth|keyboard|password|method/i.test(m)) logs.push(m.slice(0, 200)); },
      });
  });
}

export async function GET(req: NextRequest) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const host = DEFAULT_HOST; // diagnostics are PUB400-only by design
  const problem = validateHost(host);
  if (problem) return NextResponse.json({ error: "validation", message: problem }, { status: 422 });
  if (req.nextUrl.searchParams.get("ssh") === "1") {
    const port = parseInt(req.nextUrl.searchParams.get("port") || "2222", 10);
    return NextResponse.json({ data: await sshProbe(host, port) });
  }
  const ALLOWED_PORTS = new Set([23, 2222, 448, 449, 8470, 8471, 8472, 8473, 8474, 8475, 8476]);
  const ports = (req.nextUrl.searchParams.get("ports") || "2222")
    .split(",").map((p) => parseInt(p, 10)).filter((p) => ALLOWED_PORTS.has(p)).slice(0, 8);
  const results = [];
  for (const p of ports) results.push(await tcpProbe(host, p));
  return NextResponse.json({ data: { host, results } });
}
