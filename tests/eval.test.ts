import { describe, expect, it } from "vitest";
import { PERSONAS } from "@/lib/eval/personas";
import { fixtureProducts, FIXTURE_NOTICE } from "@/lib/eval/fixtures";
import { evaluatePersona, oracleViolations, shortfallText, type LoadedProducts } from "@/lib/eval/run";
import { auditReport } from "@/lib/eval/audit";
import { rankProducts } from "@/lib/matching/rank";
import { emptyProfile } from "@/lib/profile/schema";
import { normalizeProfile } from "@/lib/profile/normalize";

const now = new Date("2026-10-05T12:00:00Z");
const products = fixtureProducts(now);

describe("evaluation personas on the synthetic catalog (offline, deterministic)", () => {
  it("the catalog is clearly synthetic and spans every gate-relevant dimension", () => {
    expect(FIXTURE_NOTICE).toMatch(/SYNTHETIC/);
    expect(products.length).toBeGreaterThanOrEqual(30);
    for (const p of products) {
      expect(p.record.sourceUrl).toMatch(/^https:\/\/fixtures\.example\//);
      expect(p.lender.name).toMatch(/^Fixture /); // never a real lender name next to invented numbers
    }
    const types = new Set(products.map((p) => p.record.productType));
    for (const t of ["term_loan", "line_of_credit", "sba_7a", "sba_504", "microloan", "equipment", "invoice_factoring", "mca", "business_card", "personal_loan", "commercial_real_estate"]) expect(types.has(t as never), t).toBe(true);
    expect(new Set(products.map((p) => p.lender.category))).toEqual(new Set(["SBA", "Conventional", "Alternative"]));
  });

  for (const persona of PERSONAS) {
    it(`${persona.id}: extraction ok, no unsourced claims, engine == oracle, persona checks pass`, async () => {
      const o = await evaluatePersona({ persona, products, client: null, now });
      expect(o.extractionMismatches).toEqual([]);
      expect(o.missingRequired).toEqual([]);
      expect(o.flags, JSON.stringify(o.flags)).toEqual([]);
      expect(o.oracle).toEqual([]);
      expect(o.personaChecks).toEqual([]);
      expect(o.report.items.length).toBeLessThanOrEqual(10);
      expect(o.report.items.every((i) => i.sourceUrl && i.scrapedAt && i.reasoning.citation.includes(i.sourceUrl))).toBe(true);
      expect(o.report.items[0]?.label ?? "Pink Diamond").toBe("Pink Diamond");
    });
  }

  it("personas get genuinely different results, driven by their facts", async () => {
    const out = await Promise.all(PERSONAS.map((p) => evaluatePersona({ persona: p, products, client: null, now })));
    const tops = out.map((o) => o.report.items[0]?.productName);
    expect(new Set(tops).size).toBeGreaterThanOrEqual(3);
    const startup = out.find((o) => o.persona.id === "startup-580")!;
    expect(startup.report.items.length).toBeLessThan(10); // fewer than 10 -> explained, not padded
    expect(startup.report.notes.join(" ")).toMatch(/fewer than 10/);
    expect(startup.report.nearMisses.length).toBeGreaterThan(0);
    const re = out.find((o) => o.persona.id === "re-investor")!;
    expect(re.report.items.every((i) => ["commercial_real_estate", "sba_7a", "sba_504", "term_loan"].includes(i.productType))).toBe(true);
  });

  it("the independent oracle really detects ineligible products (it is not a rubber stamp)", () => {
    const p = normalizeProfile({ ...emptyProfile(), amountNeeded: 35000, purpose: "working_capital", ficoMin: 580, ficoMax: 580, timeInBusinessMonths: 0, monthlyRevenue: 0, businessState: "AZ" });
    const sba = products.find((x) => x.record.productName === "SBA 7(a) Loan")!;
    expect(oracleViolations(p, sba).join(" ")).toMatch(/FICO below minimum/);
    expect(oracleViolations(p, sba).join(" ")).toMatch(/time in business below minimum/);
    const desert = products.find((x) => x.record.productName === "Desert Startup Loan")!;
    expect(oracleViolations(p, desert).join(" ")).toMatch(/state AZ excluded/);
    const ok = products.find((x) => x.record.productName === "Startup Personal Loan")!;
    expect(oracleViolations(p, ok)).toEqual([]);
  });

  it("a tampered report is caught by the audit (the zero-flag result is meaningful)", async () => {
    const o = await evaluatePersona({ persona: PERSONAS[1], products, client: null, now });
    const tampered = JSON.parse(JSON.stringify(o.report));
    tampered.items[0].reasoning.whyItFits += " It offers a 1.9% rate.";
    tampered.items[1].sourceUrl = "";
    const flags = auditReport(tampered, { products, profile: o.profile, checkDomains: true });
    expect(flags.length).toBeGreaterThanOrEqual(2);
  });

  it("ranking the catalog is deterministic", () => {
    const p = normalizeProfile({ ...emptyProfile(), amountNeeded: 80000, purpose: "expansion", ficoMin: 700, ficoMax: 700, timeInBusinessMonths: 36, monthlyRevenue: 60000, businessState: "TX", ownerCountry: "US" });
    const a = rankProducts({ profile: p, products, now }).top.map((t) => t.product.id);
    const b = rankProducts({ profile: p, products: [...products].reverse(), now }).top.map((t) => t.product.id);
    expect(a).toEqual(b);
  });
});

describe("oracle mirrors the engine's explicit assumptions", () => {
  it("a card with no published limit is ineligible above the configured ceiling and eligible below it", () => {
    const card = products.find((p) => p.record.productType === "business_card")!;
    const noLimit = { ...card, record: { ...card.record, minAmount: null, maxAmount: null } };
    const big = normalizeProfile({ ...emptyProfile(), amountNeeded: 150000 });
    const small = normalizeProfile({ ...emptyProfile(), amountNeeded: 20000 });
    expect(oracleViolations(big, noLimit).join(" ")).toMatch(/assumed card ceiling/);
    expect(oracleViolations(small, noLimit)).toEqual([]);
  });
});

describe("live-mode plumbing", () => {
  const stats = { sourcesRead: 7, sourcesFromCache: 2, lendersTotal: 3, lendersScanned: 2, lendersCached: 1, lendersUnavailable: 1, discoveredNew: 0, productsFound: products.length, concurrency: 2, startedAt: now.toISOString(), finishedAt: now.toISOString() };
  const outcomes: LoadedProducts["outcomes"] = [
    { slug: "fixture-a", name: "Fixture A", status: "scraped", products: 2, sourcesRead: 3, dataAgeDays: 0 },
    { slug: "fixture-b", name: "Fixture B", status: "unavailable", products: 0, reason: "No usable product data found on 3 page(s) read.", sourcesRead: 3, dataAgeDays: null },
    { slug: "fixture-c", name: "Fixture C", status: "cached", products: 1, sourcesRead: 0, dataAgeDays: 2 },
  ];

  it("keeps the pipeline's per-lender outcomes and real source counts in the report", async () => {
    const o = await evaluatePersona({ persona: PERSONAS[1], products: [], client: null, now, loadProducts: async () => ({ products, outcomes, stats }) });
    expect(o.lenderOutcomes).toHaveLength(3);
    expect(o.report.lenders.map((l) => l.status)).toEqual(expect.arrayContaining(["scraped", "unavailable", "cached"]));
    expect(o.report.lenders.find((l) => l.slug === "fixture-b")?.reason).toMatch(/No usable product data/);
    expect(o.report.stats).toMatchObject({ sourcesRead: 7, sourcesFromCache: 2, lendersTotal: 3 });
  });

  it("a plain product array (fixtures) still works and has no lender outcomes", async () => {
    const o = await evaluatePersona({ persona: PERSONAS[1], products: [], client: null, now, loadProducts: async () => products });
    expect(o.lenderOutcomes).toEqual([]);
  });

  it("explains a short list from the engine's notes, never with an empty string", () => {
    expect(shortfallText({ items: new Array(10).fill(0) as never, notes: [] })).toBe("");
    expect(shortfallText({ items: new Array(6).fill(0) as never, notes: ["14 products from 5 lenders…", "Only 6 products passed the hard filters, so fewer than 10 are shown."] })).toMatch(/fewer than 10 — Only 6 products passed/);
    expect(shortfallText({ items: new Array(8).fill(0) as never, notes: ["At most 2 products per lender are shown; 3 further passing products were held back."] })).toMatch(/At most 2 products per lender/);
    const none = shortfallText({ items: new Array(4).fill(0) as never, notes: [] });
    expect(none).not.toMatch(/: \)/);
    expect(none).toMatch(/lender coverage/);
  });
});
