"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type Sample = { id: string; kind: "sql" | "cl"; label: string; command: string; note: string };

type Item = {
  id: string;
  title: string;
  sub?: string;
  chip?: string;
  run: () => void;
};

export default function CommandPalette({
  open,
  onClose,
  onNavigate,
  samples,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (section: string) => void;
  samples: Sample[];
}) {
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const [saved, setSaved] = useState<{ name: string; kind: "sql" | "cl"; command: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSel(0);
    try {
      const s = localStorage.getItem("ibridge_saved");
      if (s) setSaved(JSON.parse(s));
    } catch { /* ignore */ }
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open ]);

  const items = useMemo<Item[]>(() => {
    if (!open) return [];
    const go = (section: string, title: string, sub: string): Item => ({
      id: `go-${section}`, title, sub, chip: "GO",
      run: () => { onNavigate(section); onClose(); },
    });
    const load = (kind: "sql" | "cl", command: string, title: string, sub: string, chip: string): Item => ({
      id: `load-${chip}-${command}`, title, sub, chip,
      run: () => {
        window.dispatchEvent(new CustomEvent("ibridge:load", { detail: { kind, command } }));
        onNavigate("studio");
        onClose();
      },
    });
    const all: Item[] = [
      go("dashboard", "Overview", "Status, quick actions and recent runs"),
      go("studio", "SQL Studio", "Sign in, run SQL and CL, results workbench"),
      go("terminal", "Terminal", "The live 5250 screen of your session"),
      go("api", "API Console", "The customer + order REST API, live"),
      go("explorer", "Explorer", "Libraries, objects, members, IFS — live"),
      go("jobs", "Jobs", "Active jobs & system status — live"),
      go("spools", "Spools", "Spooled files center — live"),
      go("admin", "Admin", "Accounts, roles, audit — Phase B/C"),
      {
        id: "act-terminal", title: "Open the terminal", sub: "In SQL Studio, on your signed-in session", chip: "ACT",
        run: () => { window.dispatchEvent(new CustomEvent("ibridge:open-terminal")); onNavigate("studio"); onClose(); },
      },
      {
        id: "act-signout", title: "Disconnect session", sub: "Sign off the IBM i and close the session", chip: "ACT",
        run: () => { window.dispatchEvent(new CustomEvent("ibridge:signout")); onClose(); },
      },
      ...samples.map((s) => load(s.kind, s.command, `Sample: ${s.label}`, s.command, s.kind.toUpperCase())),
      ...saved.map((s) => load(s.kind, s.command, `Saved: ${s.name}`, s.command, "SAVED")),
    ];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((i) => `${i.title} ${i.sub ?? ""}`.toLowerCase().includes(q));
  }, [open, query, samples, saved, onNavigate, onClose]);

  useEffect(() => { setSel(0); }, [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[14vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-panel border border-line rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-line">
          <span className="font-mono text-phosphor text-sm">⌘K</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); items[sel]?.run(); }
              else if (e.key === "Escape") { e.preventDefault(); onClose(); }
            }}
            placeholder="Jump to a section, load a sample, run an action…"
            className="w-full bg-transparent py-3.5 font-mono text-sm text-white placeholder:text-muted outline-none"
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="font-mono text-[10px] text-muted border border-line rounded px-1.5 py-0.5">esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[46vh] overflow-y-auto py-2">
          {items.length === 0 && <p className="px-4 py-6 font-mono text-xs text-muted">No matches.</p>}
          {items.map((item, idx) => (
            <button
              key={item.id}
              data-idx={idx}
              onMouseEnter={() => setSel(idx)}
              onClick={() => item.run()}
              className={`w-full text-left px-4 py-2.5 flex items-center gap-3 ${idx === sel ? "bg-phosphor/10" : ""}`}
            >
              {item.chip && (
                <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded shrink-0 ${item.chip === "SQL" ? "bg-phosphor/10 text-phosphor" : item.chip === "CL" ? "bg-amber/10 text-amber" : "bg-white/5 text-muted"}`}>
                  {item.chip}
                </span>
              )}
              <span className="min-w-0">
                <span className={`block text-sm truncate ${idx === sel ? "text-white" : "text-white/85"}`}>{item.title}</span>
                {item.sub && <span className="block font-mono text-[10px] text-muted truncate">{item.sub}</span>}
              </span>
            </button>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-line flex gap-4 font-mono text-[10px] text-muted">
          <span>↑↓ navigate</span><span>↵ select</span><span>esc close</span>
          <span className="ml-auto">{items.length} actions</span>
        </div>
      </div>
    </div>
  );
}
