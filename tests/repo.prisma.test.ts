import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { PrismaRepo } from "@/lib/firecrawl/repo";
import { loadRegistry } from "@/lib/firecrawl/registry";
import { ExtractedProductSchema, type ProductRecord } from "@/lib/firecrawl/productSchema";
import { CACHE_TTL_MS } from "@/lib/config";

const SLUG = `itest-${Date.now()}`;
const blank = Object.fromEntries(Object.keys(ExtractedProductSchema.shape).map((k) => [k, ["excludedStates", "excludedCountries", "eligiblePurposes"].includes(k) ? [] : null]));
const rec = (name: string, url = "https://itest.example/loans"): ProductRecord =>
  ({ ...blank, productName: name, productType: "term_loan", minAmount: 5000, lenderSlug: SLUG, lenderName: "ITest", sourceUrl: url, scrapedAt: new Date().toISOString(), unverifiedFields: [] }) as unknown as ProductRecord;

const repo = new PrismaRepo();
let dbUp = true;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`select 1`;
  } catch {
    dbUp = false;
  }
});
afterAll(async () => {
  if (dbUp) {
    await prisma.lender.deleteMany({ where: { slug: SLUG } });
    await prisma.robotsCache.deleteMany({ where: { host: `${SLUG}.example` } });
    await prisma.pageFetch.deleteMany({ where: { url: { contains: SLUG } } });
  }
  await prisma.$disconnect();
});

describe("PrismaRepo (real Postgres)", () => {
  it("seed registry loads 25 unique lenders across the four spec groups", () => {
    const reg = loadRegistry();
    expect(reg).toHaveLength(25);
    expect(new Set(reg.map((r) => r.slug)).size).toBe(25);
    const groups = new Set(reg.flatMap((r) => r.groups));
    expect([...groups].sort()).toEqual(["Alternative and direct", "Conventional", "Personal loans usable for startups", "SBA"]);
    for (const name of ["Live Oak Bank", "Newtek", "Wells Fargo", "U.S. Bank", "TD Bank", "Lendio", "Chase", "Bank of America", "Citi", "PNC", "Capital One", "BHG Financial", "SoFi", "Bluevine", "OnDeck", "Funding Circle", "Credibly", "National Funding", "iBusiness Funding", "Upstart", "Prosper", "LightStream"]) {
      expect(reg.some((r) => r.name.startsWith(name)), name).toBe(true);
    }
    expect(reg.find((r) => r.slug === "sofi")!.groups).toEqual(["Alternative and direct", "Personal loans usable for startups"]);
  });

  it("upserts a lender idempotently and never clobbers a located domain or scan status", async (ctx) => {
    if (!dbUp) return ctx.skip();
    const input = { slug: SLUG, name: "ITest", category: "Alternative" as const, groups: ["Discovered"], domain: null, hints: ["loan"], searchQuery: "itest", source: "seed" as const, reliability: 60, isMarketplace: false };
    const a = await repo.upsertLender(input);
    await repo.updateLender(a.id, { domain: "itest.example", status: "ok" });
    const b = await repo.upsertLender({ ...input, name: "ITest Renamed", domain: null });
    expect(b.id).toBe(a.id);
    expect(b).toMatchObject({ name: "ITest Renamed", domain: "itest.example", status: "ok" });
    expect((await repo.listLenders()).filter((l) => l.slug === SLUG)).toHaveLength(1);
  });

  it("stores products with a 7-day TTL, replaces on refresh, and reads them back validated", async (ctx) => {
    if (!dbUp) return ctx.skip();
    const l = (await repo.listLenders()).find((x) => x.slug === SLUG)!;
    const t0 = new Date("2026-10-01T00:00:00Z");
    await repo.replaceProducts(l.id, [rec("Loan A"), rec("Loan B", "https://itest.example/other")], t0, CACHE_TTL_MS);
    let got = await repo.productsForLender(l.id);
    expect(got.map((p) => p.record.productName).sort()).toEqual(["Loan A", "Loan B"]);
    expect(got[0].expiresAt.getTime() - got[0].scrapedAt.getTime()).toBe(7 * 24 * 3600 * 1000);
    expect(got[0].lender.slug).toBe(SLUG);

    await repo.replaceProducts(l.id, [rec("Loan C")], new Date("2026-10-09T00:00:00Z"), CACHE_TTL_MS);
    got = await repo.productsForLender(l.id);
    expect(got.map((p) => p.record.productName)).toEqual(["Loan C"]); // old rows replaced, not accumulated
  });

  it("robots cache honours its max age", async (ctx) => {
    if (!dbUp) return ctx.skip();
    const host = `${SLUG}.example`;
    const t = new Date("2026-10-01T00:00:00Z");
    await repo.saveRobots(host, "User-agent: *\nDisallow: /x", t);
    expect(await repo.getRobots(host, 24 * 3600_000, new Date("2026-10-01T12:00:00Z"))).toMatch(/Disallow/);
    expect(await repo.getRobots(host, 24 * 3600_000, new Date("2026-10-02T12:00:00Z"))).toBeNull();
  });

  it("records page fetch outcomes", async (ctx) => {
    if (!dbUp) return ctx.skip();
    const l = (await repo.listLenders()).find((x) => x.slug === SLUG)!;
    await repo.recordPage(`https://itest.example/${SLUG}`, l.id, "error", 0, "timeout");
    await repo.recordPage(`https://itest.example/${SLUG}`, l.id, "ok", 2);
    const rows = await prisma.pageFetch.findMany({ where: { url: { contains: SLUG } } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "ok", productCount: 2, error: null });
  });
});
