import { profileLines, gateSummaryLines } from "@/lib/export/text";
import { fmtDate } from "@/lib/report/format";
import type { MatchResult } from "./match-core";

type Ok = Extract<MatchResult, { ok: true }>;

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const cell = (s: string) => s.replace(/\|/g, "/").replace(/\s+/g, " ");

/** Markdown for the person reading the answer. Every figure here comes straight from the report: do not add others. */
export function formatMarkdown(res: Ok, opts: { top?: number } = {}): string {
  const { report, data } = res;
  const items = report.items.slice(0, opts.top ?? report.items.length);
  const out: string[] = [];
  out.push("# LendMatch results", "");
  out.push(`**Data:** a snapshot of real lender web pages read on ${fmtDate(data.exportedAt)} (${data.ageDays} day${data.ageDays === 1 ? "" : "s"} old): ${data.lenders} lenders, ${data.products} products.`);
  if (data.stale) out.push(`**STALE DATA:** this snapshot is older than the 7-day limit. Treat every rate, term and requirement below as illustrative, not current, and say so.`);
  out.push("");
  out.push(`**Borrower profile used:** ${profileLines(res.profile).map(([k, v]) => `${k} = ${v}`).join(" · ")}`);
  if (res.profile.assumptions.length) out.push(`**Assumptions made:** ${res.profile.assumptions.join(" ")}`);
  if (report.followUps.length) out.push(`**Follow-ups applied:** ${report.followUps.map((f) => `"${f.text}" (${f.applied.join("; ") || "no change"})`).join("; ")}`);
  out.push("");
  const shortfall = report.notes.filter((n) => /^(Only|At most)/.test(n)).join(" ");
  out.push(`**Result:** ${report.considered} products considered · ${report.passed} passed every hard filter · showing ${items.length}${items.length < 10 && shortfall ? ` (fewer than 10: ${shortfall})` : ""}`, "");

  if (items.length) {
    out.push("| # | Label | Lender | Product | Category | Score | Amount | Rate | Term | Speed | Est. monthly |", "|---|---|---|---|---|---|---|---|---|---|---|");
    for (const it of items) {
      out.push(`| ${it.rank} | ${it.label} | ${cell(it.lenderName)} | ${cell(it.productName)} | ${it.category} | ${it.score.toFixed(1)} | ${cell(it.amountRange)} | ${cell(it.rateRange)} | ${cell(it.termRange)} | ${cell(it.speed)} | ${it.cost.monthlyPayment !== null ? usd(it.cost.monthlyPayment) : "n/a"} |`);
    }
    out.push("");
    for (const it of items) {
      out.push(`### #${it.rank} ${it.label}: ${it.lenderName}, ${it.productName} (${it.typeLabel}, ${it.category}; score ${it.score.toFixed(1)}/100)`);
      out.push(`- **Why it fits:** ${it.reasoning.whyItFits}`);
      out.push(`- **What could block approval:** ${it.reasoning.couldBlock}`);
      out.push(`- **Payment:** ${it.reasoning.estimatedPayment}`);
      out.push(`- **Next step:** ${it.reasoning.nextStep}`);
      out.push(`- ${it.reasoning.citation}`, "");
    }
  } else out.push("No product passed every hard filter.", "");

  if (report.nearMisses.length) {
    out.push("## Near misses (what would have to change)");
    for (const n of report.nearMisses) out.push(`- ${n.lenderName}, ${n.productName}: ${n.fixes.join(" ")} (source ${n.sourceUrl}, read ${fmtDate(n.scrapedAt)})`);
    out.push("");
  }
  const gates = gateSummaryLines(report);
  if (gates.length) out.push("## Removed by hard filters", ...gates.map((g) => `- ${g}`), "");
  const none = report.lenders.filter((l) => l.status === "unavailable" || l.status === "blocked");
  if (none.length) out.push("## Lenders with no usable data (nothing was guessed)", ...none.map((l) => `- ${l.name}: ${l.reason ?? l.status}`), "");
  if (res.followUpNotes.length) out.push("## Follow-up notes", ...res.followUpNotes.map((n) => `- ${n}`), "");
  out.push(`**Claim audit:** ${res.audit.length === 0 ? "0 flags: every number, source and estimate label was checked against the stored data." : `${res.audit.length} flag(s): ${res.audit.map((f) => `[${f.kind}] ${f.detail}`).join(" ")}`}`, "");
  out.push(`> ${report.disclaimer}`);
  return out.join("\n");
}
