/**
 * Core of the LendMatch skill: validate a borrower profile, rank a lender-data snapshot with the real engine
 * (hard filters, scoring, cost math, verified reasoning), apply follow-ups, audit the result. No I/O here; match.ts is the CLI.
 */
import { z } from "zod";
import { CACHE_TTL_DAYS } from "@/lib/config";
import { auditReport, type Flag } from "@/lib/eval/audit";
import { parseFollowUp } from "@/lib/followup/intent";
import { rerank } from "@/lib/followup/rerank";
import { applyCardEdits, missingRequired, normalizeProfile, validateProfile, type MissingField } from "@/lib/profile/normalize";
import { buildFollowUps } from "@/lib/profile/followups";
import { emptyProfile, ProfileSchema, type Profile } from "@/lib/profile/schema";
import { generateReport } from "@/lib/report/generate";
import type { Report } from "@/lib/report/types";
import type { LenderOutcome } from "@/lib/firecrawl/pipeline";
import type { LenderRow, StoredProduct } from "@/lib/types";

export interface Snapshot {
  exportedAt: string;
  lenders: Array<Omit<LenderRow, "lastScrapedAt"> & { lastScrapedAt: string | null }>;
  products: Array<{ id: string; lenderSlug: string; record: StoredProduct["record"]; scrapedAt: string; expiresAt: string }>;
}

const Edits = ProfileSchema.omit({ assumptions: true }).partial().strict();

export type MatchResult =
  | { ok: false; kind: "invalid"; issues: string[] }
  | { ok: false; kind: "missing"; missing: MissingField[]; questions: string[]; profile: Profile }
  | {
      ok: true;
      report: Report;
      profile: Profile;
      data: { exportedAt: string; ageDays: number; stale: boolean; lenders: number; products: number };
      followUpNotes: string[];
      audit: Flag[];
    };

const AGE = (from: Date, now: Date) => Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86_400_000));

export function hydrate(snap: Snapshot): { lenders: LenderRow[]; products: StoredProduct[] } {
  const lenders: LenderRow[] = snap.lenders.map((l) => ({ ...l, lastScrapedAt: l.lastScrapedAt ? new Date(l.lastScrapedAt) : null }));
  const bySlug = new Map(lenders.map((l) => [l.slug, l]));
  const products: StoredProduct[] = snap.products.map((p) => ({ id: p.id, lender: bySlug.get(p.lenderSlug)!, record: p.record, scrapedAt: new Date(p.scrapedAt), expiresAt: new Date(p.expiresAt) }));
  return { lenders, products };
}

export async function runMatch(input: { snapshot: Snapshot; profile: unknown; followups?: string[]; now?: Date }): Promise<MatchResult> {
  const now = input.now ?? new Date();
  const parsed = Edits.safeParse(input.profile);
  if (!parsed.success) {
    return { ok: false, kind: "invalid", issues: parsed.error.issues.map((i) => `${i.path.join(".") || "(profile)"}: ${i.message}`) };
  }
  const profile = normalizeProfile(applyCardEdits(emptyProfile(), parsed.data));
  const issues = validateProfile(profile);
  if (issues.length) return { ok: false, kind: "invalid", issues };
  const missing = missingRequired(profile);
  if (missing.length) return { ok: false, kind: "missing", missing, questions: buildFollowUps(profile, missing), profile };

  const { lenders, products } = hydrate(input.snapshot);
  const outcomes: LenderOutcome[] = lenders.map((l) => {
    const mine = products.filter((p) => p.lender.slug === l.slug);
    return mine.length
      ? { slug: l.slug, name: l.name, status: "cached" as const, products: mine.length, sourcesRead: 0, dataAgeDays: AGE(mine[0].scrapedAt, now) }
      : { slug: l.slug, name: l.name, status: l.status === "blocked_robots" ? ("blocked" as const) : ("unavailable" as const), products: 0, reason: l.statusReason ?? "Not scanned in this snapshot.", sourcesRead: 0, dataAgeDays: null };
  });
  const stats = {
    sourcesRead: 0,
    sourcesFromCache: new Set(products.map((p) => p.record.sourceUrl)).size,
    lendersTotal: lenders.length,
    discoveredNew: 0,
    productsFound: products.length,
  };

  let report = await generateReport({ profile, products, outcomes, stats, client: null, now });
  let current = profile;
  const followUpNotes: string[] = [];
  for (const message of input.followups ?? []) {
    const { intent } = await parseFollowUp(message, { knownLenders: report.lenders.map((l) => l.name), client: null });
    const r = await rerank({ prev: report, products, message, intent, client: null, now });
    followUpNotes.push(r.note);
    if (r.changed) {
      report = r.report;
      current = r.profile;
    }
  }

  const ageDays = AGE(new Date(input.snapshot.exportedAt), now);
  return {
    ok: true,
    report,
    profile: current,
    data: { exportedAt: input.snapshot.exportedAt, ageDays, stale: ageDays > CACHE_TTL_DAYS, lenders: lenders.length, products: products.length },
    followUpNotes,
    audit: auditReport(report, { products, profile: current, checkDomains: true }),
  };
}
