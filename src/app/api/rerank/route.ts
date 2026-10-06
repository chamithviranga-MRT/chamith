import { z } from "zod";
import { prisma } from "@/lib/db";
import { fail, json, parseBody } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { getSessionId } from "@/lib/session";
import { getAnthropic } from "@/lib/anthropic";
import { FirecrawlWeb } from "@/lib/firecrawl/client";
import { runPipeline } from "@/lib/firecrawl/pipeline";
import { PrismaRepo } from "@/lib/firecrawl/repo";
import { loadRegistry } from "@/lib/firecrawl/registry";
import { parseFollowUp } from "@/lib/followup/intent";
import { rerank } from "@/lib/followup/rerank";
import { saveProfile } from "@/lib/profile/store";
import { generateReport } from "@/lib/report/generate";
import type { Report } from "@/lib/report/types";

export const runtime = "nodejs";
export const maxDuration = 180;

const Body = z
  .object({ message: z.string().trim().min(1).max(500).optional(), refreshSlug: z.string().min(1).max(120).optional() })
  .refine((b) => b.message || b.refreshSlug, "Provide a message or refreshSlug");

/**
 * Follow-up chat. A message ("drop anything with a lien") re-ranks from CACHED, unexpired data only; nothing is scraped.
 * `refreshSlug` re-scrapes exactly one lender (the "Refresh this lender" button) and then re-ranks.
 */
export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;
  const sessionId = await getSessionId({ create: false });
  if (!sessionId) return fail("No active session", 401);
  const rl = rateLimit(`rerank:${sessionId}`, 30, 10 * 60_000);
  if (!rl.ok) return fail("Too many requests — please wait a moment.", 429, { retryAfterS: rl.retryAfterS });

  // newest finished run that actually has a report (selected in code: Prisma JSON-null filters are easy to get subtly wrong)
  const recent = await prisma.researchRun.findMany({ where: { sessionId, status: "done" }, orderBy: { startedAt: "desc" }, take: 10 });
  const prevRun = recent.find((r) => r.report !== null);
  if (!prevRun?.report) return fail("Run the research first, then refine the results.", 409);
  const prev = prevRun.report as unknown as Report;
  const repo = new PrismaRepo();
  const client = getAnthropic();
  const now = new Date();
  const slugs = prev.lenders.map((l) => l.slug);

  // --- single-lender refresh -------------------------------------------------------------------
  if (body.data.refreshSlug) {
    const slug = body.data.refreshSlug;
    if (!slugs.includes(slug)) return fail("That lender is not part of this report.", 404);
    const web = FirecrawlWeb.fromEnv();
    if (!web) return fail("Refreshing needs FIRECRAWL_API_KEY.", 503);
    const rlr = rateLimit(`refresh:${sessionId}`, 10, 60 * 60_000);
    if (!rlr.ok) return fail("Refresh limit reached (10 per hour).", 429, { retryAfterS: rlr.retryAfterS });
    const result = await runPipeline({ profile: prev.profile, web, repo, registry: loadRegistry(), discovery: false, onlySlugs: [slug], forceSlugs: [slug] });
    if (result.fatalError) return fail(result.fatalError, 502);
    const products = await repo.freshProductsForSlugs(slugs, now);
    const outcome = result.outcomes[0];
    const lenders = prev.lenders.map((l) => (l.slug === slug && outcome ? { name: l.name, slug: l.slug, status: outcome.status, products: outcome.products, reason: outcome.reason, dataAgeDays: outcome.dataAgeDays } : l));
    const report = await generateReport({
      profile: prev.profile, products, outcomes: lenders, client, now, extra: prev.extra, followUps: prev.followUps,
      stats: { ...prev.stats, sourcesRead: prev.stats.sourcesRead + result.stats.sourcesRead, productsFound: products.length },
    });
    const run = await prisma.researchRun.create({ data: { sessionId, profile: prev.profile as object, status: "done", finishedAt: now, stats: prevRun.stats ?? undefined, report: JSON.parse(JSON.stringify(report)) } });
    const name = prev.lenders.find((l) => l.slug === slug)?.name ?? slug;
    const note = outcome?.status === "scraped" ? `Refreshed ${name}: ${outcome.products} product${outcome.products === 1 ? "" : "s"} read just now.` : `Could not refresh ${name}: ${outcome?.reason ?? "no usable data"}. Its previous data is shown only if it is still within ${7} days.`;
    return json({ runId: run.id, report, note, changed: true });
  }

  // --- follow-up message: cached data only ---------------------------------------------------------
  const message = body.data.message!;
  const products = await repo.freshProductsForSlugs(slugs, now);
  if (!products.length) return fail("The cached lender data has expired (older than 7 days). Run the research again to get fresh data.", 409, { needsFreshResearch: true });

  const { intent, by } = await parseFollowUp(message, { knownLenders: prev.lenders.map((l) => l.name), client });
  const result = await rerank({ prev, products, message, intent, client, now });
  if (!result.changed) return json({ runId: prevRun.id, report: prev, note: result.note, changed: false, parsedBy: by });

  if (JSON.stringify(result.profile) !== JSON.stringify(prev.profile)) await saveProfile(sessionId, result.profile, true);
  const run = await prisma.researchRun.create({ data: { sessionId, profile: result.profile as object, status: "done", finishedAt: now, stats: prevRun.stats ?? undefined, report: JSON.parse(JSON.stringify(result.report)) } });
  return json({ runId: run.id, report: result.report, note: result.note, changed: true, parsedBy: by });
}
