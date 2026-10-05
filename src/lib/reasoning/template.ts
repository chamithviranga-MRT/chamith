import type { RankedItem } from "@/lib/matching/types";
import { PRODUCT_TYPE_LABEL } from "@/lib/firecrawl/productSchema";
import { ageLabel, fmtDate, usd } from "@/lib/report/format";
import type { Reasoning } from "@/lib/report/types";

const sentence = (s: string) => {
  const t = s.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

/** Code-generated payment line (estimate + the numbers behind it). Never written by a model. */
export function paymentLine(item: RankedItem): string {
  const c = item.cost;
  if (c.monthlyPayment === null) {
    if (c.basis === "factoring_fee" && c.financeCharge !== null) return `Estimate: no fixed monthly payment (customers pay the invoices); fee roughly ${usd(c.financeCharge)} over ${c.termMonths} 30-day period(s).`;
    return "No monthly payment can be estimated because the lender publishes no rate on the pages read.";
  }
  const range = c.monthlyPaymentLow !== null && c.monthlyPaymentHigh !== null && Math.round(c.monthlyPaymentLow) !== Math.round(c.monthlyPaymentHigh) ? `${usd(c.monthlyPaymentLow)} – ${usd(c.monthlyPaymentHigh)}` : usd(c.monthlyPayment);
  const total = c.financeCharge !== null ? `; total cost of capital about ${usd(c.financeCharge)}${c.effectiveAprPct !== null ? ` (effective APR about ${c.effectiveAprPct}%)` : ""}` : "";
  return `Estimate: about ${range} per month over ${c.termMonths} months${c.termAssumed ? " (term assumed)" : ""}${total}.${c.frequencyNote ? ` ${c.frequencyNote}` : ""}`;
}

export function citationLine(item: RankedItem): string {
  return `Source: ${item.product.record.sourceUrl} · data scraped ${fmtDate(item.product.scrapedAt)} (${ageLabel(item.ageDays)}). Estimates only; confirm with the lender.`;
}

/** Deterministic reasoning from verified fields. Used when there is no model, or when model text fails verification. */
export function templateReasoning(item: RankedItem): Reasoning {
  const p = item.product.record;
  const article = /^[aeiou]/i.test(item.category) ? "an" : "a";
  const lead = `${item.product.lender.name}'s ${p.productName} is a ${PRODUCT_TYPE_LABEL[p.productType].toLowerCase()} from ${article} ${item.category} lender.`;
  const fits = item.fitPoints.slice(0, 3).map(sentence);
  const whyItFits = [lead, ...(fits.length ? fits : ["The published details do not conflict with anything you told us, but several requirements are not published."])].join(" ");

  const priority = (r: string) => (r.startsWith("Not published") ? 2 : r.startsWith("Newly discovered") || r.includes("days old") || r.startsWith("Some details") ? 1 : 0);
  const ordered = [...item.risks].sort((a, b) => priority(a) - priority(b)); // stable: burdens and confirmations first
  const risks = ordered.slice(0, 3).map((r) => sentence(r.replace(/\s*\(Lender does not [^)]*\)/g, "")));
  const couldBlock = risks.length ? risks.join(" ") : "No blocking requirement was found in the published data, but the lender makes the final approval decision.";

  const border = item.gates.find((g) => g.status === "borderline" && g.fix);
  const nextStep = border
    ? `${sentence(border.fix!)} Then review the lender's page and start an application if it still fits.`
    : "Review the lender's requirements page and start an application, confirming rates and fees directly with the lender.";

  return { whyItFits, couldBlock, estimatedPayment: paymentLine(item), nextStep, citation: citationLine(item), source: "template" };
}
