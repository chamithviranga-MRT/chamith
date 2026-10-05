import { describe, expect, it } from "vitest";
import { runPipeline, type ProgressEvent } from "@/lib/firecrawl/pipeline";
import { MemoryRepo } from "@/lib/firecrawl/repo";
import { WebError, type PageResult, type WebClient } from "@/lib/firecrawl/client";
import type { LinkHit } from "@/lib/firecrawl/urls";
import type { LenderInput } from "@/lib/types";
import { ExtractedProductSchema, type ExtractedProduct } from "@/lib/firecrawl/productSchema";
import { emptyProfile } from "@/lib/profile/schema";
import { normalizeProfile } from "@/lib/profile/normalize";

const blank = (): ExtractedProduct =>
  Object.fromEntries(Object.keys(ExtractedProductSchema.shape).map((k) => [k, ["excludedStates", "excludedCountries", "eligiblePurposes"].includes(k) ? [] : null])) as unknown as ExtractedProduct;

/** A page whose markdown contains every number the JSON claims, unless `lie` overrides one. */
function page(name: string, over: Partial<ExtractedProduct> = {}, extraText = ""): PageResult {
  const p = { ...blank(), productName: name, productType: "term_loan" as const, minAmount: 10000, maxAmount: 250000, aprMin: 9.5, aprMax: 22, termMinMonths: 12, termMaxMonths: 60, minFico: 640, ...over };
  const md = `# ${name}\nBorrow $10,000 to $250,000 over 12 to 60 months. Rates 9.5% to 22% APR. Minimum 640 FICO. ${extraText}`;
  return { url: "", markdown: md, json: { products: [p] } };
}

class FakeWeb implements WebClient {
  scrapes: string[] = [];
  searches: string[] = [];
  maps: string[] = [];
  inflight = 0;
  maxInflight = 0;
  failures = new Map<string, number>(); // url -> remaining failures before success
  constructor(
    public pages: Record<string, PageResult | Error>,
    public opts: { concurrency?: number; searchHits?: Record<string, LinkHit[]>; robots?: Record<string, string>; delay?: number } = {}
  ) {}
  async search(q: string): Promise<LinkHit[]> {
    this.searches.push(q);
    for (const [k, hits] of Object.entries(this.opts.searchHits ?? {})) if (q.includes(k)) return hits;
    return [];
  }
  async map(url: string): Promise<LinkHit[]> {
    this.maps.push(url);
    const host = new URL(url).hostname;
    return Object.keys(this.pages).filter((u) => new URL(u).hostname === host || new URL(u).hostname === `www.${host}`).map((u) => ({ url: u }));
  }
  async scrapeProducts(url: string): Promise<PageResult> {
    this.scrapes.push(url);
    this.inflight++;
    this.maxInflight = Math.max(this.maxInflight, this.inflight);
    try {
      await new Promise((r) => setTimeout(r, this.opts.delay ?? 2));
      const left = this.failures.get(url) ?? 0;
      if (left > 0) {
        this.failures.set(url, left - 1);
        throw new WebError("timeout", 504);
      }
      const p = this.pages[url];
      if (!p) throw new WebError("Not found", 404);
      if (p instanceof Error) throw p;
      return { ...p, url };
    } finally {
      this.inflight--;
    }
  }
  async scrapeText(url: string): Promise<string | null> {
    return this.opts.robots?.[new URL(url).hostname] ?? null;
  }
  async availableConcurrency() {
    return this.opts.concurrency ?? 4;
  }
}

const L = (slug: string, domain: string | null, over: Partial<LenderInput> = {}): LenderInput => ({
  slug, name: slug.toUpperCase(), category: "Alternative", groups: ["Alternative and direct"], domain, hints: ["business loan"],
  searchQuery: null, source: "seed", reliability: 70, isMarketplace: false, ...over,
});
const profile = normalizeProfile({ ...emptyProfile(), amountNeeded: 50000, purpose: "working_capital", ficoMin: 680, ficoMax: 680, timeInBusinessMonths: 36, businessState: "TX" });
const noSleep = async () => {};
const run = (web: FakeWeb, repo: MemoryRepo, registry: LenderInput[], extra: Partial<Parameters<typeof runPipeline>[0]> = {}) =>
  runPipeline({ profile, web, repo, registry, sleep: noSleep, discovery: false, ...extra });

describe("research pipeline", () => {
  it("scans lenders in parallel, stores verified products with provenance, streams progress", async () => {
    const web = new FakeWeb({ "https://a.example/business-loans": page("A Loan"), "https://b.example/business-loans": page("B Loan"), "https://c.example/business-loans": page("C Loan") });
    const events: ProgressEvent[] = [];
    const repo = new MemoryRepo();
    const r = await run(web, repo, [L("a", "a.example"), L("b", "b.example"), L("c", "c.example")], { onEvent: (e) => events.push(e) });

    expect(r.products.map((p) => p.record.productName).sort()).toEqual(["A Loan", "B Loan", "C Loan"]);
    expect(r.products[0].record.sourceUrl).toMatch(/^https:\/\/[abc]\.example\/business-loans$/);
    expect(r.stats).toMatchObject({ sourcesRead: 3, lendersScanned: 3, lendersCached: 0, lendersUnavailable: 0 });
    const scanning = events.filter((e): e is Extract<ProgressEvent, { type: "lender" }> => e.type === "lender" && e.status === "scanning").map((e) => e.name);
    expect(scanning.sort()).toEqual(["A", "B", "C"]);
    const lastCounts = [...events].reverse().find((e) => e.type === "counts") as Extract<ProgressEvent, { type: "counts" }>;
    expect(lastCounts).toMatchObject({ sourcesRead: 3, lendersDone: 3, lendersTotal: 3, productsFound: 3 });
  });

  it("applies the lender cap in registry order, whatever order the repo lists lenders in", async () => {
    const slugs = ["a", "b", "c", "d", "e", "f"];
    const pages = Object.fromEntries(slugs.map((s) => [`https://${s}.example/business-loans`, page(`${s.toUpperCase()} Loan`)]));
    const registry = slugs.map((s) => L(s, `${s}.example`));
    // pre-seed the repo so it lists the lenders in reverse order
    const repo = new MemoryRepo();
    for (const l of [...registry].reverse()) await repo.upsertLender(l);
    const web = new FakeWeb(pages);
    const r = await run(web, repo, registry, { maxLenders: 3 });
    expect(r.products.map((p) => p.record.productName).sort()).toEqual(["A Loan", "B Loan", "C Loan"]);
    expect(web.scrapes.some((u) => /\/\/[def]\.example/.test(u))).toBe(false);
  });

  it("never exceeds the concurrency Firecrawl reports", async () => {
    const pages: Record<string, PageResult> = {};
    const reg: LenderInput[] = [];
    for (let i = 0; i < 12; i++) {
      pages[`https://l${i}.example/business-loans`] = page(`L${i} Loan`);
      reg.push(L(`l${i}`, `l${i}.example`));
    }
    const web = new FakeWeb(pages, { concurrency: 3, delay: 8 });
    const r = await run(web, new MemoryRepo(), reg);
    expect(web.maxInflight).toBeLessThanOrEqual(3);
    expect(web.maxInflight).toBeGreaterThan(1); // and it is actually parallel
    expect(r.stats.concurrency).toBe(3);
    expect(r.products).toHaveLength(12);
  });

  it("retries a failed page twice, then succeeds", async () => {
    const web = new FakeWeb({ "https://a.example/business-loans": page("A Loan") });
    web.failures.set("https://a.example/business-loans", 2);
    const r = await run(web, new MemoryRepo(), [L("a", "a.example")]);
    expect(web.scrapes.filter((u) => u.includes("business-loans"))).toHaveLength(3);
    expect(r.products).toHaveLength(1);
  });

  it("after 3 failed attempts marks the lender 'data unavailable' and invents nothing", async () => {
    const web = new FakeWeb({ "https://a.example/business-loans": page("A Loan") });
    web.failures.set("https://a.example/business-loans", 99);
    const repo = new MemoryRepo();
    const r = await run(web, repo, [L("a", "a.example")]);
    expect(web.scrapes.filter((u) => u.includes("business-loans"))).toHaveLength(3);
    expect(r.products).toEqual([]);
    expect(r.outcomes[0]).toMatchObject({ status: "unavailable" });
    expect(r.outcomes[0].reason).toMatch(/failed to load/);
    const lender = (await repo.listLenders())[0];
    expect(lender.status).toBe("data_unavailable");
  });

  it("does not retry a 404", async () => {
    const web = new FakeWeb({ "https://a.example/business-loans": new WebError("gone", 404) });
    await run(web, new MemoryRepo(), [L("a", "a.example")]);
    expect(web.scrapes.filter((u) => u.includes("business-loans"))).toHaveLength(1);
  });

  it("a page that yields no verifiable product marks the lender unavailable", async () => {
    const liar = page("Liar Loan", { maxAmount: 9_999_999, aprMin: 1.1, minFico: 500, minAmount: 77777, aprMax: 3.3, termMinMonths: 5, termMaxMonths: 7 });
    liar.markdown = "Welcome to our site. Apply today for great rates."; // none of the claimed numbers are on the page
    const web = new FakeWeb({ "https://a.example/business-loans": liar });
    const r = await run(web, new MemoryRepo(), [L("a", "a.example")]);
    expect(r.products).toEqual([]);
    expect(r.outcomes[0].reason).toMatch(/No usable product data/);
  });

  it("keeps hallucinated numbers out of stored records", async () => {
    const p = page("A Loan", { maxAmount: 999_000 }); // page says $250,000
    const web = new FakeWeb({ "https://a.example/business-loans": p });
    const r = await run(web, new MemoryRepo(), [L("a", "a.example")]);
    expect(r.products[0].record.maxAmount).toBeNull();
    expect(r.products[0].record.unverifiedFields).toContain("maxAmount");
    expect(r.products[0].record.minAmount).toBe(10000);
  });

  it("caches for 7 days, then re-scrapes; 'refresh this lender' forces a re-scrape", async () => {
    const web = new FakeWeb({ "https://a.example/business-loans": page("A Loan") });
    const repo = new MemoryRepo();
    let t = new Date("2026-10-01T12:00:00Z");
    const now = () => t;
    const reg = [L("a", "a.example")];

    await run(web, repo, reg, { now });
    expect(web.scrapes).toHaveLength(1);

    t = new Date("2026-10-05T12:00:00Z"); // 4 days later: still fresh
    const second = await run(web, repo, reg, { now });
    expect(web.scrapes).toHaveLength(1);
    expect(second.outcomes[0]).toMatchObject({ status: "cached", dataAgeDays: 4 });
    expect(second.stats).toMatchObject({ lendersCached: 1, sourcesFromCache: 1, sourcesRead: 0 });

    const forced = await run(web, repo, reg, { now, forceSlugs: ["a"] });
    expect(web.scrapes).toHaveLength(2);
    expect(forced.outcomes[0].status).toBe("scraped");

    t = new Date("2026-10-13T12:00:00Z"); // 8 days after the forced refresh: expired
    await run(web, repo, reg, { now });
    expect(web.scrapes).toHaveLength(3);
  });

  it("remembers a lender that was read but had nothing usable, so retries do not burn credits; transient failures are not remembered", async () => {
    const empty: PageResult = { url: "", markdown: "# Nothing here", json: { products: [] } };
    const web = new FakeWeb({ "https://a.example/business-loans": empty, "https://b.example/business-loans": page("B Loan") });
    const repo = new MemoryRepo();
    let t = new Date("2026-10-01T00:00:00Z");
    const reg = [L("a", "a.example"), L("b", "b.example")];
    const first = await run(web, repo, reg, { now: () => t });
    expect(first.outcomes.find((o) => o.slug === "a")).toMatchObject({ status: "unavailable" });
    const scrapesAfterFirst = web.scrapes.length;

    t = new Date("2026-10-01T10:00:00Z"); // 10 h later
    const second = await run(web, repo, reg, { now: () => t });
    expect(web.scrapes.filter((u) => u.startsWith("https://a.example"))).toHaveLength(scrapesAfterFirst - web.scrapes.slice(0, scrapesAfterFirst).filter((u) => u.startsWith("https://b.example")).length);
    expect(second.outcomes.find((o) => o.slug === "a")).toMatchObject({ status: "unavailable", sourcesRead: 0 });
    expect(second.outcomes.find((o) => o.slug === "a")!.reason).toMatch(/not retried/);

    const before = web.scrapes.length;
    t = new Date("2026-10-02T12:00:00Z"); // 36 h later: tried again
    await run(web, repo, reg, { now: () => t });
    expect(web.scrapes.slice(before).some((u) => u.startsWith("https://a.example"))).toBe(true);

    // a lender whose pages merely failed to load (network) is retried next time
    const flaky = new FakeWeb({ "https://c.example/business-loans": page("C Loan") });
    flaky.failures.set("https://c.example/business-loans", 99);
    const repo2 = new MemoryRepo();
    const t0 = new Date("2026-10-01T00:00:00Z");
    await run(flaky, repo2, [L("c", "c.example")], { now: () => t0 });
    const n = flaky.scrapes.length;
    await run(flaky, repo2, [L("c", "c.example")], { now: () => new Date(t0.getTime() + 3_600_000) });
    expect(flaky.scrapes.length).toBeGreaterThan(n);
  });

  it("an expired cache is NOT used when the refresh fails (stale data is never ranked)", async () => {
    const web = new FakeWeb({ "https://a.example/business-loans": page("A Loan") });
    const repo = new MemoryRepo();
    let t = new Date("2026-10-01T00:00:00Z");
    await run(web, repo, [L("a", "a.example")], { now: () => t });
    t = new Date("2026-10-20T00:00:00Z");
    web.failures.set("https://a.example/business-loans", 99);
    const r = await run(web, repo, [L("a", "a.example")], { now: () => t });
    expect(r.products).toEqual([]);
    expect(r.outcomes[0]).toMatchObject({ status: "unavailable", dataAgeDays: 19 });
  });

  it("respects robots.txt: disallowed pages are not scraped and the lender is reported as blocked", async () => {
    const web = new FakeWeb(
      { "https://a.example/business-loans": page("A Loan"), "https://b.example/business-loans": page("B Loan") },
      { robots: { "a.example": "User-agent: *\nDisallow: /business-loans" } }
    );
    const r = await run(web, new MemoryRepo(), [L("a", "a.example"), L("b", "b.example")]);
    expect(web.scrapes.some((u) => u.startsWith("https://a.example/business-loans"))).toBe(false);
    expect(r.outcomes.find((o) => o.slug === "a")).toMatchObject({ status: "blocked" });
    expect(r.products.map((p) => p.lender.slug)).toEqual(["b"]);
  });

  it("never reads login / account URLs even if the site map lists them", async () => {
    const web = new FakeWeb({ "https://a.example/business-loans": page("A Loan"), "https://a.example/login": page("Secret"), "https://a.example/my-account/loans": page("Secret 2") });
    await run(web, new MemoryRepo(), [L("a", "a.example")]);
    expect(web.scrapes.join(" ")).not.toMatch(/login|my-account/);
  });

  it("skips login walls found at runtime", async () => {
    const wall: PageResult = { url: "", markdown: "Sign in to continue", json: { products: [] } };
    const web = new FakeWeb({ "https://a.example/business-loans": wall });
    const r = await run(web, new MemoryRepo(), [L("a", "a.example")]);
    expect(r.products).toEqual([]);
    expect(r.outcomes[0].status).toBe("unavailable");
  });

  it("discovers new lenders from profile-driven searches and flags them 'discovered'", async () => {
    const web = new FakeWeb(
      { "https://a.example/business-loans": page("A Loan"), "https://newcdfi.org/microloans": page("CDFI Microloan", { productType: "microloan" }) },
      {
        searchHits: {
          "working capital": [
            { url: "https://www.nerdwallet.com/best-loans", title: "Best loans" },
            { url: "https://newcdfi.org/microloans", title: "New CDFI | Microloans" },
            { url: "https://a.example/business-loans", title: "A" },
          ],
        },
      }
    );
    const repo = new MemoryRepo();
    const events: ProgressEvent[] = [];
    const r = await run(web, repo, [L("a", "a.example")], { discovery: true, onEvent: (e) => events.push(e) });
    expect(web.searches.length).toBeGreaterThan(0);
    expect(events.find((e) => e.type === "discovered")).toMatchObject({ domain: "newcdfi.org" });
    expect(r.stats.discoveredNew).toBe(1);
    const found = r.products.find((p) => p.lender.slug.startsWith("d-"));
    expect(found?.lender).toMatchObject({ source: "discovered", reliability: 40 });
    expect(r.products.some((p) => /nerdwallet/.test(p.record.sourceUrl))).toBe(false);
  });

  it("locates registry lenders that have no domain via search", async () => {
    const web = new FakeWeb({ "https://happen.example/business": page("Happen Loan") }, { searchHits: { "Happen Bank": [{ url: "https://www.nerdwallet.com/x" }, { url: "https://happen.example/business", title: "Happen" }] } });
    const repo = new MemoryRepo();
    const r = await run(web, repo, [L("happen", null, { searchQuery: "Happen Bank business loans" })], { discovery: true });
    expect((await repo.listLenders()).find((l) => l.slug === "happen")?.domain).toBe("happen.example");
    expect(r.products[0].lender.slug).toBe("happen");
  });

  it("a lender whose website cannot be located is 'data unavailable'", async () => {
    const r = await run(new FakeWeb({}), new MemoryRepo(), [L("ghost", null)]);
    expect(r.outcomes[0]).toMatchObject({ status: "unavailable", reason: expect.stringMatching(/locate/) });
  });

  it("a 402 (out of credits) aborts the run with a clear error instead of retrying forever", async () => {
    const web = new FakeWeb({ "https://a.example/business-loans": new WebError("Payment required", 402, true), "https://b.example/business-loans": page("B Loan") }, { concurrency: 1 });
    const r = await run(web, new MemoryRepo(), [L("a", "a.example"), L("b", "b.example")]);
    expect(r.fatalError).toMatch(/402/);
    expect(web.scrapes.filter((u) => u.includes("a.example/business-loans"))).toHaveLength(1);
  });

  it("onlySlugs limits the run to one lender", async () => {
    const web = new FakeWeb({ "https://a.example/business-loans": page("A Loan"), "https://b.example/business-loans": page("B Loan") });
    const r = await run(web, new MemoryRepo(), [L("a", "a.example"), L("b", "b.example")], { onlySlugs: ["b"] });
    expect(r.products.map((p) => p.lender.slug)).toEqual(["b"]);
    expect(web.scrapes.some((u) => u.includes("a.example"))).toBe(false);
  });
});
