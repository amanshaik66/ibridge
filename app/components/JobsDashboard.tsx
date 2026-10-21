"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DataGrid from "./DataGrid";
import SessionGate from "./SessionGate";
import {
  SessionGoneError,
  colIndex,
  runSqlTable,
  useSessionGate,
  type GridData,
} from "./workbench";

// Phase E — Jobs dashboard: system status + active jobs from QSYS2
// services, refreshed on a timer while you watch. Same session, same
// engine — the SQL here is the runbook's own s5/s4 queries, productized.

const STATUS_CARDS: { col: string; label: string; unit?: string }[] = [
  { col: "AVERAGE_CPU_UTILIZATION", label: "Avg CPU", unit: "%" },
  { col: "ACTIVE_JOBS_IN_SYSTEM", label: "Active jobs" },
  { col: "TOTAL_JOBS_IN_SYSTEM", label: "Total jobs" },
  { col: "SYSTEM_ASP_USED", label: "System ASP used", unit: "%" },
  { col: "CURRENT_TEMPORARY_STORAGE", label: "Temp storage", unit: " MB" },
  { col: "MAIN_STORAGE_SIZE", label: "Main storage", unit: " MB" },
];

export default function JobsDashboard({ active, goStudio }: { active: boolean; goStudio: () => void }) {
  const gate = useSessionGate(active);
  const [status, setStatus] = useState<GridData | null>(null);
  const [jobs, setJobs] = useState<GridData | null>(null);
  const [jobsRaw, setJobsRaw] = useState<GridData | null>(null);
  const [auto, setAuto] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const busyRef = useRef(false);
  const loadedOnce = useRef(false);

  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      // Narrow named columns ONLY: results travel back through an 80-column
      // 5250 screen-paging path, and wide SELECT * output wraps, mangles the
      // separator line, and comes back unparsed (observed live 2026-10-20 —
      // model/serial fragment instead of a table). Every query here is sized
      // like the runbook samples that verifiably parse.
      const s = await runSqlTable("SELECT AVERAGE_CPU_UTILIZATION, ACTIVE_JOBS_IN_SYSTEM, TOTAL_JOBS_IN_SYSTEM, SYSTEM_ASP_USED, CURRENT_TEMPORARY_STORAGE, MAIN_STORAGE_SIZE FROM QSYS2.SYSTEM_STATUS_INFO");
      setStatus(s);
      const j = await runSqlTable("SELECT JOB_NAME, JOB_USER, JOB_NUMBER, JOB_STATUS, JOB_TYPE, SUBSYSTEM FROM TABLE(QSYS2.ACTIVE_JOB_INFO()) X FETCH FIRST 240 ROWS ONLY");
      setJobsRaw(j);
      setJobs(j);
      setError("");
      setUpdatedAt(new Date().toLocaleTimeString());
    } catch (e) {
      if (e instanceof SessionGoneError) { gate.markGone(); }
      else setError(e instanceof Error ? e.message : String(e));
    }
    busyRef.current = false;
    setBusy(false);
  }, [gate]);

  useEffect(() => {
    if (gate.state === "ready" && !loadedOnce.current) {
      loadedOnce.current = true;
      void refresh();
    }
  }, [gate.state, refresh]);

  useEffect(() => {
    if (!active || auto <= 0 || gate.state !== "ready") return;
    const id = setInterval(() => void refresh(), auto * 1000);
    return () => clearInterval(id);
  }, [active, auto, gate.state, refresh]);

  const cards = useMemo(() => {
    if (!status || status.rows.length === 0) return [];
    return STATUS_CARDS.flatMap((c) => {
      const i = colIndex(status, c.col);
      if (i < 0) return [];
      const v = status.rows[0][i] ?? "";
      return [{ label: c.label, value: v + (c.unit ?? "") }];
    });
  }, [status]);

  const subsystems = useMemo(() => {
    if (!jobsRaw) return [] as { name: string; count: number }[];
    const si = colIndex(jobsRaw, "SUBSYSTEM");
    if (si < 0) return [];
    const counts = new Map<string, number>();
    for (const r of jobsRaw.rows) {
      const s = (r[si] ?? "").trim();
      if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [jobsRaw]);

  if (gate.state !== "ready") {
    return (
      <SessionGate
        kicker="// jobs — live system dashboards"
        title="Jobs"
        blurb="The Jobs dashboard reads live system status and active jobs through your signed-in session."
        onGoStudio={goStudio}
        onRecheck={() => void gate.recheck()}
        checking={gate.state === "checking"}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <p className="font-mono text-phosphor mb-2">{"// jobs — live system dashboards"}</p>
      <div className="flex items-end gap-4 flex-wrap mb-6">
        <h2 className="text-3xl md:text-4xl font-bold">Jobs</h2>
        <span className="ml-auto flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] text-muted">{updatedAt ? `updated ${updatedAt}` : "not loaded yet"}{busy ? " · refreshing…" : ""}</span>
          <label className="font-mono text-[11px] text-muted flex items-center gap-1.5">
            auto-refresh
            <select value={auto} onChange={(e) => setAuto(parseInt(e.target.value, 10))}
              className="bg-ink border border-line rounded px-2 py-1.5 text-xs text-white focus:border-phosphor outline-none">
              <option value={0}>off</option>
              <option value={15}>15s</option>
              <option value={30}>30s</option>
              <option value={60}>60s</option>
            </select>
          </label>
          <button onClick={() => void refresh()} disabled={busy}
            className="font-mono text-xs px-3 py-1.5 rounded border border-phosphor text-phosphor hover:bg-phosphor/10 disabled:opacity-50">refresh now</button>
        </span>
      </div>

      {error && (
        <div className="bg-panel border border-amber/40 rounded-lg p-4 mb-4">
          <p className="font-mono text-xs text-amber break-words">{error}</p>
          <p className="text-[11px] text-muted mt-1">That is the host's answer, verbatim.</p>
        </div>
      )}

      {cards.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          {cards.map((c) => (
            <div key={c.label} className="bg-panel border border-line rounded-lg p-4">
              <p className="font-mono text-[10px] text-muted uppercase tracking-wide mb-2">{c.label}</p>
              <p className="text-xl font-semibold text-white truncate" title={c.value}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {subsystems.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-4">
          <span className="font-mono text-[10px] text-muted self-center mr-1">SUBSYSTEMS</span>
          {subsystems.map((s) => (
            <span key={s.name} className="font-mono text-[11px] px-2.5 py-1 rounded-full border border-line text-muted">
              {s.name} · <span className="text-white">{s.count}</span>
            </span>
          ))}
        </div>
      )}

      {jobs ? (
        <>
          <DataGrid table={jobs} emptyText="No active jobs returned." maxH="max-h-[560px]" />
          <p className="font-mono text-[10px] text-muted mt-3">
            First 240 active jobs from QSYS2.ACTIVE_JOB_INFO. For option-key actions on a job (hold, release, end), open it in the terminal via WRKACTJOB in SQL Studio.
          </p>
        </>
      ) : (
        !error && <p className="font-mono text-xs text-muted py-6">Reading system status and active jobs from PUB400…</p>
      )}

      {status && status.rows.length > 0 && (
        <details className="mt-6 bg-panel border border-line rounded-lg">
          <summary className="px-5 py-3 font-mono text-xs text-muted cursor-pointer hover:text-white">
            System status — the headline values ({status.columns.length})
          </summary>
          <div className="px-5 pb-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-1.5">
            {status.columns.map((c, i) => (
              <p key={c} className="text-[12px] flex gap-2 min-w-0">
                <span className="font-mono text-[10px] uppercase tracking-wide text-muted shrink-0 pt-0.5 w-44 truncate">{c}</span>
                <span className="text-white/90 break-words min-w-0">{status.rows[0][i] ?? ""}</span>
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
