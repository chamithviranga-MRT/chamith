import { ExtractedProductSchema, type ProductRecord } from "@/lib/firecrawl/productSchema";
import { emptyProfile, type Profile } from "@/lib/profile/schema";
import { normalizeProfile } from "@/lib/profile/normalize";
import type { LenderRow, StoredProduct } from "@/lib/types";

const blank = Object.fromEntries(Object.keys(ExtractedProductSchema.shape).map((k) => [k, ["excludedStates", "excludedCountries", "eligiblePurposes"].includes(k) ? [] : null]));

export const NOW = new Date("2026-10-05T12:00:00Z");

export function lender(over: Partial<LenderRow> = {}): LenderRow {
  return {
    id: over.slug ?? "l1", slug: "acme", name: "Acme Bank", category: "Alternative", groups: [], domain: "acme.example", hints: [], searchQuery: null,
    source: "seed", reliability: 80, isMarketplace: false, status: "ok", statusReason: null, lastScrapedAt: NOW, ...over,
  };
}

export function product(over: Partial<ProductRecord> = {}, lenderOver: Partial<LenderRow> = {}, scrapedDaysAgo = 1): StoredProduct {
  const l = lender(lenderOver);
  const scrapedAt = new Date(NOW.getTime() - scrapedDaysAgo * 86_400_000);
  const record = {
    ...blank, productName: "Acme Term Loan", productType: "term_loan", lenderSlug: l.slug, lenderName: l.name,
    sourceUrl: `https://${l.domain}/loans`, scrapedAt: scrapedAt.toISOString(), unverifiedFields: [],
    minAmount: 10000, maxAmount: 250000, aprMin: 9, aprMax: 12, termMinMonths: 12, termMaxMonths: 60, ...over,
  } as unknown as ProductRecord;
  return { id: `${l.slug}:${record.productName}`, lender: l, record, scrapedAt, expiresAt: new Date(scrapedAt.getTime() + 7 * 86_400_000) };
}

export function profile(over: Partial<Profile> = {}): Profile {
  return normalizeProfile({
    ...emptyProfile(), amountNeeded: 50000, purpose: "working_capital", ficoMin: 680, ficoMax: 680, timeInBusinessMonths: 36,
    monthlyRevenue: 50000, businessState: "TX", businessCountry: "US", ownerCountry: "US", ownerState: "TX", ...over,
  });
}
