import { prisma } from "@/lib/db";
import { deleteSessionData, getSessionId } from "@/lib/session";
import { fail, json } from "@/lib/http";
import { hasAnthropicKey, hasFirecrawlKey } from "@/lib/config";

export const runtime = "nodejs";

/** Bootstraps (or resumes) the anonymous session and returns saved chat + profile. */
export async function GET() {
  const id = await getSessionId({ create: true });
  if (!id) return fail("Could not create session", 500);
  const [messages, profile, lastRun] = await Promise.all([
    prisma.message.findMany({ where: { sessionId: id }, orderBy: { createdAt: "asc" }, select: { role: true, content: true } }),
    prisma.profileRecord.findUnique({ where: { sessionId: id } }),
    prisma.researchRun.findFirst({ where: { sessionId: id, status: "done" }, orderBy: { startedAt: "desc" }, select: { id: true, report: true } }),
  ]);
  return json({
    sessionId: id,
    messages,
    profile: profile ? { data: profile.data, confirmed: profile.confirmed } : null,
    lastRun: lastRun ? { id: lastRun.id, report: lastRun.report } : null,
    capabilities: { anthropic: hasAnthropicKey(), firecrawl: hasFirecrawlKey() },
  });
}

/** "Delete my data": removes the session and everything attached to it. */
export async function DELETE() {
  const id = await getSessionId({ create: false });
  if (id) await deleteSessionData(id);
  return json({ deleted: true });
}
