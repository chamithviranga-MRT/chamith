import { NextResponse } from "next/server";
import type { ZodType } from "zod";

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; res: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: fail("Invalid JSON body") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, res: fail("Invalid request", 400, { issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }) };
  }
  return { ok: true, data: parsed.data };
}
