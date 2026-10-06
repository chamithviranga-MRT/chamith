/**
 * Writes demo/snapshot.json from the Postgres cache: the lenders and products the live research run produced,
 * exactly as the app would read them back (re-judged by cleanCached). Run:  npx tsx demo/export-snapshot.ts
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { prisma } from "../src/lib/db";
import { PrismaRepo } from "../src/lib/firecrawl/repo";
import { loadRegistry } from "../src/lib/firecrawl/registry";

const MAX = Number(process.env.LENDMATCH_MAX_LENDERS || 18);

async function main() {
  const repo = new PrismaRepo();
  const all = await repo.listLenders();
  const order = loadRegistry().map((r) => r.slug);
  const lenders = order.slice(0, MAX).map((slug) => all.find((l) => l.slug === slug)).filter((l): l is NonNullable<typeof l> => Boolean(l));
  const products = (await Promise.all(lenders.map((l) => repo.productsForLender(l.id)))).flat();
  const out = {
    exportedAt: new Date().toISOString(),
    lenders: lenders.map((l) => ({ ...l, lastScrapedAt: l.lastScrapedAt ? new Date(l.lastScrapedAt).toISOString() : null })),
    products: products.map((p) => ({ id: p.id, lenderSlug: p.lender.slug, record: p.record, scrapedAt: p.scrapedAt.toISOString(), expiresAt: p.expiresAt.toISOString() })),
  };
  mkdirSync("demo", { recursive: true });
  writeFileSync("demo/snapshot.json", JSON.stringify(out));
  console.log(`snapshot: ${out.lenders.length} lenders, ${out.products.length} products, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
  await prisma.$disconnect();
}
main();
