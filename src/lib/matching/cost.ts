import type { ProductRecord } from "@/lib/firecrawl/productSchema";
import { scoringConfig, type ScoringConfig } from "./config";
import { amortizedPayment, effectiveApr, round2 } from "./math";

/**
 * All money math happens here, in code. The model never computes or alters these numbers.
 * Every figure is an ESTIMATE built from the lender's published ranges plus the assumptions listed.
 */
export interface CostEstimate {
  basis: "apr" | "factor" | "factoring_fee" | "unknown";
  amount: number;
  termMonths: number;
  termAssumed: boolean;
  rateLowPct: number | null;
  rateHighPct: number | null;
  rateUsedPct: number | null;
  /** Only one end of the rate range is published ("starting at 8%" / "up to 36%"). */
  rateBoundOnly: "min" | "max" | null;
  factorUsed: number | null;
  monthlyPayment: number | null;
  monthlyPaymentLow: number | null;
  monthlyPaymentHigh: number | null;
  originationFee: number | null;
  monthlyFeesTotal: number | null;
  /** Total cost of capital: interest/finance charge + fees (prepayment fees excluded). */
  financeCharge: number | null;
  totalRepayment: number | null;
  effectiveAprPct: number | null;
  frequencyNote: string | null;
  assumptions: string[];
  formula: string;
}

const mid = (a: number | null, b: number | null): number | null => (a !== null && b !== null ? (a + b) / 2 : (a ?? b));

export interface TermChoice {
  months: number;
  assumed: boolean;
  note: string;
}

/** Picks the term used for estimates: the borrower's preference if the lender allows it, else the lender's range, else a labelled default. */
export function chooseTerm(
  p: Pick<ProductRecord, "termMinMonths" | "termMaxMonths" | "productType">,
  preferred: number | null,
  bounds: { min?: number; max?: number } = {},
  cfg: ScoringConfig = scoringConfig
): TermChoice {
  const lo = p.termMinMonths;
  const hi = p.termMaxMonths;
  const dflt = cfg.defaults.termMonthsByType[p.productType] ?? 24;
  let months: number;
  let assumed = false;
  let note: string;

  if (preferred !== null) {
    months = Math.min(hi ?? Infinity, Math.max(lo ?? 0, preferred));
    note = months === preferred ? `your preferred ${preferred}-month term` : `${months} months (your preferred ${preferred} adjusted to the lender's published range)`;
  } else if (lo !== null && hi !== null) {
    months = Math.round((lo + hi) / 2);
    assumed = true;
    note = `${months} months (midpoint of the published ${lo}–${hi} month range)`;
  } else if (hi !== null) {
    months = Math.min(hi, dflt);
    assumed = true;
    note = `${months} months (assumed; lender publishes only a maximum of ${hi})`;
  } else if (lo !== null) {
    months = Math.max(lo, dflt);
    assumed = true;
    note = `${months} months (assumed; lender publishes only a minimum of ${lo})`;
  } else {
    months = dflt;
    assumed = true;
    note = `${months} months (assumed typical for this product type; the lender publishes no term)`;
  }
  if (bounds.max !== undefined && months > bounds.max) {
    months = Math.max(bounds.max, lo ?? 1);
    note = `${months} months (limited by your request for terms up to ${bounds.max} months)`;
    assumed = false;
  }
  if (bounds.min !== undefined && months < bounds.min) {
    months = Math.min(bounds.min, hi ?? bounds.min);
    note = `${months} months (raised to meet your request for terms of at least ${bounds.min} months)`;
    assumed = false;
  }
  return { months: Math.max(1, Math.round(months)), assumed, note };
}

export function estimateCost(
  p: ProductRecord,
  input: { amount: number; preferredTermMonths: number | null; termBounds?: { min?: number; max?: number } },
  cfg: ScoringConfig = scoringConfig
): CostEstimate {
  const P = input.amount;
  const term = chooseTerm(p, input.preferredTermMonths, input.termBounds, cfg);
  const n = term.months;
  const assumptions: string[] = [`Term used: ${term.note}.`];
  const out: CostEstimate = {
    basis: "unknown", amount: P, termMonths: n, termAssumed: term.assumed,
    rateLowPct: null, rateHighPct: null, rateUsedPct: null, rateBoundOnly: null, factorUsed: null,
    monthlyPayment: null, monthlyPaymentLow: null, monthlyPaymentHigh: null, originationFee: null, monthlyFeesTotal: null,
    financeCharge: null, totalRepayment: null, effectiveAprPct: null, frequencyNote: null, assumptions,
    formula: "No rate or factor is published for this product, so cost and payment cannot be estimated.",
  };

  const hasApr = p.aprMin !== null || p.aprMax !== null;
  const hasFactor = p.factorMin !== null || p.factorMax !== null;
  const feePct = mid(p.originationFeePctMin, p.originationFeePctMax);
  const monthlyFee = p.monthlyFeeUsd ?? 0;

  const origination = (): number => {
    if (feePct === null) return 0;
    if (p.aprIncludesFees === true && hasApr) {
      assumptions.push("The lender states its APR already includes the origination fee, so the fee is not added again.");
      return 0;
    }
    assumptions.push(
      `Origination fee of ${p.originationFeePctMin !== null && p.originationFeePctMax !== null && p.originationFeePctMin !== p.originationFeePctMax ? `${p.originationFeePctMin}–${p.originationFeePctMax}% (midpoint ${feePct}% used)` : `${feePct}%`} is treated as paid from the loan proceeds and as additional to the stated rate${p.aprIncludesFees === null ? " (the lender does not say whether its APR includes fees)" : ""}.`
    );
    return round2((P * feePct) / 100);
  };

  // ---- APR-based products ------------------------------------------------------------------
  if (hasApr && !(p.productType === "mca")) {
    out.basis = "apr";
    out.rateLowPct = p.aprMin;
    out.rateHighPct = p.aprMax;
    out.rateUsedPct = mid(p.aprMin, p.aprMax);
    out.rateBoundOnly = p.aprMin !== null && p.aprMax === null ? "min" : p.aprMin === null && p.aprMax !== null ? "max" : null;
    if (out.rateBoundOnly === "min") assumptions.push(`The lender publishes only a starting APR of ${p.aprMin}%; your actual rate may be higher, so treat this as a best case.`);
    if (out.rateBoundOnly === "max") assumptions.push(`The lender publishes only a maximum APR of ${p.aprMax}%; your actual rate may be lower.`);
    if (out.rateLowPct !== null && out.rateHighPct !== null && out.rateLowPct !== out.rateHighPct) assumptions.push(`Cost uses the midpoint of the published ${out.rateLowPct}–${out.rateHighPct}% APR range; payment shown as a range.`);

    const rate = out.rateUsedPct!;
    const fee = origination();
    const monthlyTotal = monthlyFee * n;
    if (monthlyFee) assumptions.push(`Monthly fee of $${monthlyFee} applied for each of the ${n} months.`);
    const basePmt = amortizedPayment(P, rate, n);
    const pmt = basePmt + monthlyFee;
    out.monthlyPayment = round2(pmt);
    out.monthlyPaymentLow = round2(amortizedPayment(P, out.rateLowPct ?? rate, n) + monthlyFee);
    out.monthlyPaymentHigh = round2(amortizedPayment(P, out.rateHighPct ?? rate, n) + monthlyFee);
    out.originationFee = fee || (feePct !== null ? 0 : null);
    out.monthlyFeesTotal = monthlyFee ? round2(monthlyTotal) : null;
    const interest = basePmt * n - P;
    out.financeCharge = round2(interest + fee + monthlyTotal);
    out.totalRepayment = round2(P + out.financeCharge);
    out.effectiveAprPct = round2(effectiveApr(P - fee, pmt, n));
    out.formula =
      "payment = P·r / (1 − (1+r)^−n) + monthly fee, with r = APR/12; total cost = payment × n − P + origination fee + monthly fees; " +
      "effective APR = the annual rate that equates net proceeds (P − fee) with the payment stream.";
    if (p.productType === "line_of_credit") assumptions.push(`Line of credit assumed fully drawn and repaid in equal monthly payments over ${n} months; real cost depends on how much you draw and when.`);
    if (p.productType === "business_card") assumptions.push(`Credit card assumed to carry the full amount and be repaid over ${n} months; cards normally charge interest only on balances you carry.`);
  }
  // ---- factor-rate cash advances ---------------------------------------------------------------
  else if (hasFactor && (p.productType === "mca" || !hasApr) && p.productType !== "invoice_factoring") {
    out.basis = "factor";
    const f = mid(p.factorMin, p.factorMax)!;
    out.factorUsed = f;
    if (p.factorMin !== null && p.factorMax !== null && p.factorMin !== p.factorMax) assumptions.push(`Factor rate: midpoint of the published ${p.factorMin}–${p.factorMax} range (${f}).`);
    const fee = origination();
    const payback = P * f;
    const pmt = payback / n;
    out.monthlyPayment = round2(pmt);
    out.monthlyPaymentLow = round2((P * (p.factorMin ?? f)) / n);
    out.monthlyPaymentHigh = round2((P * (p.factorMax ?? f)) / n);
    out.originationFee = fee || (feePct !== null ? 0 : null);
    out.financeCharge = round2(payback - P + fee);
    out.totalRepayment = round2(payback + fee);
    out.effectiveAprPct = round2(effectiveApr(P - fee, pmt, n));
    out.formula = "total payback = amount × factor rate; cost = payback − amount + fees; monthly payment = payback ÷ months; effective APR from net proceeds and the payment stream.";
    assumptions.push("Factor-rate products are not true APR loans. The effective APR above assumes equal monthly payments; daily or weekly remittance makes the real annualized cost higher.");
    if (p.repaymentFrequency === "daily") out.frequencyNote = `Repaid daily: roughly $${round2(payback / (n * 21.67))} per business day.`;
    if (p.repaymentFrequency === "weekly") out.frequencyNote = `Repaid weekly: roughly $${round2(payback / (n * 4.33))} per week.`;
  }
  // ---- invoice factoring ---------------------------------------------------------------------
  else if (hasFactor && p.productType === "invoice_factoring") {
    out.basis = "factoring_fee";
    const f = mid(p.factorMin, p.factorMax)!;
    out.factorUsed = f;
    const feePerPeriod = P * (f - 1);
    out.financeCharge = round2(feePerPeriod * n);
    out.totalRepayment = round2(P + out.financeCharge);
    out.effectiveAprPct = round2((f - 1) * 12 * 100);
    out.formula = "fee per 30 days = amount × (factor − 1); total cost = fee × number of 30-day periods; effective APR = (factor − 1) × 12 (simple annualization).";
    assumptions.push(`Factoring fee read as a rate per 30 days, with invoices outstanding for ${n} periods; there is no fixed monthly payment because customers pay the invoices.`);
  } else {
    assumptions.push("Rates, fees and total cost are not published on the pages read, so none are estimated.");
  }

  const base = [p.monthlyFeeUsd !== null && out.basis === "unknown" ? `Monthly fee of $${p.monthlyFeeUsd} is published.` : null].filter(Boolean) as string[];
  out.assumptions.push(...base);
  return out;
}
