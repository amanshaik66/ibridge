import Link from "next/link";

const FEATURES = [
  {
    title: "SQL Studio",
    tag: "LIVE",
    body: "Run SELECT, VALUES and CTEs against QSYS2 services and your files. Results land as real web tables — sortable, filterable, exportable to CSV/JSON, with saved queries and a history that restores outputs.",
  },
  {
    title: "Interactive 5250 terminal",
    tag: "LIVE",
    body: "WRKUSRJOB, WRKACTJOB, menus, job logs — live in the browser. Every screen brings its own field map from the host, so option fields sit exactly where IBM i puts them. Type options, roll, F-keys: the real session, not a screenshot.",
  },
  {
    title: "Persistent sessions",
    tag: "LIVE",
    body: "Sign in once and every run reuses the same 5250 session — no sign-on per command, and the failed-sign-on counter on your profile stays untouched by retries.",
  },
  {
    title: "Library & object explorer",
    tag: "PHASE E",
    body: "Browse libraries, objects and source members as web pages, over the same session. Spools and IFS follow in the same explorer.",
  },
  {
    title: "Live dashboards",
    tag: "PHASE E",
    body: "Active jobs, subsystems and system status from QSYS2, auto-refreshed — WRKACTJOB and WRKSYSSTS as dashboards instead of green screens.",
  },
  {
    title: "Guardrails by default",
    tag: "LIVE",
    body: "SQL is read-only, CL passes a safety denylist, runs are rate-limited, and an auth rejection from any door is final — iBridge never cascades into a second sign-on attempt against your profile.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-line">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center gap-6">
          <span className="font-mono text-phosphor font-bold">≋ iBridge</span>
          <nav className="hidden md:flex gap-5 font-mono text-xs text-muted">
            <Link href="/app" className="hover:text-phosphor">app</Link>
            <Link href="/docs" className="hover:text-phosphor">docs</Link>
            <a href="/api/openapi" className="hover:text-phosphor">openapi</a>
          </nav>
          <span className="ml-auto flex items-center gap-4">
            <a href="https://aman-shaik-portfolio.vercel.app/#projects" className="font-mono text-sm text-muted hover:text-phosphor">← portfolio</a>
            <Link href="/app" className="bg-phosphor text-ink font-mono font-bold text-sm px-4 py-2 rounded hover:opacity-90">Launch app →</Link>
          </span>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-6 pt-16 pb-14 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="font-mono text-phosphor mb-3">{"// ibm i · as/400 · in your browser"}</p>
            <h1 className="text-5xl md:text-6xl font-bold leading-[1.05] mb-5">
              IBM i,<br />in your <span className="text-phosphor">browser</span>.
            </h1>
            <p className="text-muted text-lg max-w-xl mb-8">
              iBridge is a modern web console for IBM i: real SQL and CL on a live system,
              an interactive 5250 terminal when a command needs one, and a REST API beside it.
              No emulator to install, no VPN gymnastics — bring a free PUB400 account and go.
            </p>
            <div className="flex gap-3 flex-wrap">
              <Link href="/app" className="bg-phosphor text-ink font-mono font-bold px-6 py-3 rounded hover:opacity-90">Launch the app →</Link>
              <Link href="/docs" className="font-mono text-sm px-6 py-3 rounded border border-line text-muted hover:text-white">Read the docs</Link>
            </div>
            <p className="mt-6 font-mono text-[11px] text-muted">pub400.com · IBM i 7.5 · 5250 sessions · credentials never stored</p>
          </div>

          {/* Decorative terminal mock (static visual) */}
          <div aria-hidden="true" className="rounded-xl overflow-hidden border border-line bg-panel shadow-2xl select-none">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-line bg-white/[0.02]">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-sm font-medium text-white">Live 5250 terminal</span>
              <span className="text-xs text-muted">WRKUSRJOB</span>
              <span className="ml-auto font-mono text-[9px] px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-300 border border-emerald-400/30">TEST</span>
            </div>
            <pre className="font-mono text-[11px] leading-relaxed text-white/85 p-4 whitespace-pre overflow-hidden">{`                          Work with User Jobs

Type options, press Enter.
  2=Change   3=Hold   4=End   5=Work with   6=Release

Opt  Subsystem/Job   User        Number    Status
 _   QPADEV0067      HNDAMSHA    195097    ACTIVE
 _   QZSHSH          QSECOFR     097563    ACTIVE

F3=Exit   F5=Refresh   F12=Cancel

Selection or command
===> WRKUSRJOB`}</pre>
            <div className="px-4 py-2.5 border-t border-line flex gap-1.5">
              {["ENTER", "F1", "F3", "F5", "F12", "Roll ↑", "Roll ↓"].map((k) => (
                <span key={k} className="font-mono text-[10px] px-2 py-1 rounded border border-line text-muted">{k}</span>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-line">
          <div className="mx-auto max-w-6xl px-6 py-14">
            <p className="font-mono text-phosphor mb-2">{"// the console"}</p>
            <h2 className="text-3xl md:text-4xl font-bold mb-10">Everything a green screen does.<br className="hidden md:block" /> None of the green screen.</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {FEATURES.map((f) => (
                <div key={f.title} className="bg-panel border border-line rounded-lg p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-white">{f.title}</h3>
                    <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded ${f.tag === "LIVE" ? "bg-phosphor/10 text-phosphor" : "bg-amber/10 text-amber"}`}>{f.tag}</span>
                  </div>
                  <p className="text-sm text-muted leading-relaxed">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it connects */}
        <section className="border-t border-line">
          <div className="mx-auto max-w-6xl px-6 py-14">
            <p className="font-mono text-phosphor mb-2">{"// how it connects"}</p>
            <h2 className="text-3xl md:text-4xl font-bold mb-10">Three steps between you and the machine</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { n: "1", t: "Sign on like an emulator", b: "iBridge opens a real TN5250 session on its backend — the same sign-on a terminal app performs — and keeps it open while you work." },
                { n: "2", t: "Run, in the right shape", b: "SQL returns as web tables, display CL as clean text, and anything interactive hands you the live terminal screen with its real field positions." },
                { n: "3", t: "Sign off cleanly", b: "Disconnect closes the session on the IBM i itself. Idle sessions expire on their own; your password is used at sign-on and never retained." },
              ].map((s) => (
                <div key={s.n} className="bg-panel border border-line rounded-lg p-6">
                  <p className="font-mono text-phosphor text-2xl mb-3">{s.n}</p>
                  <h3 className="font-semibold text-white mb-2">{s.t}</h3>
                  <p className="text-sm text-muted leading-relaxed">{s.b}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 flex gap-3 flex-wrap">
              <Link href="/app" className="bg-phosphor text-ink font-mono font-bold px-6 py-3 rounded hover:opacity-90">Try it on PUB400 →</Link>
              <Link href="/app#api" className="font-mono text-sm px-6 py-3 rounded border border-line text-muted hover:text-white">Or poke the REST API</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-6 py-6 font-mono text-xs text-muted flex flex-wrap gap-3 justify-between">
          <span>iBridge · IBM i Web Console</span>
          <span>
            <Link href="/docs" className="hover:text-phosphor">docs</Link>
            {" · "}
            <a href="/api/openapi" className="hover:text-phosphor">openapi</a>
            {" · by Aman Shaik"}
          </span>
        </div>
      </footer>
    </div>
  );
}
