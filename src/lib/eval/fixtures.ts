import { ExtractedProductSchema, type ProductRecord, type ProductType } from "@/lib/firecrawl/productSchema";
import type { Category, LenderRow, StoredProduct } from "@/lib/types";

/**
 * SYNTHETIC catalog for offline evaluation. Every lender is fictional ("Fixture ...") and every number is invented to
 * exercise a particular gate (FICO floors, time-in-business minimums, excluded states, residency rules, collateral,
 * business-use bans, ...). These are NOT real lender terms and must never be presented as such. Source URLs use
 * fixtures.example so they can never be mistaken for a real page.
 */
export const FIXTURE_NOTICE =
  "SYNTHETIC FIXTURE DATA: fictional lenders and invented numbers, used only to exercise the engine. These are not real lender terms.";

type Purpose = "working_capital" | "equipment" | "expansion" | "debt_consolidation" | "real_estate" | "inventory";
const WC: Purpose = "working_capital", EQ: Purpose = "equipment", EX: Purpose = "expansion", DC: Purpose = "debt_consolidation", RE: Purpose = "real_estate", INV: Purpose = "inventory";

const L: Record<string, { name: string; category: Category; reliability: number; marketplace?: boolean }> = {
  sbaP: { name: "Fixture SBA Partners", category: "SBA", reliability: 85 },
  micro: { name: "Fixture Community Microlender", category: "SBA", reliability: 70 },
  heart: { name: "Fixture Heartland Bank", category: "SBA", reliability: 88 },
  natl: { name: "Fixture National Bank", category: "Conventional", reliability: 92 },
  regl: { name: "Fixture Regional Bank", category: "Conventional", reliability: 88 },
  trust: { name: "Fixture Trust & Mortgage", category: "Conventional", reliability: 85 },
  prime: { name: "Fixture Prime Personal", category: "Conventional", reliability: 85 },
  onl: { name: "Fixture Online Capital", category: "Alternative", reliability: 75 },
  west: { name: "Fixture Western Lender", category: "Alternative", reliability: 72 },
  fast: { name: "Fixture Fast Funding", category: "Alternative", reliability: 62 },
  inv: { name: "Fixture Invoice Co", category: "Alternative", reliability: 65 },
  eq: { name: "Fixture Equipment Finance", category: "Alternative", reliability: 78 },
  south: { name: "Fixture Southern Equipment", category: "Alternative", reliability: 74 },
  start: { name: "Fixture Startup Lender", category: "Alternative", reliability: 60 },
  desert: { name: "Fixture Desert Startup Loans", category: "Alternative", reliability: 58 },
  mkt: { name: "Fixture Marketplace", category: "SBA", reliability: 70, marketplace: true },
  invest: { name: "Fixture Investor Lending", category: "Alternative", reliability: 72 },
  peach: { name: "Fixture Peach Investor Loans", category: "Alternative", reliability: 68 },
  global: { name: "Fixture Global SMB", category: "Alternative", reliability: 66 },
  card: { name: "Fixture Card Co", category: "Alternative", reliability: 80 },
  pers: { name: "Fixture Personal Lending", category: "Alternative", reliability: 80 },
};

const blank = Object.fromEntries(Object.keys(ExtractedProductSchema.shape).map((k) => [k, ["excludedStates", "excludedCountries", "eligiblePurposes"].includes(k) ? [] : null])) as Record<string, unknown>;

interface Spec {
  lender: keyof typeof L;
  name: string;
  type: ProductType;
  amt: [number, number];
  apr?: [number, number];
  factor?: [number, number];
  term?: [number, number];
  days?: [number, number];
  f: Record<string, unknown>;
  ageDays?: number;
}

const S: Spec[] = [
  { lender: "natl", name: "Business Term Loan", type: "term_loan", amt: [25000, 500000], apr: [8.5, 14], term: [12, 84], days: [7, 14], f: { originationFeePctMin: 1, originationFeePctMax: 2, minFico: 680, minTimeInBusinessMonths: 24, minAnnualRevenue: 250000, collateralRequired: "sometimes", personalGuarantee: "required", uccLien: true, creditPull: "hard", eligiblePurposes: [WC, EQ, EX, INV, DC] } },
  { lender: "natl", name: "Business Line of Credit", type: "line_of_credit", amt: [10000, 250000], apr: [9.5, 16], term: [12, 12], days: [10, 21], f: { minFico: 700, minTimeInBusinessMonths: 24, minAnnualRevenue: 200000, personalGuarantee: "required", uccLien: true, creditPull: "hard", eligiblePurposes: [WC, INV] } },
  { lender: "natl", name: "Equipment Loan", type: "equipment", amt: [20000, 1000000], apr: [7.5, 12], term: [24, 84], days: [5, 10], f: { minFico: 660, minTimeInBusinessMonths: 24, collateralRequired: "always", personalGuarantee: "required", uccLien: true, eligiblePurposes: [EQ] } },
  { lender: "regl", name: "Small Business Term Loan", type: "term_loan", amt: [10000, 250000], apr: [9, 15], term: [12, 60], days: [5, 10], f: { minFico: 660, minTimeInBusinessMonths: 12, minAnnualRevenue: 150000, personalGuarantee: "required", uccLien: false, excludedStates: ["NV"], eligiblePurposes: [WC, EX, EQ, INV] } },
  { lender: "regl", name: "Revolving Credit Line", type: "line_of_credit", amt: [5000, 100000], apr: [11, 18], term: [12, 12], days: [3, 7], f: { minFico: 640, minTimeInBusinessMonths: 12, personalGuarantee: "required", eligiblePurposes: [WC, INV] } },
  { lender: "sbaP", name: "SBA 7(a) Loan", type: "sba_7a", amt: [50000, 5000000], apr: [10.5, 13.5], term: [60, 300], days: [30, 60], f: { minFico: 680, minTimeInBusinessMonths: 24, collateralRequired: "sometimes", personalGuarantee: "required", uccLien: true, residencyRule: "citizen_or_permanent_resident", bankruptcyLookbackYears: 7, taxLiensDisqualify: true, eligiblePurposes: [WC, EQ, EX, RE, DC] } },
  { lender: "sbaP", name: "SBA 504 Loan", type: "sba_504", amt: [125000, 5000000], apr: [7, 9], term: [120, 300], days: [60, 90], f: { minFico: 680, minTimeInBusinessMonths: 24, collateralRequired: "always", personalGuarantee: "required", uccLien: true, residencyRule: "citizen_or_permanent_resident", eligiblePurposes: [EQ, RE, EX] } },
  { lender: "heart", name: "SBA Express Loan", type: "sba_7a", amt: [25000, 500000], apr: [11, 14], term: [60, 120], days: [10, 20], f: { minFico: 660, minTimeInBusinessMonths: 12, personalGuarantee: "required", uccLien: true, residencyRule: "us_resident", eligiblePurposes: [WC, EQ, EX, INV] } },
  { lender: "heart", name: "Established Business Term Loan", type: "term_loan", amt: [50000, 1000000], apr: [8, 12], term: [36, 120], days: [14, 30], f: { minFico: 700, minTimeInBusinessMonths: 36, minAnnualRevenue: 500000, collateralRequired: "always", personalGuarantee: "required", uccLien: true, bankruptcyLookbackYears: 7, recentDefaultsDisqualify: true, eligiblePurposes: [EX, RE, EQ] } },
  { lender: "micro", name: "Startup Microloan", type: "microloan", amt: [500, 50000], apr: [8, 13], term: [12, 72], days: [14, 30], f: { minFico: 575, minTimeInBusinessMonths: 0, collateralRequired: "sometimes", personalGuarantee: "required", residencyRule: "us_resident", eligiblePurposes: [WC, EQ, INV] } },
  { lender: "micro", name: "Growth Microloan", type: "microloan", amt: [5000, 50000], apr: [9, 14], term: [12, 72], days: [14, 30], f: { minFico: 620, minTimeInBusinessMonths: 6, personalGuarantee: "required", residencyRule: "us_resident", eligiblePurposes: [WC, EQ, INV, EX] } },
  { lender: "onl", name: "Fast Term Loan", type: "term_loan", amt: [5000, 250000], apr: [14, 35], term: [6, 36], days: [1, 3], f: { originationFeePctMin: 2, originationFeePctMax: 5, minFico: 620, minTimeInBusinessMonths: 12, minMonthlyRevenue: 10000, personalGuarantee: "required", uccLien: true, creditPull: "soft", eligiblePurposes: [WC, EX, INV, DC, EQ] } },
  { lender: "onl", name: "Flexible Line of Credit", type: "line_of_credit", amt: [5000, 150000], apr: [16, 40], term: [6, 12], days: [1, 2], f: { monthlyFeeUsd: 25, minFico: 600, minTimeInBusinessMonths: 6, minMonthlyRevenue: 8000, personalGuarantee: "required", uccLien: true, creditPull: "soft", eligiblePurposes: [WC, INV] } },
  { lender: "west", name: "Western Growth Loan", type: "term_loan", amt: [10000, 300000], apr: [12, 24], term: [12, 60], days: [3, 7], f: { minFico: 640, minTimeInBusinessMonths: 12, personalGuarantee: "required", excludedStates: ["TX", "CA"], eligiblePurposes: [WC, EX, EQ] } },
  { lender: "fast", name: "Merchant Cash Advance", type: "mca", amt: [5000, 500000], factor: [1.15, 1.45], term: [3, 18], days: [0, 2], f: { repaymentFrequency: "daily", minFico: 500, minTimeInBusinessMonths: 6, minMonthlyRevenue: 15000, collateralRequired: "none", personalGuarantee: "required", uccLien: true, eligiblePurposes: [WC, INV, EX] } },
  { lender: "fast", name: "Revenue-Based Advance", type: "mca", amt: [5000, 250000], factor: [1.2, 1.5], term: [3, 12], days: [0, 1], f: { repaymentFrequency: "daily", minFico: 500, minTimeInBusinessMonths: 3, minMonthlyRevenue: 8000, collateralRequired: "none", personalGuarantee: "required", uccLien: true } },
  { lender: "inv", name: "Invoice Factoring", type: "invoice_factoring", amt: [10000, 1000000], factor: [1.01, 1.04], days: [1, 3], f: { minFico: 550, minTimeInBusinessMonths: 3, collateralRequired: "none", personalGuarantee: "sometimes", uccLien: true, eligiblePurposes: [WC] } },
  { lender: "eq", name: "Equipment Financing", type: "equipment", amt: [5000, 500000], apr: [8, 22], term: [12, 72], days: [1, 5], f: { minFico: 600, minTimeInBusinessMonths: 12, collateralRequired: "always", personalGuarantee: "sometimes", uccLien: true, creditPull: "soft", eligiblePurposes: [EQ] } },
  { lender: "eq", name: "Startup Equipment Financing", type: "equipment", amt: [5000, 150000], apr: [16, 29], term: [24, 60], days: [3, 7], f: { minFico: 560, minTimeInBusinessMonths: 0, collateralRequired: "always", personalGuarantee: "required", uccLien: true, eligiblePurposes: [EQ] } },
  { lender: "south", name: "Heavy Equipment Loan", type: "equipment", amt: [25000, 750000], apr: [7, 15], term: [24, 84], days: [3, 10], f: { minFico: 620, minTimeInBusinessMonths: 12, collateralRequired: "always", personalGuarantee: "required", excludedStates: ["FL"], eligiblePurposes: [EQ] } },
  { lender: "start", name: "Startup Working Capital Loan", type: "term_loan", amt: [5000, 75000], apr: [18, 36], term: [6, 24], days: [2, 5], f: { originationFeePctMin: 3, originationFeePctMax: 6, minFico: 550, minTimeInBusinessMonths: 0, collateralRequired: "none", personalGuarantee: "required", eligiblePurposes: [WC, INV, EQ] } },
  { lender: "desert", name: "Desert Startup Loan", type: "term_loan", amt: [5000, 60000], apr: [15, 30], term: [6, 36], days: [2, 6], f: { minFico: 560, minTimeInBusinessMonths: 0, personalGuarantee: "required", excludedStates: ["AZ"], eligiblePurposes: [WC, EQ] } },
  { lender: "mkt", name: "Marketplace Business Loans", type: "term_loan", amt: [5000, 5000000], apr: [6, 99], term: [3, 300], days: [1, 14], f: { minFico: 550, minTimeInBusinessMonths: 6, eligiblePurposes: [WC, EQ, EX, INV, RE, DC] } },
  { lender: "invest", name: "DSCR Investment Property Loan", type: "commercial_real_estate", amt: [100000, 3000000], apr: [7.5, 10.5], term: [360, 360], days: [21, 35], f: { minFico: 680, minTimeInBusinessMonths: 0, collateralRequired: "always", personalGuarantee: "sometimes", uccLien: false, creditPull: "hard", eligiblePurposes: [RE] } },
  { lender: "invest", name: "Bridge / Fix-and-Flip Loan", type: "commercial_real_estate", amt: [75000, 2000000], apr: [9.5, 13.5], term: [6, 24], days: [7, 14], f: { originationFeePctMin: 1.5, originationFeePctMax: 3, minFico: 660, collateralRequired: "always", personalGuarantee: "required", eligiblePurposes: [RE] } },
  { lender: "peach", name: "Peach State Property Loan", type: "commercial_real_estate", amt: [100000, 2000000], apr: [7, 9.5], term: [120, 360], days: [14, 30], f: { minFico: 700, collateralRequired: "always", personalGuarantee: "required", excludedStates: ["GA"], eligiblePurposes: [RE] } },
  { lender: "trust", name: "Commercial Mortgage", type: "commercial_real_estate", amt: [250000, 10000000], apr: [6.8, 9], term: [120, 300], days: [45, 60], f: { minFico: 700, minTimeInBusinessMonths: 24, collateralRequired: "always", personalGuarantee: "required", uccLien: true, eligiblePurposes: [RE, EX] } },
  { lender: "global", name: "Global Founders Term Loan", type: "term_loan", amt: [10000, 250000], apr: [12, 24], term: [12, 48], days: [5, 10], f: { minTimeInBusinessMonths: 12, minMonthlyRevenue: 8000, residencyRule: "us_business_address", personalGuarantee: "required", eligiblePurposes: [WC, INV, EX] } },
  { lender: "global", name: "Global Founders Credit Line", type: "line_of_credit", amt: [5000, 100000], apr: [15, 30], term: [6, 12], days: [3, 7], f: { minTimeInBusinessMonths: 6, minMonthlyRevenue: 5000, residencyRule: "us_business_address", eligiblePurposes: [WC, INV] } },
  { lender: "card", name: "Business Rewards Card", type: "business_card", amt: [1000, 25000], apr: [17, 29], days: [3, 7], f: { minFico: 680, personalGuarantee: "required", creditPull: "hard", eligiblePurposes: [WC, INV] } },
  { lender: "pers", name: "Personal Loan (business use allowed)", type: "personal_loan", amt: [2000, 50000], apr: [9, 29], term: [24, 84], days: [1, 5], f: { minFico: 600, businessUseAllowed: true, collateralRequired: "none", personalGuarantee: "not_required", uccLien: false, creditPull: "soft", residencyRule: "citizen_or_permanent_resident", eligiblePurposes: [WC, EX, DC, INV, EQ] } },
  { lender: "pers", name: "Startup Personal Loan", type: "personal_loan", amt: [5000, 40000], apr: [12, 30], term: [24, 60], days: [2, 7], f: { minFico: 560, businessUseAllowed: true, collateralRequired: "none", personalGuarantee: "not_required", uccLien: false, creditPull: "soft", residencyRule: "us_resident", eligiblePurposes: [WC, EQ, INV] } },
  { lender: "prime", name: "Prime Personal Loan", type: "personal_loan", amt: [5000, 100000], apr: [7, 18], term: [24, 84], days: [1, 3], f: { minFico: 700, businessUseAllowed: false, collateralRequired: "none", personalGuarantee: "not_required", uccLien: false, creditPull: "soft" } },
];

export function fixtureProducts(now: Date): StoredProduct[] {
  return S.map((s, i) => {
    const info = L[s.lender];
    const slug = `fx-${String(s.lender)}`;
    const lender: LenderRow = {
      id: slug, slug, name: info.name, category: info.category, groups: ["Synthetic fixture"], domain: "fixtures.example", hints: [], searchQuery: null,
      source: "seed", reliability: info.reliability, isMarketplace: Boolean(info.marketplace), status: "ok", statusReason: null, lastScrapedAt: now,
    };
    const scrapedAt = new Date(now.getTime() - (s.ageDays ?? i % 5) * 86_400_000);
    const record = {
      ...blank,
      productName: s.name, productType: s.type, lenderSlug: slug, lenderName: info.name,
      sourceUrl: `https://fixtures.example/${slug}/${s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`,
      scrapedAt: scrapedAt.toISOString(), unverifiedFields: [],
      minAmount: s.amt[0], maxAmount: s.amt[1],
      aprMin: s.apr?.[0] ?? null, aprMax: s.apr?.[1] ?? null, factorMin: s.factor?.[0] ?? null, factorMax: s.factor?.[1] ?? null,
      termMinMonths: s.term?.[0] ?? null, termMaxMonths: s.term?.[1] ?? null, fundingDaysMin: s.days?.[0] ?? null, fundingDaysMax: s.days?.[1] ?? null,
      ...s.f,
    } as unknown as ProductRecord;
    return { id: `${slug}:${s.name}`, lender, record, scrapedAt, expiresAt: new Date(scrapedAt.getTime() + 7 * 86_400_000) };
  });
}

export const FIXTURE_PRODUCT_COUNT = S.length;
