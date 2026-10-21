import { NextRequest, NextResponse } from "next/server";
import { validateCommand, validateHost, DEFAULT_HOST } from "@/lib/ibmi";
import { openSession, runInSession, closeSession, getScreen, sendKeys } from "@/lib/jdbc";

// Persistent-session API. The backend session token is stored ONLY in an
// httpOnly cookie; page JS never sees it. Actions:
//   POST {action:"open", username, password, host?, port?}
//   POST {action:"run", kind, command}
//   POST {action:"close"}
const COOKIE = "ibridge_session";
const IDLE_SECONDS = 600; // matches the backend's 10-minute idle expiry

const hits = new Map<string, { count: number; reset: number }>();
function limited(ip: string): boolean {
  const t = Date.now();
  const r = hits.get(ip);
  if (!r || t > r.reset) { hits.set(ip, { count: 1, reset: t + 60_000 }); return false; }
  r.count += 1;
  return r.count > 30;
}

function clearCookie(res: NextResponse) {
  res.cookies.set(COOKIE, "", { httpOnly: true, path: "/api/lab", maxAge: 0, sameSite: "lax", secure: true });
  return res;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(ip))
    return NextResponse.json({ error: "rate_limited", message: "Too many requests. Slow down a moment." }, { status: 429 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "validation", message: "JSON body required." }, { status: 422 }); }
  const b = body as { action?: unknown; username?: unknown; password?: unknown; kind?: unknown; command?: unknown; host?: unknown };
  const action = typeof b.action === "string" ? b.action : "";

  if (action === "open") {
    const username = typeof b.username === "string" ? b.username.trim() : "";
    const password = typeof b.password === "string" ? b.password : "";
    if (!username || !password)
      return NextResponse.json({ error: "validation", message: "Username and password are required." }, { status: 422 });
    if (username.length > 32 || password.length > 128)
      return NextResponse.json({ error: "validation", message: "Credential length invalid." }, { status: 422 });
    const host = typeof b.host === "string" && b.host.trim() ? b.host.trim().toLowerCase() : DEFAULT_HOST;
    const hostProblem = validateHost(host);
    if (hostProblem) return NextResponse.json({ error: "validation", message: hostProblem }, { status: 422 });
    try {
      const token = await openSession(username, password, host);
      const res = NextResponse.json({ data: { connected: true, user: username, host } });
      res.cookies.set(COOKIE, token, {
        httpOnly: true, path: "/api/lab", maxAge: IDLE_SECONDS, sameSite: "lax", secure: true,
      });
      return res;
    } catch (e) {
      const ae = e as Error & { authFail?: boolean };
      return NextResponse.json(
        { error: "ibmi", message: (ae.message || "Sign-on failed.").slice(0, 300) },
        { status: 502 }
      );
    }
  }

  if (action === "run") {
    const token = req.cookies.get(COOKIE)?.value;
    if (!token)
      return NextResponse.json({ error: "no_session", message: "No active session. Sign in first." }, { status: 401 });
    const kind = b.kind === "cl" ? "cl" : "sql";
    const command = typeof b.command === "string" ? b.command : "";
    const problem = validateCommand(kind as "sql" | "cl", command);
    if (problem) return NextResponse.json({ error: "validation", message: problem }, { status: 422 });
    try {
      const out = await runInSession(token, kind as "sql" | "cl", command);
      const res = NextResponse.json({
        data: {
          kind, command, via: "session", output: out.output.slice(0, 20000),
          ...(out.columns && out.rows ? { columns: out.columns, rows: out.rows } : {}),
          ...(out.interactive ? { interactive: true, screen: out.screen } : {}),
        },
      });
      // Rolling expiry: each run refreshes the cookie's 10 minutes.
      res.cookies.set(COOKIE, token, {
        httpOnly: true, path: "/api/lab", maxAge: IDLE_SECONDS, sameSite: "lax", secure: true,
      });
      return res;
    } catch (e) {
      const se = e as Error & { sessionExpired?: boolean };
      if (se.sessionExpired)
        return clearCookie(NextResponse.json(
          { error: "session_expired", message: "Session expired. Sign in again." }, { status: 404 }
        ));
      return NextResponse.json(
        { error: "ibmi", message: (se.message || "Run failed.").slice(0, 300) }, { status: 502 }
      );
    }
  }

  if (action === "screen" || action === "keys") {
    const token = req.cookies.get(COOKIE)?.value;
    if (!token)
      return NextResponse.json({ error: "no_session", message: "No active session. Sign in first." }, { status: 401 });
    const bb = body as { fields?: unknown; aid?: unknown };
    try {
      const screen = action === "screen"
        ? await getScreen(token)
        : await sendKeys(
            token,
            (bb.fields && typeof bb.fields === "object" ? bb.fields : {}) as Record<number, string>,
            typeof bb.aid === "string" ? bb.aid : "ENTER"
          );
      const res = NextResponse.json({ data: { screen } });
      res.cookies.set(COOKIE, token, {
        httpOnly: true, path: "/api/lab", maxAge: IDLE_SECONDS, sameSite: "lax", secure: true,
      });
      return res;
    } catch (e) {
      const se = e as Error & { sessionExpired?: boolean };
      if (se.sessionExpired)
        return clearCookie(NextResponse.json(
          { error: "session_expired", message: "Session expired. Sign in again." }, { status: 404 }
        ));
      return NextResponse.json(
        { error: "ibmi", message: (se.message || "Terminal call failed.").slice(0, 300) }, { status: 502 }
      );
    }
  }

  if (action === "close") {
    const token = req.cookies.get(COOKIE)?.value;
    if (token) await closeSession(token);
    return clearCookie(NextResponse.json({ data: { connected: false } }));
  }

  return NextResponse.json({ error: "validation", message: "Unknown action." }, { status: 422 });
}
