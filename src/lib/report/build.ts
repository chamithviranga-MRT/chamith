import { DISCLAIMER } from "@/lib/config";
import { PRODUCT_TYPE_LABEL } from "@/lib/firecrawl/productSchema";
import type { LenderOutcome } from "@/lib/firecrawl/pipeline";
import { fundingDays } from "@/lib/matching/score";
import type { RankedItem, RankResult } from "@/lib/matching/types";
import type { ReasoningResult } from "@/lib/reasoning/claude";
import { templateReasoning } from "@/lib/reasoning/template";
import { describeFees, describeRequirements, fmtAmountRange, fmtRateRange, fmtSpeed, fmtTermRange } from "./format";
import type { LenderStatusRow, Report, ReportItem, ReportNearMiss } from "./types";

function toItem(r: RankedItem, reasoning: ReasoningResult | null): ReportItem {
  const p = r.product.record;
  return {
    rank: r.rank,
    label: r.label,
    category: r.category,
    lenderName: r.product.lender.name,
    lenderSlug: r.product.lender.slug,
    lenderSource: r.product.lender.source,
    isMarketplace: r.product.lender.isMarketplace,
    productName: p.productName,
    productType: p.productType,
    typeLabel: PRODUCT_TYPE_LABEL[p.productType],
    score: r.score,
    breakdown: r.breakdown,
    weighted: r.weighted,
    amountRange: fmtAmountRange(p),
    rateRange: fmtRateRange(p),
    termRange: fmtTermRange(p),
    speed: fmtSpeed(p),
    requirements: describeRequirements(p),
    fees: describeFees(p),
    cost: r.cost,
    gates: r.gates,
    fitPoints: r.fitPoints,
    risks: r.risks,
    reasoning: reasoning?.byId.get(r.product.id) ?? templateReasoning(r),
    sourceUrl: p.sourceUrl,
    scrapedAt: r.product.scrapedAt.toISOString(),
    ageDays: r.ageDays,
    evidenceQuote: p.evidenceQuote,
    unverifiedFields: p.unverifiedFields,
    sort: {
      amountMax: p.maxAmount,
      rate: r.cost.effectiveAprPct ?? p.aprMin ?? p.aprMax,
      termMax: p.termMaxMonths ?? r.cost.termMonths,
      speedDays: fundingDays(p),
      monthly: r.cost.monthlyPayment,
    },
  };
}

export interface BuildReportInput {
  ranked: RankResult;
  reasoning: ReasoningResult | null;
  outcomes: LenderOutcome[] | LenderStatusRow[];
  stats: Omit<Report["stats"], "reasoningBy">;
  followUps?: Report["followUps"];
  now?: Date;
}

export function buildReport(input: BuildReportInput): Report {
  const { ranked, reasoning } = input;
  const nearMisses: ReportNearMiss[] = ranked.nearMisses.map((n) => ({
    lenderName: n.product.lender.name,
    productName: n.product.record.productName,
    typeLabel: PRODUCT_TYPE_LABEL[n.product.record.productType],
    category: n.category,
    failedGates: n.failedGates.map(({ id, label, detail }) => ({ id, label, detail })),
    fixes: n.fixes,
    sourceUrl: n.product.record.sourceUrl,
    scrapedAt: n.product.scrapedAt.toISOString(),
  }));
  const lenders: LenderStatusRow[] = input.outcomes.map((o) => ({
    name: o.name, slug: o.slug, status: o.status, products: o.products, reason: o.reason, dataAgeDays: o.dataAgeDays,
  }));
  const items = ranked.top.map((r) => toItem(r, reasoning));
  return {
    version: 1,
    generatedAt: (input.now ?? new Date()).toISOString(),
    profile: ranked.profile,
    weights: ranked.weights,
    items,
    nearMisses,
    removed: ranked.removed,
    gateSummary: ranked.gateSummary,
    considered: ranked.considered,
    passed: ranked.passed,
    notes: ranked.notes,
    extra: ranked.extra,
    followUps: input.followUps ?? [],
    lenders,
    stats: { ...input.stats, reasoningBy: { claude: items.filter((i) => i.reasoning.source === "claude").length, template: items.filter((i) => i.reasoning.source === "template").length } },
    disclaimer: DISCLAIMER,
  };
}
