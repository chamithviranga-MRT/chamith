import "dotenv/config";
import { writeFileSync } from "node:fs";
import { FirecrawlWeb } from "./src/lib/firecrawl/client";
import { EXTRACTION_PROMPT, PageExtractionSchema, pageExtractionJsonSchema } from "./src/lib/firecrawl/productSchema";
import { verifyProduct, normText } from "./src/lib/firecrawl/verify";

const URLS = [
  "https://www.bluevine.com/business-loans/line-of-credit",
  "https://business.bankofamerica.com/en/business-loans/unsecured-line-of-credit",
  "https://www.pnc.com/en/small-business/borrowing/sba-financing.html",
  "https://www.lendio.com/business-loans/sba-loans",
  "https://www.chase.com/business/credit-cards/mychaseloan",
  "https://www.pnc.com/en/small-business/business-financing.html",
];
const CTX: Record<string, RegExp> = {
  termMinMonths: /\b(\d+|one|two|three|four|five|six|ten|twelve|fifteen|twenty|twenty-five)[ -](?:month|year|yr)s?\b/gi,
  termMaxMonths: /\b(\d+|one|two|three|four|five|six|ten|twelve|fifteen|twenty|twenty-five)[ -](?:month|year|yr)s?\b/gi,
  aprMin: /\d+(?:\.\d+)?\s?%/g, aprMax: /\d+(?:\.\d+)?\s?%/g,
  minAmount: /\$\s?[\d,.]+\s?(?:k|m|million|mm)?\b/gi, maxAmount: /\$\s?[\d,.]+\s?(?:k|m|million|mm)?\b/gi,
  minTimeInBusinessMonths: /(?:in business|time in business|business history|operating)/gi,
  collateralRequired: /collateral|secured|unsecured|\blien/gi,
  creditPull: /credit (?:check|pull|inquir)|soft (?:pull|inquir)|hard (?:pull|inquir)/gi,
  prepaymentPenalty: /prepay|early (?:payoff|repay)/gi,
  personalGuarantee: /guarant/gi,
  fundingDaysMin: /same[- ]day|business days?|within \d+|hours?|next[- ]day/gi, fundingDaysMax: /same[- ]day|business days?|within \d+|hours?|next[- ]day/gi,
  uccLien: /\bucc\b|blanket lien/gi, residencyRule: /citizen|resident|u\.?s\.?[- ]based|u\.?s\.? address/gi,
  bankruptcyLookbackYears: /bankrupt/gi, taxLiensDisqualify: /tax lien/gi, recentDefaultsDisqualify: /default|delinquen|collections/gi,
};
async function main() {
  const web = FirecrawlWeb.fromEnv()!;
  const report: any[] = [];
  for (const url of URLS) {
    let page;
    try { page = await web.scrapeProducts(url, { prompt: EXTRACTION_PROMPT, schema: pageExtractionJsonSchema() }); } catch (e) { console.log("FAIL", url, String(e).slice(0, 100)); continue; }
    const slug = url.replace(/https?:\/\/(www\.)?/, "").replace(/[^a-z0-9]+/gi, "-").slice(0, 60);
    writeFileSync(`reports/verifier/${slug}.md`, page.markdown);
    const parsed = PageExtractionSchema.safeParse(page.json);
    const raws = parsed.success ? parsed.data.products : [];
    const text = normText(page.markdown);
    console.log(`\n##### ${url}  (markdown ${page.markdown.length} chars, ${raws.length} raw products)`);
    for (const raw of raws) {
      const { product, unverified } = verifyProduct({ ...raw }, page.markdown);
      console.log(`\n  == ${raw.productName} [${raw.productType}] raw-fields-non-null=${Object.values(raw).filter((v) => v !== null && !(Array.isArray(v) && !v.length)).length} dropped=${unverified.length}`);
      for (const f of unverified) {
        const rv = (raw as any)[f];
        const re = CTX[f];
        let snips: string[] = [];
        if (re) for (const m of text.matchAll(new RegExp(re.source, re.flags))) { const i = m.index ?? 0; snips.push(text.slice(Math.max(0, i - 70), i + (m[0]?.length ?? 0) + 70).replace(/\s+/g, " ")); if (snips.length >= 2) break; }
        console.log(`    - ${f}: raw=${JSON.stringify(rv)} | page: ${snips.length ? snips.map((s) => `“…${s}…”`).join("  ") : "(no related text found)"}`);
      }
      report.push({ url, name: raw.productName, dropped: unverified });
    }
  }
  writeFileSync("reports/verifier/summary.json", JSON.stringify(report, null, 2));
}
main();
