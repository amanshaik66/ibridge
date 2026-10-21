"use client";

import { useCallback, useEffect, useState } from "react";
import LabTool from "./LabTool";
import Terminal from "./Terminal";
import ApiConsole from "./ApiConsole";
import Explorer from "./Explorer";
import JobsDashboard from "./JobsDashboard";
import Spools from "./Spools";
import CommandPalette, { type Sample } from "./CommandPalette";

type NavItem = { id: string; label: string; chip: string; phase?: string; hint: string };

const NAV: NavItem[] = [
  { id: "dashboard", label: "Overview", chip: "OV", hint: "Status, quick actions, recent runs" },
  { id: "studio", label: "SQL Studio", chip: "SQL", hint: "Sign in, run SQL & CL, workbench" },
  { id: "terminal", label: "Terminal", chip: "TRM", hint: "Live 5250 screen of your session" },
  { id: "explorer", label: "Explorer", chip: "EXP", hint: "Libraries, objects, source members" },
  { id: "jobs", label: "Jobs", chip: "JOB", hint: "Active jobs & system dashboards" },
  { id: "spools", label: "Spools", chip: "SPL", hint: "Spooled files center" },
  { id: "api", label: "API Console", chip: "API", hint: "Customer + order REST API" },
  { id: "admin", label: "Admin", chip: "ADM", phase: "B", hint: "Accounts, roles, vault, audit" },
];

const TITLES: Record<string, string> = Object.fromEntries(NAV.map((n) => [n.id, n.label]));

function loadAndGo(section: (s: string) => void, kind: "sql" | "cl", command: string) {
  window.dispatchEvent(new CustomEvent("ibridge:load", { detail: { kind, command } }));
  section("studio");
}

function Placeholder({ nav, children, cta }: { nav: NavItem; children: React.ReactNode; cta: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <p className="font-mono text-phosphor mb-2">{"// phase " + (nav.phase ?? "") + " — scaffolded in the shell"}</p>
      <h2 className="text-3xl md:text-4xl font-bold mb-4">{nav.label}</h2>
      <div className="bg-panel border border-line rounded-lg p-6 max-w-3xl">
        <div className="text-muted space-y-3 text-sm leading-relaxed">{children}</div>
        <div className="mt-5 flex gap-3 flex-wrap">{cta}</div>
      </div>
    </div>
  );
}

function TerminalSection({ goStudio }: { goStudio: () => void }) {
  const [alive, setAlive] = useState<boolean | null>(null);
  const [attempt, setAttempt] = useState(0);

  if (alive === false) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        <p className="font-mono text-phosphor mb-2">{"// live 5250 terminal"}</p>
        <h2 className="text-3xl md:text-4xl font-bold mb-4">Terminal</h2>
        <div className="bg-panel border border-line rounded-lg p-6 max-w-3xl">
          <p className="text-muted text-sm leading-relaxed">
            No active session right now. The terminal shows the live screen of your signed-in session —
            sign in from SQL Studio first (the <span className="text-white">stay signed in</span> button),
            then come back here, or open the terminal from inside SQL Studio.
          </p>
          <div className="mt-5 flex gap-3 flex-wrap">
            <button onClick={goStudio} className="bg-phosphor text-ink font-mono font-bold text-xs px-4 py-2 rounded hover:opacity-90">
              go to SQL Studio →
            </button>
            <button onClick={() => { setAlive(null); setAttempt((a) => a + 1); }}
              className="font-mono text-xs px-4 py-2 rounded border border-line text-muted hover:text-white">
              check again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <p className="font-mono text-phosphor mb-2">{"// live 5250 terminal"}</p>
      <h2 className="text-3xl md:text-4xl font-bold mb-2">Terminal</h2>
      <p className="text-muted text-sm max-w-3xl">
        The same session your SQL Studio commands run in. Field positions come from the host itself —
        every screen brings its own input map.
      </p>
      <Terminal key={attempt} seed={0} onExpired={() => setAlive(false)} />
    </div>
  );
}

export default function AppShell() {
  const [section, setSection] = useState("dashboard");
  const [visited, setVisited] = useState<Record<string, boolean>>({ dashboard: true, studio: true });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [sysOpen, setSysOpen] = useState(false);
  const [recent, setRecent] = useState<{ kind: "sql" | "cl"; command: string }[]>([]);

  const navigate = useCallback((s: string) => {
    setSection(s);
    setVisited((v) => ({ ...v, [s]: true }));
    try { history.replaceState(null, "", `#${s}`); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const h = window.location.hash.replace("#", "");
    if (h && TITLES[h]) navigate(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch("/api/lab/run").then((r) => r.json()).then((j) => setSamples(j.data ?? [])).catch(() => {});
    fetch("/api/health").then((r) => r.json()).then((j) => setApiOk(j?.status === "ok")).catch(() => setApiOk(false));
  }, []);

  useEffect(() => {
    if (section !== "dashboard") return;
    try {
      const h = localStorage.getItem("ibridge_history");
      if (h) setRecent((JSON.parse(h) as { kind: "sql" | "cl"; command: string }[]).slice(0, 6));
    } catch { /* fresh start */ }
  }, [section]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const navBtn = (n: NavItem) => (
    <button key={n.id} onClick={() => navigate(n.id)}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left text-sm transition-colors ${section === n.id ? "bg-phosphor/10 text-white" : "text-muted hover:text-white hover:bg-white/[0.04]"}`}>
      <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded shrink-0 ${section === n.id ? "bg-phosphor/20 text-phosphor" : "bg-white/5 text-muted"}`}>{n.chip}</span>
      <span className="flex-1 truncate">{n.label}</span>
      {n.phase && <span className="font-mono text-[9px] text-muted border border-line rounded px-1 py-px">phase {n.phase}</span>}
    </button>
  );

  return (
    <div className="min-h-screen md:flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex md:flex-col w-64 shrink-0 border-r border-line bg-panel/70 sticky top-0 h-screen">
        <div className="px-5 pt-5 pb-4 border-b border-line">
          <a href="/" className="font-mono text-phosphor font-bold text-lg">≋ iBridge</a>
          <p className="font-mono text-[10px] text-muted mt-1">IBM i WEB CONSOLE</p>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">{NAV.map(navBtn)}</nav>
        <div className="px-4 py-4 border-t border-line space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-white font-medium">PUB400</span>
            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-300 border border-emerald-400/30">TEST</span>
            <span className="text-muted font-mono text-[10px] ml-auto">pub400.com</span>
          </div>
          <div className="flex justify-between font-mono text-[10px] text-muted">
            <a href="/docs" className="hover:text-phosphor">docs</a>
            <a href="https://aman-shaik-portfolio.vercel.app/#projects" className="hover:text-phosphor">← portfolio</a>
            <span>by Aman Shaik</span>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-40 bg-ink/90 backdrop-blur border-b border-line">
          <div className="flex items-center gap-3 px-4 md:px-6 h-14">
            <a href="/" className="font-mono text-phosphor font-bold md:hidden">≋ iBridge</a>
            <div className="hidden md:flex items-baseline gap-2 min-w-0">
              <span className="font-mono text-xs text-muted">iBridge</span>
              <span className="text-muted">/</span>
              <span className="text-sm font-medium text-white truncate">{TITLES[section] ?? "Overview"}</span>
            </div>

            <div className="ml-auto flex items-center gap-2 md:gap-3">
              {/* System switcher */}
              <div className="relative">
                <button onClick={() => setSysOpen((o) => !o)}
                  className="flex items-center gap-2 border border-line rounded-md px-2.5 py-1.5 hover:border-phosphor/50">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-xs font-medium text-white">PUB400</span>
                  <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-300 border border-emerald-400/30">TEST</span>
                  <span className="text-muted text-[10px]">▾</span>
                </button>
                {sysOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setSysOpen(false)} />
                    <div className="absolute right-0 z-20 mt-2 w-64 bg-panel border border-line rounded-lg shadow-2xl p-2">
                      <button onClick={() => setSysOpen(false)} className="w-full text-left px-3 py-2 rounded hover:bg-white/[0.04]">
                        <span className="flex items-center gap-2 text-sm text-white">
                          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" /> PUB400
                          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-300 border border-emerald-400/30">TEST</span>
                          <span className="ml-auto text-phosphor text-xs">✓</span>
                        </span>
                        <span className="block font-mono text-[10px] text-muted mt-0.5 ml-4">pub400.com · IBM i 7.5 · the public test system</span>
                      </button>
                      <div className="border-t border-line my-2" />
                      <p className="px-3 py-2 font-mono text-[10px] text-muted">＋ add a system — arrives with connection profiles (Phase D)</p>
                    </div>
                  </>
                )}
              </div>

              <span className="hidden sm:flex items-center gap-1.5 font-mono text-[10px] text-muted" title="Site API health">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${apiOk === null ? "bg-muted" : apiOk ? "bg-emerald-400" : "bg-amber"}`} />
                API {apiOk === null ? "…" : apiOk ? "ok" : "down"}
              </span>

              <button onClick={() => setPaletteOpen(true)}
                className="flex items-center gap-2 border border-line rounded-md px-2.5 py-1.5 text-muted hover:text-white hover:border-phosphor/50">
                <span className="text-xs hidden sm:inline">Jump to…</span>
                <kbd className="font-mono text-[10px] border border-line rounded px-1 py-px">⌘K</kbd>
              </button>
            </div>
          </div>

          {/* Mobile nav */}
          <nav className="md:hidden flex gap-1.5 px-3 pb-2.5 overflow-x-auto">
            {NAV.map((n) => (
              <button key={n.id} onClick={() => navigate(n.id)}
                className={`shrink-0 font-mono text-[11px] px-2.5 py-1.5 rounded-full border ${section === n.id ? "border-phosphor text-phosphor" : "border-line text-muted"}`}>
                {n.label}{n.phase ? ` ·${n.phase}` : ""}
              </button>
            ))}
          </nav>
        </header>

        {/* Sections */}
        <main className="flex-1">
          {section === "dashboard" && (
            <div className="mx-auto max-w-6xl px-6 py-10">
              <p className="font-mono text-phosphor mb-2">{"// overview"}</p>
              <h2 className="text-3xl md:text-4xl font-bold mb-8">Your IBM i workspace</h2>

              <div className="grid md:grid-cols-3 gap-6 mb-6">
                <div className="bg-panel border border-line rounded-lg p-6">
                  <p className="font-mono text-[10px] text-muted mb-3">SYSTEM</p>
                  <p className="flex items-center gap-2 text-white font-medium">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" /> PUB400
                    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-300 border border-emerald-400/30">TEST</span>
                  </p>
                  <p className="font-mono text-[11px] text-muted mt-2">pub400.com · IBM i 7.5<br />5250 session via the iBridge backend</p>
                  <button onClick={() => navigate("studio")} className="mt-4 font-mono text-xs px-3 py-1.5 rounded border border-phosphor text-phosphor hover:bg-phosphor/10">open SQL Studio →</button>
                </div>
                <div className="bg-panel border border-line rounded-lg p-6">
                  <p className="font-mono text-[10px] text-muted mb-3">SESSION</p>
                  <p className="text-white font-medium">Sign in once, run many</p>
                  <p className="text-[13px] text-muted mt-2 leading-relaxed">A signed-in session stays open for ~10 idle minutes and every run reuses it — no sign-on per command. Interactive commands land in the live terminal.</p>
                  <button onClick={() => { navigate("studio"); window.dispatchEvent(new CustomEvent("ibridge:open-terminal")); }} className="mt-4 font-mono text-xs px-3 py-1.5 rounded border border-line text-muted hover:text-white">open the terminal →</button>
                </div>
                <div className="bg-panel border border-line rounded-lg p-6">
                  <p className="font-mono text-[10px] text-muted mb-3">REST API</p>
                  <p className="flex items-center gap-2 text-white font-medium">
                    <span className={`inline-block w-2 h-2 rounded-full ${apiOk ? "bg-emerald-400" : "bg-amber"}`} />
                    {apiOk === null ? "Checking…" : apiOk ? "Operational" : "Not responding"}
                  </p>
                  <p className="text-[13px] text-muted mt-2 leading-relaxed">Customer + order API with key auth, validation and an OpenAPI spec.</p>
                  <button onClick={() => navigate("api")} className="mt-4 font-mono text-xs px-3 py-1.5 rounded border border-line text-muted hover:text-white">open API Console →</button>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-panel border border-line rounded-lg p-6">
                  <p className="font-mono text-[10px] text-muted mb-4">QUICK LAUNCH — SAMPLES</p>
                  <div className="space-y-2">
                    {samples.slice(0, 6).map((s) => (
                      <button key={s.id} onClick={() => loadAndGo(navigate, s.kind, s.command)}
                        className="block w-full text-left px-3 py-2 rounded border border-line hover:border-phosphor/50 font-mono text-xs text-muted hover:text-white">
                        <span className={`mr-2 px-1.5 py-0.5 rounded text-[10px] ${s.kind === "sql" ? "bg-phosphor/10 text-phosphor" : "bg-amber/10 text-amber"}`}>{s.kind.toUpperCase()}</span>
                        {s.label}
                      </button>
                    ))}
                    {samples.length === 0 && <p className="font-mono text-xs text-muted">Loading samples…</p>}
                  </div>
                </div>
                <div className="bg-panel border border-line rounded-lg p-6">
                  <p className="font-mono text-[10px] text-muted mb-4">RECENT RUNS</p>
                  {recent.length === 0 ? (
                    <p className="text-[13px] text-muted leading-relaxed">Nothing yet. Runs you make in SQL Studio will appear here — click one to load it back into the editor. Full outputs stay in the Studio's own history.</p>
                  ) : (
                    <div className="space-y-2">
                      {recent.map((h, i) => (
                        <button key={i} onClick={() => loadAndGo(navigate, h.kind, h.command)}
                          className="block w-full text-left px-3 py-2 rounded border border-line hover:border-phosphor/50 font-mono text-xs text-muted hover:text-white truncate">
                          <span className="text-phosphor mr-2">{h.kind.toUpperCase()}</span>{h.command}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="mt-4 font-mono text-[10px] text-muted">Tip: press ⌘K anywhere to jump between sections and samples.</p>
                </div>
              </div>
            </div>
          )}

          {/* SQL Studio: LabTool stays mounted so editor + session state survive section switches */}
          <div className={section === "studio" ? "" : "hidden"}>
            <LabTool />
          </div>

          {visited.terminal && section === "terminal" && <TerminalSection goStudio={() => navigate("studio")} />}

          {/* Phase E workbenches: mounted on first visit, kept mounted (hidden) so
              browse state survives section switches — same rule as SQL Studio. */}
          {visited.explorer && (
            <div className={section === "explorer" ? "" : "hidden"}>
              <Explorer active={section === "explorer"} goStudio={() => navigate("studio")} />
            </div>
          )}

          {visited.jobs && (
            <div className={section === "jobs" ? "" : "hidden"}>
              <JobsDashboard active={section === "jobs"} goStudio={() => navigate("studio")} />
            </div>
          )}

          {visited.spools && (
            <div className={section === "spools" ? "" : "hidden"}>
              <Spools active={section === "spools"} goStudio={() => navigate("studio")} />
            </div>
          )}

          {visited.api && section === "api" && <ApiConsole />}

          {section === "admin" && (
            <Placeholder nav={NAV[7]} cta={<a href="/docs" className="font-mono text-xs px-4 py-2 rounded border border-line text-muted hover:text-white">read the security model in docs →</a>}>
              <p>iBridge accounts and teams, role-based access (Admin / Operator / Developer / Auditor), an encrypted connection vault, and the immutable audit log land in Phases B and C.</p>
              <p>Until then, the guardrails that already protect every run stay in force: read-only SQL, a CL safety denylist, rate limiting, and credentials that are never stored or logged.</p>
            </Placeholder>
          )}
        </main>

        <footer className="border-t border-line px-6 py-4 flex flex-wrap gap-3 justify-between font-mono text-[10px] text-muted">
          <span>iBridge · IBM i Web Console · Phase A shell + Phase E workbenches</span>
          <span>Engine unchanged: 5250 sessions · JDBC · SSH — auth rejection is final, no cascade</span>
        </footer>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNavigate={navigate} samples={samples} />
    </div>
  );
}
