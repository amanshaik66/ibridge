import { Client } from "ssh2";

export const DEFAULT_HOST = "pub400.com";
export const PUB400_PORT = 2222;

// Host validation. The cloud endpoint additionally refuses private/loopback
// targets so it can't be abused as an SSH proxy (SSRF guard).
export function validateHost(host: unknown, allowPrivate = false): string | null {
  const h = typeof host === "string" ? host.trim().toLowerCase() : "";
  if (!h) return "Host is empty.";
  if (h.length > 253) return "Host too long.";
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(h)) return "Invalid host format.";
  if (!allowPrivate && /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[?::1\]?$)/.test(h))
    return "Private/local hosts are not allowed on the shared runner.";
  return null;
}

export type Sample = { id: string; kind: "sql" | "cl"; label: string; command: string; note: string };

// Ordered sample runbook: SQL first, then CL — click to load, then Run.
export const SAMPLES: Sample[] = [
  { id: "s1", kind: "sql", label: "Server clock", command: "VALUES CURRENT TIMESTAMP", note: "Simplest possible query — proves the SQL path works." },
  { id: "s2", kind: "sql", label: "Sample customers", command: "SELECT * FROM QIWS.QCUSTCDT FETCH FIRST 5 ROWS ONLY", note: "The classic IBM sample customer table." },
  { id: "s3", kind: "sql", label: "Table catalog", command: "SELECT SYSTEM_TABLE_NAME, TABLE_TEXT FROM QSYS2.SYSTABLES WHERE SYSTEM_TABLE_SCHEMA = 'QIWS' FETCH FIRST 10 ROWS ONLY", note: "Query the Db2 catalog — the modern way to inspect files." },
  { id: "s4", kind: "sql", label: "Active jobs (SQL service)", command: "SELECT JOB_NAME, JOB_USER, JOB_NUMBER, JOB_STATUS FROM TABLE(QSYS2.ACTIVE_JOB_INFO()) X FETCH FIRST 5 ROWS ONLY", note: "IBM i Services: WRKACTJOB as a SQL table function." },
  { id: "s5", kind: "sql", label: "System status (SQL service)", command: "SELECT * FROM QSYS2.SYSTEM_STATUS_INFO", note: "IBM i Services: WRKSYSSTS numbers as one SQL row." },
  { id: "s6", kind: "sql", label: "Library list (SQL service)", command: "SELECT * FROM QSYS2.LIBRARY_LIST_INFO", note: "IBM i Services: your library list as a table." },
  { id: "c1", kind: "cl", label: "System values", command: "DSPSYSVAL SYSVAL(QDATE QTIME QDAY)", note: "Display date/time system values." },
  { id: "c2", kind: "cl", label: "Library list", command: "DSPLIBL", note: "Your job's library list." },
  { id: "c3", kind: "cl", label: "Job attributes", command: "DSPJOB", note: "Attributes of the server job running your command." },
  { id: "c4", kind: "cl", label: "System status (summary)", command: "WRKSYSSTS OUTPUT(*NONE)", note: "System status — OUTPUT(*NONE) keeps it batch-safe." },
  { id: "c5", kind: "cl", label: "Network attributes", command: "DSPNETA", note: "System network attributes — system name, node, network ID." },
];

// Read-only guardrails for the shared endpoint: SQL is SELECT-family only,
// CL custom commands go through a denylist. This endpoint is a convenience
// runner for YOUR pub400 account — it is not a sandbox.
const SQL_ALLOW = /^\s*(select|values|with|explain)\b/i;
const CL_DENY = /\b(chgusrprf|dltusrprf|chgpwd|pwr*dwnsys|strsst|inztap|dltlib|rmvlib|clrlib|dltf|edtf|strsrvjob|chgjob|endjob|sndmsg\s+qsysopr)\b/i;

export function validateCommand(kind: "sql" | "cl", command: string): string | null {
  const cmd = command.trim();
  if (!cmd) return "Command is empty.";
  if (cmd.length > 2000) return "Command too long (2000 chars max).";
  if (kind === "sql" && !SQL_ALLOW.test(cmd))
    return "SQL is limited to read-only statements (SELECT / VALUES / WITH / EXPLAIN).";
  if (kind === "cl" && CL_DENY.test(cmd))
    return "That CL command is blocked on the shared runner.";
  return null;
}

function toSystemCommand(kind: "sql" | "cl", command: string): string {
  if (kind === "sql") {
    const escaped = command.replace(/'/g, "''");
    return `system "RUNSQL SQL('${escaped}') COMMIT(*NONE)"`;
  }
  const escaped = command.replace(/"/g, "'");
  return `system "${escaped}"`;
}

function attemptOnIbmi(username: string, password: string, kind: "sql" | "cl", command: string, host: string, port: number): Promise<{ output: string }> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let out = "";
    let errOut = "";
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error(`Timed out while waiting for handshake from ${host}:${port}`));
    }, 30_000);

    conn
      .on("keyboard-interactive", (_name, _instructions, _lang, _prompts, finish) => {
        // IBM i sshd typically offers keyboard-interactive first (PUB400 does);
        // answer every prompt with the same password, like a terminal would.
        finish([password]);
      })
      .on("banner", (message) => { out += message; })
      .on("ready", () => {
        conn.exec(toSystemCommand(kind, command), (err, stream) => {
          if (err) { clearTimeout(timer); conn.end(); reject(err); return; }
          stream
            .on("data", (d: Buffer) => { out += d.toString(); })
            .stderr.on("data", (d: Buffer) => { errOut += d.toString(); })
            .on("close", (code: number) => {
              clearTimeout(timer);
              conn.end();
              const text = (out + (errOut ? `\n[stderr]\n${errOut}` : "")).trim();
              resolve({ output: text || `(command completed with exit code ${code}, no output)` });
            });
        });
      })
      .on("error", (e) => {
        clearTimeout(timer);
        // Surface the REAL error from the SSH layer / IBM i host — no generic
        // masking, so the user sees exactly what the host answered.
        const err = e as Error & { level?: string; code?: string };
        const parts = [err.message || String(e)];
        if (err.level) parts.push(`level: ${err.level}`);
        if (err.code) parts.push(`code: ${err.code}`);
        reject(new Error(`SSH error from ${host}:${port} — ${parts.join(" · ").slice(0, 300)}`));
      })
      .connect({
        host,
        port,
        username,
        password,
        tryKeyboard: true,
        readyTimeout: 20_000,
        // Host key is not pinned.
      });
  });
}

const RETRYABLE = /connection lost|timed out|handshake|econnreset|econnrefused|socket/i;

export async function runOnIbmi(username: string, password: string, kind: "sql" | "cl", command: string, host = DEFAULT_HOST, port = PUB400_PORT): Promise<{ output: string }> {
  // PUB400 intermittently drops cloud connections BEFORE the SSH handshake —
  // no password has been sent at that point, so reconnecting is safe and does
  // not count against the profile. Authentication failures are NEVER retried
  // (repeated bad passwords can disable an IBM i profile).
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await attemptOnIbmi(username, password, kind, command, host, port);
    } catch (e) {
      lastError = e as Error;
      const msg = lastError.message || "";
      if (/authentication/i.test(msg) || !RETRYABLE.test(msg) || attempt === 4) break;
      await new Promise((r) => setTimeout(r, attempt * 3000));
    }
  }
  throw lastError ?? new Error("Run failed.");
}
