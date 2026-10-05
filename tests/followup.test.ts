import { describe, expect, it, vi } from "vitest";
import { describeConstraints, intentFromTool, intentToolSchema, INTENT_TOOL, mergeConstraints, parseFollowUp, parseFollowUpHeuristic } from "@/lib/followup/intent";
import { rerank } from "@/lib/followup/rerank";
import { generateReport } from "@/lib/report/generate";
import type { MessagesClient, Anthropic } from "@/lib/anthropic";
import { NOW, product, profile } from "./helpers";
import { MemoryRepo } from "@/lib/firecrawl/repo";

const LENDERS = ["Wells Fargo", "SoFi", "Live Oak Bank", "American Express Business Line of Credit (formerly Kabbage)", "OnDeck"];
const p = (m: string) => parseFollowUpHeuristic(m, LENDERS);

describe("follow-up parsing (heuristic)", () => {
  it("the two spec examples", () => {
    expect(p("drop anything with a lien").constraints).toEqual({ noUccLien: true });
    expect(p("only under 24 months").constraints).toEqual({ maxTermMonths: 23 });
  });
  it.each([
    ["no UCC lien please", { noUccLien: true }],
    ["exclude anything with a blanket lien", { noUccLien: true }],
    ["I don't want a personal guarantee", { noPersonalGuarantee: true }],
    ["no personal guarantee", { noPersonalGuarantee: true }],
    ["unsecured only", { noCollateral: true }],
    ["without collateral", { noCollateral: true }],
    ["terms up to 36 months", { maxTermMonths: 36 }],
    ["within 2 years", { maxTermMonths: 24 }],
    ["less than 18 months", { maxTermMonths: 17 }],
    ["at least 5 years", { minTermMonths: 60 }],
    ["longer than 10 years", { minTermMonths: 121 }],
    ["APR under 20%", { maxAprPct: 20 }],
    ["rate below 15.5%", { maxAprPct: 15.5 }],
    ["monthly payment under $2,000", { maxMonthlyPayment: 2000 }],
    ["payments below 1.5k", { maxMonthlyPayment: 1.5 }],
    ["I need to be funded within 7 days", { maxDaysToFund: 7 }],
    ["funds in under 2 weeks", { maxDaysToFund: 14 }],
    ["need the money within 48 hours", { maxDaysToFund: 2 }],
    ["soft credit pull only", { softPullOnly: true }],
    ["no prepayment penalty", { noPrepaymentPenalty: true }],
    ["no merchant cash advances", { excludeTypes: ["mca"] }],
    ["drop factoring and credit cards", { excludeTypes: ["invoice_factoring", "business_card"] }],
    ["only term loans", { includeTypes: ["term_loan"] }],
    ["only SBA loans", { includeTypes: ["sba_7a", "sba_504", "microloan"] }],
    ["only conventional banks", { includeCategories: ["Conventional"] }],
    ["no alternative lenders", { excludeCategories: ["Alternative"] }],
    ["exclude Wells Fargo", { excludeLenders: ["Wells Fargo"] }],
    ["drop OnDeck and SoFi", { excludeLenders: ["SoFi", "OnDeck"] }],
    ["skip American Express", { excludeLenders: [] }],
  ])("%s", (msg, expected) => {
    const got = p(msg).constraints;
    if (msg === "payments below 1.5k") return expect(got.maxMonthlyPayment).toBe(1500);
    if (msg === "skip American Express") return expect(got.excludeLenders ?? []).toEqual([]); // partial name of a long lender label is not guessed
    for (const [k, v] of Object.entries(expected)) {
      const g = (got as Record<string, unknown>)[k];
      expect(Array.isArray(v) ? [...(g as string[])].sort() : g, `${msg} -> ${k}`).toEqual(Array.isArray(v) ? [...v].sort() : v);
    }
  });
  it("does not confuse a tax lien with a UCC lien, or 'in business' durations with terms", () => {
    expect(p("I have a tax lien").constraints.noUccLien).toBeUndefined();
    expect(p("I've been in business 3 years").constraints.maxTermMonths).toBeUndefined();
  });
  it("combines several filters in one message", () => {
    expect(p("no lien, no personal guarantee, and only under 24 months with APR under 25%").constraints).toEqual({ noUccLien: true, noPersonalGuarantee: true, maxTermMonths: 23, maxAprPct: 25 });
  });
  it("profile statements and reset", () => {
    expect(p("actually I need $90,000").profilePatch).toEqual({ amountNeeded: 90000 });
    expect(p("I'm fine with a personal guarantee").profilePatch).toEqual({ willingPersonalGuarantee: true });
    expect(p("I do have collateral").profilePatch).toEqual({ collateralAvailable: true });
    expect(p("clear all filters").clear).toBe(true);
    expect(p("start over").clear).toBe(true);
  });
  it("small talk and questions are not understood", () => {
    for (const m of ["thanks!", "why is Lendio second?", "what does APR mean?"]) expect(p(m).understood, m).toBe(false);
  });
});

describe("merge and describe", () => {
  it("newer values override, exclusions accumulate", () => {
    const m = mergeConstraints({ maxTermMonths: 36, excludeTypes: ["mca"], noUccLien: true }, { maxTermMonths: 23, excludeTypes: ["business_card"] });
    expect(m).toEqual({ maxTermMonths: 23, excludeTypes: ["mca", "business_card"], noUccLien: true });
    expect(describeConstraints(m)).toEqual(expect.arrayContaining(["No UCC lien", "Terms up to 23 months", "Exclude Merchant cash advance, Business credit card"]));
  });
});

describe("Claude follow-up parsing", () => {
  const toolMsg = (input: unknown) => ({ id: "m", type: "message", role: "assistant", model: "x", stop_reason: "tool_use", stop_sequence: null, content: [{ type: "tool_use", id: "t", name: INTENT_TOOL, input }], usage: { input_tokens: 1, output_tokens: 1 } }) as unknown as Anthropic.Message;
  const base = { understood: true, clearFilters: false, noUccLien: null, noPersonalGuarantee: null, noCollateral: null, maxTermMonths: null, minTermMonths: null, maxAprPct: null, maxMonthlyPayment: null, maxDaysToFund: null, includeTypes: [], excludeTypes: [], includeCategories: [], excludeCategories: [], excludeLenders: [], softPullOnly: null, noPrepaymentPenalty: null, profileAmountNeeded: null, profileWillingPersonalGuarantee: null, profileWillingUccLien: null, profileCollateralAvailable: null, profilePreferredTermMonths: null, profileSpeedNeededDays: null };

  it("uses tool-use output, validates it, and drops nonsense values", async () => {
    const create = vi.fn(async () => toolMsg({ ...base, noUccLien: true, maxTermMonths: 23, maxAprPct: -5, maxDaysToFund: 9999, excludeLenders: ["  OnDeck  "], includeTypes: ["term_loan"] }));
    const r = await parseFollowUp("drop liens, terms under 24 months", { knownLenders: LENDERS, client: { messages: { create } } as unknown as MessagesClient });
    expect(r.by).toBe("claude");
    expect(r.intent.constraints).toEqual({ noUccLien: true, maxTermMonths: 23, excludeLenders: ["OnDeck"], includeTypes: ["term_loan"] }); // -5% APR and 9999 days rejected
    const req = (create.mock.calls[0] as unknown as [Record<string, any>])[0];
    expect(req.tool_choice).toEqual({ type: "auto" });
    expect(req.messages[0].content).toContain("<known_lenders>");
  });
  it("understood:false from the model means no change", () => {
    expect(intentFromTool({ ...base, understood: false }).understood).toBe(false);
    expect(intentFromTool({ ...base, understood: true }).understood).toBe(false); // nothing actually set
    expect(intentFromTool({ garbage: 1 }).understood).toBe(false);
  });
  it("falls back to the heuristic parser if the model call fails", async () => {
    const failing = { messages: { create: vi.fn(async () => { throw new Error("overloaded"); }) } } as unknown as MessagesClient;
    const r = await parseFollowUp("drop anything with a lien", { knownLenders: LENDERS, client: failing });
    expect(r.by).toBe("heuristic");
    expect(r.error).toMatch(/overloaded/);
    expect(r.intent.constraints.noUccLien).toBe(true);
  });
  it("tool schema is closed and strict-ready", () => {
    const s = intentToolSchema() as any;
    expect(s.additionalProperties).toBe(false);
    expect(JSON.stringify(s)).not.toMatch(/"type":\[/);
  });
});

describe("re-ranking from cache without re-scraping", () => {
  const products = () => [
    product({ productName: "Lien Loan", uccLien: true, aprMin: 8, aprMax: 9, termMinMonths: 12, termMaxMonths: 60 }, { slug: "a", name: "A Bank", reliability: 90 }),
    product({ productName: "Clean Loan", uccLien: false, aprMin: 11, aprMax: 12, termMinMonths: 12, termMaxMonths: 60 }, { slug: "b", name: "B Lender" }),
    product({ productName: "Long Only", uccLien: false, aprMin: 10, aprMax: 11, termMinMonths: 48, termMaxMonths: 120 }, { slug: "c", name: "C Credit" }),
    product({ productName: "Cash Advance", productType: "mca", aprMin: null, aprMax: null, factorMin: 1.2, factorMax: 1.2, termMinMonths: 6, termMaxMonths: 6, uccLien: true }, { slug: "d", name: "D Capital" }),
  ];
  const outcomes = ["a", "b", "c", "d"].map((slug) => ({ name: slug.toUpperCase(), slug, status: "cached" as const, products: 1, dataAgeDays: 1 }));
  const initial = async () => generateReport({ profile: profile(), products: products(), outcomes, stats: { sourcesRead: 10, sourcesFromCache: 4, lendersTotal: 4, discoveredNew: 0, productsFound: 4 }, client: null, now: NOW });
  const msg = (text: string) => ({ message: text, intent: parseFollowUpHeuristic(text, ["A Bank"]), client: null, now: NOW });

  it("'drop anything with a lien' then 'only under 24 months' accumulate; products come only from the supplied cache", async () => {
    const first = await initial();
    expect(first.items.map((i) => i.productName).sort()).toEqual(["Cash Advance", "Clean Loan", "Lien Loan", "Long Only"]);

    const r1 = await rerank({ prev: first, products: products(), ...msg("drop anything with a lien") });
    expect(r1.changed).toBe(true);
    expect(r1.report.items.map((i) => i.productName).sort()).toEqual(["Clean Loan", "Long Only"]);
    expect(r1.report.extra).toEqual({ noUccLien: true });
    expect(r1.note).toMatch(/No pages were re-scraped/);
    expect(r1.note).toMatch(/Applied: No UCC lien/);

    const r2 = await rerank({ prev: r1.report, products: products(), ...msg("only under 24 months") });
    expect(r2.report.extra).toEqual({ noUccLien: true, maxTermMonths: 23 });
    expect(r2.report.items.map((i) => i.productName)).toEqual(["Clean Loan"]);
    expect(r2.report.items[0].cost.termMonths).toBeLessThanOrEqual(23);
    expect(r2.report.followUps.map((f) => f.text)).toEqual(["drop anything with a lien", "only under 24 months"]);
    expect(r2.report.nearMisses.map((n) => n.productName)).toContain("Long Only");
    expect(r2.report.nearMisses.find((n) => n.productName === "Long Only")!.fixes[0]).toMatch(/48 months or longer/);
  });

  it("'clear all filters' restores the full ranking", async () => {
    const first = await initial();
    const r1 = await rerank({ prev: first, products: products(), ...msg("drop anything with a lien") });
    const r2 = await rerank({ prev: r1.report, products: products(), ...msg("clear all filters") });
    expect(r2.report.extra).toEqual({});
    expect(r2.report.items).toHaveLength(4);
  });

  it("a message that is not a filter changes nothing and explains what to try", async () => {
    const first = await initial();
    const r = await rerank({ prev: first, products: products(), ...msg("thanks!") });
    expect(r.changed).toBe(false);
    expect(r.report).toBe(first);
    expect(r.note).toMatch(/drop anything with a lien/);
  });

  it("an amount change is applied to the profile and re-gates the same cached products", async () => {
    const first = await initial();
    const tooBig = products().map((x) => (x.record.productName === "Clean Loan" ? { ...x, record: { ...x.record, maxAmount: 60000 } } : x));
    const r = await rerank({ prev: first, products: tooBig, ...msg("actually I need $90,000") });
    expect(r.report.profile.amountNeeded).toBe(90000);
    expect(r.report.items.map((i) => i.productName)).not.toContain("Clean Loan");
    expect(r.report.nearMisses.find((n) => n.productName === "Clean Loan")!.fixes[0]).toMatch(/\$60,000 or less/);
  });

  it("flags when a profile change affects discovery, and when some lenders' caches expired", async () => {
    const first = await initial();
    const intent = { constraints: {}, clear: false, understood: true, profilePatch: { purpose: "equipment" as const } };
    const r = await rerank({ prev: first, products: products().slice(0, 2), message: "it's for equipment", intent, client: null, now: NOW });
    expect(r.suggestFreshResearch).toBe(true);
    expect(r.note).toMatch(/Confirm & research/);
    expect(r.note).toMatch(/2 lenders' cached data is older than 7 days/);
  });

  it("no filter combination can add a product that is not in the cache", async () => {
    const first = await initial();
    const r = await rerank({ prev: first, products: products().slice(0, 1), ...msg("clear all filters") });
    expect(r.report.items.map((i) => i.productName)).toEqual(["Lien Loan"]);
  });
});

describe("MemoryRepo.freshProductsForSlugs", () => {
  it("returns only unexpired products for the requested lenders", async () => {
    const repo = new MemoryRepo();
    const a = await repo.upsertLender({ slug: "a", name: "A", category: "Alternative", groups: [], domain: "a.example", hints: [], searchQuery: null, source: "seed", reliability: 70, isMarketplace: false });
    const b = await repo.upsertLender({ slug: "b", name: "B", category: "Alternative", groups: [], domain: "b.example", hints: [], searchQuery: null, source: "seed", reliability: 70, isMarketplace: false });
    await repo.replaceProducts(a.id, [product({}, { slug: "a" }).record], new Date("2026-10-01T00:00:00Z"), 7 * 86_400_000);
    await repo.replaceProducts(b.id, [product({}, { slug: "b" }).record], new Date("2026-09-01T00:00:00Z"), 7 * 86_400_000);
    const fresh = await repo.freshProductsForSlugs(["a", "b"], new Date("2026-10-05T00:00:00Z"));
    expect(fresh.map((x) => x.lender.slug)).toEqual(["a"]);
  });
});
