import { randomUUID, createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { ProductRecordSchema, type ProductRecord } from "./productSchema";
import type { Category, LenderInput, LenderRow, LenderStatus, StoredProduct } from "@/lib/types";

/** Storage for the research pipeline. Prisma in production, in-memory in unit tests. */
export interface ResearchRepo {
  upsertLender(input: LenderInput): Promise<LenderRow>;
  updateLender(id: string, patch: Partial<Pick<LenderRow, "domain" | "status" | "statusReason" | "lastScrapedAt">>): Promise<void>;
  listLenders(): Promise<LenderRow[]>;
  productsForLender(lenderId: string): Promise<StoredProduct[]>;
  /** Unexpired products for the given lender slugs (used to re-rank from cache without any web access). */
  freshProductsForSlugs(slugs: string[], now: Date): Promise<StoredProduct[]>;
  replaceProducts(lenderId: string, records: ProductRecord[], now: Date, ttlMs: number): Promise<void>;
  recordPage(url: string, lenderId: string, status: string, productCount: number, error?: string): Promise<void>;
  getRobots(host: string, maxAgeMs: number, now: Date): Promise<string | null>;
  saveRobots(host: string, body: string, now: Date): Promise<void>;
}

export const hashRecord = (r: ProductRecord) => createHash("sha256").update(JSON.stringify({ ...r, scrapedAt: undefined })).digest("hex").slice(0, 32);

// ---------------- in-memory (tests) ----------------
export class MemoryRepo implements ResearchRepo {
  lenders = new Map<string, LenderRow>();
  products = new Map<string, StoredProduct[]>();
  pages: Array<{ url: string; lenderId: string; status: string; productCount: number; error?: string }> = [];
  robots = new Map<string, { body: string; at: Date }>();

  async upsertLender(input: LenderInput): Promise<LenderRow> {
    const existing = [...this.lenders.values()].find((l) => l.slug === input.slug);
    if (existing) {
      Object.assign(existing, { ...input, domain: input.domain ?? existing.domain });
      return existing;
    }
    const row: LenderRow = { ...input, id: randomUUID(), status: "unknown", statusReason: null, lastScrapedAt: null };
    this.lenders.set(row.id, row);
    return row;
  }
  async updateLender(id: string, patch: Partial<LenderRow>) {
    const l = this.lenders.get(id);
    if (l) Object.assign(l, patch);
  }
  async listLenders() {
    return [...this.lenders.values()];
  }
  async productsForLender(lenderId: string) {
    return this.products.get(lenderId) ?? [];
  }
  async freshProductsForSlugs(slugs: string[], now: Date) {
    const ids = [...this.lenders.values()].filter((l) => slugs.includes(l.slug)).map((l) => l.id);
    return ids.flatMap((id) => (this.products.get(id) ?? []).filter((p) => p.expiresAt > now));
  }
  async replaceProducts(lenderId: string, records: ProductRecord[], now: Date, ttlMs: number) {
    const lender = this.lenders.get(lenderId)!;
    this.products.set(
      lenderId,
      records.map((record) => ({ id: randomUUID(), lender, record, scrapedAt: now, expiresAt: new Date(now.getTime() + ttlMs) }))
    );
  }
  async recordPage(url: string, lenderId: string, status: string, productCount: number, error?: string) {
    this.pages.push({ url, lenderId, status, productCount, error });
  }
  async getRobots(host: string, maxAgeMs: number, now: Date) {
    const r = this.robots.get(host);
    return r && now.getTime() - r.at.getTime() < maxAgeMs ? r.body : null;
  }
  async saveRobots(host: string, body: string, now: Date) {
    this.robots.set(host, { body, at: now });
  }
}

// ---------------- Prisma ----------------
type DbLender = Awaited<ReturnType<typeof prisma.lender.findFirstOrThrow>>;

export function toLenderRow(l: DbLender): LenderRow {
  return {
    id: l.id, slug: l.slug, name: l.name, category: l.category as Category, groups: l.groups, domain: l.domain, hints: l.hints,
    searchQuery: l.searchQuery, source: l.source as "seed" | "discovered", reliability: l.reliability, isMarketplace: l.isMarketplace,
    status: l.status as LenderStatus, statusReason: l.statusReason, lastScrapedAt: l.lastScrapedAt,
  };
}

export class PrismaRepo implements ResearchRepo {
  async upsertLender(input: LenderInput): Promise<LenderRow> {
    const existing = await prisma.lender.findUnique({ where: { slug: input.slug } });
    const l = existing
      ? await prisma.lender.update({
          where: { slug: input.slug },
          // seed data may refresh descriptive fields, but never clobbers a domain we located or a scan status
          data: { name: input.name, category: input.category, groups: input.groups, hints: input.hints, searchQuery: input.searchQuery, reliability: input.reliability, isMarketplace: input.isMarketplace, domain: input.domain ?? existing.domain },
        })
      : await prisma.lender.create({ data: { ...input } });
    return toLenderRow(l);
  }
  async updateLender(id: string, patch: Partial<Pick<LenderRow, "domain" | "status" | "statusReason" | "lastScrapedAt">>) {
    await prisma.lender.update({ where: { id }, data: patch });
  }
  async listLenders() {
    return (await prisma.lender.findMany()).map(toLenderRow);
  }
  async productsForLender(lenderId: string): Promise<StoredProduct[]> {
    const lender = await prisma.lender.findUnique({ where: { id: lenderId } });
    if (!lender) return [];
    const row = toLenderRow(lender);
    const out: StoredProduct[] = [];
    for (const p of await prisma.product.findMany({ where: { lenderId } })) {
      const parsed = ProductRecordSchema.safeParse(p.data);
      if (parsed.success) out.push({ id: p.id, lender: row, record: parsed.data, scrapedAt: p.scrapedAt, expiresAt: p.expiresAt });
    }
    return out;
  }
  async freshProductsForSlugs(slugs: string[], now: Date): Promise<StoredProduct[]> {
    if (!slugs.length) return [];
    const rows = await prisma.product.findMany({ where: { expiresAt: { gt: now }, lender: { slug: { in: slugs } } }, include: { lender: true } });
    const out: StoredProduct[] = [];
    for (const p of rows) {
      const parsed = ProductRecordSchema.safeParse(p.data);
      if (parsed.success) out.push({ id: p.id, lender: toLenderRow(p.lender), record: parsed.data, scrapedAt: p.scrapedAt, expiresAt: p.expiresAt });
    }
    return out;
  }
  async replaceProducts(lenderId: string, records: ProductRecord[], now: Date, ttlMs: number) {
    const expiresAt = new Date(now.getTime() + ttlMs);
    await prisma.$transaction([
      prisma.product.deleteMany({ where: { lenderId } }),
      ...records.map((r) =>
        prisma.product.upsert({
          where: { lenderId_sourceUrl_name: { lenderId, sourceUrl: r.sourceUrl, name: r.productName } },
          create: { lenderId, name: r.productName, productType: r.productType, sourceUrl: r.sourceUrl, data: r as object, scrapedAt: now, expiresAt, contentHash: hashRecord(r) },
          update: { productType: r.productType, data: r as object, scrapedAt: now, expiresAt, contentHash: hashRecord(r) },
        })
      ),
    ]);
  }
  async recordPage(url: string, lenderId: string, status: string, productCount: number, error?: string) {
    await prisma.pageFetch.upsert({
      where: { url },
      create: { url, lenderId, status, productCount, error: error ? error.slice(0, 500) : null },
      // explicit null: Prisma ignores `undefined`, which would leave a stale error on a page that now succeeds
      update: { lenderId, status, productCount, error: error ? error.slice(0, 500) : null, fetchedAt: new Date() },
    });
  }
  async getRobots(host: string, maxAgeMs: number, now: Date) {
    const r = await prisma.robotsCache.findUnique({ where: { host } });
    return r && now.getTime() - r.fetchedAt.getTime() < maxAgeMs ? r.body : null;
  }
  async saveRobots(host: string, body: string, now: Date) {
    await prisma.robotsCache.upsert({ where: { host }, create: { host, body, fetchedAt: now }, update: { body, fetchedAt: now } });
  }
}
