/**
 * Loads demo/snapshot.json (real lender pages read on the snapshot date) into the database cache, keeping each
 * product's original scrape date, so a fresh deployment can be tested without spending Firecrawl credits.
 * The data keeps its original 7-day expiry: after that the app treats it as expired (a research run re-reads those
 * lenders live, which costs credits) and you should run `npm run cache:warm`. Idempotent: running it twice replaces, never duplicates.
 *
 *   npm run cache:import
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { CACHE_TTL_MS } from "../src/lib/config";
import { PrismaRepo } from "../src/lib/firecrawl/repo";
import { prisma } from "../src/lib/db";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const snap = JSON.parse(readFileSync("demo/snapshot.json", "utf8")) as {
    exportedAt: string;
    lenders: Array<{ slug: string; name: string; category: never; groups: string[]; domain: string | null; hints: string[]; searchQuery: string | null; source: "seed" | "discovered"; reliability: number; isMarketplace: boolean; status: string; statusReason: string | null; lastScrapedAt: string | null }>;
    products: Array<{ lenderSlug: string; record: never; scrapedAt: string; expiresAt: string }>;
  };
  const repo = new PrismaRepo();
  let lenders = 0, products = 0;
  for (const l of snap.lenders) {
    const row = await repo.upsertLender({ slug: l.slug, name: l.name, category: l.category, groups: l.groups, domain: l.domain, hints: l.hints, searchQuery: l.searchQuery, source: l.source, reliability: l.reliability, isMarketplace: l.isMarketplace });
    const mine = snap.products.filter((p) => p.lenderSlug === l.slug);
    if (mine.length) {
      const scrapedAt = new Date(mine[0].scrapedAt);
      await repo.replaceProducts(row.id, mine.map((p) => p.record), scrapedAt, CACHE_TTL_MS);
      await repo.updateLender(row.id, { status: "ok", statusReason: null, lastScrapedAt: scrapedAt });
      products += mine.length;
    } else {
      await repo.updateLender(row.id, { status: l.status === "blocked_robots" ? "blocked_robots" : "data_unavailable", statusReason: l.statusReason, lastScrapedAt: l.lastScrapedAt ? new Date(l.lastScrapedAt) : null });
    }
    lenders++;
  }
  const expires = new Date(new Date(snap.exportedAt).getTime() + CACHE_TTL_MS);
  console.log(`Imported ${lenders} lenders and ${products} products (read ${snap.exportedAt.slice(0, 10)}). They expire ${expires.toISOString().slice(0, 10)}${expires < new Date() ? " (already expired: run npm run cache:warm instead)" : ""}.`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(`\nERROR: ${e instanceof Error ? e.message : e}\n`);
  process.exit(1);
});
