import { allowedNumbers, checkReasoning, numbersIn } from "@/lib/reasoning/verify";
import { sameSite } from "@/lib/firecrawl/urls";
import type { Profile } from "@/lib/profile/schema";
import type { Report, ReportItem } from "@/lib/report/types";
import type { StoredProduct } from "@/lib/types";

export type FlagKind = "missing_source" | "unsourced_claim" | "unlabelled_estimate" | "stale_data" | "domain_mismatch" | "missing_disclaimer";

export interface Flag {
  kind: FlagKind;
  rank: number | null;
  lender: string;
  detail: string;
}

const ESTIMATE_RE = /\bestimate\b|cannot be estimated|no fixed monthly payment/i;

/**
 * Flags every claim in a report that cannot be traced to a source. A "claim" is any number (or promise/URL) in the text a
 * borrower reads. Published numbers must trace to the stored, verified product record; computed numbers must trace to the
 * cost estimate or the borrower's own profile. Nothing else is allowed.
 */
export function auditReport(report: Report, opts: { products?: StoredProduct[]; profile?: Profile; maxAgeDays?: number; checkDomains?: boolean } = {}): Flag[] {
  const flags: Flag[] = [];
  const profile = opts.profile ?? report.profile;
  const maxAge = opts.maxAgeDays ?? 7;
  const byKey = new Map((opts.products ?? []).map((p) => [`${p.lender.slug}|${p.record.productName}`, p]));

  if (!/not financial or legal advice/i.test(report.disclaimer ?? "")) flags.push({ kind: "missing_disclaimer", rank: null, lender: "(report)", detail: "The informational-only / not-advice notice is missing." });

  for (const it of report.items) {
    const at = (kind: FlagKind, detail: string) => flags.push({ kind, rank: it.rank, lender: `${it.lenderName} — ${it.productName}`, detail });
    const stored = byKey.get(`${it.lenderSlug}|${it.productName}`);

    // ---- source + date -------------------------------------------------------------------------
    if (!/^https:\/\/[^\s]+$/.test(it.sourceUrl ?? "")) at("missing_source", "No https source URL.");
    if (!it.scrapedAt || Number.isNaN(Date.parse(it.scrapedAt))) at("missing_source", "No scraped date.");
    const cite = it.reasoning.citation ?? "";
    if (!cite.includes(it.sourceUrl ?? "\u0000") || !/scraped/i.test(cite)) at("missing_source", "Reasoning does not cite the source URL and scraped date.");
    if (it.ageDays > maxAge) at("stale_data", `Data is ${it.ageDays} days old (limit ${maxAge}).`);
    if (opts.checkDomains && stored?.lender.domain && !sameSite(it.sourceUrl, stored.lender.domain)) at("domain_mismatch", `Source ${it.sourceUrl} is not on the lender's domain (${stored.lender.domain}).`);

    // ---- published numbers must come from the verified record ----------------------------------
    const record = stored?.record;
    const recordNumbers = record ? allowedNumbers(record, record.productName, it.lenderName) : null;
    if (recordNumbers) {
      const published: Array<[string, string]> = [["amount", it.amountRange], ["rate", it.rateRange], ["term", it.termRange], ["speed", it.speed], ...it.requirements.map((r) => ["requirement", r] as [string, string]), ...it.fees.map((f) => ["fee", f] as [string, string])];
      for (const [label, text] of published) {
        const bad = numbersIn(text).filter((n) => !recordNumbers.has(n));
        if (bad.length) at("unsourced_claim", `Published ${label} "${text}" shows ${bad.join(", ")}, which is not in the verified source record.`);
      }
    }

    // ---- narrative: numbers must come from record + profile + computed estimates ---------------
    const allowed = allowedNumbers(record ?? {}, profile, it.cost, it.fitPoints, it.risks, it.gates.map((g) => g.detail), it.productName, it.lenderName, it.typeLabel);
    const issues = checkReasoning(
      { whyItFits: it.reasoning.whyItFits, couldBlock: it.reasoning.couldBlock, nextStep: it.reasoning.nextStep },
      allowed,
      it.sourceUrl
    );
    for (const issue of issues) at("unsourced_claim", issue);

    // ---- estimates must be labelled ---------------------------------------------------------------
    if (!ESTIMATE_RE.test(it.reasoning.estimatedPayment ?? "")) at("unlabelled_estimate", "The payment line is not labelled as an estimate.");
    if (it.cost.monthlyPayment !== null && !it.cost.assumptions?.length) at("unlabelled_estimate", "A payment is shown without the assumptions behind it.");
  }
  return flags;
}

export function summarizeFlags(flags: Flag[]): Record<FlagKind, number> {
  const out = { missing_source: 0, unsourced_claim: 0, unlabelled_estimate: 0, stale_data: 0, domain_mismatch: 0, missing_disclaimer: 0 } as Record<FlagKind, number>;
  for (const f of flags) out[f.kind]++;
  return out;
}

export type { ReportItem };
