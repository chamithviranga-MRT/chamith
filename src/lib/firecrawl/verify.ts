import { US_STATES } from "@/lib/profile/geo";
import { ProductRecordSchema, type ExtractedProduct, type ProductRecord } from "./productSchema";

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

/** Months may be written as months, or years (1 year = 12 months), or weeks for very short terms. */
export function monthsAppear(text: string, months: number): boolean {
  if (months === 0) return /\bno minimum\b|\bnew business|\bstartups?\b|\bnot required\b|\b0 months\b/.test(text);
  const forms = [`${months} month`, `${months}-month`, `${months} mo\\b`, `${months} months`];
  const re = (s: string) => new RegExp(`(?<![\\d.])${s}`, "i");
  if (forms.some((f) => re(f).test(text))) return true;
  if (months % 12 === 0) {
    const y = months / 12;
    if (new RegExp(`(?<![\\d.])${y}[- ](?:years?|yrs?)\\b`, "i").test(text)) return true;
    const word = Object.entries(NUM_WORDS).find(([, v]) => v === y)?.[0];
    if (word && new RegExp(`\\b${word}[- ](?:years?|yrs?)\\b`, "i").test(text)) return true;
  }
  if (months % 1 !== 0 || months < 12) {
    const years = months / 12;
    if (new RegExp(`(?<![\\d.])${years.toFixed(1)}[- ]years?`, "i").test(text)) return true;
  }
  if (months <= 3) {
    const w = Math.round(months * 4.345);
    if (new RegExp(`(?<![\\d.])${w}[- ]weeks?`, "i").test(text)) return true;
  }
  return false;
}

export function daysAppear(text: string, days: number): boolean {
  if (days === 0) return /same[- ]day|within hours|instant|immediately/.test(text);
  if (days === 1) return /24[- ]hours?|next[- ](?:business[- ])?day|1[- ](?:business[- ])?day|one (?:business )?day|overnight/.test(text);
  const forms = [`${days}`];
  const word = Object.entries(NUM_WORDS).find(([, v]) => v === days)?.[0];
  if (word) forms.push(word);
  if (days % 7 === 0) forms.push(`${days / 7}[- ]weeks?`);
  const hours = days * 24;
  forms.push(`${hours}[- ]hours?`);
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
  ["termMinMonths", monthsAppear],
  ["termMaxMonths", monthsAppear],
  ["minTimeInBusinessMonths", monthsAppear],
  ["aprMin", percentAppears],
  ["aprMax", percentAppears],
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
  ["prepaymentPenalty", (t, p) => (p.prepaymentPenalty === "none" ? has(t, /no prepayment|without (?:a )?prepayment|prepay(?:ment)? (?:anytime )?without|no early (?:payoff|repayment)|no penalty/) : has(t, /prepayment|early (?:payoff|repayment|termination)/))],
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
    if (rec.success) out.push(rec.data);
  }
  return out;
}
