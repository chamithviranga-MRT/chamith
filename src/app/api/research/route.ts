import { prisma } from "@/lib/db";
import { fail } from "@/lib/http";
import { ndjsonResponse } from "@/lib/ndjson";
import { rateLimit } from "@/lib/rateLimit";
import { getSessionId } from "@/lib/session";
import { FirecrawlWeb } from "@/lib/firecrawl/client";
import { runPipeline } from "@/lib/firecrawl/pipeline";
import { PrismaRepo } from "@/lib/firecrawl/repo";
import { loadRegistry } from "@/lib/firecrawl/registry";
import { getAnthropic } from "@/lib/anthropic";
import { generateReport } from "@/lib/report/generate";
import { missingRequired } from "@/lib/profile/normalize";
import { loadProfile } from "@/lib/profile/store";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Streams research progress as NDJSON: stage / discovered / lender / counts events, then `done`. */
export async function POST(req: Request) {
  const sessionId = await getSessionId({ create: false });
  if (!sessionId) return fail("No active session", 401);

  const { profile, confirmed } = await loadProfile(sessionId);
  if (!confirmed || missingRequired(profile).length) return fail("Confirm your profile before starting research.", 409);

  const web = FirecrawlWeb.fromEnv();
  if (!web) return fail("Research needs FIRECRAWL_API_KEY. Add it to .env and restart.", 503);

  const rl = rateLimit(`research:${sessionId}`, 3, 60 * 60_000);
  if (!rl.ok) return fail("Research limit reached for this session (3 per hour).", 429, { retryAfterS: rl.retryAfterS });

  const run = await prisma.researchRun.create({ data: { sessionId, profile: profile as object } });

  return ndjsonResponse(async (send, signal) => {
    send("run", { runId: run.id });
    const result = await runPipeline({
      profile,
      web,
      repo: new PrismaRepo(),
      registry: loadRegistry(),
      signal,
      onEvent: (e) => send(e.type, e),
    });
    await prisma.researchRun.update({
      where: { id: run.id },
      data: { status: result.fatalError ? "error" : "done", finishedAt: new Date(), stats: JSON.parse(JSON.stringify({ ...result.stats, outcomes: result.outcomes })) },
    });
    if (result.fatalError) send("error", { message: result.fatalError });
    send("pipeline_done", { stats: result.stats, outcomes: result.outcomes });
    if (signal.aborted) return;

    send("stage", { type: "stage", stage: "ranking", message: "Scoring every product and writing verified reasoning…" });
    const report = await generateReport({
      profile,
      products: result.products,
      outcomes: result.outcomes,
      stats: { sourcesRead: result.stats.sourcesRead, sourcesFromCache: result.stats.sourcesFromCache, lendersTotal: result.stats.lendersTotal, discoveredNew: result.stats.discoveredNew, productsFound: result.stats.productsFound },
      client: getAnthropic(),
    });
    await prisma.researchRun.update({ where: { id: run.id }, data: { report: JSON.parse(JSON.stringify(report)) } });
    send("report", { runId: run.id, report });
  }, req);
}
