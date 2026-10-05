import type { ProductRecord } from "@/lib/firecrawl/productSchema";
import type { Profile } from "@/lib/profile/schema";
import type { StoredProduct } from "@/lib/types";
import { interpolate, scoringConfig, type ScoringConfig } from "./config";
import type { CostEstimate } from "./cost";
import type { Gate, ScoreBreakdown } from "./types";

/** Gates that say something about how comfortably the borrower qualifies. */
const ELIGIBILITY_GATES: Gate["id"][] = ["amount", "fico", "timeInBusiness", "revenue", "state", "country", "residency", "purpose", "businessUse", "bankruptcy", "taxLiens", "defaults"];

function eligibilityScore(gates: Gate[], profile: Profile, cfg: ScoringConfig): number {
  const e = cfg.eligibility;
  const scores: number[] = [];
  for (const gate of gates) {
    if (!ELIGIBILITY_GATES.includes(gate.id)) continue;
    // history gates only matter when the borrower actually reported something
    if (gate.id === "bankruptcy" && profile.hasBankruptcy !== true) continue;
    if (gate.id === "taxLiens" && profile.hasTaxLiens !== true) continue;
    if (gate.id === "defaults" && profile.recentDefaults !== true) continue;
    // "the lender doesn't list excluded states/countries" is the norm, not a signal
    if ((gate.id === "state" || gate.id === "country") && gate.status === "unknown") continue;
    if (gate.status === "fail") scores.push(0);
    else if (gate.status === "borderline") scores.push(e.borderlineScore);
    else if (gate.status === "unknown") scores.push(e.unknownScore);
    else scores.push(gate.margin === undefined ? 100 : e.passBase + (100 - e.passBase) * gate.margin);
  }
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : e.unknownScore;
}

function costScore(cost: CostEstimate, cfg: ScoringConfig): number {
  if (cost.effectiveAprPct === null) return cfg.cost.unknownCostScore;
  const s = interpolate(cfg.cost.aprAnchors, cost.effectiveAprPct);
  return cost.rateBoundOnly === "min" ? s * cfg.cost.lowerBoundOnlyMultiplier : s;
}

function termPaymentScore(profile: Profile, p: ProductRecord, cost: CostEstimate, cfg: ScoringConfig): number {
  const t = cfg.termPayment;
  // term fit
  let term: number;
  const pref = profile.preferredTermMonths;
  if (pref === null) term = t.noTermPreferenceScore;
  else if (p.termMinMonths === null && p.termMaxMonths === null) term = t.unknownTermScore;
  else {
    const lo = p.termMinMonths ?? 0;
    const hi = p.termMaxMonths ?? Infinity;
    if (pref >= lo && pref <= hi) term = 100;
    else {
      const d = pref < lo ? lo - pref : pref - hi;
      term = Math.max(0, 100 - (100 * d) / Math.max(pref, 12));
    }
  }
  // affordability (payment as % of monthly revenue); uses the high-end payment to stay conservative
  const pay = cost.monthlyPaymentHigh ?? cost.monthlyPayment;
  const rev = profile.monthlyRevenue ?? (profile.annualRevenue !== null ? profile.annualRevenue / 12 : null);
  let afford: number;
  if (pay === null || rev === null) afford = t.unknownRevenueScore;
  else if (rev === 0) afford = t.zeroRevenueScore;
  else afford = interpolate(t.paymentToRevenueAnchors, (pay / rev) * 100);
  // repayment frequency
  const want = profile.repaymentFrequency;
  let freq: number;
  if (!want || want === "no_preference" || !p.repaymentFrequency) freq = t.frequencyNoPreference;
  else freq = want === p.repaymentFrequency ? t.frequencyMatch : t.frequencyMismatch;
  const w = t.subWeights;
  return (term * w.term + afford * w.affordability + freq * w.frequency) / (w.term + w.affordability + w.frequency);
}

export function fundingDays(p: ProductRecord): number | null {
  const a = p.fundingDaysMin;
  const b = p.fundingDaysMax;
  return a !== null && b !== null ? (a + b) / 2 : (a ?? b);
}

function speedScore(profile: Profile, p: ProductRecord, cfg: ScoringConfig): number {
  const days = fundingDays(p);
  if (days === null) return cfg.speed.unknownScore;
  const need = profile.speedNeededDays;
  if (need === null) return interpolate(cfg.speed.absoluteAnchorsDays, days);
  if (days <= need) return 100;
  const span = (cfg.speed.slowestMultiple - 1) * Math.max(need, 1);
  return Math.max(0, 100 * (1 - (days - need) / span));
}

function burdenScore(profile: Profile, p: ProductRecord, cfg: ScoringConfig): number {
  const b = cfg.burden;
  let penalty = 0;
  const add = (amount: number, willing: boolean | null) => (penalty += amount * (willing === true ? b.willingFactor : 1));
  if (p.personalGuarantee === "required") add(b.personalGuarantee, profile.willingPersonalGuarantee);
  else if (p.personalGuarantee === "sometimes") add(b.personalGuaranteeSometimes, profile.willingPersonalGuarantee);
  else if (p.personalGuarantee === null) penalty += b.unknownEach;
  if (p.uccLien === true) add(b.uccLien, profile.willingUccLien);
  else if (p.uccLien === null) penalty += b.unknownEach;
  if (p.collateralRequired === "always") add(b.collateralAlways, profile.collateralAvailable);
  else if (p.collateralRequired === "sometimes") add(b.collateralSometimes, profile.collateralAvailable);
  else if (p.collateralRequired === null) penalty += b.unknownEach;
  return Math.max(0, 100 - penalty);
}

const COMPLETENESS_KEYS: Array<(p: ProductRecord) => boolean> = [
  (p) => p.minAmount !== null || p.maxAmount !== null,
  (p) => p.termMinMonths !== null || p.termMaxMonths !== null,
  (p) => p.aprMin !== null || p.aprMax !== null || p.factorMin !== null || p.factorMax !== null,
  (p) => p.originationFeePctMin !== null || p.originationFeePctMax !== null || p.monthlyFeeUsd !== null || p.prepaymentPenalty !== null,
  (p) => p.fundingDaysMin !== null || p.fundingDaysMax !== null,
  (p) => p.minFico !== null,
  (p) => p.minTimeInBusinessMonths !== null,
  (p) => p.collateralRequired !== null,
  (p) => p.personalGuarantee !== null,
  (p) => p.creditPull !== null,
];

export function dataCompleteness(p: ProductRecord): number {
  return (COMPLETENESS_KEYS.filter((k) => k(p)).length / COMPLETENESS_KEYS.length) * 100;
}

function reliabilityScore(stored: StoredProduct, ageDays: number, cfg: ScoringConfig): number {
  const r = cfg.reliability;
  const p = stored.record;
  const completeness = Math.max(0, dataCompleteness(p) - Math.min(r.unverifiedMaxPenalty, p.unverifiedFields.length * r.unverifiedFieldPenalty));
  const ttlDays = Math.max(1, Math.round((stored.expiresAt.getTime() - stored.scrapedAt.getTime()) / 86_400_000));
  const freshness = interpolate([[r.freshnessFullDays, 100], [ttlDays, r.freshnessAtTtlScore]], ageDays);
  const data = (completeness * r.completenessWeight + freshness * r.freshnessWeight) / (r.completenessWeight + r.freshnessWeight);
  return (stored.lender.reliability * r.lenderWeight + data * r.dataWeight) / (r.lenderWeight + r.dataWeight);
}

export function scoreProduct(input: { profile: Profile; stored: StoredProduct; gates: Gate[]; cost: CostEstimate; ageDays: number; cfg?: ScoringConfig }): { breakdown: ScoreBreakdown; weighted: ScoreBreakdown; total: number } {
  const { profile, stored, gates, cost, ageDays } = input;
  const cfg = input.cfg ?? scoringConfig;
  const p = stored.record;
  const breakdown: ScoreBreakdown = {
    eligibilityFit: eligibilityScore(gates, profile, cfg),
    totalCost: costScore(cost, cfg),
    termPaymentFit: termPaymentScore(profile, p, cost, cfg),
    speed: speedScore(profile, p, cfg),
    collateralBurden: burdenScore(profile, p, cfg),
    reliability: reliabilityScore(stored, ageDays, cfg),
  };
  const weighted = Object.fromEntries(Object.entries(breakdown).map(([k, v]) => [k, (v * cfg.weights[k as keyof ScoreBreakdown]) / 100])) as unknown as ScoreBreakdown;
  const total = Object.values(weighted).reduce((a, b) => a + b, 0);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    breakdown: Object.fromEntries(Object.entries(breakdown).map(([k, v]) => [k, r2(v)])) as unknown as ScoreBreakdown,
    weighted: Object.fromEntries(Object.entries(weighted).map(([k, v]) => [k, r2(v)])) as unknown as ScoreBreakdown,
    total: r2(total),
  };
}
