"use client";

import { useState } from "react";

const DEMO_KEY = "ibridge_demo_key_2026";

type Call = { method: string; path: string; body?: string; label: string };

const CALLS: Call[] = [
  { method: "GET", path: "/api/health", label: "health check (no auth)" },
  { method: "GET", path: "/api/customers", label: "list customers" },
  { method: "GET", path: "/api/orders?customerId=CUS-1001", label: "orders for CUS-1001" },
  {
    method: "POST", path: "/api/customers", label: "create customer",
    body: JSON.stringify({ name: "Test User", email: "test@example.com", company: "Demo Inc", status: "prospect" }, null, 2),
  },
  {
    method: "POST", path: "/api/orders", label: "create order (totals computed)",
    body: JSON.stringify({ customerId: "CUS-1001", lines: [{ sku: "SVC-010", description: "API integration sprint", qty: 2, unitPrice: 2500 }] }, null, 2),
  },
];

export default function ApiConsole() {
  const [key, setKey] = useState(DEMO_KEY);
  const [call, setCall] = useState<Call>(CALLS[0]);
  const [body, setBody] = useState("");
  const [out, setOut] = useState("— press send —");
  const [status, setStatus] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      const res = await fetch(call.path, {
        method: call.method,
        headers: { "Content-Type": "application/json", "x-api-key": key },
        body: call.body ? (body || call.body) : undefined,
      });
      setStatus(res.status);
      const text = await res.text();
      try { setOut(JSON.stringify(JSON.parse(text), null, 2)); }
      catch { setOut(text); }
    } catch (e) {
      setOut(`request failed: ${String(e).slice(0, 200)}`);
      setStatus(null);
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <p className="font-mono text-phosphor mb-2">{"// rest api"}</p>
      <h2 className="text-3xl md:text-4xl font-bold mb-4">iBridge API console</h2>
      <p className="text-muted max-w-2xl mb-8">
        A working customer + order API in the spirit of an IBM&nbsp;i integration bridge: key auth,
        validation, server-computed totals, rate limiting, and a machine-readable{" "}
        <a href="/api/openapi" className="text-phosphor font-mono text-sm hover:underline">OpenAPI spec</a>.
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-panel border border-line rounded-lg p-6">
          <h2 className="font-mono text-sm text-muted mb-4">{"// try it live"}</h2>
          <label className="block font-mono text-xs text-muted mb-1">x-api-key</label>
          <input value={key} onChange={(e) => setKey(e.target.value)} spellCheck={false}
            className="w-full bg-ink border border-line rounded px-3 py-2 font-mono text-sm mb-4 focus:border-phosphor outline-none" />
          <label className="block font-mono text-xs text-muted mb-1">request</label>
          <div className="space-y-2 mb-4">
            {CALLS.map((c) => (
              <button key={c.label} onClick={() => { setCall(c); setBody(""); }}
                className={`block w-full text-left font-mono text-xs px-3 py-2 rounded border ${call.label === c.label ? "border-phosphor text-phosphor" : "border-line text-muted hover:text-white"}`}>
                <span className="font-bold">{c.method}</span> {c.path}
              </button>
            ))}
          </div>
          {call.body && (
            <>
              <label className="block font-mono text-xs text-muted mb-1">body (json — editable)</label>
              <textarea value={body || call.body} rows={6} spellCheck={false}
                onChange={(e) => setBody(e.target.value)}
                className="w-full bg-ink border border-line rounded px-3 py-2 font-mono text-xs mb-4 focus:border-phosphor outline-none" />
            </>
          )}
          <button onClick={send} disabled={busy}
            className="bg-phosphor text-ink font-mono font-bold px-8 py-2 rounded hover:opacity-90 disabled:opacity-50">
            {busy ? "sending…" : "send →"}
          </button>
        </div>

        <div className="bg-panel border border-line rounded-lg p-6">
          <h2 className="font-mono text-sm text-muted mb-4">{"// response"}{status !== null && <span className={status < 300 ? "text-phosphor" : "text-amber"}>· {status}</span>}</h2>
          <pre className="font-mono text-xs text-slate-300 whitespace-pre-wrap max-h-[560px] overflow-y-auto">{out}</pre>
        </div>
      </div>

      <div className="mt-10 bg-panel border border-line rounded-lg p-6">
        <h2 className="font-mono text-sm text-muted mb-4">{"// quickstart"}</h2>
        <pre className="font-mono text-xs text-slate-300 whitespace-pre-wrap">{`curl -H "x-api-key: ${DEMO_KEY}" \\
  https://ibridge-mauve.vercel.app/api/customers

curl -X POST -H "x-api-key: ${DEMO_KEY}" -H "Content-Type: application/json" \\
  -d '{"name":"Jane Doe","email":"jane@example.com"}' \\
  https://ibridge-mauve.vercel.app/api/customers`}</pre>
        <p className="mt-4 text-xs text-muted">Sandbox store is in-memory and resets on cold starts. Swap in Postgres when you need persistence.</p>
      </div>
    </div>
  );
}
