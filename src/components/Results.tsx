"use client";

import { useState } from "react";
import { fmtDate } from "@/lib/report/format";
import type { Report } from "@/lib/report/types";
import { ComparisonTable } from "./ComparisonTable";
import { Disclaimer } from "./Disclaimer";
import { HowIDecided } from "./HowIDecided";
import { ResultCard } from "./ResultCard";

export function Results({
  report,
  runId,
  onRefresh,
  refreshingSlug,
  onFollowUp,
  followUpBusy,
  followUpNote,
}: {
  report: Report;
  runId: string | null;
  onRefresh?: (slug: string) => void;
  refreshingSlug?: string | null;
  onFollowUp?: (text: string) => Promise<void>;
  followUpBusy?: boolean;
  followUpNote?: string | null;
}) {
  const [text, setText] = useState("");
  const unavailable = report.lenders.filter((l) => l.status === "unavailable" || l.status === "blocked");

  return (
    <section aria-label="Results" className="grid gap-4">
      <Disclaimer />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            {report.items.length ? `Your top ${report.items.length} match${report.items.length === 1 ? "" : "es"}` : "No product passed every hard filter"}
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {report.considered} products with verified data · {report.passed} passed all filters · {report.stats.sourcesRead} sources read live, {report.stats.sourcesFromCache} from cache · generated {fmtDate(report.generatedAt)}
          </p>
        </div>
        {runId && (
          <div className="flex gap-2">
            <a href={`/api/report?runId=${runId}&format=pdf`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800">Export PDF</a>
            <a href={`/api/report?runId=${runId}&format=docx`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800">Export DOCX</a>
          </div>
        )}
      </div>

      {report.notes.length > 0 && (
        <ul className="list-disc space-y-0.5 rounded-lg bg-slate-100 py-2 pl-7 pr-3 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {report.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}

      {onFollowUp && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const t = text.trim();
            if (!t || followUpBusy) return;
            setText("");
            await onFollowUp(t);
          }}
          className="flex gap-2"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            aria-label="Refine the results"
            placeholder="Refine: “drop anything with a lien”, “only under 24 months”, “no personal guarantee”…"
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-600 dark:bg-slate-950"
          />
          <button type="submit" disabled={followUpBusy || !text.trim()} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
            {followUpBusy ? "Re-ranking…" : "Re-rank"}
          </button>
        </form>
      )}
      {followUpNote && <p role="status" className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:bg-sky-950/40 dark:text-sky-100">{followUpNote}</p>}
      {report.followUps.length > 0 && (
        <p className="text-xs text-slate-600 dark:text-slate-300">
          <strong>Active filters:</strong> {report.followUps.flatMap((f) => f.applied).join(" · ") || "none"}
        </p>
      )}

      <div className="grid gap-4">
        {report.items.map((it) => (
          <ResultCard key={`${it.lenderSlug}-${it.productName}`} item={it} onRefresh={onRefresh} refreshing={refreshingSlug === it.lenderSlug} />
        ))}
      </div>

      {report.items.length > 0 && (
        <div className="grid gap-2">
          <h3 className="text-base font-semibold">Comparison table</h3>
          <ComparisonTable items={report.items} />
        </div>
      )}

      {report.nearMisses.length > 0 && (
        <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="text-base font-semibold">Near misses — what you&apos;d need to change</h3>
          <ul className="grid gap-3">
            {report.nearMisses.map((n) => (
              <li key={`${n.lenderName}-${n.productName}`} className="text-sm">
                <p className="font-medium">{n.lenderName} — {n.productName} <span className="text-xs font-normal text-slate-500">({n.typeLabel}, {n.category})</span></p>
                <ul className="list-disc pl-5 text-slate-700 dark:text-slate-200">{n.fixes.map((f) => <li key={f}>{f}</li>)}</ul>
                <p className="text-xs text-slate-500">Source: <a className="text-blue-700 underline dark:text-blue-300" href={n.sourceUrl} target="_blank" rel="noopener noreferrer">{n.sourceUrl}</a> · scraped {fmtDate(n.scrapedAt)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {unavailable.length > 0 && (
        <details className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-sm dark:border-amber-500/30 dark:bg-amber-950/20">
          <summary className="cursor-pointer font-semibold">{unavailable.length} lender{unavailable.length === 1 ? "" : "s"} with data unavailable (nothing was guessed)</summary>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
            {unavailable.map((l) => <li key={l.slug}><strong>{l.name}</strong>: {l.reason ?? "no usable data"}</li>)}
          </ul>
        </details>
      )}

      <HowIDecided report={report} />
      <Disclaimer />
    </section>
  );
}
