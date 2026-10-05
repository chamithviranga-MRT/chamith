import { describe, expect, it } from "vitest";
import { evaluateGates } from "@/lib/matching/gates";
import { rankProducts } from "@/lib/matching/rank";
import { parseScoringConfig, scoringConfig } from "@/lib/matching/config";
import { scoreProduct } from "@/lib/matching/score";
import { estimateCost } from "@/lib/matching/cost";
import { NOW, product, profile } from "./helpers";
import raw from "../config/scoring.json";

const gate = (g: ReturnType<typeof evaluateGates>, id: string) => g.find((x) => x.id === id)!;
const run = (p: ReturnType<typeof profile>, products: ReturnType<typeof product>[], extra = {}) => rankProducts({ profile: p, products, extra, now: NOW });

describe("hard gates", () => {
  const eg = (pOver = {}, prod = {}) => evaluateGates(profile(pOver), product(prod).record, product().lender);

  it("a card with no published limit is borderline for a small request and fails above the editable ceiling, saying it is an assumption", () => {
    const small = gate(eg({ amountNeeded: 20000 }, { productType: "business_card", minAmount: null, maxAmount: null }), "amount");
    expect(small.status).toBe("borderline");
    expect(small.detail).toMatch(/not published/);
    expect(small.fix).toMatch(/issuer/);
    const big = gate(eg({ amountNeeded: 150000 }, { productType: "business_card", minAmount: null, maxAmount: null }), "amount");
    expect(big.status).toBe("fail");
    expect(big.detail).toMatch(/editable assumption, not lender data/);
    expect(big.detail).toMatch(/\$50,000/);
    // a card that does publish a ceiling is still judged against it
    expect(gate(eg({ amountNeeded: 150000 }, { productType: "business_card", minAmount: null, maxAmount: 50000 }), "amount").status).toBe("fail");
    // other products with no published range stay 'unknown'
    expect(gate(eg({ amountNeeded: 150000 }, { productType: "term_loan", minAmount: null, maxAmount: null }), "amount").status).toBe("unknown");
  });

  it("a vehicle-only product fails for equipment, expansion and real estate and passes only for a vehicle purchase", () => {
    const auto = { productName: "Business Advantage Auto Loan", eligiblePurposes: ["vehicle"] as never };
    for (const purpose of ["equipment", "expansion", "real_estate"] as const) expect(gate(eg({ purpose }, auto), "purpose").status).toBe("fail");
    expect(gate(eg({ purpose: "vehicle" }, auto), "purpose").status).toBe("pass");
  });

  it("amount outside range fails with a concrete fix", () => {
    expect(gate(eg({ amountNeeded: 5000 }), "amount")).toMatchObject({ status: "fail", fix: expect.stringMatching(/at least \$10,000/) });
    expect(gate(eg({ amountNeeded: 300000 }), "amount")).toMatchObject({ status: "fail", fix: expect.stringMatching(/\$250,000 or less/) });
    expect(gate(eg(), "amount").status).toBe("pass");
  });
  it("FICO: fail below, borderline when the range straddles, pass above, unknown when unpublished", () => {
    expect(gate(eg({ ficoMin: 560, ficoMax: 600 }, { minFico: 640 }), "fico")).toMatchObject({ status: "fail", fix: expect.stringMatching(/640/) });
    expect(gate(eg({ ficoMin: 620, ficoMax: 680 }, { minFico: 640 }), "fico").status).toBe("borderline");
    expect(gate(eg({ ficoMin: 700, ficoMax: 700 }, { minFico: 640 }), "fico").status).toBe("pass");
    expect(gate(eg({}, { minFico: null }), "fico").status).toBe("unknown");
  });
  it("time in business and revenue minimums", () => {
    expect(gate(eg({ timeInBusinessMonths: 6 }, { minTimeInBusinessMonths: 24 }), "timeInBusiness")).toMatchObject({ status: "fail", fix: expect.stringMatching(/24 months/) });
    expect(gate(eg({ monthlyRevenue: 5000 }, { minAnnualRevenue: 120000 }), "revenue").status).toBe("fail");
    expect(gate(eg({ monthlyRevenue: 20000 }, { minAnnualRevenue: 120000 }), "revenue").status).toBe("pass");
  });
  it("excluded state and country", () => {
    expect(gate(eg({ businessState: "TX" }, { excludedStates: ["TX", "NV"] }), "state").status).toBe("fail");
    expect(gate(eg({ businessState: "OH", ownerState: "OH" }, { excludedStates: ["TX", "NV"] }), "state").status).toBe("pass");
    expect(gate(eg({ ownerCountry: "IN", ownerState: null }, { excludedCountries: ["IN"] }), "country").status).toBe("fail");
  });

  describe("residency rules (non-US owner of a US LLC)", () => {
    const nonUs = { ownerCountry: "IN", ownerState: null, businessCountry: "US", businessState: "DE" };
    it("citizenship-only products fail", () => {
      expect(gate(eg(nonUs, { residencyRule: "us_citizen" }), "residency").status).toBe("fail");
      expect(gate(eg(nonUs, { residencyRule: "citizen_or_permanent_resident" }), "residency").status).toBe("fail");
      expect(gate(eg(nonUs, { residencyRule: "us_resident" }), "residency").status).toBe("fail");
    });
    it("US-address products are flagged clearly, not silently passed", () => {
      const g = gate(eg(nonUs, { residencyRule: "us_business_address" }), "residency");
      expect(g.status).toBe("borderline");
      expect(g.detail).toMatch(/Requires a US address/);
    });
    it("unpublished residency rules are flagged for a non-US owner but not for a US owner", () => {
      expect(gate(eg(nonUs, {}), "residency").status).toBe("borderline");
      expect(gate(eg({}, {}), "residency").status).toBe("unknown");
    });
    it("a US citizen passes citizenship rules; a US business address rule fails for a non-US business", () => {
      expect(gate(eg({ ownerResidency: "us_citizen" }, { residencyRule: "us_citizen" }), "residency").status).toBe("pass");
      expect(gate(eg({ businessCountry: "CA", businessState: null, ownerCountry: "CA" }, { residencyRule: "us_business_address" }), "residency").status).toBe("fail");
    });
  });

  it("purpose and business-use gates", () => {
    expect(gate(eg({ purpose: "real_estate" }, { eligiblePurposes: ["working_capital", "equipment"] }), "purpose").status).toBe("fail");
    expect(gate(eg({ purpose: "equipment" }, { eligiblePurposes: ["working_capital", "equipment"] }), "purpose").status).toBe("pass");
    expect(gate(eg({}, { businessUseAllowed: false }), "businessUse").status).toBe("fail");
    expect(gate(eg({}, { productType: "personal_loan", businessUseAllowed: null }), "businessUse").status).toBe("borderline");
  });
  it("collateral / guarantee / UCC respect what the borrower will accept", () => {
    expect(gate(eg({ collateralAvailable: false }, { collateralRequired: "always" }), "collateral").status).toBe("fail");
    expect(gate(eg({ willingPersonalGuarantee: false }, { personalGuarantee: "required" }), "personalGuarantee").status).toBe("fail");
    expect(gate(eg({ willingPersonalGuarantee: null }, { personalGuarantee: "required" }), "personalGuarantee").status).toBe("borderline");
    expect(gate(eg({ willingUccLien: false }, { uccLien: true }), "uccLien").status).toBe("fail");
    expect(gate(eg({ willingUccLien: true }, { uccLien: true }), "uccLien").status).toBe("pass");
  });
  it("bankruptcy, tax lien and default policies", () => {
    expect(gate(eg({ hasBankruptcy: true, bankruptcyYearsAgo: 3 }, { bankruptcyLookbackYears: 7 }), "bankruptcy")).toMatchObject({ status: "fail", fix: expect.stringMatching(/4 more years/) });
    expect(gate(eg({ hasBankruptcy: true, bankruptcyYearsAgo: 9 }, { bankruptcyLookbackYears: 7 }), "bankruptcy").status).toBe("pass");
    expect(gate(eg({ hasBankruptcy: true }, { bankruptcyLookbackYears: 99 }), "bankruptcy").status).toBe("fail");
    expect(gate(eg({ hasBankruptcy: true }, {}), "bankruptcy").status).toBe("borderline");
    expect(gate(eg({ hasTaxLiens: true }, { taxLiensDisqualify: true }), "taxLiens").status).toBe("fail");
    expect(gate(eg({ recentDefaults: true }, { recentDefaultsDisqualify: true }), "defaults").status).toBe("fail");
    expect(gate(eg({ hasBankruptcy: false }, { bankruptcyLookbackYears: 7 }), "bankruptcy").status).toBe("pass");
  });
});

describe("ranking", () => {
  const A = product({ productName: "Cheap Term Loan", aprMin: 8, aprMax: 10 }, { slug: "a", name: "A Bank", reliability: 85 });
  const B = product({ productName: "Expensive MCA", productType: "mca", aprMin: null, aprMax: null, factorMin: 1.35, factorMax: 1.35, termMinMonths: 6, termMaxMonths: 6 }, { slug: "b", name: "B Capital", reliability: 65 });
  const C = product({ productName: "Needs 720", minFico: 720 }, { slug: "c", name: "C Bank" });
  const D = product({ productName: "Not In Texas", excludedStates: ["TX"] }, { slug: "d", name: "D Lending" });
  const E = product({ productName: "Small Only", maxAmount: 25000 }, { slug: "e", name: "E Funding" });
  const F = product({ productName: "Needs Two Things", minFico: 720, minTimeInBusinessMonths: 60 }, { slug: "f", name: "F Credit" });
  const G = product({ productName: "Fails Three", minFico: 760, minTimeInBusinessMonths: 60, maxAmount: 20000 }, { slug: "g", name: "G Loans" });
  const all = [A, B, C, D, E, F, G];

  it("filters first, then ranks: cheap loan beats a factor-rate advance; labels and categories attached", () => {
    const r = run(profile(), all);
    expect(r.top.map((t) => t.product.record.productName)).toEqual(["Cheap Term Loan", "Expensive MCA"]);
    expect(r.top[0]).toMatchObject({ rank: 1, label: "Pink Diamond", category: "Alternative" });
    expect(r.top[1]).toMatchObject({ rank: 2, label: "Gem" });
    expect(r.top[0].score).toBeGreaterThan(r.top[1].score);
    expect(r.top[0].score).toBeLessThanOrEqual(100);
  });

  it("returns fewer than 10 (never pads) and explains which gates removed the rest", () => {
    const r = run(profile(), all);
    expect(r.top.length).toBeLessThan(10);
    expect(r.passed).toBe(2);
    expect(r.notes.join(" ")).toMatch(/Only 2 products passed the hard filters/);
    expect(r.gateSummary).toMatchObject({ fico: 3, state: 1, amount: 2, timeInBusiness: 2 });
    expect(r.removed.find((x) => x.productName === "Not In Texas")!.failedGates[0]).toMatchObject({ id: "state" });
  });

  it("offers near misses (<=2 failed gates) with exactly what to change, fewest gates first", () => {
    const r = run(profile(), all);
    const names = r.nearMisses.map((n) => n.product.record.productName);
    expect(names).not.toContain("Fails Three");
    expect(names.slice(0, 3).sort()).toEqual(["Needs 720", "Not In Texas", "Small Only"].sort());
    expect(names[names.length - 1]).toBe("Needs Two Things");
    const c = r.nearMisses.find((n) => n.product.record.productName === "Needs 720")!;
    expect(c.fixes[0]).toMatch(/Raise your personal FICO to at least 720/);
    expect(r.nearMisses.find((n) => n.product.record.productName === "Needs Two Things")!.fixes).toHaveLength(2);
  });

  it("is deterministic: input order does not change the result", () => {
    const a = run(profile(), all).top.map((t) => t.product.id);
    const b = run(profile(), [...all].reverse()).top.map((t) => t.product.id);
    expect(a).toEqual(b);
  });

  it("caps products per lender so one bank cannot fill the list", () => {
    const many = Array.from({ length: 5 }, (_, i) => product({ productName: `Wells Product ${i}`, aprMin: 8 + i * 0.1, aprMax: 10 }, { slug: "wells", name: "Wells" }));
    const other = product({ productName: "Other", aprMin: 11, aprMax: 14 }, { slug: "oth", name: "Other Lender" });
    const r = run(profile(), [...many, other]);
    expect(r.top.filter((t) => t.product.lender.slug === "wells")).toHaveLength(2);
    expect(r.top.map((t) => t.product.lender.slug)).toContain("oth");
    expect(r.notes.join(" ")).toMatch(/At most 2 products per lender/);
  });

  it("score breakdown sums to the total and respects the configured weights", () => {
    const t = run(profile(), all).top[0];
    const sum = Object.values(t.weighted).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(t.score, 1);
    for (const [k, w] of Object.entries(scoringConfig.weights)) {
      expect(t.weighted[k as keyof typeof t.weighted]).toBeLessThanOrEqual(w + 0.01);
    }
  });

  it("weights are really editable: all weight on speed makes the fastest product win", () => {
    const slowCheap = product({ productName: "Slow Cheap", aprMin: 7, aprMax: 8, fundingDaysMin: 40, fundingDaysMax: 45 }, { slug: "s1", name: "Slow" });
    const fastPricey = product({ productName: "Fast Pricey", aprMin: 28, aprMax: 30, fundingDaysMin: 1, fundingDaysMax: 1 }, { slug: "s2", name: "Fast" });
    const base = rankProducts({ profile: profile(), products: [slowCheap, fastPricey], now: NOW });
    expect(base.top[0].product.record.productName).toBe("Slow Cheap");
    const cfg = parseScoringConfig({ ...raw, weights: { eligibilityFit: 0, totalCost: 0, termPaymentFit: 0, speed: 100, collateralBurden: 0, reliability: 0 } });
    const speedy = rankProducts({ profile: profile(), products: [slowCheap, fastPricey], now: NOW, cfg });
    expect(speedy.top[0].product.record.productName).toBe("Fast Pricey");
  });

  it("unknown data is never treated as a pass: a fully-specified fit outscores an all-unknown product", () => {
    const known = product({ productName: "Known", minFico: 640, minTimeInBusinessMonths: 12, collateralRequired: "none", personalGuarantee: "not_required", uccLien: false, creditPull: "soft", fundingDaysMin: 2, fundingDaysMax: 3 }, { slug: "k", name: "Known Lender", reliability: 70 });
    const mystery = product({ productName: "Mystery", aprMin: null, aprMax: null, termMinMonths: null, termMaxMonths: null, minAmount: null, maxAmount: null }, { slug: "m", name: "Mystery Lender", reliability: 70 });
    const r = run(profile(), [known, mystery]);
    expect(r.top.map((t) => t.product.record.productName)).toEqual(["Known", "Mystery"]);
    const m = r.top[1];
    expect(m.risks.join(" ")).toMatch(/Not published: Personal FICO/);
    expect(m.risks.join(" ")).toMatch(/No rate is published/);
    expect(m.breakdown.totalCost).toBe(scoringConfig.cost.unknownCostScore);
  });

  it("a starting-rate-only product is penalised relative to the same rate fully published", () => {
    const full = product({ productName: "Full", aprMin: 10, aprMax: 10 }, { slug: "f1", name: "Full" });
    const teaser = product({ productName: "Teaser", aprMin: 10, aprMax: null }, { slug: "f2", name: "Teaser" });
    const r = run(profile(), [full, teaser]);
    expect(r.top[0].product.record.productName).toBe("Full");
    expect(r.top[1].risks.join(" ")).toMatch(/starting rate/);
  });

  it("flags stale data, marketplaces and discovered lenders in risks", () => {
    const old = product({ productName: "Old" }, { slug: "o", name: "Old Lender" }, 6);
    const mkt = product({ productName: "Mkt" }, { slug: "mk", name: "Lendio", isMarketplace: true });
    const disc = product({ productName: "Disc" }, { slug: "d-x", name: "Newco", source: "discovered", reliability: 40 });
    const r = run(profile(), [old, mkt, disc]);
    const risk = (n: string) => r.top.find((t) => t.product.record.productName === n)!.risks.join(" ");
    expect(risk("Old")).toMatch(/6 days old/);
    expect(risk("Mkt")).toMatch(/marketplace/);
    expect(risk("Disc")).toMatch(/not in LendMatch's seed registry/);
  });

  it("ranking cannot depend on commissions: no such field exists anywhere in the model", () => {
    const t = run(profile(), all).top[0];
    expect(JSON.stringify(t.product)).not.toMatch(/commission|affiliate|referral|payout|sponsor/i);
    expect(Object.keys(t.breakdown).sort()).toEqual(["collateralBurden", "eligibilityFit", "reliability", "speed", "termPaymentFit", "totalCost"]);
  });

  it("non-US owner persona: citizenship-only lenders drop out, US-address lenders stay with a clear flag", () => {
    const p = profile({ ownerCountry: "IN", ownerState: null, ownerResidency: "non_resident", businessState: "DE", businessCountry: "US" });
    const cit = product({ productName: "Citizens Only", residencyRule: "us_citizen" }, { slug: "c1", name: "Citizens" });
    const addr = product({ productName: "Needs US Address", residencyRule: "us_business_address" }, { slug: "c2", name: "Addr" });
    const open = product({ productName: "Silent Rules" }, { slug: "c3", name: "Silent" });
    const r = run(p, [cit, addr, open]);
    expect(r.top.map((t) => t.product.record.productName).sort()).toEqual(["Needs US Address", "Silent Rules"]);
    expect(r.top.find((t) => t.product.record.productName === "Needs US Address")!.risks.join(" ")).toMatch(/Requires a US address/);
    expect(r.gateSummary.residency).toBe(1);
  });
});

describe("follow-up constraints", () => {
  const lien = product({ productName: "Lien Loan", uccLien: true, aprMin: 8, aprMax: 9 }, { slug: "l1", name: "Lien Lender" });
  const noLien = product({ productName: "Clean Loan", uccLien: false, aprMin: 12, aprMax: 14 }, { slug: "l2", name: "Clean Lender" });
  const unknownLien = product({ productName: "Silent Loan", uccLien: null, aprMin: 10, aprMax: 11 }, { slug: "l3", name: "Silent Lender" });

  it("'drop anything with a lien' removes known-lien products and flags unknown ones", () => {
    const r = run(profile(), [lien, noLien, unknownLien], { noUccLien: true });
    const names = r.top.map((t) => t.product.record.productName);
    expect(names).not.toContain("Lien Loan");
    expect(names).toEqual(expect.arrayContaining(["Clean Loan", "Silent Loan"]));
    expect(r.gateSummary.userLien).toBe(1);
    expect(r.top.find((t) => t.product.record.productName === "Silent Loan")!.risks.join(" ")).toMatch(/does not say whether it files a lien/);
  });

  it("'only under 24 months' drops products that cannot go that short and shortens the estimate for the rest", () => {
    const long = product({ productName: "Long Only", termMinMonths: 36, termMaxMonths: 120 }, { slug: "t1", name: "Long" });
    const flex = product({ productName: "Flexible", termMinMonths: 6, termMaxMonths: 60 }, { slug: "t2", name: "Flex" });
    const r = run(profile(), [long, flex], { maxTermMonths: 23 });
    expect(r.top.map((t) => t.product.record.productName)).toEqual(["Flexible"]);
    expect(r.top[0].cost.termMonths).toBeLessThanOrEqual(23);
    expect(r.nearMisses[0].fixes[0]).toMatch(/36 months or longer/);
  });

  it("monthly payment / APR / speed / type / category / lender filters", () => {
    const a = product({ productName: "A", aprMin: 30, aprMax: 30 }, { slug: "x1", name: "X1", category: "Alternative" });
    const b = product({ productName: "B", aprMin: 9, aprMax: 9, fundingDaysMin: 20, fundingDaysMax: 20 }, { slug: "x2", name: "X2", category: "Conventional" });
    // a 1.2 factor repaid over 6 months is a very high effective APR (~75%)
    const c = product({ productName: "C", productType: "mca", aprMin: null, aprMax: null, factorMin: 1.2, factorMax: 1.2, termMinMonths: 6, termMaxMonths: 6 }, { slug: "x3", name: "X3", category: "Alternative" });
    expect(run(profile(), [a, b, c], { maxAprPct: 15 }).top.map((t) => t.product.record.productName)).toEqual(["B"]);
    expect(run(profile(), [a, b, c], { maxDaysToFund: 7 }).top.map((t) => t.product.record.productName)).not.toContain("B");
    expect(run(profile(), [a, b, c], { excludeTypes: ["mca"] }).top.map((t) => t.product.record.productName)).not.toContain("C");
    expect(run(profile(), [a, b, c], { includeCategories: ["Conventional"] }).top.map((t) => t.product.record.productName)).toEqual(["B"]);
    expect(run(profile(), [a, b, c], { excludeLenders: ["x1"] }).top.map((t) => t.product.record.productName)).not.toContain("A");
    expect(run(profile(), [a, b, c], { maxMonthlyPayment: 100 }).top.length).toBeLessThan(3);
  });

  it("soft-pull-only and no-prepayment filters", () => {
    const hard = product({ productName: "Hard", creditPull: "hard", prepaymentPenalty: "exists" }, { slug: "p1", name: "P1" });
    const soft = product({ productName: "Soft", creditPull: "soft", prepaymentPenalty: "none" }, { slug: "p2", name: "P2" });
    const r = run(profile(), [hard, soft], { softPullOnly: true, noPrepaymentPenalty: true });
    expect(r.top.map((t) => t.product.record.productName)).toEqual(["Soft"]);
  });
});

describe("eligibility component isolates unknown data", () => {
  const score = (prod: Record<string, unknown>) => {
    const s = product({ aprMin: 10, aprMax: 10, ...prod }, { reliability: 80 });
    const pr = profile();
    const gates = evaluateGates(pr, s.record, s.lender);
    return scoreProduct({ profile: pr, stored: s, gates, cost: estimateCost(s.record, { amount: 50000, preferredTermMonths: null }), ageDays: 1 }).breakdown.eligibilityFit;
  };
  it("a product whose eligibility facts are all unpublished scores exactly the configured unknownScore, not 100", () => {
    const allUnknown = score({ minAmount: null, maxAmount: null, minFico: null, minTimeInBusinessMonths: null });
    expect(allUnknown).toBe(scoringConfig.eligibility.unknownScore);
    expect(allUnknown).toBeLessThan(100);
  });
  it("a verified comfortable fit scores strictly higher than the same product with unpublished requirements", () => {
    const unknown = score({ minAmount: null, maxAmount: null, minFico: null, minTimeInBusinessMonths: null });
    const comfortable = score({ minFico: 600, minTimeInBusinessMonths: 6 });
    expect(comfortable).toBeGreaterThan(unknown);
  });
  it("a borderline FICO scores below an unpublished one", () => {
    const unknown = score({ minAmount: null, maxAmount: null, minFico: null, minTimeInBusinessMonths: null });
    const borderline = (() => {
      const s = product({ minAmount: null, maxAmount: null, minFico: 650, minTimeInBusinessMonths: null, aprMin: 10, aprMax: 10 });
      const pr = profile({ ficoMin: 620, ficoMax: 680 });
      const gates = evaluateGates(pr, s.record, s.lender);
      return scoreProduct({ profile: pr, stored: s, gates, cost: estimateCost(s.record, { amount: 50000, preferredTermMonths: null }), ageDays: 1 }).breakdown.eligibilityFit;
    })();
    // eligibility is the mean over the 7 decisive gates: one borderline (40) + six unknown (60)
    const { borderlineScore: b, unknownScore: u } = scoringConfig.eligibility;
    expect(borderline).toBeCloseTo((b + 6 * u) / 7, 1);
    expect(borderline).toBeLessThan(unknown);
  });
});

describe("scoreProduct unit", () => {
  it("every component is within 0-100 and total within 0-100", () => {
    const s = product({ aprMin: 5, aprMax: 6, fundingDaysMin: 0, fundingDaysMax: 0, collateralRequired: "none", personalGuarantee: "not_required", uccLien: false, minFico: 600 }, { reliability: 100 }, 0);
    const pr = profile();
    const gates = evaluateGates(pr, s.record, s.lender);
    const cost = estimateCost(s.record, { amount: 50000, preferredTermMonths: null });
    const out = scoreProduct({ profile: pr, stored: s, gates, cost, ageDays: 0 });
    for (const v of Object.values(out.breakdown)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect(out.total).toBeGreaterThan(85);
    expect(out.total).toBeLessThanOrEqual(100);
  });
});
