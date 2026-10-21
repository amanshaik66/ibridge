import { NextRequest, NextResponse } from "next/server";
import { SAMPLES, validateCommand, validateHost, runOnIbmi, DEFAULT_HOST } from "@/lib/ibmi";
import { JDBC_BACKEND_URL, runViaJdbc, runVia5250 } from "@/lib/jdbc";

// 10 lab runs / minute per IP — this endpoint opens real SSH sessions.
const hits = new Map<string, { count: number; reset: number }>();

function limited(ip: string): boolean {
  const t = Date.now();
  const r = hits.get(ip);
  if (!r || t > r.reset) { hits.set(ip, { count: 1, reset: t + 60_000 }); return false; }
  r.count += 1;
  return r.count > 10;
}

export async function GET() {
  // The ordered sample runbook is public; credentials are never needed for it.
  return NextResponse.json({ data: SAMPLES });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(ip))
    return NextResponse.json({ error: "rate_limited", message: "10 runs/minute exceeded." }, { status: 429 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "validation", message: "JSON body required." }, { status: 422 }); }
  const b = body as { username?: unknown; password?: unknown; kind?: unknown; command?: unknown; sampleId?: unknown; host?: unknown; port?: unknown };

  const username = typeof b.username === "string" ? b.username.trim() : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (!username || !password)
    return NextResponse.json({ error: "validation", message: "Username and password are required." }, { status: 422 });
  if (username.length > 32 || password.length > 128)
    return NextResponse.json({ error: "validation", message: "Credential length invalid." }, { status: 422 });

  const host = typeof b.host === "string" && b.host.trim() ? b.host.trim().toLowerCase() : DEFAULT_HOST;
  const hostProblem = validateHost(host);
  if (hostProblem) return NextResponse.json({ error: "validation", message: hostProblem }, { status: 422 });

  const portRaw = typeof b.port === "number" ? b.port : typeof b.port === "string" ? parseInt(b.port, 10) : NaN;
  const port = Number.isNaN(portRaw) ? 2222 : portRaw;
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    return NextResponse.json({ error: "validation", message: "Port must be between 1 and 65535." }, { status: 422 });

  let kind = b.kind === "cl" ? "cl" : "sql";
  let command = typeof b.command === "string" ? b.command : "";
  if (typeof b.sampleId === "string") {
    const s = SAMPLES.find((x) => x.id === b.sampleId);
    if (!s) return NextResponse.json({ error: "validation", message: "Unknown sampleId." }, { status: 422 });
    kind = s.kind; command = s.command;
  }
  const problem = validateCommand(kind as "sql" | "cl", command);
  if (problem) return NextResponse.json({ error: "validation", message: problem }, { status: 422 });

  // Credentials live only in this request's memory — never stored, never logged.
  if (JDBC_BACKEND_URL) {
    // First door: a real 5250 session (the sign-on path tn5250 apps use).
    // An auth rejection here is final — never cascade it into more sign-on
    // attempts on other doors (failed sign-ons count toward profile disable).
    try {
      const res5250 = await runVia5250(username, password, kind as "sql" | "cl", command, host, port);
      return NextResponse.json({
        data: {
          kind, command, host, port, via: "5250", output: res5250.output.slice(0, 20000),
          ...(res5250.columns && res5250.rows ? { columns: res5250.columns, rows: res5250.rows } : {}),
        },
      });
    } catch (e) {
      const ae = e as Error & { authFail?: boolean };
      if (ae.authFail)
        return NextResponse.json({ error: "ibmi", message: (ae.message || "Sign-on rejected.").slice(0, 300) }, { status: 502 });
    }
    try {
      const { output } = await runViaJdbc(username, password, kind as "sql" | "cl", command, host, port);
      return NextResponse.json({ data: { kind, command, host, port, via: "jdbc", output: output.slice(0, 20000) } });
    } catch (e) {
      const msg = (e as Error).message || "";
      // A real answer from IBM i (bad password, host-server error, ...) is
      // final — surface it. Only a dead/sleeping backend falls back to SSH.
      const backendDown = /fetch failed|timeout|timed out|abort|ECONN|socket|502|503|504/i.test(msg) && !/password|user|signon|CPF|disabled/i.test(msg);
      if (!backendDown)
        return NextResponse.json({ error: "ibmi", message: msg.slice(0, 300) }, { status: 502 });
    }
  }
  try {
    const { output } = await runOnIbmi(username, password, kind as "sql" | "cl", command, host, port);
    return NextResponse.json({ data: { kind, command, host, port, via: "ssh", output: output.slice(0, 20000) } });
  } catch (e) {
    return NextResponse.json({ error: "ibmi", message: (e as Error).message.slice(0, 300) }, { status: 502 });
  }
}
