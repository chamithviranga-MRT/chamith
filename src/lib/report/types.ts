import type { CostEstimate } from "@/lib/matching/cost";
import type { ExtraConstraints, Gate, GateId, RemovedItem, ScoreBreakdown } from "@/lib/matching/types";
import type { Profile } from "@/lib/profile/schema";
import type { Category } from "@/lib/types";

export interface Reasoning {
  whyItFits: string;
  couldBlock: string;
  /** Always code-generated (never by the model). */
  estimatedPayment: string;
  nextStep: string;
  /** Always code-generated: source URL + scraped date. */
  citation: string;
  source: "claude" | "template";
}

export interface ReportItem {
  rank: number;
  label: "Pink Diamond" | "Gem";
  category: Category;
  lenderName: string;
  lenderSlug: string;
  lenderSource: "seed" | "discovered";
  isMarketplace: boolean;
  productName: string;
  productType: string;
  typeLabel: string;
  score: number;
  breakdown: ScoreBreakdown;
  weighted: ScoreBreakdown;
  amountRange: string;
  rateRange: string;
  termRange: string;
  speed: string;
  requirements: string[];
  fees: string[];
  cost: CostEstimate;
  gates: Gate[];
  fitPoints: string[];
  risks: string[];
  reasoning: Reasoning;
  sourceUrl: string;
  scrapedAt: string;
  ageDays: number;
  evidenceQuote: string | null;
  unverifiedFields: string[];
  /** Raw numbers for sortable table columns. */
  sort: { amountMax: number | null; rate: number | null; termMax: number | null; speedDays: number | null; monthly: number | null };
}

export interface ReportNearMiss {
  lenderName: string;
  productName: string;
  typeLabel: string;
  category: Category;
  failedGates: Array<{ id: GateId; label: string; detail: string }>;
  fixes: string[];
  sourceUrl: string;
  scrapedAt: string;
}

export interface LenderStatusRow {
  name: string;
  slug: string;
  status: "cached" | "scraped" | "unavailable" | "blocked";
  products: number;
  reason?: string;
  dataAgeDays: number | null;
}

export interface Report {
  version: 1;
  generatedAt: string;
  profile: Profile;
  weights: ScoreBreakdown;
  items: ReportItem[];
  nearMisses: ReportNearMiss[];
  removed: RemovedItem[];
  gateSummary: Partial<Record<GateId, number>>;
  considered: number;
  passed: number;
  notes: string[];
  extra: ExtraConstraints;
  /** Follow-up requests applied so far, newest last. */
  followUps: Array<{ text: string; applied: string[] }>;
  lenders: LenderStatusRow[];
  stats: {
    sourcesRead: number;
    sourcesFromCache: number;
    lendersTotal: number;
    discoveredNew: number;
    productsFound: number;
    reasoningBy: { claude: number; template: number };
  };
  disclaimer: string;
}
