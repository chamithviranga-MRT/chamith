import { z } from "zod";
import { fail, json, parseBody } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { getSessionId } from "@/lib/session";
import { FirecrawlWeb } from "@/lib/firecrawl/client";
import { runPipeline } from "@/lib/firecrawl/pipeline";
import { PrismaRepo } from "@/lib/firecrawl/repo";
import { loadRegistry } from "@/lib/firecrawl/registry";
import { loadProfile } from "@/lib/profile/store";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({ slug: z.string().min(1).max(120) });

/** "Refresh this lender": re-scrapes one lender regardless of cache age. */
export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;
  const sessionId = await getSessionId({ create: false });
  if (!sessionId) return fail("No active session", 401);
  const web = FirecrawlWeb.fromEnv();
  if (!web) return fail("Refreshing needs FIRECRAWL_API_KEY.", 503);
  const rl = rateLimit(`refresh:${sessionId}`, 10, 60 * 60_000);
  if (!rl.ok) return fail("Refresh limit reached (10 per hour).", 429, { retryAfterS: rl.retryAfterS });

  const repo = new PrismaRepo();
  const known = (await repo.listLenders()).some((l) => l.slug === body.data.slug);
  if (!known && !loadRegistry().some((l) => l.slug === body.data.slug)) return fail("Unknown lender", 404);

  const { profile } = await loadProfile(sessionId);
  const result = await runPipeline({
    profile, web, repo, registry: loadRegistry(), discovery: false, onlySlugs: [body.data.slug], forceSlugs: [body.data.slug],
  });
  if (result.fatalError) return fail(result.fatalError, 502);
  return json({ outcome: result.outcomes[0] ?? null, products: result.products.length });
}
