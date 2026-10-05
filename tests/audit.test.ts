import { describe, expect, it } from "vitest";
import { auditReport, summarizeFlags } from "@/lib/eval/audit";
import { rankProducts } from "@/lib/matching/rank";
import { generateReasoning } from "@/lib/reasoning/claude";
import { buildReport } from "@/lib/report/build";
import { NOW, product, profile } from "./helpers";
import type { Report } from "@/lib/report/types";

async function clean() {
  const pr = profile();
  const products = [
    product({ productName: "Prime Term Loan", minFico: 640, collateralRequired: "none", fundingDaysMin: 2, fundingDaysMax: 3 }, { slug: "a", name: "A Bank" }),
    product({ productName: "Flex LOC", productType: "line_of_credit", aprMin: 14, aprMax: 18, personalGuarantee: "required" }, { slug: "b", name: "B Capital" }),
  ];
  const ranked = rankProducts({ profile: pr, products, now: NOW });
  const reasoning = await generateReasoning({ items: ranked.top, profile: pr, client: null });
  const report = buildReport({ ranked, reasoning, outcomes: [], stats: { sourcesRead: 1, sourcesFromCache: 0, lendersTotal: 2, discoveredNew: 0, productsFound: 2 }, now: NOW });
  return { report: JSON.parse(JSON.stringify(report)) as Report, products, pr };
}

describe("claim audit", () => {
  it("a clean report has zero flags", async () => {
    const { report, products, pr } = await clean();
    expect(auditReport(report, { products, profile: pr })).toEqual([]);
  });

  it("flags an invented number in the narrative", async () => {
    const { report, products, pr } = await clean();
    report.items[0].reasoning.whyItFits += " It also advertises a 2.9% teaser rate.";
    const flags = auditReport(report, { products, profile: pr });
    expect(flags.map((f) => f.kind)).toContain("unsourced_claim");
    expect(flags.find((f) => f.kind === "unsourced_claim")!.detail).toMatch(/2\.9/);
    expect(flags[0].rank).toBe(1);
  });

  it("flags a published figure that is not in the verified source record", async () => {
    const { report, products, pr } = await clean();
    report.items[1].amountRange = "$10,000 – $999,000";
    const f = auditReport(report, { products, profile: pr });
    expect(f.some((x) => x.kind === "unsourced_claim" && /999,000/.test(x.detail))).toBe(true);
  });

  it("flags a missing source, missing citation, stale data and a foreign domain", async () => {
    const { report, products, pr } = await clean();
    report.items[0].sourceUrl = "";
    report.items[1].reasoning.citation = "no citation here";
    report.items[1].ageDays = 12;
    const f = auditReport(report, { products, profile: pr });
    expect(summarizeFlags(f).missing_source).toBeGreaterThanOrEqual(2);
    expect(summarizeFlags(f).stale_data).toBe(1);
    const c2 = await clean();
    c2.report.items[0].sourceUrl = "https://evil.example/loans";
    c2.report.items[0].reasoning.citation = "Source: https://evil.example/loans · data scraped Oct 4, 2026";
    expect(auditReport(c2.report, { products: c2.products, profile: c2.pr, checkDomains: true }).some((x) => x.kind === "domain_mismatch")).toBe(true);
  });

  it("does not demand an 'estimate' label from a payment line that shows no dollar figure", async () => {
    const { report, products, pr } = await clean();
    report.items[0].reasoning.estimatedPayment = "No monthly payment can be calculated because the lender publishes no rate.";
    report.items[1].reasoning.estimatedPayment = "Repayment depends on how you draw; nothing to calculate here.";
    expect(summarizeFlags(auditReport(report, { products, profile: pr })).unlabelled_estimate ?? 0).toBe(0);
  });

  it("flags unlabelled estimates, promises, foreign URLs and a missing disclaimer", async () => {
    const { report, products, pr } = await clean();
    report.items[0].reasoning.estimatedPayment = "You will pay $1,600 a month.";
    report.items[1].reasoning.nextStep = "Apply at https://sketchy.example now - you will be approved.";
    report.disclaimer = "Good luck!";
    const k = summarizeFlags(auditReport(report, { products, profile: pr }));
    expect(k.unlabelled_estimate).toBe(1);
    expect(k.unsourced_claim).toBeGreaterThanOrEqual(1);
    expect(k.missing_disclaimer).toBe(1);
  });
});
