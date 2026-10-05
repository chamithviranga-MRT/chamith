import { describe, expect, it } from "vitest";
import { PERSONAS } from "@/lib/eval/personas";
import { fixtureProducts, FIXTURE_NOTICE } from "@/lib/eval/fixtures";
import { evaluatePersona, oracleViolations } from "@/lib/eval/run";
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
