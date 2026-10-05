import type { MessagesClient } from "@/lib/anthropic";
import { CACHE_TTL_DAYS } from "@/lib/config";
import { applyPatch } from "@/lib/profile/normalize";
import type { Profile } from "@/lib/profile/schema";
import { generateReport } from "@/lib/report/generate";
import type { Report } from "@/lib/report/types";
import type { StoredProduct } from "@/lib/types";
import { describeIntent, mergeConstraints, type FollowUpIntent } from "./intent";

export const FOLLOW_UP_EXAMPLES = "“drop anything with a lien”, “only under 24 months”, “no personal guarantee”, “no merchant cash advances”, “only SBA loans”, “APR under 20%”, “payment under $2,000 a month”, “funded within 7 days”";

export interface RerankResult {
  report: Report;
  changed: boolean;
  applied: string[];
  note: string;
  /** Profile fields that affect which lenders are discovered changed; a fresh research run would find more. */
  suggestFreshResearch: boolean;
  profile: Profile;
}

const DISCOVERY_FIELDS = ["purpose", "borrowerType", "businessState", "ownerCountry", "timeInBusinessMonths"] as const;

/**
 * Re-rank from CACHED, unexpired data only. No web access happens here: the products were scraped earlier and are
 * still inside the 7-day TTL. Filters accumulate across follow-ups.
 */
export async function rerank(opts: {
  prev: Report;
  products: StoredProduct[];
  message: string;
  intent: FollowUpIntent;
  client: MessagesClient | null;
  now?: Date;
}): Promise<RerankResult> {
  const { prev, intent } = opts;
  const now = opts.now ?? new Date();

  if (!intent.understood) {
    return { report: prev, changed: false, applied: [], suggestFreshResearch: false, profile: prev.profile, note: `I couldn't turn that into a filter. Try something like ${FOLLOW_UP_EXAMPLES}.` };
  }

  const base = intent.clear ? {} : prev.extra;
  const extra = mergeConstraints(base, intent.constraints);

  let profile = prev.profile;
  let profileIssues: string[] = [];
  if (Object.keys(intent.profilePatch).length) {
    const r = applyPatch(prev.profile, intent.profilePatch);
    profile = r.profile;
    profileIssues = r.issues;
  }
  const suggestFreshResearch = DISCOVERY_FIELDS.some((k) => profile[k] !== prev.profile[k]);

  const applied = intent.clear ? ["Cleared all filters", ...describeIntent(intent)] : describeIntent(intent);
  const followUps = intent.clear ? [{ text: opts.message, applied }] : [...prev.followUps, { text: opts.message, applied }];

  const report = await generateReport({
    profile, products: opts.products, extra, followUps, client: opts.client, now,
    outcomes: prev.lenders,
    stats: { sourcesRead: prev.stats.sourcesRead, sourcesFromCache: prev.stats.sourcesFromCache, lendersTotal: prev.stats.lendersTotal, discoveredNew: prev.stats.discoveredNew, productsFound: opts.products.length },
  });

  const lenders = new Set(opts.products.map((p) => p.lender.slug)).size;
  const oldest = opts.products.length ? Math.max(...opts.products.map((p) => Math.floor((now.getTime() - p.scrapedAt.getTime()) / 86_400_000))) : 0;
  const expectedLenders = prev.lenders.filter((l) => (l.status === "scraped" || l.status === "cached") && l.products > 0).length;
  const parts = [
    `Applied: ${applied.join("; ")}.`,
    `Re-ranked ${opts.products.length} cached product${opts.products.length === 1 ? "" : "s"} from ${lenders} lender${lenders === 1 ? "" : "s"} (oldest data ${oldest} day${oldest === 1 ? "" : "s"} old). No pages were re-scraped.`,
  ];
  if (expectedLenders > lenders) parts.push(`${expectedLenders - lenders} lender${expectedLenders - lenders === 1 ? "'s" : "s'"} cached data is older than ${CACHE_TTL_DAYS} days and was left out — use “Refresh this lender” or run the research again.`);
  if (profileIssues.length) parts.push(`I ignored a value that didn't look right: ${profileIssues.join(" ")}`);
  if (suggestFreshResearch) parts.push("That changes which lenders are relevant. Edit your profile and press “Confirm & research” again to look for more lenders (lenders with fresh data are reused, not re-scraped).");
  if (report.items.length === 0) parts.push("Nothing passes these filters — see the near misses below for what to relax.");

  return { report, changed: true, applied, note: parts.join(" "), suggestFreshResearch, profile };
}
