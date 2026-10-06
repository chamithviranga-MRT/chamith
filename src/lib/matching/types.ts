import type { Category, StoredProduct } from "@/lib/types";
import type { ProductType } from "@/lib/firecrawl/productSchema";
import type { Profile } from "@/lib/profile/schema";

export type GateId =
  | "amount" | "fico" | "timeInBusiness" | "revenue" | "state" | "country" | "residency" | "purpose" | "businessUse"
  | "collateral" | "personalGuarantee" | "uccLien" | "bankruptcy" | "taxLiens" | "defaults"
  | "userTerm" | "userApr" | "userPayment" | "userSpeed" | "userLien" | "userGuarantee" | "userCollateral" | "userType" | "userCategory"
  | "userLender" | "userPull" | "userPrepay" | "userAmount";

/**
 * pass       = requirement is known and met
 * fail       = requirement is known and NOT met (hard filter)
 * borderline = passes only at the edge of the user's range, or needs the user to confirm something
 * unknown    = the lender does not publish this, so it cannot be checked (never treated as a pass in scoring)
 */
export type GateStatus = "pass" | "fail" | "borderline" | "unknown";

export interface Gate {
  id: GateId;
  label: string;
  status: GateStatus;
  detail: string;
  /** For fail/borderline: what the borrower would need to change. */
  fix?: string;
  /** Position within the margin: 0..1 (only for numeric gates that pass). */
  margin?: number;
}

/** Extra filters from follow-up chat ("drop anything with a lien", "only under 24 months"). */
export interface ExtraConstraints {
  noUccLien?: boolean;
  noPersonalGuarantee?: boolean;
  noCollateral?: boolean;
  maxTermMonths?: number;
  minTermMonths?: number;
  maxAprPct?: number;
  maxMonthlyPayment?: number;
  maxDaysToFund?: number;
  minAmount?: number;
  maxAmount?: number;
  includeTypes?: ProductType[];
  excludeTypes?: ProductType[];
  includeCategories?: Category[];
  excludeCategories?: Category[];
  excludeLenders?: string[];
  softPullOnly?: boolean;
  noPrepaymentPenalty?: boolean;
}

export interface ScoreBreakdown {
  eligibilityFit: number;
  totalCost: number;
  termPaymentFit: number;
  speed: number;
  collateralBurden: number;
  reliability: number;
}

export interface RankedItem {
  rank: number;
  label: "Pink Diamond" | "Gem";
  category: Category;
  product: StoredProduct;
  score: number;
  /** Each component 0-100 (before weighting) and its weighted points. */
  breakdown: ScoreBreakdown;
  weighted: ScoreBreakdown;
  cost: import("./cost").CostEstimate;
  gates: Gate[];
  /** What could block approval: deterministic, derived from gates and burdens. */
  risks: string[];
  ageDays: number;
  /** Short plain-language "why it fits" bullets built from known fields. */
  fitPoints: string[];
}

export interface NearMiss {
  product: StoredProduct;
  category: Category;
  failedGates: Gate[];
  fixes: string[];
  score: number;
}

export interface RemovedItem {
  lenderName: string;
  productName: string;
  failedGates: Array<Pick<Gate, "id" | "label" | "detail">>;
}

export interface RankResult {
  top: RankedItem[];
  nearMisses: NearMiss[];
  removed: RemovedItem[];
  /** How many products each gate removed (a product failing two gates counts in both). */
  gateSummary: Partial<Record<GateId, number>>;
  considered: number;
  passed: number;
  notes: string[];
  profile: Profile;
  extra: ExtraConstraints;
  weights: ScoreBreakdown;
}
