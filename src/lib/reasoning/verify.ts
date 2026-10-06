/**
 * Checks model-written text against the facts it was given. "Never state a rate, fee or requirement that is not in
 * scraped data" is enforced here: every number must come from the item's verified facts, no foreign URLs, no promises.
 */

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";

/** Dates and bare years are citation metadata, not claims. */
export function stripDates(text: string): string {
  return text
    .replace(/\b\d{4}-\d{2}-\d{2}(?:t[\d:.]+z?)?\b/gi, " ")
    .replace(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}(?:,?\\s+\\d{4})?`, "gi"), " ") // 5 Oct 2026 (day first)
    .replace(new RegExp(`\\b${MONTH}\\s+\\d{1,2}(?!\\d)(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?`, "gi"), " ") // Oct 5, 2026
    .replace(new RegExp(`\\b${MONTH}\\s+\\d{4}\\b`, "gi"), " ") // Oct 2026
    .replace(/(?<![$\d.,])\b(?:19[9]\d|20\d{2}|2100)\b(?![%\d,.])/g, " ");
}

export function parseNumberToken(tok: string): number | null {
  const m = /^\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(%|k|m|mm|million|thousand|billion)?$/i.exec(tok.trim());
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ""));
  const s = (m[2] ?? "").toLowerCase();
  if (s === "k" || s === "thousand") n *= 1_000;
  else if (s === "m" || s === "mm" || s === "million") n *= 1_000_000;
  else if (s === "billion") n *= 1_000_000_000;
  return Number.isFinite(n) ? n : null;
}

/** All numeric values mentioned in `text` (dates removed). */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of stripDates(text).matchAll(/\$?\s?\d[\d,]*(?:\.\d+)?\s?(?:%|million|thousand|billion|mm|k\b|m\b)?/gi)) {
    const n = parseNumberToken(m[0]);
    if (n !== null) out.push(n);
  }
  return out;
}

/** Walks any JSON-ish value collecting numbers (including those inside strings). */
export function collectNumbers(v: unknown, into: Set<number> = new Set()): Set<number> {
  if (typeof v === "number" && Number.isFinite(v)) into.add(v);
  else if (typeof v === "string") for (const n of numbersIn(v)) into.add(n);
  else if (Array.isArray(v)) for (const x of v) collectNumbers(x, into);
  else if (v && typeof v === "object") for (const x of Object.values(v)) collectNumbers(x, into);
  return into;
}

export interface AllowedNumbers {
  has(n: number): boolean;
  size: number;
}

/** Facts -> permitted numbers, with the unit conversions a human would consider "the same fact". */
export function allowedNumbers(...sources: unknown[]): AllowedNumbers {
  const base = new Set<number>();
  for (const s of sources) collectNumbers(s, base);
  const all = new Set<number>(base);
  for (const v of base) {
    all.add(Math.round(v));
    all.add(Math.round(v * 10) / 10);
    all.add(Math.round(v * 100) / 100);
    if (v >= 12 && v % 12 === 0) all.add(v / 12); // months -> years
    if (v > 0 && v <= 40 && Number.isInteger(v)) all.add(v * 12); // years -> months
    if (v >= 7 && v % 7 === 0) all.add(v / 7); // days -> weeks
  }
  return {
    size: all.size,
    has: (n: number) => {
      if (all.has(n)) return true;
      for (const v of all) if (Math.abs(v - n) < 0.0051) return true;
      return false;
    },
  };
}

const BANNED_CLAIMS = /\b(?:guarantee[sd]?\s+(?:approval|funding|you)|will be approved|sure to be approved|risk[- ]free|no risk|best (?:rate|lender|deal) (?:in|on|available)|lowest rate (?:available|anywhere)|pre-?approved)\b/i;
const URL_RE = /(?:https?:\/\/|www\.)[^\s)\]>"']+/gi;

export interface ReasoningText {
  whyItFits: string;
  couldBlock: string;
  nextStep: string;
}

const cleanUrl = (u: string) => u.replace(/[.,;:!?]+$/, "").replace(/\/+$/, "").toLowerCase();

/** Returns a list of violations (empty = text is acceptable). */
export function checkReasoning(text: ReasoningText, allowed: AllowedNumbers, sourceUrl: string): string[] {
  const issues: string[] = [];
  const fields: Array<[keyof ReasoningText, string]> = [["whyItFits", text.whyItFits], ["couldBlock", text.couldBlock], ["nextStep", text.nextStep]];
  for (const [name, value] of fields) {
    if (!value || value.trim().length < 10) {
      issues.push(`${name} is empty or too short`);
      continue;
    }
    if (value.length > 700) issues.push(`${name} is too long (${value.length} characters)`);
    const bad = [...new Set(numbersIn(value).filter((n) => !allowed.has(n)))];
    if (bad.length) issues.push(`${name} contains number(s) not in the verified facts: ${bad.join(", ")}`);
    for (const u of value.match(URL_RE) ?? []) {
      if (cleanUrl(u) !== cleanUrl(sourceUrl)) issues.push(`${name} contains a URL other than the source URL: ${u}`);
    }
    if (BANNED_CLAIMS.test(value)) issues.push(`${name} makes a promise or superlative that cannot be supported`);
  }
  return issues;
}
