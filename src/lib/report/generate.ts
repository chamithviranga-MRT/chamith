import type { MessagesClient } from "@/lib/anthropic";
import type { LenderOutcome } from "@/lib/firecrawl/pipeline";
import { rankProducts } from "@/lib/matching/rank";
import type { ExtraConstraints } from "@/lib/matching/types";
import type { Profile } from "@/lib/profile/schema";
import { generateReasoning } from "@/lib/reasoning/claude";
import type { StoredProduct } from "@/lib/types";
import { buildReport } from "./build";
import type { LenderStatusRow, Report } from "./types";

/** Rank cached/fresh products against a profile, write verified reasoning, and assemble the report. */
export async function generateReport(opts: {
  profile: Profile;
  products: StoredProduct[];
  outcomes: Array<LenderOutcome | LenderStatusRow>;
  stats: Omit<Report["stats"], "reasoningBy">;
  client: MessagesClient | null;
  extra?: ExtraConstraints;
  followUps?: Report["followUps"];
  now?: Date;
}): Promise<Report> {
  const ranked = rankProducts({ profile: opts.profile, products: opts.products, extra: opts.extra, now: opts.now });
  const reasoning = await generateReasoning({ items: ranked.top, profile: opts.profile, client: opts.client });
  return buildReport({ ranked, reasoning, outcomes: opts.outcomes, stats: opts.stats, followUps: opts.followUps, now: opts.now });
}
