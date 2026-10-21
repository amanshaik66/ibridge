"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DataGrid from "./DataGrid";
import SessionGate from "./SessionGate";
import {
  SessionGoneError,
  loadInStudio,
  runSqlTable,
  useSessionGate,
  type GridData,
} from "./workbench";

// Phase E — Spools center: your spooled files from QSYS2.OUTPUT_QUEUE_ENTRIES
// over the signed-in session. The host itself scopes the list to what your
// profile may see. View/hold/release stay one click away in the terminal.
export default function Spools({ active, goStudio }: { active: boolean; goStudio: () => void }) {
  const gate = useSessionGate(active);
  const [grid, setGrid] = useState<GridData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      // Narrow named columns only — wide output wraps on the 80-column
      // screen-paging path and returns unparsed (see JobsDashboard note).
      const raw = await runSqlTable("SELECT SPOOLED_FILE_NAME, JOB_NAME, USER_NAME, STATUS, SIZE, TOTAL_PAGES FROM QSYS2.OUTPUT_QUEUE_ENTRIES FETCH FIRST 200 ROWS ONLY");
      setGrid(raw);
      setError("");
      setUpdatedAt(new Date().toLocaleTimeString());
    } catch (e) {
      if (e instanceof SessionGoneError) { gate.markGone(); }
      else setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }, [gate]);

  useEffect(() => {
    if (gate.state === "ready" && !loadedOnce.current) {
      loadedOnce.current = true;
      void load();
    }
  }, [gate.state, load]);

  if (gate.state !== "ready") {
    return (
      <SessionGate
        kicker="// spools — spooled files center"
        title="Spools"
        blurb="The spool center lists spooled files through your signed-in session."
        onGoStudio={goStudio}
        onRecheck={() => void gate.recheck()}
        checking={gate.state === "checking"}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <p className="font-mono text-phosphor mb-2">{"// spools — spooled files center"}</p>
      <div className="flex items-end gap-4 flex-wrap mb-6">
        <h2 className="text-3xl md:text-4xl font-bold">Spools</h2>
        <span className="ml-auto flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] text-muted">{updatedAt ? `updated ${updatedAt}` : ""}{busy ? " · loading…" : ""}</span>
          <button onClick={() => void load()} disabled={busy}
            className="font-mono text-xs px-3 py-1.5 rounded border border-line text-muted hover:text-white disabled:opacity-50">refresh</button>
          <button onClick={() => { loadInStudio("cl", "WRKSPLF"); goStudio(); }}
            className="font-mono text-xs px-3 py-1.5 rounded border border-phosphor text-phosphor hover:bg-phosphor/10">WRKSPLF in Studio →</button>
        </span>
      </div>

      {error && (
        <div className="bg-panel border border-amber/40 rounded-lg p-4 mb-4">
          <p className="font-mono text-xs text-amber break-words">{error}</p>
          <p className="text-[11px] text-muted mt-1">That is the host's answer, verbatim. WRKSPLF in the terminal covers the same ground today.</p>
        </div>
      )}

      {grid ? (
        <>
          <DataGrid table={grid} emptyText="No spooled files on any output queue your profile may see." />
          <p className="font-mono text-[10px] text-muted mt-3">
            First 200 entries from QSYS2.OUTPUT_QUEUE_ENTRIES, scoped by the host to your profile's authority.
            To view, hold or release a file, load WRKSPLF in SQL Studio and press Run — option 5 displays the file in the live terminal.
          </p>
        </>
      ) : (
        !error && <p className="font-mono text-xs text-muted py-6">Reading output queues from PUB400…</p>
      )}
    </div>
  );
}
