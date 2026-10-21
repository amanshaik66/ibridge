"use client";

import { useEffect, useState } from "react";
import Terminal from "./Terminal";

type Sample = { id: string; kind: "sql" | "cl"; label: string; command: string; note: string };

export default function LabTool() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [host, setHost] = useState("pub400.com");
  const [port, setPort] = useState("2222");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [kind, setKind] = useState<"sql" | "cl">("sql");
  const [command, setCommand] = useState("");
  const [output, setOutput] = useState("— output appears here —");
  const [table, setTable] = useState<{ columns: string[]; rows: string[][] } | null>(null);
  const [sessionUser, setSessionUser] = useState<string | null>(null);
  const [connBusy, setConnBusy] = useState(false);
  const [showTerm, setShowTerm] = useState(false);
  const [termSeed, setTermSeed] = useState(0);
  // Step 2 (SQL workbench): sort/filter/export + saved queries + history with outputs
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [filterText, setFilterText] = useState("");
  const [saved, setSaved] = useState<{ name: string; kind: "sql" | "cl"; command: string }[]>([]);
  const [richHistory, setRichHistory] = useState<{ kind: "sql" | "cl"; command: string; output?: string; table?: { columns: string[]; rows: string[][] } }[]>([]);

  useEffect(() => {
    try {
      const s = localStorage.getItem("ibridge_saved");
      if (s) setSaved(JSON.parse(s));
      const h = localStorage.getItem("ibridge_history");
      if (h) setRichHistory(JSON.parse(h));
    } catch { /* fresh start */ }
  }, []);

  function persistSaved(next: typeof saved) {
    setSaved(next);
    try { localStorage.setItem("ibridge_saved", JSON.stringify(next)); } catch { /* quota */ }
  }
  function persistHistory(next: typeof richHistory) {
    setRichHistory(next);
    try { localStorage.setItem("ibridge_history", JSON.stringify(next.slice(0, 8))); } catch { /* quota */ }
  }
  function download(name: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function tableCsv(): string {
    if (!table) return "";
    const esc = (c: string) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
    return [table.columns.map(esc).join(","), ...displayRows.map((r) => r.map(esc).join(","))].join("\n");
  }
  const displayRows = (() => {
    if (!table) return [];
    let rows = table.rows;
    const q = filterText.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.some((c) => c.toLowerCase().includes(q)));
    if (sortCol != null) {
      const ci = sortCol;
      rows = [...rows].sort((a, b) => {
        const x = a[ci] ?? "", y = b[ci] ?? "";
        const nx = parseFloat(x), ny = parseFloat(y);
        const cmp = !Number.isNaN(nx) && !Number.isNaN(ny) ? nx - ny : x.localeCompare(y);
        return cmp * sortDir;
      });
    }
    return rows;
  })();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/lab/run").then((r) => r.json()).then((j) => {
      setSamples(j.data ?? []);
      const first = (j.data ?? [])[0];
      if (first) { setKind(first.kind); setCommand(first.command); }
    }).catch(() => {});
  }, []);

  function pick(s: Sample) {
    setKind(s.kind);
    setCommand(s.command);
    setMsg("");
  }

  // Phase A shell integration (additive — no run/session logic changes):
  // the app shell's command palette and dashboard dispatch window events to
  // load a command into the editor, open the terminal, or end the session.
  useEffect(() => {
    const onLoad = (e: Event) => {
      const d = (e as CustomEvent).detail as { kind?: "sql" | "cl"; command?: string } | undefined;
      if (d?.command) {
        setKind(d.kind ?? "sql");
        setCommand(d.command);
        setMsg("");
      }
    };
    const onTerm = () => {
      if (sessionUser) setShowTerm(true);
      else setMsg("Sign in first — the terminal needs your session.");
    };
    const onOut = () => { void signOut(); };
    window.addEventListener("ibridge:load", onLoad);
    window.addEventListener("ibridge:open-terminal", onTerm);
    window.addEventListener("ibridge:signout", onOut);
    return () => {
      window.removeEventListener("ibridge:load", onLoad);
      window.removeEventListener("ibridge:open-terminal", onTerm);
      window.removeEventListener("ibridge:signout", onOut);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUser]);

  async function signIn() {
    setMsg("");
    if (!username.trim() || !password) { setMsg("Enter your PUB400 username and password first."); return; }
    setConnBusy(true);
    try {
      const r = await fetch("/api/lab/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "open", username: username.trim(), password, host: host.trim() || "pub400.com", port: parseInt(port, 10) || 2222 }),
      });
      const j = await r.json();
      if (!r.ok) {
        setMsg(j.message || "Sign-in failed.");
      } else {
        setSessionUser(username.trim().toUpperCase());
        setMsg("Signed in — this session stays open for ~10 idle minutes, and runs below reuse it (no sign-on per command).");
      }
    } catch (e) {
      setMsg(`Sign-in request failed: ${String(e).slice(0, 120)}`);
    }
    setConnBusy(false);
  }

  async function signOut() {
    setConnBusy(true);
    try {
      await fetch("/api/lab/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close" }),
      });
    } catch { /* best effort */ }
    setSessionUser(null);
    setShowTerm(false);
    setMsg("Signed out — session closed on the IBM i.");
    setConnBusy(false);
  }

  async function run() {
    setMsg("");
    if (!sessionUser && (!username.trim() || !password)) { setMsg("Enter your PUB400 username and password first."); return; }
    if (!command.trim()) { setMsg("Enter a command first."); return; }
    setBusy(true);
    setTable(null);
    setSortCol(null);
    setFilterText("");
    setOutput(sessionUser ? "… running in your signed-in session …" : `… iBridge signing on to ${host.trim() || "pub400.com"} over a 5250 session …`);
    try {
      const r = sessionUser
        ? await fetch("/api/lab/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "run", kind, command }),
          })
        : await fetch("/api/lab/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: username.trim(), password, kind, command, host: host.trim() || "pub400.com", port: parseInt(port, 10) || 2222 }),
          });
      const j = await r.json();
      if (!r.ok) {
        if (j.error === "session_expired" || j.error === "no_session") setSessionUser(null);
        setOutput(`// error: ${j.message || "run failed"}`);
      } else if (j.data.interactive) {
        // The command opened an interactive display: hand the live screen to
        // the terminal instead of flattening it into text.
        setShowTerm(true);
        setTermSeed((s) => s + 1);
        setOutput("// that command opened an interactive screen — it's live in the terminal below ↓");
        persistHistory([{ kind, command, output: "(interactive screen — opened in terminal)" }, ...richHistory.filter((x) => x.command !== command)].slice(0, 8));
        setTimeout(() => document.getElementById("ibridge-terminal")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
      } else if (Array.isArray(j.data.columns) && Array.isArray(j.data.rows)) {
        const tbl = { columns: j.data.columns as string[], rows: j.data.rows as string[][] };
        setTable(tbl);
        setOutput("");
        const entry = tbl.rows.length <= 300
          ? { kind, command, table: tbl }
          : { kind, command, output: `${tbl.rows.length} records (too large to keep in history)` };
        persistHistory([entry, ...richHistory.filter((x) => x.command !== command)].slice(0, 8));
      } else {
        setOutput(j.data.output);
        persistHistory([{ kind, command, output: String(j.data.output).slice(0, 4000) }, ...richHistory.filter((x) => x.command !== command)].slice(0, 8));
      }
    } catch (e) {
      setOutput(`// request failed: ${String(e).slice(0, 160)}`);
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <p className="font-mono text-phosphor mb-2">{"// live ibm i — pub400.com"}</p>
      <h1 className="text-4xl md:text-5xl font-bold mb-4 text-phosphor">IBM i Command Lab</h1>
      <p className="text-muted max-w-3xl mb-8">
        Run <span className="text-white font-semibold">real SQL and CL commands</span> on a live IBM i,
        straight from your browser. Bring your own free{" "}
        <a href="https://www.pub400.com" target="_blank" rel="noreferrer" className="text-phosphor hover:underline">PUB400</a>{" "}
        account — everything runs right here through iBridge, nothing to install. Credentials are used for one session only, never stored, never logged. Use a PUB400-only password.
      </p>

      <div className="grid md:grid-cols-5 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-panel border border-line rounded-lg p-6">
            <h2 className="font-mono text-sm text-muted mb-4">{"// 1. your ibm i login"}</h2>
            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <label className="block font-mono text-xs text-muted mb-1">host</label>
                <input value={host} onChange={(e) => setHost(e.target.value)} spellCheck={false} autoComplete="off"
                  placeholder="pub400.com"
                  className="w-full bg-ink border border-line rounded px-3 py-2 font-mono text-sm focus:border-phosphor outline-none text-phosphor" />
              </div>
              <div className="w-24">
                <label className="block font-mono text-xs text-muted mb-1">port</label>
                <input value={port} onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ""))} spellCheck={false} autoComplete="off"
                  placeholder="2222" inputMode="numeric"
                  className="w-full bg-ink border border-line rounded px-3 py-2 font-mono text-sm focus:border-phosphor outline-none text-phosphor" />
              </div>
            </div>
            <label className="block font-mono text-xs text-muted mb-1">username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} spellCheck={false} autoComplete="off"
              placeholder="e.g. AMANxx"
              className="w-full bg-ink border border-line rounded px-3 py-2 font-mono text-sm mb-3 focus:border-phosphor outline-none text-phosphor" />
            <label className="block font-mono text-xs text-muted mb-1">password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off"
              className="w-full bg-ink border border-line rounded px-3 py-2 font-mono text-sm focus:border-phosphor outline-none text-phosphor" />
            <p className="mt-3 text-xs text-muted">No IBM i account? PUB400 is free at pub400.com.</p>
            <div className="mt-4 pt-4 border-t border-line">
              {sessionUser ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center gap-2 text-sm text-white">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
                    Signed in as <span className="font-mono">{sessionUser}</span>
                  </span>
                  <button onClick={() => setShowTerm((s) => !s)}
                    className="font-mono text-xs px-3 py-1.5 rounded border border-phosphor text-phosphor hover:bg-phosphor/10">
                    {showTerm ? "hide terminal" : "open terminal"}
                  </button>
                  <button onClick={signOut} disabled={connBusy}
                    className="font-mono text-xs px-3 py-1.5 rounded border border-line text-muted hover:text-white disabled:opacity-50">
                    disconnect
                  </button>
                  <span className="text-xs text-muted">Runs reuse this session (~10 idle minutes).</span>
                </div>
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={signIn} disabled={connBusy}
                    className="font-mono text-xs px-3 py-1.5 rounded border border-phosphor text-phosphor hover:bg-phosphor/10 disabled:opacity-50">
                    {connBusy ? "signing in…" : "stay signed in"}
                  </button>
                  <span className="text-xs text-muted">Optional: sign in once, then every run reuses the same session — no sign-on per command.</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-panel border border-line rounded-lg p-6">
            <h2 className="font-mono text-sm text-muted mb-4">{"// 2. pick a sample (in order)"}</h2>
            <div className="space-y-2">
              {samples.map((s, i) => (
                <button key={s.id} onClick={() => pick(s)}
                  className={`block w-full text-left px-3 py-2 rounded border font-mono text-xs ${command === s.command ? "border-phosphor text-phosphor" : "border-line text-muted hover:text-white"}`}>
                  <span className="text-phosphor font-bold mr-2">{i + 1}.</span>
                  <span className={`mr-2 px-1.5 py-0.5 rounded text-[10px] ${s.kind === "sql" ? "bg-phosphor/10 text-phosphor" : "bg-amber/10 text-amber"}`}>{s.kind.toUpperCase()}</span>
                  {s.label}
                  <span className="block text-[10px] text-muted mt-0.5 ml-6">{s.note}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="md:col-span-3 space-y-6">
          <div className="bg-panel border border-line rounded-lg p-6">
            <h2 className="font-mono text-sm text-muted mb-4">{"// 3. run it"}</h2>
            <div className="flex gap-2 mb-3">
              {(["sql", "cl"] as const).map((k) => (
                <button key={k} onClick={() => setKind(k)}
                  className={`font-mono text-xs px-4 py-1.5 rounded border ${kind === k ? "border-phosphor text-phosphor" : "border-line text-muted"}`}>
                  {k.toUpperCase()}
                </button>
              ))}
              <span className="font-mono text-[10px] text-muted self-center ml-2">
                {kind === "sql" ? "read-only: SELECT / VALUES / WITH" : "custom CL passes a safety denylist"}
              </span>
            </div>
            <textarea value={command} onChange={(e) => setCommand(e.target.value)} rows={4} spellCheck={false}
              className="w-full bg-ink border border-line rounded px-3 py-2 font-mono text-sm mb-4 focus:border-phosphor outline-none text-phosphor" />
            <button onClick={run} disabled={busy}
              className="bg-phosphor text-ink font-mono font-bold px-8 py-2 rounded hover:opacity-90 disabled:opacity-50">
              {busy ? "running on pub400…" : "▶ run on ibm i"}
            </button>
            {msg && <p className="mt-3 font-mono text-sm text-amber">{msg}</p>}
            {richHistory.length > 0 && (
              <div className="mt-4">
                <p className="font-mono text-[10px] text-muted mb-2">{"// recent runs — click to reload command + its output"}</p>
                <div className="flex flex-wrap gap-2">
                  {richHistory.map((h, i) => (
                    <button key={i} onClick={() => {
                        setKind(h.kind); setCommand(h.command);
                        setSortCol(null); setFilterText("");
                        if (h.table) { setTable(h.table); setOutput(""); }
                        else { setTable(null); setOutput(h.output ?? ""); }
                      }}
                      className="font-mono text-[10px] px-2 py-1 rounded border border-line text-muted hover:text-white max-w-full truncate">
                      {h.kind.toUpperCase()} · {h.command.slice(0, 42)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <p className="font-mono text-[10px] text-muted">{"// saved queries"}</p>
                <button onClick={() => {
                    if (!command.trim()) { setMsg("Nothing to save yet — enter a command first."); return; }
                    const name = window.prompt("Name this query:", command.slice(0, 40));
                    if (!name) return;
                    persistSaved([{ name, kind, command }, ...saved.filter((s) => s.name !== name)]);
                  }}
                  className="font-mono text-[10px] px-2 py-0.5 rounded border border-line text-muted hover:text-white">
                  + save current
                </button>
              </div>
              {saved.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {saved.map((s, i) => (
                    <span key={i} className="inline-flex items-center gap-1 font-mono text-[10px] px-2 py-1 rounded border border-phosphor/40 text-phosphor">
                      <button onClick={() => { setKind(s.kind); setCommand(s.command); }} className="max-w-[180px] truncate">{s.name}</button>
                      <button aria-label="delete saved query" onClick={() => persistSaved(saved.filter((x) => x.name !== s.name))} className="text-muted hover:text-white">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl overflow-hidden border border-line bg-panel shadow-lg">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-line bg-white/[0.02]">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-sm font-medium text-white">{host.trim() || "pub400.com"}</span>
              <span className="text-xs text-muted">result</span>
              {table && <span className="ml-auto text-xs text-muted">{table.rows.length} record(s)</span>}
            </div>
            {table ? (
              <div>
                <div className="flex items-center gap-2 px-4 py-2 border-b border-line flex-wrap">
                  <input value={filterText} onChange={(e) => setFilterText(e.target.value)} placeholder="filter rows…"
                    className="bg-ink border border-line rounded px-2.5 py-1 text-xs text-white placeholder:text-muted focus:border-phosphor outline-none w-44" />
                  <span className="text-[11px] text-muted">{displayRows.length} of {table.rows.length} rows · click a column to sort</span>
                  <span className="ml-auto flex gap-1.5">
                    <button onClick={() => download("ibridge-result.csv", tableCsv(), "text/csv")}
                      className="font-mono text-[11px] px-2 py-1 rounded border border-line text-muted hover:text-white">CSV</button>
                    <button onClick={() => download("ibridge-result.json", JSON.stringify(displayRows.map((r) => Object.fromEntries(table.columns.map((c, i) => [c, r[i]]))), null, 2), "application/json")}
                      className="font-mono text-[11px] px-2 py-1 rounded border border-line text-muted hover:text-white">JSON</button>
                    <button onClick={() => { void navigator.clipboard?.writeText(tableCsv()).catch(() => {}); }}
                      className="font-mono text-[11px] px-2 py-1 rounded border border-line text-muted hover:text-white">copy</button>
                  </span>
                </div>
                <div className="max-h-[520px] overflow-auto min-h-[200px]">
                  <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0">
                      <tr className="bg-white/[0.04]">
                        {table.columns.map((c, i) => (
                          <th key={i} onClick={() => { if (sortCol === i) setSortDir((d) => (d === 1 ? -1 : 1)); else { setSortCol(i); setSortDir(1); } }}
                            className="text-left text-xs font-semibold uppercase tracking-wide text-white/70 border-b border-line px-4 py-2.5 whitespace-nowrap cursor-pointer hover:text-white select-none">
                            {c}{sortCol === i ? (sortDir === 1 ? " ↑" : " ↓") : ""}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map((row, ri) => (
                        <tr key={ri} className="hover:bg-white/[0.04]">
                          {row.map((cell, ci) => (
                            <td key={ci} className="text-white/90 border-b border-line/40 px-4 py-2 whitespace-nowrap">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <pre className="text-white/90 text-xs md:text-sm p-4 whitespace-pre-wrap max-h-[520px] overflow-y-auto min-h-[200px]">{output}</pre>
            )}
          </div>
        </div>
      </div>
      {sessionUser && showTerm && (
        <div id="ibridge-terminal">
          <Terminal seed={termSeed} onExpired={() => { setSessionUser(null); setShowTerm(false); setMsg("Session expired — sign in again."); }} />
        </div>
      )}
      <div className="bg-panel border border-line rounded-lg p-6 mb-6 mt-6">
        <h2 className="font-mono text-sm text-muted mb-3">{"// how it connects"}</h2>
        <p className="text-sm text-muted">
          Direct through iBridge: enter your IBM i login above, pick a sample, and hit run — iBridge signs on
          to {host.trim() || "pub400.com"} through a 5250 session on its backend (the same sign-on a tn5250 app
          uses), runs the command, and returns the result here as clean web output.
          Nothing to download, nothing to run on your computer.
        </p>
      </div>
    </div>
  );
}
