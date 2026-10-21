"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DataGrid from "./DataGrid";
import SessionGate from "./SessionGate";
import IfsBrowser from "./IfsBrowser";
import {
  SessionGoneError,
  colIndex,
  loadInStudio,
  projectColumns,
  runSqlTable,
  useSessionGate,
  type GridData,
} from "./workbench";

// Phase E — Explorer: libraries → objects → file detail (fields, members,
// data preview), plus an IFS tab. All data comes from QSYS2 SQL services
// over the signed-in session; the engine is untouched.

type ObjRef = { lib: string; name: string; type: string; attrs: { name: string; value: string }[] };
type View = { kind: "libs" } | { kind: "objects"; lib: string } | { kind: "detail"; obj: ObjRef };
type DetailTab = "fields" | "members" | "data";

const IDENT = /^[A-Za-z0-9#@$_.]+$/;

export default function Explorer({ active, goStudio }: { active: boolean; goStudio: () => void }) {
  const gate = useSessionGate(active);
  const [tab, setTab] = useState<"libs" | "ifs">("libs");
  const [view, setView] = useState<View>({ kind: "libs" });
  const [detailTab, setDetailTab] = useState<DetailTab>("fields");
  const [typeFilter, setTypeFilter] = useState<string>("*ALL");
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [libInput, setLibInput] = useState("");
  const [libFilter, setLibFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const libsRef = useRef<Map<string, GridData>>(new Map());
  const objectsRef = useRef<Map<string, GridData>>(new Map());
  const detailRef = useRef<Map<string, GridData>>(new Map());
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);

  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof SessionGoneError) { gate.markGone(); return; }
      setError(e instanceof Error ? e.message : String(e));
    },
    [gate]
  );

  // Bounded + narrow by construction: the full catalog view over SELECT *
  // hangs the 5250 paging path on a big system (observed live 2026-10-20 —
  // PUB400 has a very large schema catalog). Two columns, a name-prefix
  // filter, and a hard row cap keep this query in the seconds range.
  const loadLibs = useCallback(async (filter: string) => {
    setLoading(true); setError("");
    try {
      const term = filter.toUpperCase().replace(/[^A-Z0-9#@$_.]/g, "");
      const where = term ? ` WHERE SCHEMA_NAME LIKE '${term}%'` : "";
      const raw = await runSqlTable(
        `SELECT SCHEMA_NAME, SCHEMA_TEXT FROM QSYS2.SYSSCHEMAS${where} ORDER BY SCHEMA_NAME FETCH FIRST 150 ROWS ONLY`
      );
      libsRef.current.set(filter, projectColumns(raw, ["SCHEMA_NAME", "SCHEMA_TEXT", "SCHEMA_OWNER"]));
    } catch (e) { fail(e); }
    setLoading(false); rerender();
  }, [fail, rerender]);

  const loadObjects = useCallback(
    async (lib: string) => {
      if (!IDENT.test(lib)) { setError(`Unexpected library name "${lib}" — refusing to query.`); return; }
      setLoading(true); setError("");
      try {
        // Narrow named columns only — wide output wraps on the 80-column
        // screen-paging path and returns unparsed (see JobsDashboard note).
        const raw = await runSqlTable(
          `SELECT OBJNAME, OBJTYPE, OBJTEXT, OBJSIZE FROM TABLE(QSYS2.OBJECT_STATISTICS('${lib}','*ALL')) X FETCH FIRST 1000 ROWS ONLY`
        );
        objectsRef.current.set(lib, raw);
      } catch (e) { fail(e); }
      setLoading(false); rerender();
    },
    [fail, rerender]
  );

  const loadDetail = useCallback(
    async (obj: ObjRef, which: DetailTab) => {
      const key = `${obj.lib}/${obj.name}/${which}`;
      if (detailRef.current.has(key)) return;
      if (!IDENT.test(obj.lib) || !IDENT.test(obj.name)) { setError("Unexpected object name — refusing to query."); return; }
      setLoading(true); setError("");
      try {
        let raw: GridData;
        if (which === "fields") {
          raw = await runSqlTable(
            `SELECT COLUMN_NAME, DATA_TYPE, LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE, IS_NULLABLE FROM QSYS2.SYSCOLUMNS WHERE SYSTEM_TABLE_SCHEMA = '${obj.lib}' AND SYSTEM_TABLE_NAME = '${obj.name}' ORDER BY ORDINAL_POSITION`
          );
          detailRef.current.set(key, raw);
        } else if (which === "members") {
          raw = await runSqlTable(
            `SELECT TABLE_PARTITION, NUMBER_ROWS, DATA_SIZE, AVG_ROW_LENGTH FROM QSYS2.SYSPARTITIONSTAT WHERE SYSTEM_TABLE_SCHEMA = '${obj.lib}' AND SYSTEM_TABLE_NAME = '${obj.name}'`
          );
          detailRef.current.set(key, raw);
        } else {
          raw = await runSqlTable(`SELECT * FROM ${obj.lib}.${obj.name} FETCH FIRST 25 ROWS ONLY`);
          detailRef.current.set(key, raw);
        }
      } catch (e) { fail(e); }
      setLoading(false); rerender();
    },
    [fail, rerender]
  );

  useEffect(() => {
    if (gate.state !== "ready" || tab !== "libs") return;
    if (view.kind === "libs" && !libsRef.current.has(libFilter)) void loadLibs(libFilter);
    if (view.kind === "objects" && !objectsRef.current.has(view.lib)) void loadObjects(view.lib);
    if (view.kind === "detail" && view.obj.type === "*FILE") void loadDetail(view.obj, detailTab);
  }, [gate.state, tab, view, detailTab, libFilter, loadLibs, loadObjects, loadDetail]);

  const libs = libsRef.current.get(libFilter) ?? null;
  const objects = view.kind === "objects" ? objectsRef.current.get(view.lib) ?? null : null;
  const objTypes = useMemo(() => {
    if (!objects) return [] as string[];
    const ti = colIndex(objects, "OBJTYPE");
    if (ti < 0) return [] as string[];
    return [...new Set(objects.rows.map((r) => (r[ti] ?? "").trim()).filter(Boolean))].sort();
  }, [objects]);
  const objectsShown = useMemo(() => {
    if (!objects || typeFilter === "*ALL") return objects;
    const ti = colIndex(objects, "OBJTYPE");
    if (ti < 0) return objects;
    return { columns: objects.columns, rows: objects.rows.filter((r) => (r[ti] ?? "").trim() === typeFilter) };
  }, [objects, typeFilter]);

  if (gate.state !== "ready") {
    return (
      <SessionGate
        kicker="// explorer — libraries, objects, source"
        title="Explorer"
        blurb="The Explorer browses libraries, objects and files through your signed-in session."
        onGoStudio={goStudio}
        onRecheck={() => void gate.recheck()}
        checking={gate.state === "checking"}
      />
    );
  }

  const openObject = (row: string[]) => {
    if (!objects || view.kind !== "objects") return;
    const ni = colIndex(objects, "OBJNAME");
    const ti = colIndex(objects, "OBJTYPE");
    const name = (row[ni >= 0 ? ni : 0] ?? "").trim();
    const type = (row[ti >= 0 ? ti : 1] ?? "").trim();
    if (!name) return;
    const attrs = objects.columns.map((c, i) => ({ name: c, value: row[i] ?? "" })).filter((a) => a.value !== "");
    setDetailTab("fields");
    setSelectedMember(null);
    setError("");
    setView({ kind: "detail", obj: { lib: view.lib, name, type, attrs } });
  };

  const detailKey = view.kind === "detail" ? `${view.obj.lib}/${view.obj.name}/${detailTab}` : "";
  const detailGrid = view.kind === "detail" ? detailRef.current.get(detailKey) ?? null : null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <p className="font-mono text-phosphor mb-2">{"// explorer — libraries, objects, source"}</p>
      <h2 className="text-3xl md:text-4xl font-bold mb-6">Explorer</h2>

      <div className="flex gap-2 mb-6">
        {(["libs", "ifs"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`font-mono text-xs px-4 py-1.5 rounded border ${tab === t ? "border-phosphor text-phosphor" : "border-line text-muted hover:text-white"}`}>
            {t === "libs" ? "Libraries" : "IFS"}
          </button>
        ))}
        <span className="font-mono text-[10px] text-muted self-center ml-2">live from QSYS2, over your session</span>
      </div>

      {tab === "ifs" && <IfsBrowser ready={gate.state === "ready"} onGone={gate.markGone} />}

      {tab === "libs" && (
        <>
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 flex-wrap mb-4 font-mono text-xs">
            <button onClick={() => { setView({ kind: "libs" }); setError(""); }} className="text-phosphor hover:underline">Libraries</button>
            {view.kind !== "libs" && (
              <>
                <span className="text-muted">›</span>
                <button onClick={() => { if (view.kind === "detail") { setView({ kind: "objects", lib: view.obj.lib }); setError(""); } }}
                  className={view.kind === "objects" ? "text-white" : "text-phosphor hover:underline"}>
                  {view.kind === "objects" ? view.lib : view.obj.lib}
                </button>
              </>
            )}
            {view.kind === "detail" && (
              <>
                <span className="text-muted">›</span>
                <span className="text-white">{view.obj.name}</span>
                <span className="px-1.5 py-0.5 rounded bg-phosphor/10 text-phosphor text-[10px]">{view.obj.type}</span>
              </>
            )}
            <span className="ml-auto flex gap-2">
              <button disabled={loading}
                onClick={() => {
                  if (view.kind === "libs") { libsRef.current.delete(libFilter); void loadLibs(libFilter); }
                  if (view.kind === "objects") { objectsRef.current.delete(view.lib); void loadObjects(view.lib); }
                  if (view.kind === "detail") { detailRef.current.delete(detailKey); void loadDetail(view.obj, detailTab); }
                }}
                className="font-mono text-xs px-3 py-1.5 rounded border border-line text-muted hover:text-white disabled:opacity-50">refresh</button>
            </span>
          </div>

          {error && (
            <div className="bg-panel border border-amber/40 rounded-lg p-4 mb-4">
              <p className="font-mono text-xs text-amber break-words">{error}</p>
              <p className="text-[11px] text-muted mt-1">That is the host's answer, verbatim.</p>
            </div>
          )}
          {loading && <p className="font-mono text-xs text-muted py-6">Querying PUB400…</p>}

          {view.kind === "libs" && (
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <input value={libInput} onChange={(e) => setLibInput(e.target.value)} spellCheck={false}
                onKeyDown={(e) => { if (e.key === "Enter") setLibFilter(libInput.trim()); }}
                placeholder="library name prefix — e.g. QIWS"
                className="bg-ink border border-line rounded px-2.5 py-1.5 font-mono text-xs text-white placeholder:text-muted focus:border-phosphor outline-none w-64" />
              <button onClick={() => setLibFilter(libInput.trim())}
                className="font-mono text-xs px-3 py-1.5 rounded border border-phosphor text-phosphor hover:bg-phosphor/10">search libraries</button>
              {libFilter && (
                <button onClick={() => { setLibInput(""); setLibFilter(""); }}
                  className="font-mono text-xs px-3 py-1.5 rounded border border-line text-muted hover:text-white">show all</button>
              )}
              <span className="font-mono text-[10px] text-muted">PUB400's catalog is large — this list shows the first ~150 libraries alphabetically; a prefix search finds any library directly.</span>
            </div>
          )}

          {!loading && view.kind === "libs" && libs && (
            <DataGrid
              table={libs}
              emptyText="No libraries match — try a shorter prefix."
              onRowClick={(row) => {
                const si = colIndex(libs, "SCHEMA_NAME");
                const lib = (row[si >= 0 ? si : 0] ?? "").trim();
                if (lib) { setTypeFilter("*ALL"); setError(""); setView({ kind: "objects", lib }); }
              }}
            />
          )}

          {!loading && view.kind === "objects" && objectsShown && (
            <>
              {objTypes.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mb-3">
                  {["*ALL", ...objTypes].map((t) => (
                    <button key={t} onClick={() => setTypeFilter(t)}
                      className={`font-mono text-[11px] px-2.5 py-1 rounded-full border ${typeFilter === t ? "border-phosphor text-phosphor" : "border-line text-muted hover:text-white"}`}>
                      {t === "*ALL" ? `All types (${objects?.rows.length ?? 0})` : `${t} (${objects?.rows.filter((r) => (r[colIndex(objects, "OBJTYPE")] ?? "").trim() === t).length})`}
                    </button>
                  ))}
                </div>
              )}
              <DataGrid table={objectsShown} onRowClick={openObject} emptyText="No objects in this library (that your profile may see)." />
              {objects && objects.rows.length >= 1000 && <p className="font-mono text-[10px] text-muted mt-3">Showing the first 1,000 objects — use the filter to narrow down.</p>}
              <p className="font-mono text-[10px] text-muted mt-3">Click an object for its details.</p>
            </>
          )}

          {!loading && view.kind === "detail" && (
            <div>
              <div className="bg-panel border border-line rounded-lg p-5 mb-5">
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2">
                  {view.obj.attrs.map((a) => (
                    <p key={a.name} className="text-[13px] flex gap-2 min-w-0">
                      <span className="font-mono text-[10px] uppercase tracking-wide text-muted shrink-0 pt-0.5 w-32 truncate">{a.name}</span>
                      <span className="text-white/90 break-words min-w-0">{a.value}</span>
                    </p>
                  ))}
                </div>
                <div className="mt-4 flex gap-2 flex-wrap">
                  <button onClick={() => { loadInStudio("cl", `DSPOBJD OBJ(${view.obj.lib}/${view.obj.name}) OBJTYPE(${view.obj.type || "*ALL"})`); goStudio(); }}
                    className="font-mono text-xs px-3 py-1.5 rounded border border-line text-muted hover:text-white">DSPOBJD in Studio</button>
                  {view.obj.type === "*FILE" && (
                    <button onClick={() => { loadInStudio("cl", `DSPFD FILE(${view.obj.lib}/${view.obj.name})`); goStudio(); }}
                      className="font-mono text-xs px-3 py-1.5 rounded border border-line text-muted hover:text-white">DSPFD in Studio</button>
                  )}
                </div>
              </div>

              {view.obj.type === "*FILE" && (
                <>
                  <div className="flex gap-2 mb-4">
                    {(["fields", "members", "data"] as const).map((t) => (
                      <button key={t} onClick={() => { setDetailTab(t); setSelectedMember(null); }}
                        className={`font-mono text-xs px-3 py-1.5 rounded border ${detailTab === t ? "border-phosphor text-phosphor" : "border-line text-muted hover:text-white"}`}>
                        {t === "fields" ? "Fields" : t === "members" ? "Members" : "Data preview"}
                      </button>
                    ))}
                  </div>
                  {detailGrid ? (
                    <>
                      <DataGrid
                        table={detailGrid}
                        emptyText={detailTab === "members" ? "No members in this file." : "Nothing to show."}
                        onRowClick={detailTab === "members" ? (row) => {
                          const mi = colIndex(detailGrid, "TABLE_PARTITION");
                          const m = (row[mi >= 0 ? mi : 0] ?? "").trim();
                          if (m) setSelectedMember(m);
                        } : undefined}
                      />
                      {detailTab === "members" && selectedMember && view.kind === "detail" && (
                        <div className="mt-3 flex items-center gap-3 flex-wrap bg-panel border border-line rounded-lg px-4 py-3">
                          <span className="font-mono text-xs text-white">Member <span className="text-phosphor">{selectedMember}</span></span>
                          <button onClick={() => { if (view.kind === "detail" && IDENT.test(selectedMember)) { loadInStudio("cl", `DSPPFM FILE(${view.obj.lib}/${view.obj.name}) MBR(${selectedMember})`); goStudio(); } }}
                            className="font-mono text-xs px-3 py-1.5 rounded border border-phosphor text-phosphor hover:bg-phosphor/10">
                            view with DSPPFM in Studio →
                          </button>
                          <span className="text-[11px] text-muted">Loads the command in SQL Studio — press Run and the member opens in the live terminal, Roll keys and all.</span>
                        </div>
                      )}
                      {detailTab === "data" && <p className="font-mono text-[10px] text-muted mt-3">First 25 rows. For the full table with sorting and export, run the SELECT in SQL Studio.</p>}
                    </>
                  ) : (
                    !loading && <p className="font-mono text-xs text-muted py-4">No data loaded for this tab yet.</p>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
