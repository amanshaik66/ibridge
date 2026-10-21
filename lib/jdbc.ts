// JT400/JDBC backend (free Java host). When JDBC_BACKEND_URL is set, lab runs
// go through the IBM i host servers (signon 8476 / database 8471 / remote
// command 8475) instead of SSH. Set after the backend is deployed.
export const JDBC_BACKEND_URL = "https://ibridge-jdbc.onrender.com";

const APP_KEY = "ibridge_demo_key_2026";

export async function runViaJdbc(
  username: string,
  password: string,
  kind: "sql" | "cl",
  command: string,
  host: string,
  port: number
): Promise<{ output: string }> {
  const r = await fetch(`${JDBC_BACKEND_URL}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": APP_KEY },
    body: JSON.stringify({ username, password, kind, command, host, port }),
    // A sleeping free-tier backend can take a minute to wake, then sign on.
    signal: AbortSignal.timeout(150_000),
  });
  const j = (await r.json()) as { ok?: boolean; output?: string; message?: string };
  if (j.ok && typeof j.output === "string") return { output: j.output };
  throw new Error(j.message || `JDBC backend error (HTTP ${r.status})`);
}

/**
 * Runs through a real 5250 (Telnet) session on the same backend: the sign-on
 * path a tn5250 emulator uses. Auth rejections are flagged (authFail) so the
 * caller never cascades them into more sign-on attempts on other doors.
 */
function parseRunResult(j: { output?: unknown; columns?: unknown; rows?: unknown }): { output: string; columns?: string[]; rows?: string[][] } {
  const out: { output: string; columns?: string[]; rows?: string[][] } = { output: String(j.output ?? "") };
  if (Array.isArray(j.columns) && Array.isArray(j.rows)) {
    out.columns = j.columns.map((c) => String(c));
    out.rows = j.rows.map((row) => (Array.isArray(row) ? row.map((c) => String(c)) : []));
  }
  return out;
}

// ---- Persistent sessions (stay signed in) ----
// The backend holds one live 5250 session per token (10-minute idle
// expiry). The token reaches the browser only as an httpOnly cookie set by
// /api/lab/session — page JS never sees it.

export async function openSession(
  username: string,
  password: string,
  host: string
): Promise<string> {
  const r = await fetch(`${JDBC_BACKEND_URL}/session/open`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": APP_KEY },
    body: JSON.stringify({ username, password, host }),
    signal: AbortSignal.timeout(200_000),
  });
  const j = (await r.json()) as { ok?: boolean; session?: string; message?: string; auth?: boolean };
  if (j.ok && typeof j.session === "string") return j.session;
  const e = new Error(j.message || `Session open failed (HTTP ${r.status})`) as Error & { authFail?: boolean };
  if (j.auth) e.authFail = true;
  throw e;
}

export async function runInSession(
  session: string,
  kind: "sql" | "cl",
  command: string
): Promise<{ output: string; columns?: string[]; rows?: string[][]; interactive?: boolean; screen?: ScreenSnapshot }> {
  const r = await fetch(`${JDBC_BACKEND_URL}/session/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": APP_KEY },
    body: JSON.stringify({ session, kind, command }),
    signal: AbortSignal.timeout(200_000),
  });
  const j = (await r.json()) as { ok?: boolean; output?: string; message?: string; error?: string; columns?: unknown; rows?: unknown; interactive?: boolean; screen?: ScreenSnapshot };
  if (j.ok && j.interactive && j.screen) return { output: "", interactive: true, screen: j.screen };
  if (j.ok && typeof j.output === "string") return parseRunResult(j);
  const e = new Error(j.message || `Session run failed (HTTP ${r.status})`) as Error & { sessionExpired?: boolean };
  if (j.error === "session_expired" || r.status === 404) e.sessionExpired = true;
  throw e;
}

export type ScreenFieldInfo = { i: number; row: number; col: number; len: number; value: string; bypass: boolean };
export type ScreenSnapshot = { rows: string[]; fields: ScreenFieldInfo[] };

async function sessionCall(path: string, session: string, extra: Record<string, unknown>): Promise<ScreenSnapshot> {
  const r = await fetch(`${JDBC_BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": APP_KEY },
    body: JSON.stringify({ session, ...extra }),
    signal: AbortSignal.timeout(120_000),
  });
  const j = (await r.json()) as { ok?: boolean; screen?: ScreenSnapshot; message?: string; error?: string };
  if (j.ok && j.screen) return j.screen;
  const e = new Error(j.message || `Session call failed (HTTP ${r.status})`) as Error & { sessionExpired?: boolean };
  if (j.error === "session_expired" || r.status === 404) e.sessionExpired = true;
  throw e;
}

export async function getScreen(session: string): Promise<ScreenSnapshot> {
  return sessionCall("/session/screen", session, {});
}

export async function sendKeys(session: string, fields: Record<number, string>, aid: string): Promise<ScreenSnapshot> {
  return sessionCall("/session/keys", session, { fields, aid });
}

export async function closeSession(session: string): Promise<void> {
  try {
    await fetch(`${JDBC_BACKEND_URL}/session/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": APP_KEY },
      body: JSON.stringify({ session }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch { /* best effort */ }
}

export async function runVia5250(
  username: string,
  password: string,
  kind: "sql" | "cl",
  command: string,
  host: string,
  port: number
): Promise<{ output: string; columns?: string[]; rows?: string[][] }> {
  const r = await fetch(`${JDBC_BACKEND_URL}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": APP_KEY },
    body: JSON.stringify({ username, password, kind, command, host, port, mode: "5250" }),
    // 5250 flow: wake the free host, connect, sign on, run, page output.
    signal: AbortSignal.timeout(200_000),
  });
  const j = (await r.json()) as { ok?: boolean; output?: string; message?: string; auth?: boolean; columns?: unknown; rows?: unknown };
  if (j.ok && typeof j.output === "string") {
    const out: { output: string; columns?: string[]; rows?: string[][] } = { output: j.output };
    if (Array.isArray(j.columns) && Array.isArray(j.rows)) {
      out.columns = j.columns.map((c) => String(c));
      out.rows = j.rows.map((row) => (Array.isArray(row) ? row.map((c) => String(c)) : []));
    }
    return out;
  }
  const e = new Error(j.message || `5250 backend error (HTTP ${r.status})`) as Error & { authFail?: boolean };
  if (j.auth) e.authFail = true;
  throw e;
}
