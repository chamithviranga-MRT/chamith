import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";

export const SESSION_COOKIE = "lm_sid";
const MAX_AGE_S = 60 * 60 * 24 * 30;

/**
 * Anonymous session: a 192-bit random id in an httpOnly cookie. There is no account, e-mail or
 * IP stored. The id is the only capability needed to read a session, so it must be unguessable
 * (hence randomBytes, not the schema's cuid default).
 */
export async function getSessionId(opts: { create: boolean }): Promise<string | null> {
  const jar = await cookies();
  const existing = jar.get(SESSION_COOKIE)?.value;
  if (existing && /^[A-Za-z0-9_-]{20,64}$/.test(existing)) {
    const s = await prisma.session.findUnique({ where: { id: existing }, select: { id: true } });
    if (s) {
      await prisma.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } });
      return s.id;
    }
  }
  if (!opts.create) return null;
  const id = randomBytes(24).toString("base64url");
  await prisma.session.create({ data: { id } });
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_S,
  });
  return id;
}

/** Removes every row owned by the session (messages, profile, runs cascade) and the cookie. */
export async function deleteSessionData(sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
