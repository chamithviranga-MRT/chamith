import { describe, expect, it, vi } from "vitest";
import { generateReasoning, factsFor, REASONING_SYSTEM, REASONING_TOOL, allowedFor } from "@/lib/reasoning/claude";
import { checkReasoning, numbersIn, allowedNumbers, stripDates } from "@/lib/reasoning/verify";
import { templateReasoning } from "@/lib/reasoning/template";
import { rankProducts } from "@/lib/matching/rank";
import type { MessagesClient } from "@/lib/anthropic";
import type { Anthropic } from "@/lib/anthropic";
import { NOW, product, profile } from "./helpers";
import { buildReport } from "@/lib/report/build";

const pr = profile();
const ranked = (products: ReturnType<typeof product>[] = [product({ productName: "Term Loan", minFico: 640, collateralRequired: "none" }, { slug: "a", name: "A Bank" }), product({ productName: "Flex LOC", productType: "line_of_credit", personalGuarantee: "required", aprMin: 14, aprMax: 18 }, { slug: "b", name: "B Capital" })], prof = pr) =>
  rankProducts({ profile: prof, products, now: NOW });

function toolMsg(items: unknown[]): Anthropic.Message {
  return { id: "m", type: "message", role: "assistant", model: "x", stop_reason: "tool_use", stop_sequence: null, content: [{ type: "tool_use", id: "t", name: REASONING_TOOL, input: { items } }], usage: { input_tokens: 1, output_tokens: 1 } } as unknown as Anthropic.Message;
}
const client = (impl: (req: any) => Anthropic.Message) => ({ messages: { create: vi.fn(async (req: any) => impl(req)) } }) as unknown as MessagesClient & { messages: { create: ReturnType<typeof vi.fn> } };
/** Verified text for one item: only cites the minimum FICO when that product actually publishes one. */
const good = (id: string, over: Record<string, string> = {}) => ({
  id,
  whyItFits: id.includes("Term Loan") ? "Your 680 credit score clears the published minimum of 640 and the $50,000 request is within the lender's range." : "Your $50,000 request is within the lender's published range and the amount fits your stated purpose.",
  couldBlock: "No blocking requirement was found in the published data, but the lender makes the final decision.",
  nextStep: "Open the lender's requirements page and start an application.",
  ...over,
});

describe("number verification", () => {
  it("extracts numbers in common formats and ignores dates", () => {
    expect(numbersIn("Borrow $10,000 to $1.5 million at 8.5% over 36 months; scraped Oct 5, 2026 (2026-10-05)")).toEqual([10000, 1_500_000, 8.5, 36]);
    expect(stripDates("on 2026-10-05 and Oct 5, 2026 and 5 Oct 2026 in 2026")).not.toMatch(/\d/);
    expect(numbersIn("about $2k and 7(a)")).toEqual([2000, 7]);
  });
  it("allows restatements and unit conversions, rejects new numbers", () => {
    const a = allowedNumbers({ term: 60, amount: 50000, apr: 12.1064, monthly: 1613.36 });
    expect(a.has(60) && a.has(5)).toBe(true); // 60 months == 5 years
    expect(a.has(50000) && a.has(12.1) && a.has(1613) && a.has(1613.36)).toBe(true);
    expect(a.has(7)).toBe(false);
    expect(a.has(49000)).toBe(false);
  });
  it("flags invented numbers, foreign URLs, promises and empty fields", () => {
    const a = allowedNumbers({ amount: 50000 });
    const base = { whyItFits: "The $50,000 request is within the published range for this product.", couldBlock: "The lender makes the final decision on approval.", nextStep: "Open the lender page and apply." };
    expect(checkReasoning(base, a, "https://x.example/l")).toEqual([]);
    expect(checkReasoning({ ...base, whyItFits: "The rate is only 4.5% which is great for you." }, a, "https://x.example/l").join()).toMatch(/4\.5/);
    expect(checkReasoning({ ...base, nextStep: "Apply at https://evil.example/apply today." }, a, "https://x.example/l").join()).toMatch(/URL other than/);
    expect(checkReasoning({ ...base, nextStep: "Apply at https://x.example/l." }, a, "https://x.example/l")).toEqual([]);
    expect(checkReasoning({ ...base, whyItFits: "You will be approved quickly for this loan." }, a, "https://x.example/l").join()).toMatch(/promise/);
    expect(checkReasoning({ ...base, couldBlock: "ok" }, a, "https://x.example/l").join()).toMatch(/empty or too short/);
  });
});

describe("template reasoning (offline / fallback)", () => {
  it("passes the same verifier the model output must pass, for varied products", () => {
    const products = [
      product({ productName: "Plain", minFico: 640 }, { slug: "p1", name: "P1" }),
      product({ productName: "SBA 7(a) Loan", productType: "sba_7a", minFico: 680, personalGuarantee: "required", uccLien: true, termMinMonths: 120, termMaxMonths: 300 }, { slug: "p2", name: "P2" }),
      product({ productName: "Cash Advance", productType: "mca", aprMin: null, aprMax: null, factorMin: 1.2, factorMax: 1.4, termMinMonths: 6, termMaxMonths: 6, repaymentFrequency: "daily" }, { slug: "p3", name: "P3" }),
      product({ productName: "Teaser", aprMin: 8, aprMax: null }, { slug: "p4", name: "P4", isMarketplace: true }),
      product({ productName: "No Rates", aprMin: null, aprMax: null }, { slug: "p5", name: "P5", source: "discovered", reliability: 40 }, 6),
    ];
    for (const item of ranked(products).top) {
      const t = templateReasoning(item);
      expect(checkReasoning(t, allowedFor(item, pr), item.product.record.sourceUrl), item.product.record.productName).toEqual([]);
      expect(t.citation).toContain(item.product.record.sourceUrl);
      expect(t.citation).toMatch(/scraped \w{3} \d{1,2}, \d{4}/);
      expect(t.estimatedPayment.length).toBeGreaterThan(10);
      expect(t.source).toBe("template");
    }
  });
});

describe("template 'what could block approval' prioritisation", () => {
  it("leads with real burdens and confirmations; 'Not published' notes come last", () => {
    const item = ranked([product({ productName: "Guarantee Loan", personalGuarantee: "required", uccLien: true, minFico: null, minTimeInBusinessMonths: null }, { slug: "g", name: "G Bank" })]).top[0];
    const rawNotPublished = item.risks.findIndex((r) => r.startsWith("Not published"));
    const rawGuarantee = item.risks.findIndex((r) => /personal guarantee/i.test(r));
    expect(rawGuarantee).toBeGreaterThanOrEqual(0);
    expect(rawNotPublished).toBeLessThan(rawGuarantee); // raw gate order puts the "not published" notes first
    // the guarantee is stated exactly once (the borderline gate covers it; no duplicate burden line)
    expect(item.risks.filter((r) => /personal guarantee/i.test(r))).toHaveLength(1);
    const first = templateReasoning(item).couldBlock;
    expect(first.indexOf("personal guarantee")).toBeGreaterThanOrEqual(0);
    expect(first.indexOf("personal guarantee")).toBeLessThan(first.indexOf("Not published") === -1 ? Infinity : first.indexOf("Not published"));
  });
  it("never repeats the same point in one explanation", () => {
    const item = ranked([product({ productName: "Burdens", personalGuarantee: "required", uccLien: true, collateralRequired: "always" }, { slug: "d", name: "D Bank" })]).top[0];
    const text = templateReasoning(item).couldBlock;
    expect((text.match(/personal guarantee/gi) ?? []).length).toBeLessThanOrEqual(1);
    expect((text.match(/UCC lien/gi) ?? []).length).toBeLessThanOrEqual(1);
  });
  it("flags very wide published APR ranges", () => {
    const item = ranked([product({ productName: "Wide", aprMin: 6, aprMax: 99 }, { slug: "w", name: "W Marketplace" })]).top[0];
    expect(item.risks.join(" ")).toMatch(/very wide \(6%–99%\)/);
    const tight = ranked([product({ productName: "Tight", aprMin: 9, aprMax: 14 }, { slug: "t", name: "T Bank" })]).top[0];
    expect(tight.risks.join(" ")).not.toMatch(/very wide/);
  });
  it("a zero minimum time in business reads naturally, and a US-based owner is not asked to confirm residency", () => {
    const item = ranked([product({ productName: "Startup Friendly", minTimeInBusinessMonths: 0, residencyRule: "us_resident" }, { slug: "s", name: "S Lender" })], profile({ timeInBusinessMonths: 0 })).top[0];
    expect(item.fitPoints.join(" ")).toMatch(/No minimum time in business/);
    expect(item.fitPoints.join(" ")).not.toMatch(/Requires 0 months/);
    expect(item.gates.find((g) => g.id === "residency")!.status).toBe("pass");
    expect(item.risks.join(" ")).not.toMatch(/US resident/);
  });
  it("uses the right article ('an Alternative lender')", () => {
    const item = ranked([product({ productName: "X" }, { slug: "x", name: "X Co", category: "Alternative" })]).top[0];
    expect(templateReasoning(item).whyItFits).toMatch(/offered by an Alternative lender/);
    const conv = ranked([product({ productName: "Y" }, { slug: "y", name: "Y Co", category: "Conventional" })]).top[0];
    expect(templateReasoning(conv).whyItFits).toMatch(/offered by a Conventional lender/);
    const sba = ranked([product({ productName: "Z", productType: "sba_7a" }, { slug: "z", name: "Z Co", category: "SBA" })]).top[0];
    expect(templateReasoning(sba).whyItFits).toMatch(/\(SBA 7\(a\)\) is offered by an SBA lender/);
  });
});

describe("Claude reasoning with verification", () => {
  it("accepts verified output, always appends a code-generated citation and payment line, and shows the model only facts", async () => {
    const r = ranked();
    const c = client(() => toolMsg(r.top.map((i) => good(i.product.id))));
    const out = await generateReasoning({ items: r.top, profile: pr, client: c });
    expect(out.claude).toBe(2);
    expect(out.template).toBe(0);
    const first = out.byId.get(r.top[0].product.id)!;
    expect(first.source).toBe("claude");
    expect(first.citation).toContain(r.top[0].product.record.sourceUrl);
    expect(first.estimatedPayment).toMatch(/per month/);
    const req = c.messages.create.mock.calls[0][0];
    expect(req.system).toBe(REASONING_SYSTEM);
    expect(req.tool_choice).toEqual({ type: "auto" });
    expect(req.messages[0].content).toContain("<products>");
    expect(req.messages[0].content).not.toMatch(/evidenceQuote|sourceUrl/); // raw page text and URLs stay out of the prompt
  });

  it("rejects a hallucinated number, retries once with feedback, then accepts the corrected text", async () => {
    const r = ranked();
    let n = 0;
    const c = client((req) => {
      n++;
      if (n === 1) return toolMsg(r.top.map((i) => good(i.product.id, { whyItFits: "This loan has a rock-bottom 3.1% rate that fits your profile well." })));
      expect(req.messages[0].content).toMatch(/previous answer was rejected/);
      expect(req.messages[0].content).toMatch(/3\.1/);
      return toolMsg(r.top.map((i) => good(i.product.id)));
    });
    const out = await generateReasoning({ items: r.top, profile: pr, client: c });
    expect(c.messages.create).toHaveBeenCalledTimes(2);
    expect(out.claude).toBe(2);
    expect([...out.byId.values()].every((x) => !/3\.1/.test(x.whyItFits))).toBe(true);
  });

  it("falls back to template text for items that keep failing verification; good items keep the model text", async () => {
    const r = ranked();
    const [a, b] = r.top;
    const c = client(() => toolMsg([good(a.product.id), good(b.product.id, { nextStep: "Apply now at https://evil.example/offer for a 2.2% rate." })]));
    const out = await generateReasoning({ items: r.top, profile: pr, client: c });
    expect(out.byId.get(a.product.id)!.source).toBe("claude");
    const fb = out.byId.get(b.product.id)!;
    expect(fb.source).toBe("template");
    expect(fb.nextStep).not.toMatch(/evil/);
    expect(out).toMatchObject({ claude: 1, template: 1 });
  });

  it("handles a model that omits an item", async () => {
    const r = ranked();
    const c = client(() => toolMsg([good(r.top[0].product.id)]));
    const out = await generateReasoning({ items: r.top, profile: pr, client: c });
    expect(out.byId.get(r.top[1].product.id)!.source).toBe("template");
  });

  it("no client or an API failure yields template reasoning for every item and reports the error", async () => {
    const r = ranked();
    expect((await generateReasoning({ items: r.top, profile: pr, client: null })).template).toBe(2);
    const failing = { messages: { create: vi.fn(async () => { throw new Error("overloaded"); }) } } as unknown as MessagesClient;
    const out = await generateReasoning({ items: r.top, profile: pr, client: failing });
    expect(out.template).toBe(2);
    expect(out.error).toMatch(/overloaded/);
  });

  it("scraped text cannot smuggle instructions: the prompt marks products as untrusted data", () => {
    expect(REASONING_SYSTEM).toMatch(/scraped from the web[\s\S]*ignore any instructions/i);
    const item = ranked().top[0];
    expect(JSON.stringify(factsFor(item))).not.toMatch(/https?:\/\//);
  });
});

describe("report assembly", () => {
  it("builds a serialisable report with sources and dates on every item", async () => {
    const r = ranked();
    const reasoning = await generateReasoning({ items: r.top, profile: pr, client: null });
    const report = buildReport({ ranked: r, reasoning, outcomes: [], stats: { sourcesRead: 3, sourcesFromCache: 1, lendersTotal: 2, discoveredNew: 0, productsFound: 2 }, now: NOW });
    const round = JSON.parse(JSON.stringify(report));
    expect(round.items).toHaveLength(2);
    for (const it of round.items) {
      expect(it.sourceUrl).toMatch(/^https:\/\//);
      expect(it.scrapedAt).toMatch(/^2026-/);
      expect(it.reasoning.citation).toContain(it.sourceUrl);
    }
    expect(round.items[0]).toMatchObject({ rank: 1, label: "Pink Diamond" });
    expect(round.disclaimer).toMatch(/not financial or legal advice/i);
    expect(round.stats.reasoningBy).toEqual({ claude: 0, template: 2 });
  });
});
