import Link from "next/link";

const SECTIONS = [
  { id: "quickstart", label: "Quickstart" },
  { id: "sessions", label: "Sessions" },
  { id: "terminal", label: "The terminal" },
  { id: "rules", label: "SQL & CL rules" },
  { id: "api", label: "REST API" },
  { id: "keys", label: "Keyboard" },
  { id: "limits", label: "Known limits" },
  { id: "roadmap", label: "Roadmap" },
];

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="text-2xl font-bold text-white mt-12 mb-4 scroll-mt-24 first:mt-0">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-muted leading-relaxed mb-4 max-w-3xl">{children}</p>;
}
function Code({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-[13px] text-phosphor bg-white/[0.04] px-1.5 py-0.5 rounded">{children}</code>;
}

export default function Docs() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-line">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center gap-6">
          <Link href="/" className="font-mono text-phosphor font-bold">≋ iBridge</Link>
          <span className="font-mono text-xs text-muted">/ docs</span>
          <span className="ml-auto">
            <Link href="/app" className="bg-phosphor text-ink font-mono font-bold text-sm px-4 py-2 rounded hover:opacity-90">Launch app →</Link>
          </span>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-6xl px-6 py-12 w-full grid md:grid-cols-[180px_1fr] gap-10">
        <aside className="hidden md:block">
          <nav className="sticky top-8 space-y-2">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="block font-mono text-xs text-muted hover:text-phosphor">{s.label}</a>
            ))}
          </nav>
        </aside>

        <article>
          <p className="font-mono text-phosphor mb-2">{"// documentation"}</p>
          <h1 className="text-4xl font-bold mb-6">Using iBridge</h1>

          <H id="quickstart">Quickstart</H>
          <P>
            You need an IBM i account. The public test system <a href="https://www.pub400.com" target="_blank" rel="noreferrer" className="text-phosphor hover:underline">PUB400</a> gives
            you one free: sign up there, and PUB400 emails you a user profile and password.
          </P>
          <P>
            Then open the <Link href="/app" className="text-phosphor hover:underline">app</Link>, go to <strong className="text-white">SQL Studio</strong>,
            enter host <Code>pub400.com</Code>, port <Code>2222</Code> and your credentials, and press{" "}
            <strong className="text-white">stay signed in</strong>. Pick a sample on the left — or write your own SQL/CL — and run it.
            SQL comes back as a table, display CL as clean text, and interactive CL opens the live terminal.
          </P>

          <H id="sessions">Sessions</H>
          <P>
            Signing in opens one real TN5250 session on the iBridge backend and keeps it open. Every run reuses it,
            so there is exactly one sign-on no matter how many commands you run — which also means iBridge never
            burns through your profile's failed-sign-on allowance. Sessions expire after about 10 idle minutes
            (any run refreshes the timer), and <strong className="text-white">disconnect</strong> signs off on the IBM i itself.
          </P>
          <P>
            Your password is used only at the moment of sign-on. It is never stored, never logged, and the session
            token never leaves an httpOnly cookie in your browser. If you skip signing in, runs still work in
            one-shot mode: one sign-on per command, using the credentials in the form.
          </P>

          <H id="terminal">The terminal</H>
          <P>
            When a command opens an interactive display — <Code>WRKUSRJOB</Code>, <Code>WRKACTJOB</Code>, menus,
            job logs — iBridge hands you that exact screen, live. The input boxes are not drawn by guesswork:
            the host's own 5250 field definitions say where each field starts and how long it is, and the terminal
            renders one input per field at those coordinates.
          </P>
          <P>
            Type into the underlined fields (an option next to a job, a value on a prompt screen), then press{" "}
            <strong className="text-white">ENTER</strong> or an <strong className="text-white">F-key</strong>. All edited fields travel
            with the key, exactly like a hardware terminal, and the answering screen comes back with its own fresh
            field map. Invalid options get the host's own error messages — because it is the host answering.
          </P>

          <H id="rules">SQL &amp; CL rules</H>
          <P>
            <strong className="text-white">SQL is read-only.</strong> Only <Code>SELECT</Code>, <Code>VALUES</Code>, <Code>WITH</Code> and{" "}
            <Code>EXPLAIN</Code> statements run; anything that writes is rejected before it reaches the system.
            Table functions such as <Code>QSYS2.ACTIVE_JOB_INFO</Code> need their <Code>TABLE(...)</Code> wrapper,
            as on any IBM i.
          </P>
          <P>
            <strong className="text-white">CL passes a safety denylist.</strong> Display and work-with commands are welcome;
            destructive verbs are blocked. Runs are rate-limited per visitor, and hosts are checked so the tool
            can't be pointed at private or loopback addresses. If any connection door rejects your password, the
            run stops there — iBridge never tries a second door with the same credentials.
          </P>

          <H id="api">REST API</H>
          <P>
            Beside the console, iBridge ships a working customer + order REST API: key auth via the{" "}
            <Code>x-api-key</Code> header, validation, server-computed totals, rate limiting, and a machine-readable{" "}
            <a href="/api/openapi" className="text-phosphor hover:underline">OpenAPI spec</a>. Try it live in the{" "}
            <Link href="/app#api" className="text-phosphor hover:underline">API Console</Link> — the demo key is
            shown there. The sandbox store is in-memory and resets on cold starts.
          </P>

          <H id="keys">Keyboard</H>
          <P>
            Press <Code>⌘K</Code> (or <Code>Ctrl+K</Code>) anywhere in the app for the command palette: jump between
            sections, load any sample or saved query into the editor, open the terminal, or disconnect — without
            touching the mouse. <Code>↑</Code>/<Code>↓</Code> navigate, <Code>Enter</Code> selects, <Code>Esc</Code> closes.
            Inside the terminal, pressing Enter in a field sends ENTER to the host.
          </P>

          <H id="limits">Known limits</H>
          <P>
            The backend runs on a free tier that sleeps when idle, so the first sign-in after a quiet stretch can
            take a minute or two — and if the backend host restarts, live sessions end with it (the app will tell
            you the session expired rather than pretend otherwise). One session serves one browser; the terminal is
            a single 24×80 screen at a time.
          </P>

          <H id="roadmap">Roadmap</H>
          <P>
            <strong className="text-white">Phase A — shipped:</strong> the app shell, navigation, system switcher,
            command palette, landing page and these docs. The connection engine underneath did not change.
          </P>
          <P>
            Next: accounts with roles and an encrypted connection vault (B), audit log and command policies (C),
            connection profiles for many systems (D), the library/object explorer and live dashboards (E),
            a versioned platform API (F), an always-on backend (G), and an AI copilot with watchers (H).
          </P>
        </article>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-6 py-6 font-mono text-xs text-muted flex flex-wrap gap-3 justify-between">
          <span>iBridge · IBM i Web Console · docs</span>
          <span>by Aman Shaik</span>
        </div>
      </footer>
    </div>
  );
}
