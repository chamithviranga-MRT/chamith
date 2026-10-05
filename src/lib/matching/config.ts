import { z } from "zod";
import raw from "@config/scoring.json";

const Anchors = z.array(z.tuple([z.number(), z.number()])).min(2);

export const ScoringConfigSchema = z.object({
  weights: z.object({
    eligibilityFit: z.number().min(0),
    totalCost: z.number().min(0),
    termPaymentFit: z.number().min(0),
    speed: z.number().min(0),
    collateralBurden: z.number().min(0),
    reliability: z.number().min(0),
  }),
  cost: z.object({ aprAnchors: Anchors, unknownCostScore: z.number(), lowerBoundOnlyMultiplier: z.number() }),
  defaults: z.object({ termMonthsByType: z.record(z.string(), z.number()) }),
  eligibility: z.object({
    passBase: z.number(), borderlineScore: z.number(), unknownScore: z.number(),
    ficoMarginFullAt: z.number(), tibMarginMultiple: z.number(), revenueMarginMultiple: z.number(),
  }),
  termPayment: z.object({
    paymentToRevenueAnchors: Anchors, unknownRevenueScore: z.number(), zeroRevenueScore: z.number(),
    noTermPreferenceScore: z.number(), unknownTermScore: z.number(), frequencyMatch: z.number(),
    frequencyNoPreference: z.number(), frequencyMismatch: z.number(),
    subWeights: z.object({ term: z.number(), affordability: z.number(), frequency: z.number() }),
  }),
  speed: z.object({ unknownScore: z.number(), slowestMultiple: z.number(), absoluteAnchorsDays: Anchors }),
  burden: z.object({
    personalGuarantee: z.number(), personalGuaranteeSometimes: z.number(), uccLien: z.number(),
    collateralAlways: z.number(), collateralSometimes: z.number(), unknownEach: z.number(), willingFactor: z.number(),
  }),
  reliability: z.object({
    lenderWeight: z.number(), dataWeight: z.number(), completenessWeight: z.number(), freshnessWeight: z.number(),
    freshnessFullDays: z.number(), freshnessAtTtlScore: z.number(), unverifiedFieldPenalty: z.number(), unverifiedMaxPenalty: z.number(),
  }),
  assumptions: z.object({ unpublishedCardLimitCeilingUsd: z.number().min(0) }).passthrough(),
  rank: z.object({ topN: z.number().int().min(1), nearMissMax: z.number().int().min(0), nearMissMaxFailedGates: z.number().int().min(1), maxPerLender: z.number().int().min(1) }),
});
export type ScoringConfig = z.infer<typeof ScoringConfigSchema>;

/** Validates the editable config. Weights must total 100 so scores read as 0-100. */
export function parseScoringConfig(input: unknown): ScoringConfig {
  const cfg = ScoringConfigSchema.parse(input);
  const total = Object.values(cfg.weights).reduce((a, b) => a + b, 0);
  if (Math.abs(total - 100) > 0.001) throw new Error(`config/scoring.json: weights must sum to 100 (got ${total})`);
  return cfg;
}

export const scoringConfig: ScoringConfig = parseScoringConfig(raw);

/** Piecewise-linear interpolation through [x, y] anchors (x ascending or descending in y). Clamped at the ends. */
export function interpolate(anchors: Array<[number, number]>, x: number): number {
  const a = [...anchors].sort((p, q) => p[0] - q[0]);
  if (x <= a[0][0]) return a[0][1];
  if (x >= a[a.length - 1][0]) return a[a.length - 1][1];
  for (let i = 1; i < a.length; i++) {
    if (x <= a[i][0]) {
      const [x0, y0] = a[i - 1];
      const [x1, y1] = a[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return a[a.length - 1][1];
}
