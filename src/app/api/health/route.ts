import { prisma } from "@/lib/db";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness + database check for the container healthcheck / load balancer. Reveals nothing but ok / not ok. */
export async function GET() {
  try {
    await prisma.$queryRaw`select 1`;
    return json({ ok: true });
  } catch {
    return json({ ok: false }, { status: 503 });
  }
}
