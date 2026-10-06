import registryJson from "@data/lenders.json";
import type { Category, LenderInput } from "@/lib/types";

interface RegistryEntry {
  slug: string;
  name: string;
  category: Category;
  groups: string[];
  domain: string | null;
  searchQuery?: string;
  hints: string[];
  isMarketplace?: boolean;
  reliability: number;
}

/** Seed registry (data/lenders.json). A starting point only — discovery adds lenders on every run. */
export function loadRegistry(): LenderInput[] {
  return (registryJson.lenders as RegistryEntry[]).map((l) => ({
    slug: l.slug,
    name: l.name,
    category: l.category,
    groups: l.groups,
    domain: l.domain,
    hints: l.hints,
    searchQuery: l.searchQuery ?? null,
    source: "seed" as const,
    reliability: l.reliability,
    isMarketplace: Boolean(l.isMarketplace),
  }));
}
