"use client";

import { useEffect, useState } from "react";

type FieldInfo = { i: number; row: number; col: number; len: number; value: string; bypass: boolean };
type Snap = { rows: string[]; fields: FieldInfo[] };

const ROW_H = 18; // px per screen row
const FONT = 13;

export default function Terminal({ onExpired, seed = 0 }: { onExpired: () => void; seed?: number }) {
  const [snap, setSnap] = useState<Snap | null>(null);
  const [vals, setVals] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function apply(s: Snap) {
    setSnap(s);
    const v: Record<number, string> = {};
    s.fields.forEach((f) => { if (!f.bypass) v[f.i] = f.value.replace(/\s+$/, ""); });
    setVals(v);
  }

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/lab/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) {
        if (j.error === "session_expired" || j.error === "no_session") {
          onExpired();
          setErr("Session expired — sign in again.");
        } else {
          setErr(j.message || "Terminal error.");
        }
      } else {
        apply(j.data.screen as Snap);
      }
    } catch (e) {
      setErr(String(e).slice(0, 140));
    }
    setBusy(false);
  }

  useEffect(() => {
    void post({ action: "screen" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const keys = (aid: string) => void post({ action: "keys", fields: vals, aid });

  const fkeys = Array.from({ length: 12 }, (_, i) => `PF${i + 1}`);
  const fkeys2 = Array.from({ length: 12 }, (_, i) => `PF${i + 13}`);

  const keyBtn = "font-mono text-[11px] px-2 py-1 rounded border border-line text-muted hover:text-white hover:border-phosphor disabled:opacity-50";

  return (
    <div className="rounded-xl overflow-hidden border border-line bg-panel shadow-lg mt-6">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-line bg-white/[0.02] flex-wrap">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
        <span className="text-sm font-medium text-white">Live 5250 terminal</span>
        <span className="text-xs text-muted">the same session your commands run in</span>
        <button className={`${keyBtn} ml-auto`} disabled={busy} onClick={() => void post({ action: "screen" })}>refresh</button>
      </div>

      <div className="p-3 overflow-x-auto bg-ink">
        <div className="relative mx-auto" style={{ width: "80ch", fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: FONT, lineHeight: `${ROW_H}px` }}>
          <pre className="text-white/90 whitespace-pre" style={{ lineHeight: `${ROW_H}px`, margin: 0 }}>
            {(snap?.rows ?? Array(24).fill("")).map((r) => (r + " ".repeat(80)).slice(0, 80)).join("\n")}
          </pre>
          {snap?.fields.filter((f) => !f.bypass).map((f) => (
            <input
              key={f.i}
              value={vals[f.i] ?? ""}
              disabled={busy}
              onChange={(e) => setVals((v) => ({ ...v, [f.i]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); keys("ENTER"); } }}
              spellCheck={false}
              autoComplete="off"
              className="absolute font-mono text-phosphor outline-none focus:ring-1 focus:ring-phosphor/60"
              style={{
                top: f.row * ROW_H,
                left: `${f.col}ch`,
                width: `${Math.max(f.len, 1)}ch`,
                height: ROW_H,
                fontSize: FONT,
                lineHeight: `${ROW_H}px`,
                backgroundColor: "#101c33",
                borderBottom: "1px dashed rgba(120,255,170,0.35)",
                padding: "0 1px",
              }}
            />
          ))}
        </div>
      </div>

      <div className="px-3 py-2 border-t border-line space-y-2">
        <div className="flex gap-1.5 flex-wrap items-center">
          <button className="font-mono text-[11px] px-3 py-1 rounded bg-phosphor text-ink font-bold disabled:opacity-50" disabled={busy} onClick={() => keys("ENTER")}>ENTER</button>
          {fkeys.map((k) => (
            <button key={k} className={keyBtn} disabled={busy} onClick={() => keys(k)}>{k.replace("PF", "F")}</button>
          ))}
        </div>
        <div className="flex gap-1.5 flex-wrap items-center">
          {fkeys2.map((k) => (
            <button key={k} className={keyBtn} disabled={busy} onClick={() => keys(k)}>{k.replace("PF", "F")}</button>
          ))}
          <button className={keyBtn} disabled={busy} onClick={() => keys("PAGE_UP")}>Roll ↑</button>
          <button className={keyBtn} disabled={busy} onClick={() => keys("PAGE_DOWN")}>Roll ↓</button>
          <button className={keyBtn} disabled={busy} onClick={() => keys("CLEAR")}>Clear</button>
          <button className={keyBtn} disabled={busy} onClick={() => keys("PRINT")}>Print</button>
        </div>
        {err && <p className="font-mono text-xs text-amber">{err}</p>}
        <p className="text-[11px] text-muted">
          Type into the underlined fields, then ENTER or an F-key. Interactive screens (WRKUSRJOB, menus, job logs) work here.
          Leave the terminal at a command line before running samples — or the run will F3 its way back first.
        </p>
      </div>
    </div>
  );
}
