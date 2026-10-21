"use client";

// The "no active session" panel every session-backed workbench shows —
// same guidance pattern as the Terminal section.
export default function SessionGate({
  kicker,
  title,
  blurb,
  onGoStudio,
  onRecheck,
  checking = false,
}: {
  kicker: string;
  title: string;
  blurb: string;
  onGoStudio: () => void;
  onRecheck: () => void;
  checking?: boolean;
}) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <p className="font-mono text-phosphor mb-2">{kicker}</p>
      <h2 className="text-3xl md:text-4xl font-bold mb-4">{title}</h2>
      <div className="bg-panel border border-line rounded-lg p-6 max-w-3xl">
        <p className="text-muted text-sm leading-relaxed">
          {checking ? "Checking for a signed-in session…" : (
            <>
              No active session right now. {blurb} Sign in from SQL Studio first (the{" "}
              <span className="text-white">stay signed in</span> button), then come back here.
            </>
          )}
        </p>
        <div className="mt-5 flex gap-3 flex-wrap">
          <button onClick={onGoStudio} className="bg-phosphor text-ink font-mono font-bold text-xs px-4 py-2 rounded hover:opacity-90">
            go to SQL Studio →
          </button>
          <button onClick={onRecheck} className="font-mono text-xs px-4 py-2 rounded border border-line text-muted hover:text-white">
            check again
          </button>
        </div>
      </div>
    </div>
  );
}
