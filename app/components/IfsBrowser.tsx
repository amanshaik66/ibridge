"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DataGrid from "./DataGrid";
import {
  SessionGoneError,
  colIndex,
  runSqlTable,
  type GridData,
} from "./workbench";

// IFS browser: directory listings from QSYS2.IFS_OBJECT_STATISTICS over the
// signed-in session. Directories are clickable; everything else is listed
// with the attributes the host returns.
export default function IfsBrowser({
  ready,
  onGone,
}: {
  ready: boolean;
  onGone: () => void;
}) {
  const [path, setPath] = useState("/");
  const [pathInput, setPathInput] = useState("/");
  const [grid, setGrid] = useState<GridData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const loadedFor = useRef<string | null>(null);

  const load = useCallback(
    async (p: string) => {
      setLoading(true);
      setError("");
      try {
        const esc = p.replace(/'/g, "''");
        // Narrow named columns only — wide output wraps on the 80-column
        // screen-paging path and returns unparsed (see JobsDashboard note).
        const raw = await runSqlTable(
          `SELECT PATH_NAME, OBJECT_TYPE, DATA_SIZE FROM TABLE(QSYS2.IFS_OBJECT_STATISTICS(START_PATH_NAME => '${esc}', SUBTREE_DIRECTORIES => 'NO')) X FETCH FIRST 500 ROWS ONLY`
        );
        setGrid(raw);
        loadedFor.current = p;
      } catch (e) {
        if (e instanceof SessionGoneError) { onGone(); return; }
        setError(e instanceof Error ? e.message : String(e));
        setGrid(null);
      }
      setLoading(false);
    },
    [onGone]
  );

  useEffect(() => {
    if (ready && loadedFor.current !== path) void load(path);
  }, [ready, path, load]);

  const segments = path.split("/").filter(Boolean);
  const crumbTo = (i: number) => "/" + segments.slice(0, i + 1).join("/");

  function openRow(row: string[]) {
    if (!grid) return;
    const pi = colIndex(grid, "PATH_NAME");
    const ti = colIndex(grid, "OBJECT_TYPE");
    if (pi < 0) return;
    const type = (row[ti] ?? "").trim().toUpperCase();
    if (type === "*DIR" || type === "DIRECTORY") {
      setPath(row[pi]);
      setPathInput(row[pi]);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <button onClick={() => { setPath("/"); setPathInput("/"); }}
          className="font-mono text-xs px-2.5 py-1.5 rounded border border-line text-muted hover:text-white">/ (root)</button>
        {segments.map((s, i) => (
          <span key={i} className="flex items-center gap-2">
            <span className="text-muted">/</span>
            <button onClick={() => { const p = crumbTo(i); setPath(p); setPathInput(p); }}
              className="font-mono text-xs text-phosphor hover:underline">{s}</button>
          </span>
        ))}
        {path !== "/" && (
          <button onClick={() => { const p = segments.length <= 1 ? "/" : crumbTo(segments.length - 2); setPath(p); setPathInput(p); }}
            className="font-mono text-xs px-2.5 py-1.5 rounded border border-line text-muted hover:text-white ml-2">↑ parent</button>
        )}
        <span className="ml-auto flex gap-2">
          <input value={pathInput} onChange={(e) => setPathInput(e.target.value)} spellCheck={false}
            onKeyDown={(e) => { if (e.key === "Enter") setPath(pathInput.trim() || "/"); }}
            placeholder="/path/to/directory"
            className="bg-ink border border-line rounded px-2.5 py-1.5 font-mono text-xs text-white placeholder:text-muted focus:border-phosphor outline-none w-64" />
          <button onClick={() => setPath(pathInput.trim() || "/")}
            className="font-mono text-xs px-3 py-1.5 rounded border border-phosphor text-phosphor hover:bg-phosphor/10">go</button>
          <button onClick={() => { loadedFor.current = null; void load(path); }} disabled={loading}
            className="font-mono text-xs px-3 py-1.5 rounded border border-line text-muted hover:text-white disabled:opacity-50">refresh</button>
        </span>
      </div>

      {error && (
        <div className="bg-panel border border-amber/40 rounded-lg p-4 mb-4">
          <p className="font-mono text-xs text-amber break-words">{error}</p>
          <p className="text-[11px] text-muted mt-1">That is the host's answer, verbatim — check the path exists and your profile may read it.</p>
        </div>
      )}
      {loading && <p className="font-mono text-xs text-muted py-6">Listing {path} on PUB400…</p>}
      {!loading && grid && (
        <DataGrid table={grid} onRowClick={openRow} emptyText="This directory is empty (or nothing here is visible to your profile)." />
      )}
      <p className="font-mono text-[10px] text-muted mt-3">Click a *DIR row to step into it. Listing capped at 500 entries per directory.</p>
    </div>
  );
}
