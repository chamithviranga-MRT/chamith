import { z } from "zod";
import { fail, json, parseBody } from "@/lib/http";
import { getSessionId } from "@/lib/session";
import { ProfileSchema } from "@/lib/profile/schema";
import { applyCardEdits, missingRequired, normalizeProfile, validateProfile } from "@/lib/profile/normalize";
import { loadProfile, saveProfile } from "@/lib/profile/store";

export const runtime = "nodejs";

const Edits = ProfileSchema.omit({ assumptions: true }).partial().strict();
const Body = z.object({ edits: Edits.default({}), confirm: z.boolean().default(false) });

export async function GET() {
  const sessionId = await getSessionId({ create: false });
  if (!sessionId) return json({ profile: null, missing: [], confirmed: false });
  const { profile, confirmed } = await loadProfile(sessionId);
  return json({ profile, missing: missingRequired(profile), confirmed });
}

/** Card edits (null clears a field) and the explicit "Confirm & research" step. */
export async function PUT(req: Request) {
  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;
  const sessionId = await getSessionId({ create: true });
  if (!sessionId) return fail("Could not start a session", 500);

  const { profile: current } = await loadProfile(sessionId);
  const edited = normalizeProfile(applyCardEdits(current, body.data.edits));
  const issues = validateProfile(edited);
  if (issues.length) return fail("Some values are out of range", 422, { issues });

  const missing = missingRequired(edited);
  if (body.data.confirm && missing.length) return fail("Required fields are still missing", 422, { missing });

  await saveProfile(sessionId, edited, body.data.confirm);
  return json({ profile: edited, missing, confirmed: body.data.confirm });
}
