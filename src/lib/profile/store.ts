import { prisma } from "@/lib/db";
import { emptyProfile, ProfileSchema, type Profile } from "./schema";
import { normalizeProfile } from "./normalize";

export async function loadProfile(sessionId: string): Promise<{ profile: Profile; confirmed: boolean }> {
  const rec = await prisma.profileRecord.findUnique({ where: { sessionId } });
  if (!rec) return { profile: emptyProfile(), confirmed: false };
  const parsed = ProfileSchema.safeParse(rec.data);
  return { profile: parsed.success ? normalizeProfile(parsed.data) : emptyProfile(), confirmed: rec.confirmed };
}

export async function saveProfile(sessionId: string, profile: Profile, confirmed: boolean) {
  await prisma.profileRecord.upsert({
    where: { sessionId },
    create: { sessionId, data: profile as object, confirmed },
    update: { data: profile as object, confirmed },
  });
}
