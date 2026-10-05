import type { Profile } from "@/lib/profile/schema";
import type { LenderInput, LenderRow, StoredProduct } from "@/lib/types";
import { CACHE_TTL_MS, DISCOVERED_RELIABILITY, MAX_LENDERS_PER_RUN, USE_FIRECRAWL_AGENT } from "@/lib/config";
import { isRetryableWebError, toWebError, type WebClient } from "./client";
import { buildDiscoveryQueries, candidatesFromSearch, NON_LENDER_DOMAINS } from "./discovery";
import { EXTRACTION_PROMPT, PageExtractionSchema, pageExtractionJsonSchema, type ProductRecord } from "./productSchema";
import { createLimiter, defaultSleep, runPool, withRetry } from "./pool";
import type { ResearchRepo } from "./repo";
import { isAllowed, parseRobots, type RobotsRules } from "./robots";
import { hostOf, isDeniedUrl, looksLikeLoginWall, rankProductUrls, registrableDomain, sameSite, type LinkHit } from "./urls";
import { toProductRecords } from "./verify";

export type ProgressEvent =
  | { type: "stage"; stage: "registry" | "discovery" | "scanning" | "done"; message: string }
  | { type: "discovered"; name: string; domain: string }
  | { type: "lender"; slug: string; name: string; status: "scanning" | "cached" | "done" | "unavailable" | "blocked"; products?: number; reason?: string }
  | { type: "counts"; sourcesRead: number; sourcesFromCache: number; lendersDone: number; lendersTotal: number; productsFound: number };

export interface LenderOutcome {
  slug: string;
  name: string;
  status: "cached" | "scraped" | "unavailable" | "blocked";
  products: number;
  reason?: string;
  /** Pages read live for this lender in this run. */
  sourcesRead: number;
  dataAgeDays: number | null;
}

export interface PipelineOptions {
  profile: Profile;
  web: WebClient;
  repo: ResearchRepo;
  registry: LenderInput[];
  now?: () => Date;
  ttlMs?: number;
  maxLenders?: number;
  maxDiscovered?: number;
  pagesPerLender?: number;
  discovery?: boolean;
  /** Re-scrape these lenders even if their cache is fresh ("Refresh this lender"). */
  forceSlugs?: string[];
  /** Restrict the run to these lenders (single-lender refresh). */
  onlySlugs?: string[];
  useAgent?: boolean;
  retries?: number;
  onEvent?: (e: ProgressEvent) => void;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}

export interface PipelineResult {
  products: StoredProduct[];
  outcomes: LenderOutcome[];
  stats: {
    sourcesRead: number;
    sourcesFromCache: number;
    lendersTotal: number;
    lendersScanned: number;
    lendersCached: number;
    lendersUnavailable: number;
    discoveredNew: number;
    productsFound: number;
    concurrency: number;
    startedAt: string;
    finishedAt: string;
  };
  fatalError?: string;
}

const ROBOTS_TTL_MS = 24 * 60 * 60 * 1000;
const AGE_DAYS = (from: Date | null, now: Date) => (from ? Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86_400_000)) : null);

export async function runPipeline(o: PipelineOptions): Promise<PipelineResult> {
  const now = o.now ?? (() => new Date());
  const ttl = o.ttlMs ?? CACHE_TTL_MS;
  const emit = (e: ProgressEvent) => o.onEvent?.(e);
  const startedAt = now();
  const sleep = o.sleep ?? defaultSleep;
  const pagesPerLender = o.pagesPerLender ?? 3;
  const force = new Set(o.forceSlugs ?? []);
  const useAgent = o.useAgent ?? USE_FIRECRAWL_AGENT;

  let sourcesRead = 0;
  let sourcesFromCache = 0;
  let productsFound = 0;
  let lendersDone = 0;
  let lendersTotal = 0;
  let discoveredNew = 0;
  let fatalError: string | undefined;
  const outcomes: LenderOutcome[] = [];
  const emitCounts = () => emit({ type: "counts", sourcesRead, sourcesFromCache, lendersDone, lendersTotal, productsFound });

  // ---- 1. registry --------------------------------------------------------------------------
  emit({ type: "stage", stage: "registry", message: "Loading lender registry…" });
  const seeded: LenderRow[] = [];
  for (const r of o.registry) seeded.push(await o.repo.upsertLender(r));

  // ---- 2. concurrency (as reported by Firecrawl) --------------------------------------------
  const concurrency = Math.min(20, Math.max(1, await o.web.availableConcurrency()));
  const limit = createLimiter(concurrency);
  const call = <T>(fn: () => Promise<T>): Promise<T> =>
    limit(() => withRetry(fn, { retries: o.retries ?? 2, shouldRetry: isRetryableWebError, sleep }));
  const guard = <T>(p: Promise<T>): Promise<T> =>
    p.catch((e) => {
      const err = toWebError(e);
      if (err.fatal && !fatalError) fatalError = `Firecrawl rejected the request (${err.status}): ${err.message}`;
      throw err;
    });
  const aborted = () => Boolean(fatalError) || Boolean(o.signal?.aborted);

  // ---- 3. discovery from the profile --------------------------------------------------------
  const seedUrls = new Map<string, string[]>(); // lender slug -> product URLs surfaced by search
  const discoveredThisRun = new Set<string>();
  if (o.discovery !== false && !o.onlySlugs) {
    const queries = buildDiscoveryQueries(o.profile);
    emit({ type: "stage", stage: "discovery", message: `Searching for lenders that fit your profile (${queries.length} searches)…` });
    const hits: LinkHit[] = [];
    await runPool(queries, concurrency, async (q) => {
      if (aborted()) return;
      try {
        const r = await guard(call(() => o.web.search(q, { limit: 8 })));
        sourcesRead++;
        hits.push(...r);
        emitCounts();
      } catch {
        /* a failed search just means fewer discovered lenders */
      }
    });

    // Registry lenders without a known domain are located through search.
    for (const l of seeded.filter((x) => !x.domain && x.searchQuery)) {
      if (aborted()) break;
      try {
        const r = await guard(call(() => o.web.search(l.searchQuery!, { limit: 5 })));
        sourcesRead++;
        const pick = r.find((h) => {
          const d = registrableDomain(h.url);
          return d && !NON_LENDER_DOMAINS.has(d) && h.url.startsWith("https://");
        });
        if (pick) {
          const domain = registrableDomain(pick.url)!;
          l.domain = domain;
          await o.repo.updateLender(l.id, { domain });
          seedUrls.set(l.slug, r.filter((h) => sameSite(h.url, domain)).map((h) => h.url));
        }
      } catch {
        /* handled when the lender is scanned: no domain => data unavailable */
      }
    }

    const known = new Set(seeded.map((l) => (l.domain ? registrableDomain(l.domain) : null)).filter((d): d is string => Boolean(d)));
    for (const c of candidatesFromSearch(hits, known, o.maxDiscovered ?? 10)) {
      const slug = `d-${c.domain.replace(/[^a-z0-9]+/g, "-")}`;
      const row = await o.repo.upsertLender({
        slug, name: c.name, category: c.category, groups: ["Discovered"], domain: c.domain, hints: ["business loan", "financing"],
        searchQuery: null, source: "discovered", reliability: DISCOVERED_RELIABILITY, isMarketplace: false,
      });
      seedUrls.set(slug, c.seedUrls);
      discoveredThisRun.add(slug);
      discoveredNew++;
      emit({ type: "discovered", name: row.name, domain: c.domain });
      seeded.push(row);
    }
  }

  // ---- 4. choose the lenders to cover --------------------------------------------------------
  const all = await o.repo.listLenders();
  const registrySlugs = new Set(o.registry.map((r) => r.slug));
  let lenders = all.filter((l) => registrySlugs.has(l.slug) || discoveredThisRun.has(l.slug));
  // lenders discovered in earlier runs are only reused while their cached data is still fresh
  for (const l of all.filter((x) => x.source === "discovered" && !discoveredThisRun.has(x.slug))) {
    const fresh = (await o.repo.productsForLender(l.id)).some((p) => p.expiresAt > now());
    if (fresh) lenders.push(l);
  }
  if (o.onlySlugs) lenders = lenders.filter((l) => o.onlySlugs!.includes(l.slug));
  lenders = lenders.slice(0, o.maxLenders ?? MAX_LENDERS_PER_RUN);
  lendersTotal = lenders.length;
  emit({ type: "stage", stage: "scanning", message: `Scanning ${lendersTotal} lenders…` });
  emitCounts();

  // ---- 5. robots.txt (cached 24h; never blocks on failure because Firecrawl enforces it too) ---
  const robotsMemo = new Map<string, Promise<RobotsRules | null>>();
  const getRobots = (host: string) => {
    if (!robotsMemo.has(host)) {
      robotsMemo.set(
        host,
        (async () => {
          const cached = await o.repo.getRobots(host, ROBOTS_TTL_MS, now());
          if (cached !== null) return parseRobots(cached);
          try {
            const body = await guard(call(() => o.web.scrapeText(`https://${host}/robots.txt`)));
            await o.repo.saveRobots(host, body ?? "", now());
            return body ? parseRobots(body) : null;
          } catch {
            return null;
          }
        })()
      );
    }
    return robotsMemo.get(host)!;
  };

  const schema = pageExtractionJsonSchema();

  // ---- 6. scan one lender -------------------------------------------------------------------
  const finish = (l: LenderRow, outcome: Omit<LenderOutcome, "slug" | "name">) => {
    outcomes.push({ slug: l.slug, name: l.name, ...outcome });
    lendersDone++;
    emitCounts();
  };

  const scanLender = async (l: LenderRow) => {
    if (aborted()) return;
    const stored = await o.repo.productsForLender(l.id);
    const fresh = stored.filter((p) => p.expiresAt > now());
    if (fresh.length && !force.has(l.slug)) {
      const urls = new Set(fresh.map((p) => p.record.sourceUrl)).size;
      sourcesFromCache += urls;
      productsFound += fresh.length;
      emit({ type: "lender", slug: l.slug, name: l.name, status: "cached", products: fresh.length });
      return finish(l, { status: "cached", products: fresh.length, sourcesRead: 0, dataAgeDays: AGE_DAYS(fresh[0].scrapedAt, now()) });
    }

    const unavailable = async (reason: string, status: "unavailable" | "blocked" = "unavailable") => {
      await o.repo.updateLender(l.id, { status: status === "blocked" ? "blocked_robots" : "data_unavailable", statusReason: reason });
      emit({ type: "lender", slug: l.slug, name: l.name, status, reason });
      finish(l, { status, products: 0, reason, sourcesRead: pageReads, dataAgeDays: AGE_DAYS(stored[0]?.scrapedAt ?? null, now()) });
    };
    let pageReads = 0;

    const domain = l.domain;
    if (!domain) return unavailable("Could not locate the lender's official website.");
    emit({ type: "lender", slug: l.slug, name: l.name, status: "scanning" });

    // candidate product pages: search hits first, then pages found by mapping the site
    const rules = await getRobots(domain);
    const candidates: LinkHit[] = [];
    for (const u of seedUrls.get(l.slug) ?? []) if (sameSite(u, domain) && !isDeniedUrl(u)) candidates.push({ url: u });
    for (const hint of l.hints.slice(0, 2)) {
      if (aborted()) return;
      try {
        candidates.push(...(await guard(call(() => o.web.map(`https://${domain}`, { search: hint, limit: 40 })))));
      } catch {
        /* mapping is best-effort */
      }
    }
    const seedFirst = candidates.filter((c) => (seedUrls.get(l.slug) ?? []).includes(c.url)).slice(0, pagesPerLender);
    let ranked = [...seedFirst, ...rankProductUrls(candidates, domain, l.hints, pagesPerLender)];
    if (!ranked.length && useAgent && o.web.agentFindPages) {
      try {
        const found = await guard(o.web.agentFindPages(domain, `Find pages on ${domain} that describe the business financing or loan products it offers (rates, amounts, terms, eligibility).`));
        ranked = rankProductUrls(found, domain, l.hints, pagesPerLender);
      } catch {
        /* agent is optional */
      }
    }
    if (!ranked.length) ranked = [{ url: `https://${domain}` }];
    const unique = [...new Map(ranked.map((r) => [r.url.replace(/\/+$/, ""), r])).values()].slice(0, pagesPerLender + seedFirst.length);

    const allowed = unique.filter((u) => !rules || isAllowed(rules, u.url));
    for (const u of unique.filter((x) => !allowed.includes(x))) await o.repo.recordPage(u.url, l.id, "blocked_robots", 0);
    if (!allowed.length) return unavailable(`robots.txt on ${domain} disallows reading its product pages, so none were read.`, "blocked");

    const records: ProductRecord[] = [];
    const errors: string[] = [];
    const scrapedAt = now();
    await Promise.all(
      allowed.map(async (u) => {
        if (aborted()) return;
        try {
          const page = await guard(call(() => o.web.scrapeProducts(u.url, { prompt: EXTRACTION_PROMPT, schema })));
          sourcesRead++;
          pageReads++;
          if (looksLikeLoginWall(page.markdown)) {
            await o.repo.recordPage(u.url, l.id, "skipped", 0, "login or bot wall");
            return;
          }
          const parsed = PageExtractionSchema.safeParse(page.json);
          const recs = parsed.success ? toProductRecords(parsed.data.products, page.markdown, { lenderSlug: l.slug, lenderName: l.name, sourceUrl: u.url, scrapedAt }) : [];
          records.push(...recs);
          await o.repo.recordPage(u.url, l.id, recs.length ? "ok" : "empty", recs.length);
        } catch (e) {
          const err = toWebError(e);
          errors.push(`${hostOf(u.url) ?? u.url}: ${err.message.slice(0, 120)}`);
          await o.repo.recordPage(u.url, l.id, "error", 0, err.message);
        } finally {
          emitCounts();
        }
      })
    );
    if (aborted() && !records.length) return;

    // one product can appear on several pages: keep the version with the most verified facts
    const best = new Map<string, ProductRecord>();
    const weight = (r: ProductRecord) => Object.values(r).filter((v) => typeof v === "number" || (typeof v === "string" && v.length)).length - r.unverifiedFields.length;
    for (const r of records) {
      const key = `${r.productType}|${r.productName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
      const cur = best.get(key);
      if (!cur || weight(r) > weight(cur)) best.set(key, r);
    }
    const products = [...best.values()];

    if (!products.length) {
      const reason = errors.length === allowed.length ? `All ${allowed.length} page(s) failed to load (${errors[0]}).` : `No usable product data found on ${allowed.length} page(s) read.`;
      return unavailable(reason);
    }
    await o.repo.replaceProducts(l.id, products, scrapedAt, ttl);
    await o.repo.updateLender(l.id, { status: "ok", statusReason: null, lastScrapedAt: scrapedAt });
    productsFound += products.length;
    emit({ type: "lender", slug: l.slug, name: l.name, status: "done", products: products.length });
    finish(l, { status: "scraped", products: products.length, sourcesRead: pageReads, dataAgeDays: 0 });
  };

  await runPool(lenders, Math.min(8, concurrency * 2), async (l) => {
    try {
      await scanLender(l);
    } catch (e) {
      const reason = toWebError(e).message.slice(0, 160);
      await o.repo.updateLender(l.id, { status: "data_unavailable", statusReason: reason });
      emit({ type: "lender", slug: l.slug, name: l.name, status: "unavailable", reason });
      finish(l, { status: "unavailable", products: 0, reason, sourcesRead: 0, dataAgeDays: null });
    }
  });

  // ---- 7. collect everything that is fresh ---------------------------------------------------
  const products: StoredProduct[] = [];
  for (const l of lenders) {
    for (const p of await o.repo.productsForLender(l.id)) if (p.expiresAt > now()) products.push(p);
  }
  emit({ type: "stage", stage: "done", message: `Read ${sourcesRead} sources live (${sourcesFromCache} from cache) and found ${products.length} products.` });

  return {
    products,
    outcomes,
    stats: {
      sourcesRead, sourcesFromCache, lendersTotal,
      lendersScanned: outcomes.filter((x) => x.status === "scraped").length,
      lendersCached: outcomes.filter((x) => x.status === "cached").length,
      lendersUnavailable: outcomes.filter((x) => x.status === "unavailable" || x.status === "blocked").length,
      discoveredNew, productsFound: products.length, concurrency,
      startedAt: startedAt.toISOString(), finishedAt: now().toISOString(),
    },
    ...(fatalError ? { fatalError } : {}),
  };
}
