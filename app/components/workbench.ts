"use client";

// Shared plumbing for the Phase E workbenches (Explorer, Jobs, Spools, IFS).
// Everything here talks to the EXISTING persistent-session API only —
// POST /api/lab/session {action:"run"|"screen"} — the engine is untouched.

import { useCallback, useEffect, useRef, useState } from "react";

export type GridData = { columns: string[]; rows: string[][] };

export type RunOutcome =
  | { type: "table"; table: GridData }
  | { type: "text"; text: string }
  | { type: "interactive" };

export class SessionGoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionGoneError";
  }
}

async function postSession(payload: Record<string, unknown>): Promise<Response> {
  return fetch("/api/lab/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** True when a signed-in session cookie is alive on the backend. Bounded:
 *  a half-dead backend session can make the screen call hang, and the gate
 *  must resolve to "gone" (with a check-again button) instead of spinning. */
export async function probeSession(): Promise<boolean> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25_000);
  try {
    const r = await fetch("/api/lab/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "screen" }),
      signal: ctl.signal,
    });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Run one command inside the signed-in session. Throws SessionGoneError when the session is gone. */
export async function runSessionCmd(kind: "sql" | "cl", command: string, timeoutMs = 0): Promise<RunOutcome> {
  const ctl = timeoutMs > 0 ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  let r: Response;
  try {
    r = await fetch("/api/lab/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "run", kind, command }),
      signal: ctl?.signal,
    });
  } catch (e) {
    if (ctl && (e as Error)?.name === "AbortError")
      throw new Error(`No answer from the host within ${Math.round(timeoutMs / 1000)} seconds. The backend may be busy or the session may have died — try again, or re-check the session from SQL Studio.`);
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
  const j = (await r.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    data?: { columns?: unknown; rows?: unknown; output?: unknown; interactive?: unknown };
  };
  if (!r.ok) {
    if (j.error === "session_expired" || j.error === "no_session")
      throw new SessionGoneError(j.message || "Session expired. Sign in again.");
    throw new Error(j.message || `Run failed (HTTP ${r.status}).`);
  }
  if (j.data?.interactive) return { type: "interactive" };
  if (Array.isArray(j.data?.columns) && Array.isArray(j.data?.rows))
    return { type: "table", table: { columns: j.data.columns as string[], rows: j.data.rows as string[][] } };
  return { type: "text", text: String(j.data?.output ?? "") };
}

/** Run a SQL query that must come back as a table; host text/errors surface verbatim.
 *  Workbench queries are small by construction; the 150s bound turns a wedged
 *  backend/session into an honest error instead of an endless spinner. */
export async function runSqlTable(command: string): Promise<GridData> {
  const out = await runSessionCmd("sql", command, 150_000);
  if (out.type === "table") return out.table;
  if (out.type === "interactive") throw new Error("That query opened an interactive screen instead of returning data.");
  throw new Error(out.text.slice(0, 400) || "The host returned no table for that query.");
}

/**
 * Project a grid onto the preferred columns that actually exist (in the given
 * order). QSYS2 service column sets vary by release/PTF level, so the
 * workbenches ask for SELECT * and display what the host really returned.
 */
export function projectColumns(grid: GridData, preferred: string[]): GridData {
  const byName = new Map(grid.columns.map((c, i) => [c.toUpperCase(), i] as const));
  const picked: number[] = [];
  for (const p of preferred) {
    const i = byName.get(p.toUpperCase());
    if (i !== undefined && !picked.includes(i)) picked.push(i);
  }
  if (picked.length === 0) return grid;
  return {
    columns: picked.map((i) => grid.columns[i]),
    rows: grid.rows.map((r) => picked.map((i) => r[i] ?? "")),
  };
}

/** Index of a column by name (case-insensitive), or -1. */
export function colIndex(grid: GridData, name: string): number {
  return grid.columns.findIndex((c) => c.toUpperCase() === name.toUpperCase());
}

/** Load a command into the SQL Studio editor (the shell routes the event). */
export function loadInStudio(kind: "sql" | "cl", command: string) {
  window.dispatchEvent(new CustomEvent("ibridge:load", { detail: { kind, command } }));
}

export type GateState = "checking" | "gone" | "ready";

/**
 * Session gate for a workbench section: probes on mount and again whenever
 * the section becomes active (so signing in, then switching over, just works).
 */
export function useSessionGate(active: boolean) {
  const [state, setState] = useState<GateState>("checking");
  const wasActive = useRef(false);

  const recheck = useCallback(async () => {
    setState("checking");
    setState((await probeSession()) ? "ready" : "gone");
  }, []);

  useEffect(() => {
    if (active && !wasActive.current) {
      wasActive.current = true;
      void recheck();
    }
    if (!active) wasActive.current = false;
  }, [active, recheck]);

  const markGone = useCallback(() => setState("gone"), []);

  return { state, recheck, markGone };
}
