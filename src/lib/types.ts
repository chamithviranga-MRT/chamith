import type { ProductRecord } from "@/lib/firecrawl/productSchema";

export type Category = "SBA" | "Conventional" | "Alternative";
export type LenderStatus = "unknown" | "ok" | "data_unavailable" | "blocked_robots";

export interface LenderRow {
  id: string;
  slug: string;
  name: string;
  category: Category;
  groups: string[];
  domain: string | null;
  hints: string[];
  searchQuery: string | null;
  source: "seed" | "discovered";
  reliability: number;
  isMarketplace: boolean;
  status: LenderStatus;
  statusReason: string | null;
  lastScrapedAt: Date | null;
}

export interface StoredProduct {
  id: string;
  lender: LenderRow;
  record: ProductRecord;
  scrapedAt: Date;
  expiresAt: Date;
}

export type LenderInput = Pick<LenderRow, "slug" | "name" | "category" | "groups" | "domain" | "hints" | "searchQuery" | "source" | "reliability" | "isMarketplace">;
