/**
 * In-browser stand-in for the six /api routes, so the REAL UI (src/components/*) runs from a single HTML file.
 * It uses the real engine (profile extraction, hard filters, scoring, cost math, verified reasoning, follow-up
 * re-ranking, DOCX/PDF export) on a frozen snapshot of live-scraped lender data. It cannot browse the web or call
 * Claude, and it says so. Nothing leaves the browser.
 */
import { z } from "zod";
import { emptyProfile, ProfileSchema, type Profile } from "@/lib/profile/schema";
import { applyCardEdits, missingRequired, normalizeProfile, validateProfile } from "@/lib/profile/normalize";
import { processUserMessage } from "@/lib/profile/process";
import { generateReport } from "@/lib/report/generate";
import { parseFollowUp } from "@/lib/followup/intent";
import { rerank } from "@/lib/followup/rerank";
import { buildDocx } from "@/lib/export/docx";
import { renderPdf } from "@/lib/export/pdf";
import type { Report } from "@/lib/report/types";
import type { LenderRow, StoredProduct } from "@/lib/types";
import type { LenderOutcome } from "@/lib/firecrawl/pipeline";
import { Packer } from "docx";

export interface Snapshot {
  exportedAt: string;
  lenders: Array<Omit<LenderRow, "lastScrapedAt"> & { lastScrapedAt: string | null }>;
  products: Array<{ id: string; lenderSlug: string; record: StoredProduct["record"]; scrapedAt: string; expiresAt: string }>;
}

const Edits = ProfileSchema.omit({ assumptions: true }).partial().strict();
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const AGE = (from: Date, now: Date) => Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86_400_000));

/**
 * src/lib/export/pdf.ts joins its chunks with Buffer.concat. That is the only Node API it needs, so provide it just for
 * the duration of the call: a global Buffer would make the zip library (DOCX) believe it is running on Node.
 */
async function withConcatShim<T>(fn: () => Promise<T>): Promise<T> {
  const g = globalThis as unknown as { Buffer?: unknown };
  const had = "Buffer" in g;
  g.Buffer = {
    concat(list: Uint8Array[]) {
      const out = new Uint8Array(list.reduce((n, c) => n + c.length, 0));
      let o = 0;
      for (const c of list) { out.set(c, o); o += c.length; }
      return out;
    },
  };
  try { return await fn(); } finally { if (!had) delete g.Buffer; }
}

export function snapshotAgeDays(snap: Snapshot, now = new Date()): number {
  return AGE(new Date(snap.exportedAt), now);
}

export function installDemoBackend(snap: Snapshot) {
  const lenders: LenderRow[] = snap.lenders.map((l) => ({ ...l, lastScrapedAt: l.lastScrapedAt ? new Date(l.lastScrapedAt) : null }));
  const bySlug = new Map(lenders.map((l) => [l.slug, l]));
  const products: StoredProduct[] = snap.products.map((p) => ({ id: p.id, lender: bySlug.get(p.lenderSlug)!, record: p.record, scrapedAt: new Date(p.scrapedAt), expiresAt: new Date(p.expiresAt) }));

  let messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  let profile: Profile = emptyProfile();
  let confirmed = false;
  let runs = new Map<string, Report>();
  let runSeq = 0;
  let lastRunId: string | null = null;
  const reset = () => {
    messages = []; profile = emptyProfile(); confirmed = false; runs = new Map(); lastRunId = null;
  };

  const outcomesFor = (now: Date): LenderOutcome[] =>
    lenders.map((l) => {
      const mine = products.filter((p) => p.lender.slug === l.slug);
      return mine.length
        ? { slug: l.slug, name: l.name, status: "cached" as const, products: mine.length, sourcesRead: 0, dataAgeDays: AGE(mine[0].scrapedAt, now) }
        : { slug: l.slug, name: l.name, status: l.status === "blocked_robots" ? ("blocked" as const) : ("unavailable" as const), products: 0, reason: l.statusReason ?? "Not scanned in this snapshot.", sourcesRead: 0, dataAgeDays: null };
    });
  const statsFor = () => ({
    sourcesRead: 0,
    sourcesFromCache: new Set(products.map((p) => p.record.sourceUrl)).size,
    lendersTotal: lenders.length,
    discoveredNew: 0,
    productsFound: products.length,
  });

  const handlers: Record<string, (init?: RequestInit, url?: URL) => Promise<Response>> = {
    "GET /api/session": async () =>
      json({
        sessionId: "demo", messages,
        profile: confirmed || messages.length ? { data: profile, confirmed } : null,
        lastRun: lastRunId ? { id: lastRunId, report: runs.get(lastRunId) } : null,
        capabilities: { anthropic: false, firecrawl: false },
      }),
    "DELETE /api/session": async () => (reset(), json({ deleted: true })),

    "POST /api/chat": async (init) => {
      const { message } = z.object({ message: z.string().trim().min(1).max(4000) }).parse(JSON.parse(String(init?.body)));
      const last = [...messages].reverse().find((m) => m.role === "assistant")?.content ?? null;
      const r = await processUserMessage({ text: message, current: profile, lastAssistant: last, extractor: null });
      messages.push({ role: "user", content: r.redactedText }, { role: "assistant", content: r.reply });
      profile = r.profile;
      confirmed = false;
      return json({ reply: r.reply, profile: r.profile, missing: r.missing, questions: r.questions, ready: r.missing.length === 0, mode: r.mode, redactions: r.redactions });
    },

    "PUT /api/profile": async (init) => {
      const body = z.object({ edits: Edits.default({}), confirm: z.boolean().default(false) }).safeParse(JSON.parse(String(init?.body)));
      if (!body.success) return json({ error: "Invalid request" }, 400);
      const edited = normalizeProfile(applyCardEdits(profile, body.data.edits));
      const issues = validateProfile(edited);
      if (issues.length) return json({ error: "Some values are out of range", issues }, 422);
      const missing = missingRequired(edited);
      if (body.data.confirm && missing.length) return json({ error: "Required fields are still missing", missing }, 422);
      profile = edited;
      confirmed = body.data.confirm;
      return json({ profile: edited, missing, confirmed });
    },

    "POST /api/research": async () => {
      if (!confirmed || missingRequired(profile).length) return json({ error: "Confirm your profile before starting research." }, 409);
      const now = new Date();
      const runId = `demo-${++runSeq}`;
      const outcomes = outcomesFor(now);
      const enc = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(c) {
          const send = (event: string, data: unknown) => c.enqueue(enc.encode(JSON.stringify({ event, data }) + "\n"));
          try {
            send("run", { runId });
            send("stage", { type: "stage", stage: "registry", message: "Loading the saved snapshot of lender data (this offline demo cannot browse the web)…" });
            await sleep(250);
            send("stage", { type: "stage", stage: "scanning", message: `Reading ${lenders.length} lenders from the snapshot…` });
            let done = 0, productsFound = 0, urls = 0;
            for (const o of outcomes) {
              send("lender", { type: "lender", slug: o.slug, name: o.name, status: "scanning" });
              await sleep(70);
              if (o.status === "cached") {
                productsFound += o.products;
                urls += new Set(products.filter((p) => p.lender.slug === o.slug).map((p) => p.record.sourceUrl)).size;
                send("lender", { type: "lender", slug: o.slug, name: o.name, status: "cached", products: o.products });
              } else send("lender", { type: "lender", slug: o.slug, name: o.name, status: o.status, reason: o.reason });
              done++;
              send("counts", { type: "counts", sourcesRead: 0, sourcesFromCache: urls, lendersDone: done, lendersTotal: lenders.length, productsFound });
              await sleep(40);
            }
            send("pipeline_done", { stats: statsFor(), outcomes });
            send("stage", { type: "stage", stage: "ranking", message: "Scoring every product and writing verified reasoning…" });
            const report = await generateReport({ profile, products, outcomes, stats: statsFor(), client: null, now });
            runs.set(runId, report);
            lastRunId = runId;
            send("report", { runId, report });
          } catch (e) {
            send("error", { message: e instanceof Error ? e.message : "Unexpected error" });
          } finally {
            c.close();
          }
        },
      });
      return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8" } });
    },

    "POST /api/rerank": async (init) => {
      const body = z.object({ message: z.string().trim().min(1).max(500).optional(), refreshSlug: z.string().optional() }).parse(JSON.parse(String(init?.body)));
      const prev = lastRunId ? runs.get(lastRunId) : undefined;
      if (!prev) return json({ error: "Run the research first, then refine the results." }, 409);
      if (body.refreshSlug) return json({ error: "Refreshing a lender needs live web access (Firecrawl), which this offline demo does not have. Run the full app to refresh a lender." }, 503);
      const now = new Date();
      const slugs = new Set(prev.lenders.map((l) => l.slug));
      const pool = products.filter((p) => slugs.has(p.lender.slug));
      const { intent, by } = await parseFollowUp(body.message!, { knownLenders: prev.lenders.map((l) => l.name), client: null });
      const result = await rerank({ prev, products: pool, message: body.message!, intent, client: null, now });
      if (!result.changed) return json({ runId: lastRunId, report: prev, note: result.note, changed: false, parsedBy: by });
      if (JSON.stringify(result.profile) !== JSON.stringify(prev.profile)) { profile = result.profile; confirmed = true; }
      const runId = `demo-${++runSeq}`;
      runs.set(runId, result.report);
      lastRunId = runId;
      return json({ runId, report: result.report, note: result.note, changed: true, parsedBy: by });
    },
  };

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
    if (!url.pathname.startsWith("/api/") && !/\/api\/[a-z]+$/.test(url.pathname)) return realFetch(input, init);
    const path = "/api/" + url.pathname.split("/api/")[1];
    const h = handlers[`${(init?.method ?? "GET").toUpperCase()} ${path}`];
    if (!h) return json({ error: "Not available in the offline demo." }, 404);
    try {
      return await h(init, url);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
    }
  };

  // Export links point at /api/report; build the file in the browser instead of navigating.
  const download = (blob: Blob, name: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
  document.addEventListener("click", async (e) => {
    const a = (e.target as HTMLElement | null)?.closest?.("a[href*='/api/report']") as HTMLAnchorElement | null;
    if (!a) return;
    e.preventDefault();
    const u = new URL(a.href);
    const report = runs.get(u.searchParams.get("runId") ?? "");
    const format = u.searchParams.get("format");
    if (!report) return;
    const stamp = report.generatedAt.slice(0, 10);
    try {
      if (format === "docx") download(await Packer.toBlob(buildDocx(report)), `lendmatch-report-${stamp}.docx`);
      else download(new Blob([new Uint8Array(await withConcatShim(() => renderPdf(report)))], { type: "application/pdf" }), `lendmatch-report-${stamp}.pdf`);
    } catch (err) {
      alert(`Could not build the ${format?.toUpperCase()} in the browser: ${err instanceof Error ? err.message : err}`);
    }
  });
}
