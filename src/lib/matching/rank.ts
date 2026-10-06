import { PRODUCT_TYPE_LABEL } from "@/lib/firecrawl/productSchema";
import { fmtSpeed } from "@/lib/report/format";
import type { Profile } from "@/lib/profile/schema";
import type { StoredProduct } from "@/lib/types";
import { scoringConfig, type ScoringConfig } from "./config";
import { estimateCost, type CostEstimate } from "./cost";
import { evaluateGates } from "./gates";
import { fundingDays, scoreProduct } from "./score";
import type { ExtraConstraints, Gate, GateId, NearMiss, RankedItem, RankResult, RemovedItem } from "./types";

const DAY = 86_400_000;
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Gates whose "unknown" status is worth telling the borrower about. */
const WORTH_CONFIRMING: GateId[] = ["fico", "timeInBusiness", "revenue", "residency", "personalGuarantee", "uccLien", "collateral"];

export function buildRisks(gates: Gate[], cost: CostEstimate, stored: StoredProduct, ageDays: number): string[] {
  const p = stored.record;
  const risks: string[] = [];
  const covered = new Set<GateId>();
  for (const g of gates) {
    if (g.status === "borderline") {
      // most details already end in "— confirm …"; only add the fix when it says something new
      risks.push(g.fix && !/confirm/i.test(g.detail) ? `${g.detail} ${g.fix}` : g.detail);
      covered.add(g.id);
    } else if (g.status === "unknown" && WORTH_CONFIRMING.includes(g.id)) risks.push(`Not published: ${g.label} — confirm with the lender. (${g.detail})`);
  }
  // burdens: state them once (a borderline gate for the same item already did)
  if (p.personalGuarantee === "required" && !covered.has("personalGuarantee")) risks.push("Requires a personal guarantee: your personal assets are at risk if the business cannot repay.");
  if (p.uccLien === true && !covered.has("uccLien")) risks.push("Files a UCC lien on business assets.");
  if (p.collateralRequired === "always" && !covered.has("collateral")) risks.push("Requires collateral.");
  if (p.aprMin !== null && p.aprMax !== null && p.aprMin > 0 && p.aprMax / p.aprMin >= 3) risks.push(`The published APR range is very wide (${p.aprMin}%–${p.aprMax}%); your actual rate could be anywhere in it.`);
  if (cost.rateBoundOnly === "min") risks.push(`Only a starting rate (${cost.rateLowPct}% APR) is published; your actual rate may be higher.`);
  if (cost.basis === "unknown") risks.push("No rate is published on the pages read, so cost and payment cannot be estimated.");
  if (cost.basis === "factor") risks.push("Factor-rate pricing: the effective annual cost is usually far above a typical APR and repayment may be daily or weekly.");
  if (p.creditPull === "hard") risks.push("A hard credit inquiry will be made, which can lower your score slightly.");
  if (p.prepaymentPenalty === "exists") risks.push("A prepayment penalty applies if you pay early.");
  if (stored.lender.isMarketplace) risks.push("This is a marketplace: offers come from partner lenders, so actual terms vary.");
  if (stored.lender.source === "discovered") risks.push("Newly discovered lender not in LendMatch's seed registry — verify its legitimacy independently.");
  if (p.unverifiedFields.length) risks.push(`Some details on the page could not be verified and were left out (${p.unverifiedFields.join(", ")}).`);
  if (ageDays >= 5) risks.push(`This data is ${ageDays} days old; rates may have changed.`);
  return [...new Set(risks)];
}

export function buildFitPoints(profile: Profile, gates: Gate[], cost: CostEstimate, stored: StoredProduct): string[] {
  const p = stored.record;
  const pts: string[] = [];
  for (const id of ["amount", "fico", "timeInBusiness", "revenue", "purpose"] as GateId[]) {
    const g = gates.find((x) => x.id === id);
    if (g?.status === "pass" && !g.detail.startsWith("Lender does not")) pts.push(g.detail);
  }
  const days = fundingDays(p);
  if (days !== null) {
    const published = fmtSpeed(p); // the lender's own range, not our midpoint
    const worst = p.fundingDaysMax ?? p.fundingDaysMin ?? days;
    const need = profile.speedNeededDays;
    pts.push(need === null ? `Funding speed: ${published}.` : worst <= need ? `Funding speed: ${published}, within your ${need}-day need.` : `Funding speed: ${published} (you need funds within ${need} days).`);
  }
  if (cost.effectiveAprPct !== null && cost.financeCharge !== null) pts.push(`Estimated total cost ${usd(cost.financeCharge)} over ${cost.termMonths} months (effective APR about ${cost.effectiveAprPct}%).`);
  if (p.collateralRequired === "none") pts.push("No collateral required.");
  if (p.personalGuarantee === "not_required") pts.push("No personal guarantee required.");
  if (p.creditPull === "soft") pts.push("Soft credit pull to check your rate.");
  return pts;
}

export interface RankInput {
  profile: Profile;
  products: StoredProduct[];
  extra?: ExtraConstraints;
  now?: Date;
  cfg?: ScoringConfig;
  topN?: number;
}

/** Hard filters -> weighted score -> ranked Top N, plus near misses and an account of what each gate removed. */
export function rankProducts(input: RankInput): RankResult {
  const { profile, products } = input;
  const extra = input.extra ?? {};
  const cfg = input.cfg ?? scoringConfig;
  const now = input.now ?? new Date();
  const topN = input.topN ?? cfg.rank.topN;
  const amount = profile.amountNeeded ?? 0;
  const termBounds = { min: extra.minTermMonths, max: extra.maxTermMonths };

  interface Evaluated { stored: StoredProduct; gates: Gate[]; cost: CostEstimate; failed: Gate[]; ageDays: number; score: ReturnType<typeof scoreProduct> }
  const evaluated: Evaluated[] = products.map((stored) => {
    const gates = evaluateGates(profile, stored.record, stored.lender, extra, cfg);
    const cost = estimateCost(stored.record, { amount, preferredTermMonths: profile.preferredTermMonths, termBounds }, cfg);
    const ageDays = Math.max(0, Math.floor((now.getTime() - stored.scrapedAt.getTime()) / DAY));
    return { stored, gates, cost, failed: gates.filter((g) => g.status === "fail"), ageDays, score: scoreProduct({ profile, stored, gates, cost, ageDays, cfg }) };
  });

  const passing = evaluated.filter((e) => e.failed.length === 0);
  const failing = evaluated.filter((e) => e.failed.length > 0);

  const unknownCount = (e: Evaluated) => e.gates.filter((g) => g.status === "unknown").length;
  passing.sort((a, b) =>
    b.score.total - a.score.total ||
    unknownCount(a) - unknownCount(b) ||
    (a.cost.effectiveAprPct ?? Infinity) - (b.cost.effectiveAprPct ?? Infinity) ||
    a.stored.lender.name.localeCompare(b.stored.lender.name) ||
    a.stored.record.productName.localeCompare(b.stored.record.productName)
  );

  const perLender = new Map<string, number>();
  const picked: Evaluated[] = [];
  let capped = 0;
  for (const e of passing) {
    if (picked.length >= topN) break;
    const n = perLender.get(e.stored.lender.slug) ?? 0;
    if (n >= cfg.rank.maxPerLender) {
      capped++;
      continue;
    }
    perLender.set(e.stored.lender.slug, n + 1);
    picked.push(e);
  }

  const top: RankedItem[] = picked.map((e, i) => ({
    rank: i + 1,
    label: i === 0 ? "Pink Diamond" : "Gem",
    category: e.stored.lender.category,
    product: e.stored,
    score: e.score.total,
    breakdown: e.score.breakdown,
    weighted: e.score.weighted,
    cost: e.cost,
    gates: e.gates,
    risks: buildRisks(e.gates, e.cost, e.stored, e.ageDays),
    ageDays: e.ageDays,
    fitPoints: buildFitPoints(profile, e.gates, e.cost, e.stored),
  }));

  const gateSummary: Partial<Record<GateId, number>> = {};
  const removed: RemovedItem[] = failing.map((e) => {
    for (const g of e.failed) gateSummary[g.id] = (gateSummary[g.id] ?? 0) + 1;
    return { lenderName: e.stored.lender.name, productName: e.stored.record.productName, failedGates: e.failed.map(({ id, label, detail }) => ({ id, label, detail })) };
  });

  const nearMisses: NearMiss[] = failing
    .filter((e) => e.failed.length <= cfg.rank.nearMissMaxFailedGates)
    .sort((a, b) => a.failed.length - b.failed.length || b.score.total - a.score.total)
    .slice(0, cfg.rank.nearMissMax)
    .map((e) => ({ product: e.stored, category: e.stored.lender.category, failedGates: e.failed, fixes: e.failed.map((g) => g.fix ?? g.detail), score: e.score.total }));

  const notes: string[] = [];
  const lenders = new Set(products.map((p) => p.lender.slug)).size;
  notes.push(`${products.length} product${products.length === 1 ? "" : "s"} from ${lenders} lender${lenders === 1 ? "" : "s"} had verified data; ${passing.length} passed every hard filter.`);
  if (passing.length < topN) notes.push(`Only ${passing.length} product${passing.length === 1 ? "" : "s"} passed the hard filters, so fewer than ${topN} are shown rather than padding the list with products you would not qualify for.`);
  if (capped) notes.push(`At most ${cfg.rank.maxPerLender} products per lender are shown; ${capped} further passing product${capped === 1 ? " was" : "s were"} held back to keep the list diverse.`);
  if (products.some((p) => p.record.productType === "mca")) notes.push(`${PRODUCT_TYPE_LABEL.mca} pricing is not an APR; its effective annual cost is an estimate.`);

  return { top, nearMisses, removed, gateSummary, considered: products.length, passed: passing.length, notes, profile, extra, weights: cfg.weights };
}
