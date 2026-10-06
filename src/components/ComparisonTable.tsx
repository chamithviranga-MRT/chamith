"use client";

import { useMemo, useState } from "react";
import { ageLabel } from "@/lib/report/format";
import type { ReportItem } from "@/lib/report/types";

type Key = "rank" | "lender" | "product" | "category" | "score" | "amount" | "apr" | "term" | "speed" | "monthly" | "age";

const COLS: Array<{ key: Key; label: string; num: boolean; get: (i: ReportItem) => number | string | null; show: (i: ReportItem) => string }> = [
  { key: "rank", label: "#", num: true, get: (i) => i.rank, show: (i) => String(i.rank) },
  { key: "lender", label: "Lender", num: false, get: (i) => i.lenderName, show: (i) => i.lenderName },
  { key: "product", label: "Product", num: false, get: (i) => i.productName, show: (i) => i.productName },
  { key: "category", label: "Category", num: false, get: (i) => i.category, show: (i) => i.category },
  { key: "score", label: "Score", num: true, get: (i) => i.score, show: (i) => i.score.toFixed(1) },
  { key: "amount", label: "Amount", num: true, get: (i) => i.sort.amountMax, show: (i) => i.amountRange },
  { key: "apr", label: "Rate", num: true, get: (i) => i.sort.rate, show: (i) => (i.cost.effectiveAprPct !== null ? `${i.rateRange}\n≈${i.cost.effectiveAprPct}% effective` : i.rateRange) },
  { key: "term", label: "Term", num: true, get: (i) => i.sort.termMax, show: (i) => i.termRange },
  { key: "speed", label: "Speed", num: true, get: (i) => i.sort.speedDays, show: (i) => i.speed },
  { key: "monthly", label: "Est. monthly", num: true, get: (i) => i.sort.monthly, show: (i) => (i.cost.monthlyPayment !== null ? `$${Math.round(i.cost.monthlyPayment).toLocaleString("en-US")}` : "n/a") },
  { key: "age", label: "Data age", num: true, get: (i) => i.ageDays, show: (i) => ageLabel(i.ageDays) },
];

export function ComparisonTable({ items }: { items: ReportItem[] }) {
  const [sort, setSort] = useState<{ key: Key; dir: "asc" | "desc" }>({ key: "rank", dir: "asc" });
  const rows = useMemo(() => {
    const col = COLS.find((c) => c.key === sort.key)!;
    return [...items].sort((a, b) => {
      const x = col.get(a);
      const y = col.get(b);
      if (x === null && y === null) return a.rank - b.rank;
      if (x === null) return 1; // unknowns always last
      if (y === null) return -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return (sort.dir === "asc" ? c : -c) || a.rank - b.rank;
    });
  }, [items, sort]);

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <table className="min-w-full text-left text-xs sm:text-sm">
        <caption className="sr-only">Comparison of the top matches. Click a column header to sort.</caption>
        <thead className="bg-slate-50 dark:bg-slate-800/70">
          <tr>
            {COLS.map((c) => {
              const active = sort.key === c.key;
              return (
                <th key={c.key} scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className="whitespace-nowrap px-3 py-2 font-semibold">
                  <button type="button" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key && s.dir === "asc" ? "desc" : "asc" }))} className="inline-flex items-center gap-1 hover:text-indigo-700 dark:hover:text-indigo-300">
                    {c.label}
                    <span aria-hidden className="text-[10px] text-slate-400">{active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((i) => (
            <tr key={`${i.lenderSlug}-${i.productName}-${i.rank}`} className={i.label === "Pink Diamond" ? "bg-fuchsia-50/60 dark:bg-fuchsia-950/20" : ""}>
              {COLS.map((c) => (
                <td key={c.key} className={`px-3 py-2 align-top ${c.num ? "tabular-nums" : ""} whitespace-pre-line ${c.key === "lender" || c.key === "product" ? "min-w-[8rem]" : "whitespace-nowrap"}`}>
                  {c.show(i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
