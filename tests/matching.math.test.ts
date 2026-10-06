import { describe, expect, it } from "vitest";
import { amortizedPayment, effectiveApr } from "@/lib/matching/math";
import { chooseTerm, estimateCost } from "@/lib/matching/cost";
import { interpolate, parseScoringConfig, scoringConfig } from "@/lib/matching/config";
import { product } from "./helpers";
import raw from "../config/scoring.json";

// Reference values were computed independently (python) from the textbook formulas, not from this code.
describe("amortization", () => {
  it("matches known loan payments", () => {
    expect(amortizedPayment(10000, 12, 12)).toBeCloseTo(888.4879, 4);
    expect(amortizedPayment(100000, 6, 360)).toBeCloseTo(599.5505, 4);
    expect(amortizedPayment(50000, 10, 36)).toBeCloseTo(1613.3594, 4);
    expect(amortizedPayment(25000, 18.5, 24)).toBeCloseTo(1254.1506, 4);
  });
  it("zero rate is straight-line; zero term returns principal", () => {
    expect(amortizedPayment(12000, 0, 12)).toBe(1000);
    expect(amortizedPayment(5000, 9, 0)).toBe(5000);
  });
  it("payments exactly repay principal + interest", () => {
    const pmt = amortizedPayment(50000, 10, 36);
    expect(pmt * 36 - 50000).toBeCloseTo(8080.94, 1);
  });
});

describe("effective APR (IRR)", () => {
  it("equals the stated APR when there are no fees", () => {
    expect(effectiveApr(10000, amortizedPayment(10000, 12, 12), 12)).toBeCloseTo(12, 3);
  });
  it("rises when fees reduce net proceeds", () => {
    expect(effectiveApr(9500, amortizedPayment(10000, 12, 12), 12)).toBeCloseTo(21.8559, 3);
    expect(effectiveApr(48500, amortizedPayment(50000, 10, 36), 36)).toBeCloseTo(12.1064, 3);
  });
  it("is the rate at which net proceeds equal the discounted payments (self-consistency)", () => {
    const proceeds = 47000, pmt = 1700, n = 36;
    const r = effectiveApr(proceeds, pmt, n) / 100 / 12;
    expect((pmt * (1 - Math.pow(1 + r, -n))) / r).toBeCloseTo(proceeds, 4);
  });
  it("is 0 when payments never exceed proceeds", () => {
    expect(effectiveApr(10000, 800, 12)).toBe(0);
  });
});

describe("interpolate", () => {
  const a: Array<[number, number]> = [[6, 100], [12, 85], [20, 65]];
  it("is piecewise linear and clamped", () => {
    expect(interpolate(a, 6)).toBe(100);
    expect(interpolate(a, 9)).toBeCloseTo(92.5);
    expect(interpolate(a, 16)).toBeCloseTo(75);
    expect(interpolate(a, 1)).toBe(100);
    expect(interpolate(a, 99)).toBe(65);
  });
});

describe("term selection", () => {
  const base = { termMinMonths: 12, termMaxMonths: 60, productType: "term_loan" as const };
  it("honours the preference inside the range, clamps outside it", () => {
    expect(chooseTerm(base, 36)).toMatchObject({ months: 36, assumed: false });
    expect(chooseTerm(base, 120).months).toBe(60);
    expect(chooseTerm(base, 6).months).toBe(12);
  });
  it("uses the midpoint of a published range, flagged as assumed", () => {
    expect(chooseTerm(base, null)).toMatchObject({ months: 36, assumed: true });
  });
  it("falls back to a labelled default only when no term is published", () => {
    const t = chooseTerm({ termMinMonths: null, termMaxMonths: null, productType: "equipment" }, null);
    expect(t).toMatchObject({ months: 48, assumed: true });
    expect(t.note).toMatch(/assumed/);
  });
  it("never applies the borrower's preferred term when the lender publishes no term at all", () => {
    const t = chooseTerm({ termMinMonths: null, termMaxMonths: null, productType: "equipment" }, 120);
    expect(t).toMatchObject({ months: 48, assumed: true });
    expect(t.note).toMatch(/could not be checked/);
  });
  it("still honours the preference when only one bound is published", () => {
    expect(chooseTerm({ termMinMonths: 12, termMaxMonths: null, productType: "term_loan" }, 36)).toMatchObject({ months: 36, assumed: false });
  });
  it("respects a user cap on term", () => {
    expect(chooseTerm(base, null, { max: 24 }).months).toBe(24);
    expect(chooseTerm(base, 48, { max: 24 }).months).toBe(24);
  });
});

describe("cost estimates", () => {
  it("term loan with a separate origination fee", () => {
    const p = product({ aprMin: 10, aprMax: 10, originationFeePctMin: 3, originationFeePctMax: 3, termMinMonths: 36, termMaxMonths: 36 }).record;
    const c = estimateCost(p, { amount: 50000, preferredTermMonths: null });
    expect(c.basis).toBe("apr");
    expect(c.monthlyPayment).toBeCloseTo(1613.36, 2);
    expect(c.originationFee).toBe(1500);
    expect(c.financeCharge).toBeCloseTo(8080.94 + 1500, 1);
    expect(c.totalRepayment).toBeCloseTo(50000 + 8080.94 + 1500, 1);
    expect(c.effectiveAprPct).toBeCloseTo(12.1064, 2);
    expect(c.assumptions.join(" ")).toMatch(/does not say whether its APR includes fees/);
    expect(c.formula).toMatch(/P·r/);
  });
  it("does not double count a fee when the lender says APR includes it", () => {
    const p = product({ aprMin: 10, aprMax: 10, originationFeePctMin: 3, originationFeePctMax: 3, aprIncludesFees: true, termMinMonths: 36, termMaxMonths: 36 }).record;
    const c = estimateCost(p, { amount: 50000, preferredTermMonths: null });
    expect(c.financeCharge).toBeCloseTo(8080.94, 1);
    expect(c.effectiveAprPct).toBeCloseTo(10, 2);
  });
  it("uses the midpoint of an APR range and returns a payment range", () => {
    const p = product({ aprMin: 9, aprMax: 12, termMinMonths: 48, termMaxMonths: 48 }).record;
    const c = estimateCost(p, { amount: 30000, preferredTermMonths: null });
    expect(c.rateUsedPct).toBe(10.5);
    expect(c.monthlyPayment).toBeCloseTo(768.1014, 2);
    expect(c.monthlyPaymentLow!).toBeLessThan(c.monthlyPayment!);
    expect(c.monthlyPaymentHigh!).toBeGreaterThan(c.monthlyPayment!);
  });
  it("monthly fee is added to the payment and to total cost", () => {
    const p = product({ aprMin: 0, aprMax: 0, monthlyFeeUsd: 50, termMinMonths: 12, termMaxMonths: 12 }).record;
    const c = estimateCost(p, { amount: 12000, preferredTermMonths: null });
    expect(c.monthlyPayment).toBe(1050);
    expect(c.monthlyFeesTotal).toBe(600);
    expect(c.financeCharge).toBe(600);
  });
  it("flags a start-at-only rate as a best case", () => {
    const c = estimateCost(product({ aprMin: 8, aprMax: null }).record, { amount: 20000, preferredTermMonths: 24 });
    expect(c.rateBoundOnly).toBe("min");
    expect(c.assumptions.join(" ")).toMatch(/best case/);
  });
  it("merchant cash advance: payback = amount x factor", () => {
    const p = product({ productType: "mca", aprMin: null, aprMax: null, factorMin: 1.3, factorMax: 1.3, termMinMonths: 9, termMaxMonths: 9, repaymentFrequency: "daily" }).record;
    const c = estimateCost(p, { amount: 10000, preferredTermMonths: null });
    expect(c.basis).toBe("factor");
    expect(c.totalRepayment).toBe(13000);
    expect(c.financeCharge).toBe(3000);
    expect(c.monthlyPayment).toBeCloseTo(1444.44, 2);
    expect(c.effectiveAprPct).toBeCloseTo(67.1453, 2);
    expect(c.frequencyNote).toMatch(/per business day/);
    expect(c.assumptions.join(" ")).toMatch(/not true APR/);
  });
  it("invoice factoring: fee per 30 days x periods", () => {
    const p = product({ productType: "invoice_factoring", aprMin: null, aprMax: null, factorMin: 1.03, factorMax: 1.03, termMinMonths: null, termMaxMonths: null }).record;
    const c = estimateCost(p, { amount: 10000, preferredTermMonths: null });
    expect(c.basis).toBe("factoring_fee");
    expect(c.termMonths).toBe(3);
    expect(c.financeCharge).toBe(900);
    expect(c.monthlyPayment).toBeNull();
  });
  it("never invents a rate: no published rate => no estimate", () => {
    const c = estimateCost(product({ aprMin: null, aprMax: null }).record, { amount: 50000, preferredTermMonths: null });
    expect(c.basis).toBe("unknown");
    expect(c.monthlyPayment).toBeNull();
    expect(c.financeCharge).toBeNull();
    expect(c.effectiveAprPct).toBeNull();
  });
});

describe("scoring config", () => {
  it("weights sum to 100 and match the spec", () => {
    expect(scoringConfig.weights).toEqual({ eligibilityFit: 30, totalCost: 25, termPaymentFit: 15, speed: 10, collateralBurden: 10, reliability: 10 });
  });
  it("rejects weights that do not sum to 100", () => {
    const bad = JSON.parse(JSON.stringify(raw));
    bad.weights.speed = 20;
    expect(() => parseScoringConfig(bad)).toThrow(/sum to 100/);
  });
  it("contains nothing that could tie ranking to commissions", () => {
    expect(JSON.stringify(raw).replace(/"_comment":"[^"]*"/g, "")).not.toMatch(/commission|affiliate|referral|payout|sponsor|partner/i);
  });
});
