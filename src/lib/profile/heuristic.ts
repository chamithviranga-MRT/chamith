import type { Frequency, Profile, ProfilePatch, Purpose } from "./schema";
import { FOREIGN_COUNTRY_PATTERNS, US_STATES } from "./geo";

/**
 * Pattern-based extractor used when no Anthropic key is configured or the model call fails.
 * Deliberately conservative: when a value is ambiguous it is left null (and later asked/edited)
 * rather than guessed.
 */

export interface ExtractContext {
  userText: string;
  current: Profile;
  lastAssistant: string | null;
}
export type Extractor = (ctx: ExtractContext) => Promise<ProfilePatch>;

const AMBIGUOUS_CODES = new Set(["OK", "OR", "ME", "HI", "OH", "IN", "PA", "LA", "MA", "DE", "ID", "AS", "VI", "GU", "MP", "PR"]);

function parseMoney(num: string, suffix?: string): number {
  const n = Number(num.replace(/,/g, ""));
  const s = (suffix ?? "").toLowerCase();
  if (s === "k" || s === "thousand") return n * 1_000;
  if (s === "m" || s === "mm" || s === "million") return n * 1_000_000;
  return n;
}

interface MoneyHit {
  value: number;
  index: number;
  end: number;
}

function findMoney(t: string): MoneyHit[] {
  const hits: MoneyHit[] = [];
  const seen = new Set<number>();
  const push = (m: RegExpExecArray, value: number) => {
    if (seen.has(m.index)) return;
    seen.add(m.index);
    hits.push({ value, index: m.index, end: m.index + m[0].length });
  };
  for (const m of t.matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)\s?(k|mm|m|million|thousand)?\b/gi)) push(m as RegExpExecArray, parseMoney(m[1], m[2]));
  for (const m of t.matchAll(/(?<![\d$,.])(\d[\d,]*(?:\.\d+)?)\s?(k|thousand|million|mm)\b/gi)) push(m as RegExpExecArray, parseMoney(m[1], m[2]));
  for (const m of t.matchAll(/(?<![\d$,.])(\d{1,3}(?:,\d{3})+|\d{4,})\s*(?:dollars|usd|bucks)\b/gi)) push(m as RegExpExecArray, parseMoney(m[1]));
  return hits.sort((a, b) => a.index - b.index);
}

function windowAround(t: string, hit: MoneyHit, before = 45, after = 45) {
  return { b: t.slice(Math.max(0, hit.index - before), hit.index).toLowerCase(), a: t.slice(hit.end, hit.end + after).toLowerCase() };
}

const REVENUE_BEFORE = /(revenue|sales|income|gross(?:ing)?|making|earn(?:ing|s)?|bring(?:ing)? in|turnover|deposits?)[^$\d]{0,30}$/;
const REVENUE_AFTER = /^\s*(?:\/|a |per |in |of |every )?\s*(?:mo\b|month|monthly|yr\b|year|annual|yearly|in (?:monthly |annual )?(?:revenue|sales|income)|revenue|sales)/;
const AMOUNT_BEFORE = /(need|needs|loan|borrow|fund(?:s|ing)?|raise|raising|financ(?:e|ing)|capital|looking for|looking to|want|seeking|credit line|line of credit|up to|request|ask(?:ing)? for)[^$\d]{0,40}$/;
const AMOUNT_AFTER = /^\s*(?:loan|in (?:funding|financing|capital)|for\b|to (?:buy|fund|expand|open|cover|pay|purchase|launch|build)|of (?:working|funding|capital))/;

function extractMoney(t: string, patch: ProfilePatch) {
  const hits = findMoney(t);
  let amount: number | null = null;
  let amountLow: number | null = null;
  let monthly: number | null = null;
  let annual: number | null = null;
  for (const h of hits) {
    const { b, a } = windowAround(t, h);
    const revenueish = REVENUE_BEFORE.test(b) || REVENUE_AFTER.test(a);
    if (revenueish && !AMOUNT_BEFORE.test(b)) {
      const ctx = `${b} ${a}`;
      if (/(month|monthly|\/mo\b|per month|a month)/.test(ctx)) monthly ??= h.value;
      else if (/(year|annual|yearly|\/yr|per year|a year)/.test(ctx)) annual ??= h.value;
      continue; // revenue with no stated period is ambiguous: leave null
    }
    if (AMOUNT_BEFORE.test(b) || AMOUNT_AFTER.test(a)) amount ??= h.value;
    else amountLow ??= h.value;
  }
  if (/\b(?:no|zero|haven'?t (?:made|had|earned) any)\s+(?:revenue|sales|income)\b|\bpre-?revenue\b|\bnot (?:yet )?(?:making|generating) (?:any )?(?:revenue|money|sales)\b/i.test(t)) {
    monthly ??= 0;
    annual ??= 0;
  }
  const finalAmount = amount ?? amountLow;
  if (finalAmount !== null) patch.amountNeeded = finalAmount;
  if (monthly !== null) patch.monthlyRevenue = monthly;
  if (annual !== null) patch.annualRevenue = annual;
}

const FICO_BANDS: Array<[RegExp, number, number, string]> = [
  [/\b(?:very good|great)\b[^.]{0,20}credit|credit[^.]{0,20}\b(?:very good|great)\b/, 740, 799, "very good"],
  [/\b(?:excellent|exceptional|perfect|stellar)\b[^.]{0,20}credit|credit[^.]{0,20}\b(?:excellent|exceptional|perfect|stellar)\b/, 800, 850, "excellent"],
  [/\b(?:poor|bad|terrible|rough|damaged|low)\b[^.]{0,20}credit|credit[^.]{0,20}\b(?:poor|bad|terrible|rough|damaged|low)\b/, 300, 579, "poor"],
  [/\b(?:fair|average|so-so|mediocre|okay|ok)\b[^.]{0,20}credit|credit[^.]{0,20}\b(?:fair|average|so-so|mediocre)\b/, 580, 669, "fair"],
  [/\b(?:good|decent|solid)\b[^.]{0,20}credit|credit[^.]{0,20}\b(?:good|decent|solid)\b/, 670, 739, "good"],
];

function extractCredit(t: string, lower: string, patch: ProfilePatch, assumptions: string[]) {
  const inRange = (n: number) => n >= 300 && n <= 850;
  const range = /(?:fico|credit|score)[^.\d]{0,30}(\d{3})\s*(?:-|–|—|to)\s*(\d{3})|(\d{3})\s*(?:-|–|—|to)\s*(\d{3})\s*(?:fico|credit|score)/i.exec(t);
  if (range) {
    const a = Number(range[1] ?? range[3]);
    const b = Number(range[2] ?? range[4]);
    if (inRange(a) && inRange(b)) {
      patch.ficoMin = Math.min(a, b);
      patch.ficoMax = Math.max(a, b);
      return;
    }
  }
  const single =
    /(?:fico|credit score|credit|score)[^.\d]{0,25}?(\d{3})\b(?!\s*(?:-|–|to)\s*\d{3})/i.exec(t) ??
    /\b(\d{3})\s*(?:fico|credit score|score)\b/i.exec(t);
  if (single && inRange(Number(single[1]))) {
    patch.ficoMin = patch.ficoMax = Number(single[1]);
    return;
  }
  for (const [re, lo, hi, label] of FICO_BANDS) {
    if (re.test(lower)) {
      patch.ficoMin = lo;
      patch.ficoMax = hi;
      assumptions.push(`Described credit as “${label}”, mapped to a FICO range of ${lo}–${hi}.`);
      return;
    }
  }
}

const STARTUP_RE =
  /\b(start-?up|not (?:yet )?(?:launched|started|opened|open)|haven'?t (?:launched|started|opened|begun)|pre-?launch|idea stage|just (?:starting|launching|getting started)|about to (?:start|launch|open)|(?:planning|plan|hoping|want|wanting) to (?:start|open|launch)|starting (?:a|my|an)\b|launching (?:a|my|an)\b|opening (?:a|my|an)\b|new business|no operating history)/i;

function extractTimeInBusiness(t: string, lower: string, patch: ProfilePatch, assumptions: string[]): boolean {
  const re = /(\d+(?:\.\d+)?)[- ]?(years?|yrs?|months?|mos?)\b(?:[- ]old)?/gi;
  for (const m of t.matchAll(re)) {
    const idx = m.index ?? 0;
    const before = lower.slice(Math.max(0, idx - 30), idx);
    const after = lower.slice(idx + m[0].length, idx + m[0].length + 40);
    if (/(term|repay|payoff|pay off|over the|over|within|under|less than|loan of|amortiz|maturity|\bfor a\b)\s*$/.test(before)) continue;
    if (/^\s*(?:term|loan|repayment|payoff|financing|maturity|ago\b|from now)/.test(after)) continue;
    const bizCtx = /^[\s,-]*(?:[a-z'-]+\s+){0,2}?(?:in business|old|operating|operation|established|open\b|running|profitable|business|company|restaurant|shop|store|firm|llc|practice|agency|salon|contracting|company|bakery|cafe|truck|farm|clinic|studio|startup|gym|bar\b)/.test(after) ||
      /(?:in business|operating|operated|open(?:ed)?|established|running|been|invest(?:ing|ed)|owned|trading|flipping|landlord)\s*(?:for|since|about|around|roughly|over|almost|nearly)?\s*$/.test(before) ||
      /(in business|operating|operated|been open|established|owned)[^.]{0,25}$/.test(before) ||
      /(business|company|llc|restaurant|shop|store|firm|practice)[^.]{0,20}(?:for|is|has been|been)[^.]{0,10}$/.test(before);
    if (!bizCtx) continue;
    const n = Number(m[1]);
    const months = /^(?:year|yr)/i.test(m[2]) ? Math.round(n * 12) : Math.round(n);
    patch.timeInBusinessMonths = months;
    return true;
  }
  const since = /\b(?:since|established in|founded in|opened in|started in)\s+((?:19|20)\d{2})\b/i.exec(t);
  if (since) {
    const years = new Date().getFullYear() - Number(since[1]);
    if (years >= 0 && years <= 100) {
      patch.timeInBusinessMonths = years * 12;
      assumptions.push(`Time in business estimated from “since ${since[1]}”.`);
      return true;
    }
  }
  if (STARTUP_RE.test(t)) {
    patch.timeInBusinessMonths = 0;
    patch.borrowerType = "startup";
    return true;
  }
  return false;
}

function extractLocation(t: string, lower: string, patch: ProfilePatch) {
  type Found = { code: string; index: number };
  const found: Found[] = [];
  for (const [code, name] of Object.entries(US_STATES)) {
    if (code === "DC") continue;
    const re = new RegExp(`\\b${name.replace(/\./g, "\\.")}\\b`, "gi");
    for (const m of t.matchAll(re)) {
      // "Washington" / "New York" are also cities; accept as state anyway (cheap to correct on the card)
      found.push({ code, index: m.index ?? 0 });
    }
  }
  if (/\b(?:washington,? ?d\.?c\.?|district of columbia)\b/i.test(t)) found.push({ code: "DC", index: lower.indexOf("washington") });
  for (const m of t.matchAll(/(?:,\s*|\bin\s+|\bof\s+|\bbased in\s+)([A-Z]{2})\b/g)) {
    const code = m[1];
    if (!US_STATES[code]) continue;
    const viaComma = m[0].trim().startsWith(",");
    if (AMBIGUOUS_CODES.has(code) && !viaComma) continue;
    found.push({ code, index: m.index ?? 0 });
  }

  const usBizHint = /\b(?:u\.?s\.?|american|delaware|wyoming|florida|texas|new mexico)\s+(?:llc|c-?corp|corporation|company|business|inc)\b|\bllc in the (?:us|u\.s\.|united states)\b|\b(?:us|u\.s\.)[- ]based (?:llc|business|company)\b|\bregistered in\b/i.test(t);
  let ownerState: string | null = null;
  let bizState: string | null = null;
  for (const f of found) {
    const before = lower.slice(Math.max(0, f.index - 45), f.index);
    if (/(live|living|lives|reside|resident|home|personally|i am in|i'm in|i am from|i'm from)[^.;]{0,25}$/.test(before) && !/(business|company|llc|restaurant|shop|located|based|operat)[^.;]{0,15}$/.test(before)) {
      ownerState ??= f.code;
    } else {
      bizState ??= f.code;
    }
  }
  if (bizState) patch.businessState = bizState;
  if (ownerState) patch.ownerState = ownerState;
  if (usBizHint) patch.businessCountry = "US";

  // Non-US owner.
  const nonUsCue = /\bnon-?\s?u\.?s\.?\b|\bforeign (?:national|owner|founder|citizen)\b|\boutside (?:of )?the (?:us|u\.s\.|united states)\b|\boverseas\b|\babroad\b|\bnot a (?:u\.?s\.? )?(?:citizen|resident)\b|\bno (?:us|u\.s\.) (?:citizenship|residency)\b/i.test(t);
  let ownerCountry: string | null = null;
  for (const [re, code] of FOREIGN_COUNTRY_PATTERNS) {
    const m = re.exec(t);
    if (!m) continue;
    const before = lower.slice(Math.max(0, (m.index ?? 0) - 40), m.index);
    if (/(live|living|lives|based|reside|resident|citizen|national|from|born|located|owner|founder|i'm in|i am in|home|residing)[^.;]{0,25}$/.test(before) || nonUsCue || /\b(?:owner|founder|i)\b.{0,30}$/.test(before)) {
      ownerCountry = code;
      break;
    }
  }
  if (!ownerCountry && nonUsCue) ownerCountry = "ZZ";
  if (ownerCountry) {
    patch.ownerCountry = ownerCountry;
    if (usBizHint && !patch.businessCountry) patch.businessCountry = "US";
    // a US state mentioned alongside a foreign owner describes the business, not the owner
    if (patch.ownerState && !ownerState) delete patch.ownerState;
    if (ownerState && !bizState && usBizHint) {
      patch.businessState = ownerState;
      delete patch.ownerState;
    }
    patch.ownerState = undefined;
  }

  // Residency status.
  if (/\bgreen card\b|\bpermanent resident\b|\blpr\b/i.test(t)) patch.ownerResidency = "permanent_resident";
  else if (/\b(?:h-?1b|f-?1|l-?1|o-?1|e-?2|visa holder|on a visa|work visa|student visa|opt\b)/i.test(t)) patch.ownerResidency = "visa_holder";
  else if (/\bu\.?s\.? citizen\b|\bamerican citizen\b/i.test(t) && !/\bnot a\b/i.test(t)) patch.ownerResidency = "us_citizen";
  else if (ownerCountry && ownerCountry !== "US") patch.ownerResidency = "non_resident";
}

const PURPOSE_RULES: Array<[RegExp, Purpose]> = [
  [/\b(?:consolidat\w*|pay(?:ing)? off (?:my |our |existing )?(?:debt|loans?|cards?|mca)|refinanc\w*|existing debt)\b/i, "debt_consolidation"],
  [/\b(?:real estate|rental propert\w*|investment propert\w*|fix(?: and |-and-)?flip\w*|flip(?:ping)? (?:a |houses?|homes?)|buy(?:ing)? a (?:house|duplex|property|building)|multi-?family|duplex|fourplex|brrrr|landlord|commercial propert\w*|buy(?:ing)? (?:the )?building)\b/i, "real_estate"],
  [/\b(?:equipment|machinery|machine|excavator|truck|trailer|vehicle|van\b|oven|forklift|cnc|tractor|kitchen equipment|point of sale|pos system)\b/i, "equipment"],
  [/\binventory|stock up|merchandise|wholesale order|raw materials?\b/i, "inventory"],
  [/\b(?:expan\w+|second location|new location|open(?:ing)? (?:another|a second|a new)|scale|scaling|grow(?:th)?|hire more|renovat\w+|remodel\w*)\b/i, "expansion"],
  [/\b(?:working capital|payroll|cash ?flow|operating (?:expenses|costs)|day-to-day|bridge|marketing|seasonal)\b/i, "working_capital"],
];

function firstPurpose(text: string): Purpose | null {
  for (const [re, purpose] of PURPOSE_RULES) if (re.test(text)) return purpose;
  return null;
}

function extractPurposeAndType(t: string, patch: ProfilePatch) {
  // Industry names ("food truck", "trucking") must not read as an equipment purchase.
  const scrubbed = t.replace(/\bfood trucks?\b|\btrucking\b|\btruck drivers?\b|\bmoving company\b/gi, " ");
  // Prefer the clause that follows the amount ("$35,000 for working capital ...").
  const clause = /(?:\$\s?\d[\d,.]*\s?(?:k|m|mm|million|thousand)?|\d[\d,.]*\s?(?:k|thousand|million))\s+(?:loan\s+)?(?:for|to|of)\s+([^.;]{3,90})/i.exec(scrubbed);
  const purpose = (clause ? firstPurpose(clause[1]) : null) ?? firstPurpose(scrubbed);
  if (purpose) patch.purpose = purpose;
  if (/\breal estate invest\w*|\blandlord\b|\bfix(?: and |-and-)?flip\w*|\brental propert\w*|\binvestment propert\w*|\bbrrrr\b/i.test(t)) patch.borrowerType = "real_estate_investor";
  else if (/\bpersonal loan\b[^.]{0,60}\b(?:business|startup|side)|\b(?:business|startup)[^.]{0,60}\bpersonal loan\b/i.test(t)) patch.borrowerType = "personal_for_business";
}

const INDUSTRIES = [
  "restaurant", "cafe", "coffee shop", "bakery", "food truck", "bar", "contractor", "construction", "plumbing", "hvac", "landscaping",
  "trucking", "freight", "retail", "e-commerce", "ecommerce", "saas", "software", "salon", "barber", "medical", "dental", "clinic",
  "farm", "agriculture", "manufacturing", "gym", "fitness", "real estate", "consulting", "marketing agency", "auto repair", "cleaning",
  "daycare", "pharmacy", "photography", "logistics", "tech", "e-commerce store",
];

function extractIndustry(lower: string, patch: ProfilePatch) {
  for (const i of INDUSTRIES) {
    if (new RegExp(`\\b${i.replace(/[-]/g, "[- ]?")}\\b`, "i").test(lower)) {
      patch.industry = i === "ecommerce" ? "e-commerce" : i;
      return;
    }
  }
}

const NEG = String.raw`(?:no|never|zero|without|haven'?t had any|have not had any|don'?t have any|free of|not had any)`;

function extractCreditEvents(lower: string, patch: ProfilePatch) {
  if (new RegExp(`${NEG}\\s+(?:recent\\s+)?bankruptc`).test(lower)) patch.hasBankruptcy = false;
  else if (/\bbankrupt\w*|\bchapter (?:7|11|13)\b/.test(lower)) {
    patch.hasBankruptcy = true;
    const ago = /(\d+)\s*years?\s*ago/.exec(lower.slice(Math.max(0, lower.search(/bankrupt|chapter (?:7|11|13)/) - 40)));
    if (ago) patch.bankruptcyYearsAgo = Number(ago[1]);
  }
  if (new RegExp(`${NEG}\\s+(?:\\w+\\s+)?tax liens?`).test(lower)) patch.hasTaxLiens = false;
  else if (/\btax liens?\b/.test(lower)) patch.hasTaxLiens = true;
  if (new RegExp(`${NEG}\\s+(?:recent\\s+)?(?:defaults?|charge-?offs?|collections)`).test(lower)) patch.recentDefaults = false;
  else if (/\b(?:defaulted|default on|charge-?offs?|charged off|in collections|went to collections)\b/.test(lower)) patch.recentDefaults = true;
}

function extractPreferences(t: string, lower: string, patch: ProfilePatch) {
  // personal guarantee
  if (/(?:no|not|won'?t|refuse|unwilling|can'?t|cannot|don'?t want|do not want|never)[^.]{0,30}personal guarantee|personal guarantee[^.]{0,25}(?:not|no|never|unwilling|off the table|isn'?t)/.test(lower)) patch.willingPersonalGuarantee = false;
  else if (/(?:willing|ok|okay|fine|comfortable|can|happy|able|open)[^.]{0,30}(?:personal guarantee|guarantee)|personal guarantee[^.]{0,20}(?:is fine|is ok|is okay|works)/.test(lower)) patch.willingPersonalGuarantee = true;
  // UCC / blanket lien (not tax liens)
  if (/(?:no|not|won'?t|refuse|unwilling|can'?t|don'?t want|do not want|avoid|never)[^.]{0,30}(?:ucc|blanket lien|lien on (?:my|the) (?:assets|business))/.test(lower)) patch.willingUccLien = false;
  else if (/(?:willing|ok|okay|fine|comfortable|can|happy|open)[^.]{0,30}(?:ucc|blanket lien)/.test(lower)) patch.willingUccLien = true;
  // collateral
  if (/\bno collateral\b|\bnothing to (?:pledge|put up)\b|\bdon'?t have (?:any )?collateral\b|\bwithout collateral\b/.test(lower)) patch.collateralAvailable = false;
  else if (/\b(?:have|with|can offer|can pledge|can use|could use|offering|offer|pledge|put up|use)\b[^.]{0,45}\bcollateral\b|\bas collateral\b|\bcollateral\b[^.]{0,15}(?:available|:|is)\b/.test(lower)) {
    patch.collateralAvailable = true;
    const d = /collateral[^.]{0,10}(?:such as|like|:|is|including)\s+([^.;]{3,80})/i.exec(t);
    if (d) patch.collateralDescription = d[1].trim();
  }

  // speed
  const days = /(?:within|in|inside|under|by|funded in|funds? in|need(?:ed)? (?:it )?in)\s*(?:about |around |roughly )?(\d{1,3})\s*(business\s*)?(day|week)s?\b/i.exec(t);
  if (days) patch.speedNeededDays = Number(days[1]) * (/week/i.test(days[3]) ? 7 : 1);
  else if (/\b(?:asap|urgent(?:ly)?|immediately|right away|this week|as fast as possible|yesterday)\b/i.test(t)) patch.speedNeededDays = 7;
  else if (/\b(?:24|twenty-four)\s*hours?\b|\bsame[- ]day\b|\bovernight\b/i.test(t)) patch.speedNeededDays = 1;
  else if (/\b48\s*hours?\b/i.test(t)) patch.speedNeededDays = 2;

  // term
  const term = /(\d+(?:\.\d+)?)[- ]?(year|yr|month|mo)s?\s*(?:term|loan|repayment|payoff|amortization)|(?:repaid over|repay(?:ing|ment)? (?:in|over)|term of|pay(?:ing)? (?:it )?back (?:in|over)|paid (?:off )?(?:in|over)|amortiz\w+ over|over)\s*(?:about |around |roughly )?(\d+(?:\.\d+)?)\s*(year|yr|month|mo)s?\b(?!\s*(?:in business|old))/i.exec(t);
  if (term) {
    const n = Number(term[1] ?? term[3]);
    const unit = (term[2] ?? term[4]).toLowerCase();
    patch.preferredTermMonths = Math.round(/^(year|yr)/.test(unit) ? n * 12 : n);
  }
  // frequency
  const f: Frequency | null = /\bdaily (?:payments?|repayment|remittance)|pay(?:ing)? daily\b/.test(lower)
    ? "daily"
    : /\bweekly (?:payments?|repayment)|pay(?:ing)? weekly\b/.test(lower)
      ? "weekly"
      : /\bmonthly (?:payments?|repayment)|pay(?:ing)? monthly\b|\bmonthly installments?\b/.test(lower)
        ? "monthly"
        : null;
  if (f) patch.repaymentFrequency = f;
}

function extractExpectations(t: string, patch: ProfilePatch) {
  const lift = /(?:increase|grow|boost|lift|raise|expect)[^.]{0,40}?(?:revenue|sales)[^.]{0,25}?(\d{1,3})\s*%|(\d{1,3})\s*%\s*(?:revenue|sales)\s*(?:growth|increase|lift)/i.exec(t);
  if (lift) patch.expectedRevenueLiftPct = Number(lift[1] ?? lift[2]);
  const plan = /(?:plan(?:s)? to|plan is to|will use (?:it|the funds|this) to|intend to)\s+([^.]{10,160})/i.exec(t);
  if (plan) patch.growthPlan = plan[1].trim();
}

export function heuristicExtract(raw: string): ProfilePatch {
  const t = raw.replace(/\s+/g, " ").trim();
  const lower = t.toLowerCase();
  const patch: ProfilePatch = {};
  const assumptions: string[] = [];

  extractMoney(t, patch);
  extractCredit(t, lower, patch, assumptions);
  extractTimeInBusiness(t, lower, patch, assumptions);
  extractLocation(t, lower, patch);
  extractPurposeAndType(t, patch);
  extractIndustry(lower, patch);
  extractCreditEvents(lower, patch);
  extractPreferences(t, lower, patch);
  extractExpectations(t, patch);

  const biz = /paydex\D{0,12}(\d{2,3})/i.exec(t);
  if (biz) {
    patch.businessCreditScore = Number(biz[1]);
    patch.businessCreditScoreType = "Paydex";
  }
  if (assumptions.length) patch.assumptions = assumptions;
  for (const k of Object.keys(patch) as (keyof ProfilePatch)[]) if (patch[k] === undefined) delete patch[k];
  return patch;
}

export const heuristicExtractor: Extractor = async ({ userText }) => heuristicExtract(userText);
