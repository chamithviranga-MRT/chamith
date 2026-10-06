import { US_STATES } from "@/lib/profile/geo";
import { ProductRecordSchema, type ExtractedProduct, type ProductRecord } from "./productSchema";
import { isDeniedUrl } from "./urls";
import type { StoredProduct } from "@/lib/types";

/**
 * Grounding check. A model (Firecrawl's extractor) can hallucinate numbers, so a value is kept ONLY
 * if it can be found in the page text it claims to come from. Anything else is nulled and listed in
 * `unverifiedFields`. This is how "never state a rate, fee or requirement that is not in scraped data"
 * is enforced in code rather than hoped for.
 */

const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, thirty: 30 };

/** Lowercase, unify dashes/quotes/spaces, drop markdown noise. */
export function normText(s: string): string {
  return s
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, " ")
    .replace(/[*_`#>|]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function fmt(n: number): string[] {
  const out = new Set<string>();
  out.add(String(n));
  if (Number.isInteger(n)) out.add(n.toLocaleString("en-US"));
  else {
    out.add(n.toFixed(1));
    out.add(n.toFixed(2));
    out.add(n.toLocaleString("en-US", { maximumFractionDigits: 3 }));
  }
  return [...out];
}

function hasToken(text: string, tok: string): boolean {
  const re = new RegExp(`(?<![\\d.,])${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\d]|\\.\\d|,\\d)`, "i");
  return re.test(text);
}

export function moneyAppears(text: string, n: number): boolean {
  if (n === 0) return /\$\s?0\b|\bno (?:fee|cost)|\bfree\b/.test(text);
  const forms: string[] = fmt(n);
  if (n >= 1000 && n % 1000 === 0) forms.push(`${n / 1000}k`, `${n / 1000} k`, `${n / 1000},000`);
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    for (const f of fmt(m)) forms.push(`${f} million`, `${f}m`, `${f} mm`, `${f}mm`);
  }
  return forms.some((f) => hasToken(text, f) || hasToken(text, `$${f}`));
}

export function percentAppears(text: string, n: number): boolean {
  const forms = [...fmt(n), n.toFixed(0), n.toFixed(1), n.toFixed(2)];
  return forms.some((f) => new RegExp(`(?<![\\d.])${f.replace(".", "\\.")}0*\\s?(?:%|percent|pct)`, "i").test(text));
}

/**
 * An APR must be an annual rate. "Monthly loan fees range from 0.55% to 1.55%" contains the number but describes a fee,
 * so the value is only accepted if SOME occurrence of it is not clearly a periodic fee (annual/interest wording wins).
 */
export function aprAppears(text: string, n: number): boolean {
  const forms = [...fmt(n), n.toFixed(0), n.toFixed(1), n.toFixed(2)];
  const re = new RegExp(`(?<![\\d.])(?:${[...new Set(forms)].map((f) => f.replace(".", "\\.")).join("|")})0*\\s?(?:%|percent|pct)`, "gi");
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    const ctx = text.slice(Math.max(0, i - 120), i + m[0].length + 120);
    const annual = /\bapr\b|annual percentage|interest|annuali[sz]ed|per year|a year|annually/.test(ctx);
    const periodicFee = /\b(?:monthly|weekly|daily)\b[^.]{0,60}\bfees?\b|\bfees?\b[^.]{0,60}\b(?:per|a|each|every) (?:month|week|day)\b|\bper month\b|\beach month\b/.test(ctx);
    if (annual || !periodicFee) return true;
  }
  return false;
}

/** Where a month/year figure for `months` appears in the text (as months, years, weeks, a "12+", or the low end of a range). */
function monthMatches(text: string, months: number): Array<{ index: number; length: number }> {
  const out: Array<{ index: number; length: number }> = [];
  const add = (src: string) => {
    for (const m of text.matchAll(new RegExp(src, "gi"))) out.push({ index: m.index ?? 0, length: m[0].length });
  };
  const RANGE = "\\s?(?:-|to)\\s?\\d+(?:\\.\\d+)?"; // the lower end of "6-12 months" / "10-30 years"
  for (const f of [`${months} month`, `${months}-month`, `${months} mo\\b`, `${months} months`, `${months}\\+ ?months?`, `${months} (?:plus|or more) months?`, `${months}${RANGE} ?(?:months?|mos?\\b)`]) add(`(?<![\\d.])${f}`);
  if (months % 12 === 0) {
    const y = months / 12;
    add(`(?<![\\d.])${y}(?:\\+|[- ]| (?:plus|or more) )(?:years?|yrs?)\\b`);
    add(`(?<![\\d.])${y}${RANGE} ?(?:years?|yrs?)\\b`);
    const word = Object.entries(NUM_WORDS).find(([, v]) => v === y)?.[0];
    if (word) add(`\\b${word}[- ](?:years?|yrs?)\\b`);
  }
  if (months % 1 !== 0 || months < 12) add(`(?<![\\d.])${(months / 12).toFixed(1)}[- ]years?`);
  if (months <= 3) add(`(?<![\\d.])${Math.round(months * 4.345)}[- ]weeks?`);
  return out;
}

/** Months may be written as months, or years (1 year = 12 months), or weeks for very short terms. */
export function monthsAppear(text: string, months: number): boolean {
  if (months === 0) return /\bno minimum\b|\bnew business|\bstartups?\b|\bnot required\b|\b0 months\b/.test(text);
  return monthMatches(text, months).length > 0;
}

const BUSINESS_AGE = /in business|business history|time in business|years in business|months in business|operating|operation|established|business age|been (?:open|running)/;
const LOAN_TERM = /\bterms?\b|repay|pay(?:ing)? back|maturit|duration|loan length|borrow(?:ing)? (?:for|over)|financing for/;

/** The figure must sit next to wording that fits its ROLE: "in business 12+ months" is a business age, not a 12-month loan term. */
function monthsInRole(text: string, months: number, role: "term" | "businessAge"): boolean {
  if (months === 0) return monthsAppear(text, months);
  return monthMatches(text, months).some((m) => {
    const ctx = text.slice(Math.max(0, m.index - 70), m.index + m.length + 70);
    const age = BUSINESS_AGE.test(ctx);
    const term = LOAN_TERM.test(ctx);
    return role === "term" ? term || !age : age || !term;
  });
}
export const termMonthsAppear = (t: string, n: number) => monthsInRole(t, n, "term");
export const businessAgeAppears = (t: string, n: number) => monthsInRole(t, n, "businessAge");

/** "Time to fund 1-2 months after approval": a month count only counts as funding time next to funding wording ("3 months of bank statements" does not). */
function monthsFundingAppear(text: string, m: number): boolean {
  const re = new RegExp(`(?<![\\d.])(?:\\d+\\s?(?:-|to)\\s?)?${m}(?:\\s?(?:-|to)\\s?\\d+)?\\s?months?`, "gi");
  for (const x of text.matchAll(re)) {
    const i = x.index ?? 0;
    if (/\b(?:fund|funded|funding|approv|disburs|closing|close in|receive)/.test(text.slice(Math.max(0, i - 60), i + x[0].length + 60))) return true;
  }
  return false;
}

export function daysAppear(text: string, days: number): boolean {
  if (days === 0) return /same[- ]day|within hours|instant|immediately/.test(text);
  if (days === 1) return /24[- ]hours?|next[- ](?:business[- ])?day|1[- ](?:business[- ])?day|one (?:business )?day|overnight|(?<![\d.])1\s?(?:-|to)\s?\d+\s?(?:business |calendar |working )?days?/.test(text);
  const forms = [`${days}`];
  const word = Object.entries(NUM_WORDS).find(([, v]) => v === days)?.[0];
  if (word) forms.push(word);
  if (days % 7 === 0) forms.push(`${days / 7}[- ]weeks?`);
  const hours = days * 24;
  forms.push(`${hours}[- ]hours?`);
  if (days % 30 === 0 && monthsFundingAppear(text, days / 30)) return true;
  return forms.some((f) => new RegExp(`(?<![\\d.])${f}\\s*(?:-|to|or)?\\s*(?:\\d+\\s*)?(?:business |calendar |working )?(?:days?|weeks?|hours?)`, "i").test(text) || new RegExp(`(?<![\\d.])${f}(?![\\d])\\s*(?:-|to)\\s*\\d+\\s*(?:business )?days?`, "i").test(text) || new RegExp(`\\b\\d+\\s*(?:-|to)\\s*${f}\\s*(?:business )?days?`, "i").test(text));
}

export function plainNumberAppears(text: string, n: number): boolean {
  return fmt(n).some((f) => hasToken(text, f));
}

export function ficoAppears(text: string, n: number): boolean {
  return new RegExp(`(?<![\\d.,])${n}\\+?(?![\\d,])`).test(text) && /fico|credit score|credit/.test(text);
}

export function factorAppears(text: string, n: number): boolean {
  return [n.toFixed(2), n.toFixed(1), String(n), n.toFixed(3)].some((f) => hasToken(text, f));
}

const has = (text: string, re: RegExp) => re.test(text);

type Check = (t: string, p: ExtractedProduct) => boolean;

const NUM_RULES: Array<[keyof ExtractedProduct, (t: string, v: number) => boolean]> = [
  ["minAmount", moneyAppears],
  ["maxAmount", moneyAppears],
  ["minAnnualRevenue", moneyAppears],
  ["minMonthlyRevenue", moneyAppears],
  ["monthlyFeeUsd", moneyAppears],
  ["termMinMonths", termMonthsAppear],
  ["termMaxMonths", termMonthsAppear],
  ["minTimeInBusinessMonths", businessAgeAppears],
  ["aprMin", aprAppears],
  ["aprMax", aprAppears],
  ["originationFeePctMin", percentAppears],
  ["originationFeePctMax", percentAppears],
  ["fundingDaysMin", daysAppear],
  ["fundingDaysMax", daysAppear],
  ["minFico", ficoAppears],
  ["factorMin", factorAppears],
  ["factorMax", factorAppears],
];

const ENUM_RULES: Array<[keyof ExtractedProduct, Check]> = [
  ["personalGuarantee", (t, p) => has(t, /guarant/) && (p.personalGuarantee !== "not_required" || has(t, /no personal guarantee|without a personal guarantee|not require(?:d)? (?:a )?personal guarantee|no guarantee/))],
  ["uccLien", (t, p) => (p.uccLien ? has(t, /\bucc\b|blanket lien|lien/) : has(t, /\bucc\b|blanket lien|lien|no lien/))],
  ["collateralRequired", (t, p) => (p.collateralRequired === "none" ? has(t, /unsecured|no collateral|without collateral|collateral[- ]free|not require(?:d)? collateral/) : has(t, /collateral|secured|secure the loan|pledge/))],
  ["creditPull", (t, p) => (p.creditPull === "soft" ? has(t, /soft (?:credit )?(?:pull|check|inquiry)|soft pull/) : has(t, /hard (?:credit )?(?:pull|check|inquiry)|hard pull|credit inquiry/))],
  ["prepaymentPenalty", (t, p) => (p.prepaymentPenalty === "none" ? has(t, /no prepayment|without (?:a )?prepayment|prepay(?:ment)? (?:anytime )?without|no early (?:payoff|repayment)|no (?:[a-z]+ ){0,3}(?:or )?(?:early (?:payoff|repayment)|prepayment) (?:fees?|penalt)|no penalty/) : has(t, /prepayment|early (?:payoff|repayment|termination)/))],
  ["repaymentFrequency", (t, p) => has(t, new RegExp(`${p.repaymentFrequency}`))],
  ["residencyRule", (t) => has(t, /citizen|permanent resident|resident|green card|u\.?s\.? (?:address|business|based)/)],
  ["businessUseAllowed", (t, p) => (p.businessUseAllowed ? has(t, /business/) : has(t, /business|commercial/))],
  ["aprIncludesFees", (t) => has(t, /apr|annual percentage rate/) && has(t, /fee|includ/)],
];

/** Verify one extracted product against the page text. Returns the cleaned product + dropped field names. */
export function verifyProduct(raw: ExtractedProduct, pageMarkdown: string): { product: ExtractedProduct; unverified: string[] } {
  const text = normText(pageMarkdown);
  const product: ExtractedProduct = { ...raw, excludedStates: [...raw.excludedStates], excludedCountries: [...raw.excludedCountries], eligiblePurposes: [...raw.eligiblePurposes] };
  const dropped: string[] = [];
  const drop = (k: string) => {
    if (!dropped.includes(k)) dropped.push(k);
  };

  for (const [key, test] of NUM_RULES) {
    const v = product[key];
    if (typeof v === "number") {
      if (!Number.isFinite(v) || v < 0 || !test(text, v)) {
        (product as Record<string, unknown>)[key] = null;
        drop(key);
      }
    }
  }
  for (const [key, check] of ENUM_RULES) {
    if (product[key] !== null && product[key] !== undefined && !check(text, product)) {
      (product as Record<string, unknown>)[key] = null;
      drop(key);
    }
  }

  // credit-history disqualifiers: the page must actually talk about them
  if (product.bankruptcyLookbackYears !== null) {
    const y = product.bankruptcyLookbackYears;
    if (!(has(text, /bankruptc/) && (y === 99 || monthsAppear(text, y * 12)))) {
      product.bankruptcyLookbackYears = null;
      drop("bankruptcyLookbackYears");
    }
  }
  if (product.taxLiensDisqualify !== null && !has(text, /tax lien|\blien/)) {
    product.taxLiensDisqualify = null;
    drop("taxLiensDisqualify");
  }
  if (product.recentDefaultsDisqualify !== null && !has(text, /default|delinquen|charge-?off|collections?/)) {
    product.recentDefaultsDisqualify = null;
    drop("recentDefaultsDisqualify");
  }

  // sanity: ranges must be ordered, otherwise the pair is untrustworthy
  const pairs: Array<[keyof ExtractedProduct, keyof ExtractedProduct]> = [
    ["minAmount", "maxAmount"], ["termMinMonths", "termMaxMonths"], ["aprMin", "aprMax"], ["factorMin", "factorMax"],
    ["originationFeePctMin", "originationFeePctMax"], ["fundingDaysMin", "fundingDaysMax"],
  ];
  for (const [lo, hi] of pairs) {
    const a = product[lo];
    const b = product[hi];
    if (typeof a === "number" && typeof b === "number" && a > b) {
      (product as Record<string, unknown>)[lo] = null;
      (product as Record<string, unknown>)[hi] = null;
      drop(String(lo));
      drop(String(hi));
    }
  }
  if (typeof product.minFico === "number" && (product.minFico < 300 || product.minFico > 850)) {
    product.minFico = null;
    drop("minFico");
  }

  // excluded states: each must be a real code AND the page must mention it
  const keptStates: string[] = [];
  for (const s of product.excludedStates) {
    const code = s.trim().toUpperCase();
    const name = US_STATES[code]?.toLowerCase();
    if (name && (text.includes(name) || new RegExp(`\\b${code}\\b`, "i").test(pageMarkdown))) keptStates.push(code);
    else drop("excludedStates");
  }
  product.excludedStates = [...new Set(keptStates)];
  const keptCountries = product.excludedCountries.map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c));
  product.excludedCountries = keptCountries.length === product.excludedCountries.length ? keptCountries : (drop("excludedCountries"), []);

  // evidence quote must literally exist in the page
  if (product.evidenceQuote) {
    const q = normText(product.evidenceQuote).replace(/[.…]+$/g, "").trim();
    if (q.length < 8 || !text.includes(q)) {
      product.evidenceQuote = null;
      drop("evidenceQuote");
    } else product.evidenceQuote = product.evidenceQuote.slice(0, 220);
  }
  return { product, unverified: dropped };
}

const VEHICLE_ONLY = /\b(?:auto|vehicles?|cars?|vans?|trucks?|fleet)\b/i;
const IDENTIFIER_NAME = /^[a-z0-9]+(?:_[a-z0-9]+)+$/i; // "business_credit_card": a field label, not a product name

/**
 * Judgement calls applied to every record (fresh or cached):
 *  - an APR of exactly 0% is an introductory/promotional offer, not the product's rate;
 *  - a minimum amount or term of 0 means "not stated", not "zero";
 *  - a product with no listed uses whose name/evidence says it finances vehicles is vehicle-only, so it is offered for
 *    vehicle purchases only (a bank auto loan can neither fund a second restaurant nor buy an excavator).
 */
export function sanitizeRecord(r: ProductRecord): ProductRecord {
  const out: ProductRecord = { ...r, unverifiedFields: [...r.unverifiedFields] };
  for (const k of ["aprMin", "aprMax"] as const) {
    if (out[k] === 0) {
      out[k] = null;
      if (!out.unverifiedFields.includes(k)) out.unverifiedFields.push(k);
    }
  }
  if (out.minAmount === 0) out.minAmount = null;
  if (out.termMinMonths === 0) out.termMinMonths = null;
  if (!out.eligiblePurposes.length && VEHICLE_ONLY.test(`${out.productName} ${out.evidenceQuote ?? ""}`)) out.eligiblePurposes = ["vehicle"];
  return out;
}

/** Can a stored record still be shown? Rules tighten over time, so cached rows are re-judged on every read. */
export function isUsableRecord(r: ProductRecord): boolean {
  return !isDeniedUrl(r.sourceUrl) && !IDENTIFIER_NAME.test(r.productName);
}

/** Re-judge, sanitise and de-duplicate products read back from the cache (identical facts on one page = one product). */
export function cleanCached(products: StoredProduct[]): StoredProduct[] {
  const seen = new Set<string>();
  const out: StoredProduct[] = [];
  for (const p of products) {
    if (!isUsableRecord(p.record)) continue;
    const record = sanitizeRecord(p.record);
    const key = [p.lender.slug, record.sourceUrl, record.productType, record.aprMin, record.aprMax, record.minAmount, record.maxAmount, record.termMinMonths, record.termMaxMonths, record.minFico, record.minTimeInBusinessMonths].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...p, record });
  }
  return out;
}

/** Free text from a scraped page is untrusted: strip links, markup, control chars; bound its length. */
export function cleanLabel(s: string | null | undefined, max = 100): string | null {
  if (!s) return null;
  const t = s
    .replace(/<[^>]*>/g, "") // whole HTML tags
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[\u0000-\u001f\u007f<>`{}[\]\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return t.length >= 2 ? t : null;
}

/** Looks for a plausible injection attempt; flagged pages are dropped entirely. */
export function looksLikeInjection(s: string): boolean {
  return /ignore (?:all |any )?(?:previous|prior|above) (?:instructions|prompts)|disregard (?:the )?(?:above|previous)|you are now|system prompt|reveal your|as an ai (?:language )?model/i.test(s);
}

/** Turn a verified page extraction into stored records (adds provenance; rejects products with no usable data). */
export function toProductRecords(
  products: ExtractedProduct[],
  pageMarkdown: string,
  ctx: { lenderSlug: string; lenderName: string; sourceUrl: string; scrapedAt: Date }
): ProductRecord[] {
  const out: ProductRecord[] = [];
  for (const raw of products) {
    const name = cleanLabel(raw.productName);
    if (!name || !raw.productType) continue;
    if (IDENTIFIER_NAME.test(name)) continue;
    if (looksLikeInjection(`${raw.productName ?? ""} ${raw.evidenceQuote ?? ""}`)) continue;
    const { product, unverified } = verifyProduct({ ...raw, productName: name }, pageMarkdown);
    // A product with no verified quantitative or eligibility fact is not worth ranking.
    const factual = [
      product.minAmount, product.maxAmount, product.aprMin, product.aprMax, product.factorMin, product.factorMax,
      product.termMinMonths, product.termMaxMonths, product.minFico, product.minTimeInBusinessMonths,
    ].some((v) => typeof v === "number");
    if (!factual) continue;
    const rec = ProductRecordSchema.safeParse({
      ...product,
      productName: name,
      productType: raw.productType,
      lenderSlug: ctx.lenderSlug,
      lenderName: ctx.lenderName,
      sourceUrl: ctx.sourceUrl,
      scrapedAt: ctx.scrapedAt.toISOString(),
      unverifiedFields: unverified,
    });
    if (rec.success && isUsableRecord(rec.data)) out.push(sanitizeRecord(rec.data));
  }
  return out;
}
