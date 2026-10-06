import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { renderPdf } from "@/lib/export/pdf";
import { renderDocx } from "@/lib/export/docx";
import { pdfSafe } from "@/lib/export/text";
import { rankProducts } from "@/lib/matching/rank";
import { generateReasoning } from "@/lib/reasoning/claude";
import { buildReport } from "@/lib/report/build";
import { NOW, product, profile } from "./helpers";

async function sampleReport() {
  const pr = profile({ preferredTermMonths: 36 });
  const ranked = rankProducts({
    profile: pr, now: NOW,
    products: [
      product({ productName: "Prime Term Loan", minFico: 640, collateralRequired: "none", personalGuarantee: "not_required", fundingDaysMin: 2, fundingDaysMax: 3, originationFeePctMin: 1, originationFeePctMax: 3, evidenceQuote: "Borrow $10,000 to $250,000" }, { slug: "a", name: "A Bank", category: "Conventional" }, 1),
      product({ productName: "Flex LOC — 7(a) style", productType: "line_of_credit", aprMin: 14, aprMax: 18, personalGuarantee: "required" }, { slug: "b", name: "B Capital" }, 3),
      product({ productName: "Needs 720 FICO", minFico: 720 }, { slug: "c", name: "C Credit" }),
    ],
  });
  const reasoning = await generateReasoning({ items: ranked.top, profile: pr, client: null });
  return buildReport({
    ranked, reasoning, now: NOW,
    outcomes: [{ name: "Ghost Lender", slug: "ghost", status: "unavailable", products: 0, reason: "No usable product data found on 2 page(s) read.", dataAgeDays: null }],
    stats: { sourcesRead: 12, sourcesFromCache: 4, lendersTotal: 25, discoveredNew: 2, productsFound: 3 },
  });
}

describe("PDF export", () => {
  it("renders a real PDF containing the disclaimer, every pick, sources, scraped dates and 'How I decided'", async () => {
    const report = await sampleReport();
    const buf = await renderPdf(report);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(4000);
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    expect(totalPages).toBeGreaterThanOrEqual(2);
    const t = text.replace(/\s+/g, " ");
    expect(t).toMatch(/Informational only/);
    expect(t).toMatch(/not financial or legal advice/);
    for (const it of report.items) {
      expect(t).toContain(it.lenderName);
      expect(t).toContain(it.productName.replace("—", "-"));
      expect(t).toContain(it.sourceUrl);
      expect(t).toMatch(/scraped Oct \d{1,2}, 2026/);
    }
    expect(t).toMatch(/Pink Diamond/);
    expect(t).toMatch(/Gem/);
    expect(t).toMatch(/How I decided/);
    expect(t).toMatch(/Near misses/);
    expect(t).toMatch(/Raise your personal FICO to at least 720/);
    expect(t).toMatch(/Ghost Lender: No usable product data/);
    expect(t).toMatch(/never depends on commissions/);
    expect(t).toMatch(/Page \d+ of \d+/);
  });

  it("lists score components in the spec order even when the stored JSON has its keys reordered (Postgres jsonb)", async () => {
    const report = await sampleReport();
    const shuffle = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.length - b.length || a.localeCompare(b))) as T; // jsonb key order
    const shuffled = { ...report, weights: shuffle(report.weights), items: report.items.map((i) => ({ ...i, breakdown: shuffle(i.breakdown), weighted: shuffle(i.weighted) })) };
    expect(Object.keys(shuffled.weights)[0]).not.toBe("eligibilityFit");
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(await renderPdf(shuffled))), { mergePages: true });
    const t = text.replace(/\s+/g, " ");
    const at = (s: string) => t.indexOf(s);
    expect(at("Eligibility fit 30")).toBeGreaterThan(-1);
    expect(at("Eligibility fit 30")).toBeLessThan(at("Total cost of capital 25"));
    expect(at("Total cost of capital 25")).toBeLessThan(at("Term & payment fit 15"));
    expect(at("Term & payment fit 15")).toBeLessThan(at("Speed 10"));
    expect(at("Speed 10")).toBeLessThan(at("Collateral & guarantee burden 10"));
  });

  it("handles a report with zero matches", async () => {
    const report = await sampleReport();
    const empty = { ...report, items: [], nearMisses: [] };
    const buf = await renderPdf(empty);
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: true });
    expect(text).toMatch(/No product passed every hard filter/);
  });

  it("pdfSafe replaces glyphs the base font lacks", () => {
    expect(pdfSafe("≈ $5 → ≥ 3 — “x” · …")).toBe("~ $5 -> >= 3 - \"x\" | ...");
  });
});

describe("DOCX export", () => {
  it("is a valid .docx with the picks, hyperlinks to sources, notice and score table", async () => {
    const report = await sampleReport();
    const buf = await renderDocx(report);
    const zip = await JSZip.loadAsync(buf);
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(["[Content_Types].xml", "word/document.xml"]));
    const xml = await zip.file("word/document.xml")!.async("string");
    const text = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text).toMatch(/not financial or legal advice/);
    for (const it of report.items) {
      expect(text).toContain(it.lenderName);
      expect(text).toContain(it.sourceUrl);
    }
    expect(text).toMatch(/Pink Diamond/);
    expect(text).toMatch(/How I decided/);
    expect(text).toMatch(/Why it fits/);
    expect(text).toMatch(/Eligibility fit/);
    const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
    expect(rels).toContain(report.items[0].sourceUrl);
    expect(rels).toMatch(/TargetMode="External"/);
    const footer = Object.keys(zip.files).find((f) => /word\/footer\d*\.xml/.test(f));
    expect(footer).toBeTruthy();
    expect((await zip.file(footer!)!.async("string"))).toMatch(/Informational only/);
  });
});
