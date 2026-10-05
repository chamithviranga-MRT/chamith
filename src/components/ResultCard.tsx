"use client";

import { useState } from "react";
import { COMPONENT_LABEL, COMPONENT_ORDER } from "@/lib/export/text";
import { ageLabel, fmtDate } from "@/lib/report/format";
import type { ReportItem } from "@/lib/report/types";

const CATEGORY_CLS: Record<string, string> = {
  SBA: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
  Conventional: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
  Alternative: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
};

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      <p className="mt-0.5 text-sm leading-relaxed">{children}</p>
    </div>
  );
}

export function ResultCard({ item, onRefresh, refreshing }: { item: ReportItem; onRefresh?: (slug: string) => void; refreshing?: boolean }) {
  const [open, setOpen] = useState(false);
  const diamond = item.label === "Pink Diamond";
  const stale = item.ageDays >= 5;
  return (
    <article className={`rounded-2xl border bg-white p-4 shadow-sm dark:bg-slate-900 ${diamond ? "border-fuchsia-400 ring-1 ring-fuchsia-300/60 dark:border-fuchsia-500" : "border-slate-200 dark:border-slate-700"}`} aria-labelledby={`card-${item.rank}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${diamond ? "badge-pink-diamond" : "badge-gem"}`}>
              {diamond ? "◆ Pink Diamond" : "◇ Gem"} · #{item.rank}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_CLS[item.category]}`}>{item.category}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">{item.typeLabel}</span>
            {item.isMarketplace && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-800 dark:bg-violet-950 dark:text-violet-200">Marketplace</span>}
            {item.lenderSource === "discovered" && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Discovered</span>}
          </div>
          <h3 id={`card-${item.rank}`} className="mt-1.5 text-lg font-semibold leading-tight">
            {item.lenderName} <span className="font-normal text-slate-500">—</span> {item.productName}
          </h3>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold tabular-nums leading-none">{item.score.toFixed(1)}</p>
          <p className="text-[11px] text-slate-500">out of 100</p>
        </div>
      </header>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <Fact label="Amount" value={item.amountRange} />
        <Fact label={item.cost.basis === "factor" ? "Factor rate" : "APR"} value={item.rateRange.replace(/ APR$/, "").replace(/ factor rate$/, "")} />
        <Fact label="Term" value={item.termRange} />
        <Fact label="Speed" value={item.speed} />
      </dl>

      <div className="mt-3 grid gap-3">
        <Block title="Why it fits">{item.reasoning.whyItFits}</Block>
        <Block title="What could block approval">{item.reasoning.couldBlock}</Block>
        <Block title="Estimated monthly payment">{item.reasoning.estimatedPayment}</Block>
        <Block title="Next step">{item.reasoning.nextStep}</Block>
      </div>

      {(item.requirements.length > 0 || item.fees.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[...item.requirements, ...item.fees].map((r) => (
            <span key={r} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {r}
            </span>
          ))}
        </div>
      )}

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-xs dark:border-slate-700">
        <p className="min-w-0 break-words">
          <span className="text-slate-500">Source: </span>
          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline decoration-dotted underline-offset-2 hover:decoration-solid dark:text-blue-300">
            {item.sourceUrl}
          </a>
        </p>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 ${stale ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`} title={`Scraped ${fmtDate(item.scrapedAt)}`}>
            Data scraped {fmtDate(item.scrapedAt)} · {ageLabel(item.ageDays)}
          </span>
          {onRefresh && (
            <button type="button" disabled={refreshing} onClick={() => onRefresh(item.lenderSlug)} className="rounded-md border border-slate-300 px-2 py-1 font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800">
              {refreshing ? "Refreshing…" : "Refresh this lender"}
            </button>
          )}
        </div>
      </footer>

      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-3 text-xs font-medium text-indigo-700 hover:underline dark:text-indigo-300">
        {open ? "Hide" : "Show"} score breakdown, formula and assumptions
      </button>
      {open && (
        <div className="mt-2 grid gap-3 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
          <div>
            <p className="mb-1 font-semibold">Score breakdown (component 0–100 × weight)</p>
            <ul className="grid gap-1">
              {COMPONENT_ORDER.map((k) => (
                <li key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <div>
                    <div className="flex justify-between"><span>{COMPONENT_LABEL[k]}</span><span className="tabular-nums">{item.breakdown[k].toFixed(0)} → {item.weighted[k].toFixed(1)} pts</span></div>
                    <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${item.breakdown[k]}%` }} /></div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold">Formula</p>
            <p>{item.cost.formula}</p>
          </div>
          <div>
            <p className="font-semibold">Assumptions (all figures are estimates)</p>
            <ul className="list-disc space-y-0.5 pl-4">{item.cost.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
          </div>
          {item.risks.length > 0 && (
            <div>
              <p className="font-semibold">All flags</p>
              <ul className="list-disc space-y-0.5 pl-4">{item.risks.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          )}
          {item.evidenceQuote && (
            <div>
              <p className="font-semibold">Verbatim excerpt from the source page</p>
              <blockquote className="border-l-2 border-slate-300 pl-2 italic text-slate-600 dark:text-slate-300">“{item.evidenceQuote}”</blockquote>
            </div>
          )}
          <p className="text-slate-500">Reasoning written by {item.reasoning.source === "claude" ? "Claude from verified fields only; every number was checked against the data" : "a template from verified fields only"}. Sources are added by code.</p>
        </div>
      )}
    </article>
  );
}
