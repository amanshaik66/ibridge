"use client";

import { useMemo, useState } from "react";
import type { GridData } from "./workbench";

// Sortable / filterable result table in the console's house style (same
// framing as the SQL Studio workbench table). Optional row click for
// drill-down views like the Explorer.
export default function DataGrid({
  table,
  onRowClick,
  emptyText = "No rows returned.",
  maxH = "max-h-[520px]",
}: {
  table: GridData;
  onRowClick?: (row: string[]) => void;
  emptyText?: string;
  maxH?: string;
}) {
  const [filterText, setFilterText] = useState("");
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const displayRows = useMemo(() => {
    let rows = table.rows;
    const q = filterText.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.some((c) => (c ?? "").toLowerCase().includes(q)));
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
  }, [table, filterText, sortCol, sortDir]);

  function download(name: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function csv(): string {
    const esc = (c: string) => (/[",\n]/.test(c ?? "") ? `"${(c ?? "").replace(/"/g, '""')}"` : c ?? "");
    return [table.columns.map(esc).join(","), ...displayRows.map((r) => r.map(esc).join(","))].join("\n");
  }

  return (
    <div className="rounded-xl overflow-hidden border border-line bg-panel shadow-lg">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-line flex-wrap">
        <input value={filterText} onChange={(e) => setFilterText(e.target.value)} placeholder="filter rows…"
          className="bg-ink border border-line rounded px-2.5 py-1 text-xs text-white placeholder:text-muted focus:border-phosphor outline-none w-44" />
        <span className="text-[11px] text-muted">{displayRows.length} of {table.rows.length} rows · click a column to sort</span>
        <span className="ml-auto flex gap-1.5">
          <button onClick={() => download("ibridge-grid.csv", csv(), "text/csv")}
            className="font-mono text-[11px] px-2 py-1 rounded border border-line text-muted hover:text-white">CSV</button>
          <button onClick={() => download("ibridge-grid.json", JSON.stringify(displayRows.map((r) => Object.fromEntries(table.columns.map((c, i) => [c, r[i]]))), null, 2), "application/json")}
            className="font-mono text-[11px] px-2 py-1 rounded border border-line text-muted hover:text-white">JSON</button>
        </span>
      </div>
      <div className={`${maxH} overflow-auto`}>
        {table.rows.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted">{emptyText}</p>
        ) : (
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
                <tr key={ri} onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`hover:bg-white/[0.04] ${onRowClick ? "cursor-pointer" : ""}`}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="text-white/90 border-b border-line/40 px-4 py-2 whitespace-nowrap max-w-[420px] truncate">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
