/**
 * Fills the lender cache (Postgres) from the live web so the first real user is not the one who waits for it.
 * Reads the registry lenders only (no profile-driven discovery) and spends Firecrawl credits: ~30 per lender that is
 * not already cached. Lenders cached within the last 7 days, and lenders that recently returned nothing, cost nothing.
 *
 *   npm run cache:warm                       # all registry lenders (LENDMATCH_MAX_LENDERS caps the count)
 *   LENDMATCH_MAX_LENDERS=10 npm run cache:warm
 *   npm run cache:warm -- --refresh=bluevine,lendio   # re-read these even if cached
 */
import "dotenv/config";
import { FirecrawlWeb } from "../src/lib/firecrawl/client";
import { runPipeline } from "../src/lib/firecrawl/pipeline";
import { PrismaRepo } from "../src/lib/firecrawl/repo";
import { loadRegistry } from "../src/lib/firecrawl/registry";
import { emptyProfile } from "../src/lib/profile/schema";
import { normalizeProfile } from "../src/lib/profile/normalize";
import { prisma } from "../src/lib/db";

const refresh = (process.argv.find((a) => a.startsWith("--refresh="))?.split("=")[1] ?? "").split(",").filter(Boolean);

async function main() {
  const web = FirecrawlWeb.fromEnv();
  if (!web) throw new Error("FIRECRAWL_API_KEY is not set.");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const res = await runPipeline({
    profile: normalizeProfile(emptyProfile()), web, repo: new PrismaRepo(), registry: loadRegistry(),
    discovery: false, forceSlugs: refresh, onEvent: (e) => e.type === "stage" && console.error(`[warm] ${e.message}`),
  });
  if (res.fatalError) throw new Error(res.fatalError);
  const by = (s: string) => res.outcomes.filter((o) => o.status === s);
  console.log(`\nLenders: ${res.outcomes.length} · read live ${by("scraped").length} · from cache ${by("cached").length} · unavailable ${by("unavailable").length} · blocked ${by("blocked").length}`);
  console.log(`Products cached: ${res.products.length} · pages read live: ${res.stats.sourcesRead}`);
  for (const o of res.outcomes.filter((x) => x.status === "unavailable" || x.status === "blocked")) console.log(`  - ${o.name}: ${o.status}${o.reason ? ` (${o.reason})` : ""}`);
  if (!res.products.length) process.exitCode = 1;
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(`\nERROR: ${e instanceof Error ? e.message : e}\n`);
  process.exit(1);
});
