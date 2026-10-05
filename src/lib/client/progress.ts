export type LenderState = {
  slug: string;
  name: string;
  status: "scanning" | "cached" | "done" | "unavailable" | "blocked";
  products?: number;
  reason?: string;
};

export interface ProgressState {
  stage: string;
  lenders: LenderState[];
  discovered: Array<{ name: string; domain: string }>;
  sourcesRead: number;
  sourcesFromCache: number;
  lendersDone: number;
  lendersTotal: number;
  productsFound: number;
  error: string | null;
  finished: boolean;
}

export const initialProgress: ProgressState = {
  stage: "Starting…", lenders: [], discovered: [], sourcesRead: 0, sourcesFromCache: 0, lendersDone: 0, lendersTotal: 0, productsFound: 0, error: null, finished: false,
};

/** Folds one stream event into the progress state (pure, so it is unit-testable). */
export function progressReducer(s: ProgressState, ev: { event: string; data: any }): ProgressState {
  const d = ev.data ?? {};
  switch (ev.event) {
    case "stage":
      return { ...s, stage: String(d.message ?? s.stage) };
    case "discovered":
      return { ...s, discovered: s.discovered.some((x) => x.domain === d.domain) ? s.discovered : [...s.discovered, { name: d.name, domain: d.domain }] };
    case "lender": {
      const next: LenderState = { slug: d.slug, name: d.name, status: d.status, products: d.products, reason: d.reason };
      const i = s.lenders.findIndex((l) => l.slug === d.slug);
      const lenders = i >= 0 ? s.lenders.map((l, k) => (k === i ? next : l)) : [...s.lenders, next];
      return { ...s, lenders };
    }
    case "counts":
      return { ...s, sourcesRead: d.sourcesRead, sourcesFromCache: d.sourcesFromCache, lendersDone: d.lendersDone, lendersTotal: d.lendersTotal, productsFound: d.productsFound };
    case "pipeline_done":
      return { ...s, finished: true };
    case "error":
      return { ...s, error: String(d.message ?? "Research failed") };
    default:
      return s;
  }
}

/** "Scanning SoFi... BHG Financial... Bluevine..." — the lenders currently being read. */
export function scanningTicker(s: ProgressState, max = 3): string {
  const active = s.lenders.filter((l) => l.status === "scanning").map((l) => l.name);
  if (!active.length) return s.finished ? "Finished scanning." : s.stage;
  const shown = active.slice(-max).map((n) => `${n}...`).join(" ");
  return `Scanning ${shown}${active.length > max ? ` (+${active.length - max} more)` : ""}`;
}
