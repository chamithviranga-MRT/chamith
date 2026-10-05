"use client";

import { scanningTicker, type LenderState, type ProgressState } from "@/lib/client/progress";

const STATUS: Record<LenderState["status"], { label: string; cls: string; icon: string }> = {
  scanning: { label: "scanning", cls: "border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-500/40 dark:bg-indigo-950/40 dark:text-indigo-100", icon: "◌" },
  cached: { label: "cached", cls: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-950/40 dark:text-sky-100", icon: "◉" },
  done: { label: "done", cls: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-100", icon: "✓" },
  unavailable: { label: "data unavailable", cls: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100", icon: "!" },
  blocked: { label: "blocked by robots.txt", cls: "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-100", icon: "⛔" },
};

export function ProgressPanel({ state }: { state: ProgressState }) {
  const pct = state.lendersTotal ? Math.round((state.lendersDone / state.lendersTotal) * 100) : 0;
  return (
    <section aria-label="Research progress" aria-live="polite" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Researching live lender data</h2>
        <p className="text-sm tabular-nums text-slate-600 dark:text-slate-300">
          <strong className="text-slate-900 dark:text-slate-50">{state.sourcesRead}</strong> sources read
          {state.sourcesFromCache > 0 && <> · {state.sourcesFromCache} from cache</>} · {state.productsFound} products found
        </p>
      </div>
      <p className="mt-2 min-h-[1.5rem] text-sm text-indigo-700 dark:text-indigo-300">{state.error ? "" : scanningTicker(state)}</p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {state.lendersDone} of {state.lendersTotal || "…"} lenders complete
      </p>
      {state.error && (
        <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {state.error}
        </p>
      )}
      {state.discovered.length > 0 && (
        <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
          <strong>Discovered from your profile:</strong> {state.discovered.map((d) => `${d.name} (${d.domain})`).join(", ")}
        </p>
      )}
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {state.lenders.map((l) => {
          const st = STATUS[l.status];
          return (
            <li key={l.slug} title={l.reason ?? undefined} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${st.cls}`}>
              <span aria-hidden className={l.status === "scanning" ? "animate-pulse" : ""}>{st.icon}</span>
              <span className="font-medium">{l.name}</span>
              <span className="opacity-70">· {st.label}{l.products !== undefined && l.status !== "unavailable" ? ` (${l.products})` : ""}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
