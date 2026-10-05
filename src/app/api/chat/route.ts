import { z } from "zod";
import { prisma } from "@/lib/db";
import { fail, json, parseBody } from "@/lib/http";
import { getSessionId } from "@/lib/session";
import { rateLimit } from "@/lib/rateLimit";
import { getAnthropic } from "@/lib/anthropic";
import { createClaudeExtractor } from "@/lib/profile/claudeExtractor";
import { processUserMessage } from "@/lib/profile/process";
import { loadProfile, saveProfile } from "@/lib/profile/store";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({ message: z.string().trim().min(1).max(4000) });

/**
 * Intake turn: redact → extract (Claude tool-use, or offline fallback) → merge into the stored
 * profile → reply with at most 3 follow-up questions in a single message.
 */
export async function POST(req: Request) {
  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;

  const sessionId = await getSessionId({ create: true });
  if (!sessionId) return fail("Could not start a session", 500);

  const rl = rateLimit(`chat:${sessionId}`, 30, 10 * 60_000);
  if (!rl.ok) return fail("You're sending messages very quickly — please wait a moment.", 429, { retryAfterS: rl.retryAfterS });

  const [{ profile: current }, lastAssistant] = await Promise.all([
    loadProfile(sessionId),
    prisma.message.findFirst({ where: { sessionId, role: "assistant" }, orderBy: { createdAt: "desc" }, select: { content: true } }),
  ]);

  const client = getAnthropic();
  const result = await processUserMessage({
    text: body.data.message,
    current,
    lastAssistant: lastAssistant?.content ?? null,
    extractor: client ? createClaudeExtractor(client) : null,
  });

  // Only the redacted text is ever persisted.
  await prisma.message.createMany({
    data: [
      { sessionId, role: "user", content: result.redactedText },
      { sessionId, role: "assistant", content: result.reply },
    ],
  });
  await saveProfile(sessionId, result.profile, false);

  return json({
    reply: result.reply,
    profile: result.profile,
    missing: result.missing,
    questions: result.questions,
    ready: result.missing.length === 0,
    mode: result.mode,
    redactions: result.redactions,
    ...(result.modelError ? { modelError: result.modelError } : {}),
  });
}
