"use client";

import { COMPONENT_LABEL, COMPONENT_ORDER, GATE_LABEL, profileLines } from "@/lib/export/text";
import type { Report } from "@/lib/report/types";

export function HowIDecided({ report }: { report: Report }) {
  const removedByGate = Object.entries(report.gateSummary).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  const comps = report.items.length ? COMPONENT_ORDER : [];
  return (
    <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <summary className="cursor-pointer text-base font-semibold">How I decided</summary>
      <div className="mt-3 grid gap-5 text-sm">
        <section>
          <h3 className="mb-1 font-semibold">1. Your extracted profile</h3>
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {profileLines(report.profile).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-slate-100 py-0.5 dark:border-slate-800"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
            ))}
          </dl>
          {report.profile.assumptions.length > 0 && <p className="mt-2 text-xs text-slate-500">Assumptions: {report.profile.assumptions.join(" ")}</p>}
        </section>

        <section>
          <h3 className="mb-1 font-semibold">2. Filters applied</h3>
          <p className="text-slate-600 dark:text-slate-300">
            A product is removed if the lender&apos;s <em>published</em> rules rule you out. A rule the lender does not publish is never treated as a pass; it is flagged for you to confirm.
            {report.considered} products were checked and {report.passed} passed every filter.
          </p>
          {removedByGate.length > 0 ? (
            <ul className="mt-2 grid gap-1">
              {removedByGate.map(([id, n]) => (
                <li key={id} className="flex justify-between rounded-md bg-slate-50 px-3 py-1.5 dark:bg-slate-800/60"><span>{GATE_LABEL[id as keyof typeof GATE_LABEL] ?? id}</span><span className="tabular-nums font-medium">{n} removed</span></li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-slate-500">No product was removed by a hard filter.</p>
          )}
          {report.followUps.length > 0 && (
            <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
              <p className="font-semibold">Your follow-up filters</p>
              <ul className="list-disc pl-4">{report.followUps.map((f, i) => <li key={i}>“{f.text}” → {f.applied.join("; ") || "no change"}</li>)}</ul>
            </div>
          )}
          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-slate-600 dark:text-slate-300">{report.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </section>

        <section>
          <h3 className="mb-1 font-semibold">3. Score breakdown (weights are editable in config/scoring.json)</h3>
          <p className="mb-2 text-xs text-slate-500">Ranking never depends on commissions or referral fees. Each component is scored 0–100, then weighted.</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="py-1 pr-3">#</th><th className="pr-3">Lender — product</th>
                  {comps.map((c) => <th key={c} className="pr-3 text-right font-semibold">{COMPONENT_LABEL[c]}<br /><span className="font-normal text-slate-500">weight {report.weights[c]}</span></th>)}
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {report.items.map((i) => (
                  <tr key={i.rank} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-1 pr-3">{i.rank}</td><td className="pr-3">{i.lenderName} — {i.productName}</td>
                    {comps.map((c) => <td key={c} className="pr-3 text-right tabular-nums">{i.breakdown[c].toFixed(0)}</td>)}
                    <td className="text-right font-semibold tabular-nums">{i.score.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className="mb-1 font-semibold">4. Cost and payment math (done in code, not by the AI)</h3>
          <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600 dark:text-slate-300">
            {[...new Set(report.items.map((i) => i.cost.formula))].map((f) => <li key={f}>{f}</li>)}
          </ul>
          <p className="mt-1 text-xs text-slate-500">Per-product assumptions are under “Show score breakdown, formula and assumptions” on each card.</p>
        </section>
      </div>
    </details>
  );
}
