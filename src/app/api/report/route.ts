import { prisma } from "@/lib/db";
import { fail } from "@/lib/http";
import { getSessionId } from "@/lib/session";
import { renderDocx } from "@/lib/export/docx";
import { renderPdf } from "@/lib/export/pdf";
import type { Report } from "@/lib/report/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET /api/report?runId=...&format=pdf|docx - exports the stored report for the caller's own session only. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");
  const format = url.searchParams.get("format");
  if (!runId || (format !== "pdf" && format !== "docx")) return fail("Use ?runId=…&format=pdf|docx");

  const sessionId = await getSessionId({ create: false });
  if (!sessionId) return fail("No active session", 401);
  const run = await prisma.researchRun.findFirst({ where: { id: runId, sessionId }, select: { report: true } });
  if (!run?.report) return fail("Report not found", 404);

  const report = run.report as unknown as Report;
  const stamp = report.generatedAt.slice(0, 10);
  const body = format === "pdf" ? await renderPdf(report) : await renderDocx(report);
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="lendmatch-report-${stamp}.${format}"`,
      "cache-control": "private, no-store",
    },
  });
}
