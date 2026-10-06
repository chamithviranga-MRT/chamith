import { emptyProfile, type Profile, type ProfilePatch } from "./schema";
import { normalizeCountry, normalizeState } from "./geo";

export type MissingField = "amount" | "purpose" | "credit" | "timeInBusiness" | "location";

const NUMERIC_KEYS = [
  "timeInBusinessMonths", "monthlyRevenue", "annualRevenue", "ficoMin", "ficoMax", "businessCreditScore",
  "bankruptcyYearsAgo", "amountNeeded", "preferredTermMonths", "speedNeededDays", "expectedRevenueLiftPct",
] as const satisfies readonly (keyof Profile)[];

const STRING_KEYS = [
  "industry", "businessCreditScoreType", "collateralDescription", "growthPlan", "cashFlowForecast",
] as const satisfies readonly (keyof Profile)[];

function cleanString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, 400) : null;
}

function addAssumption(p: Profile, text: string) {
  if (!p.assumptions.includes(text)) p.assumptions.push(text);
}

/**
 * Merge a model/heuristic/card patch into an existing profile.
 * `null`/`undefined` in the patch never erases a stored value (null = "not stated").
 * Explicit `false` booleans and `0` numbers DO overwrite (they are real answers).
 */
export function mergeProfile(base: Profile, patch: ProfilePatch): Profile {
  const out: Profile = { ...base, assumptions: [...base.assumptions] };
  for (const [k, v] of Object.entries(patch) as [keyof Profile, unknown][]) {
    if (k === "assumptions") {
      for (const a of (v as string[] | undefined) ?? []) {
        const t = cleanString(a);
        if (t) addAssumption(out, t);
      }
      continue;
    }
    if (v === null || v === undefined) continue;
    if (typeof v === "string") {
      const s = cleanString(v);
      if (s !== null) (out as Record<string, unknown>)[k] = s;
    } else {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

/** Applies explicit edits from the card, where null CAN clear a field. */
export function applyCardEdits(base: Profile, edits: ProfilePatch): Profile {
  const out: Profile = { ...base, assumptions: [...base.assumptions] };
  for (const [k, v] of Object.entries(edits) as [keyof Profile, unknown][]) {
    if (k === "assumptions") continue;
    (out as Record<string, unknown>)[k] = v === undefined ? (out as Record<string, unknown>)[k] : v;
  }
  return out;
}

/** Canonicalises values, derives obvious fields and records every inference as an assumption. */
export function normalizeProfile(input: Profile): Profile {
  const p: Profile = { ...emptyProfile(), ...input, assumptions: [...(input.assumptions ?? [])] };

  for (const k of NUMERIC_KEYS) {
    const v = p[k];
    (p as Record<string, unknown>)[k] = typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  for (const k of STRING_KEYS) (p as Record<string, unknown>)[k] = cleanString(p[k]);

  p.ownerCountry = normalizeCountry(p.ownerCountry);
  p.businessCountry = normalizeCountry(p.businessCountry);
  p.ownerState = normalizeState(p.ownerState);
  p.businessState = normalizeState(p.businessState);

  // A US state implies a US location for that same entity.
  if (p.businessState && !p.businessCountry) p.businessCountry = "US";
  if (p.ownerState && !p.ownerCountry) p.ownerCountry = "US";
  if (p.ownerState && p.ownerCountry && p.ownerCountry !== "US") p.ownerState = null;
  if (p.businessState && p.businessCountry && p.businessCountry !== "US") p.businessState = null;

  // If only one side is described, assume the other matches and say so.
  const ownerKnown = Boolean(p.ownerCountry);
  const bizKnown = Boolean(p.businessCountry);
  if (ownerKnown && !bizKnown && p.ownerCountry === "US") {
    p.businessCountry = "US";
    if (p.ownerState && !p.businessState) p.businessState = p.ownerState;
    addAssumption(p, "Assumed the business is in the same place as the owner (US) — edit if different.");
  } else if (bizKnown && !ownerKnown) {
    p.ownerCountry = p.businessCountry;
    if (p.businessState && !p.ownerState) p.ownerState = p.businessState;
    addAssumption(p, "Assumed the owner lives in the same place as the business — edit if different.");
  }

  // Residency follows from country when it is obviously non-US.
  if (!p.ownerResidency && p.ownerCountry && p.ownerCountry !== "US") {
    p.ownerResidency = "non_resident";
    addAssumption(p, "Owner is outside the US, so treated as a non-resident for eligibility checks — edit if you hold US residency.");
  }

  // Revenue: derive the missing period.
  if (p.annualRevenue === null && p.monthlyRevenue !== null) {
    p.annualRevenue = p.monthlyRevenue * 12;
    addAssumption(p, "Annual revenue estimated as 12 × monthly revenue.");
  } else if (p.monthlyRevenue === null && p.annualRevenue !== null) {
    p.monthlyRevenue = Math.round(p.annualRevenue / 12);
    addAssumption(p, "Monthly revenue estimated as annual revenue ÷ 12.");
  }

  // FICO range: a single bound means a single score.
  if (p.ficoMin !== null && p.ficoMax === null) p.ficoMax = p.ficoMin;
  if (p.ficoMax !== null && p.ficoMin === null) p.ficoMin = p.ficoMax;
  if (p.ficoMin !== null && p.ficoMax !== null && p.ficoMin > p.ficoMax) [p.ficoMin, p.ficoMax] = [p.ficoMax, p.ficoMin];

  // Borrower type from operating history when the user did not say.
  if (!p.borrowerType && p.timeInBusinessMonths !== null) {
    p.borrowerType = p.timeInBusinessMonths === 0 ? "startup" : "existing_small_business";
    addAssumption(p, `Borrower type inferred as ${p.borrowerType === "startup" ? "startup" : "existing small business"} from time in business.`);
  }

  // Bankruptcy details only make sense when there is one.
  if (p.hasBankruptcy === false) p.bankruptcyYearsAgo = null;

  return p;
}

/** Range / sanity checks. Returns human-readable issues; invalid values are cleared by `dropInvalid`. */
export function validateProfile(p: Profile): string[] {
  const issues: string[] = [];
  const chk = (cond: boolean, msg: string) => {
    if (!cond) issues.push(msg);
  };
  for (const k of ["ficoMin", "ficoMax"] as const) {
    const v = p[k];
    chk(v === null || (v >= 300 && v <= 850), "Personal FICO must be between 300 and 850.");
  }
  chk(p.amountNeeded === null || p.amountNeeded > 0, "Amount needed must be greater than zero.");
  chk(p.amountNeeded === null || p.amountNeeded <= 50_000_000, "Amount needed looks too large for this tool (max $50M).");
  chk(p.timeInBusinessMonths === null || (p.timeInBusinessMonths >= 0 && p.timeInBusinessMonths <= 1200), "Time in business must be between 0 and 1,200 months.");
  chk(p.monthlyRevenue === null || p.monthlyRevenue >= 0, "Monthly revenue cannot be negative.");
  chk(p.annualRevenue === null || p.annualRevenue >= 0, "Annual revenue cannot be negative.");
  chk(p.preferredTermMonths === null || (p.preferredTermMonths > 0 && p.preferredTermMonths <= 480), "Preferred term must be between 1 and 480 months.");
  chk(p.speedNeededDays === null || (p.speedNeededDays >= 0 && p.speedNeededDays <= 365), "Funding speed must be between 0 and 365 days.");
  chk(p.bankruptcyYearsAgo === null || (p.bankruptcyYearsAgo >= 0 && p.bankruptcyYearsAgo <= 60), "Years since bankruptcy must be between 0 and 60.");
  chk(p.businessCreditScore === null || (p.businessCreditScore >= 0 && p.businessCreditScore <= 300), "Business credit score is out of range.");
  return [...new Set(issues)];
}

/** Clears out-of-range values so they are re-asked rather than silently used. */
export function dropInvalid(p: Profile): Profile {
  const out = { ...p, assumptions: [...p.assumptions] };
  if ((out.ficoMin !== null && (out.ficoMin < 300 || out.ficoMin > 850)) || (out.ficoMax !== null && (out.ficoMax < 300 || out.ficoMax > 850))) {
    out.ficoMin = null;
    out.ficoMax = null;
  }
  if (out.amountNeeded !== null && (out.amountNeeded <= 0 || out.amountNeeded > 50_000_000)) out.amountNeeded = null;
  if (out.timeInBusinessMonths !== null && (out.timeInBusinessMonths < 0 || out.timeInBusinessMonths > 1200)) out.timeInBusinessMonths = null;
  if (out.monthlyRevenue !== null && out.monthlyRevenue < 0) out.monthlyRevenue = null;
  if (out.annualRevenue !== null && out.annualRevenue < 0) out.annualRevenue = null;
  if (out.preferredTermMonths !== null && (out.preferredTermMonths <= 0 || out.preferredTermMonths > 480)) out.preferredTermMonths = null;
  if (out.speedNeededDays !== null && (out.speedNeededDays < 0 || out.speedNeededDays > 365)) out.speedNeededDays = null;
  if (out.bankruptcyYearsAgo !== null && (out.bankruptcyYearsAgo < 0 || out.bankruptcyYearsAgo > 60)) out.bankruptcyYearsAgo = null;
  if (out.businessCreditScore !== null && (out.businessCreditScore < 0 || out.businessCreditScore > 300)) out.businessCreditScore = null;
  return out;
}

/** Full pipeline for any incoming change: merge → drop invalid → normalise → report issues. */
export function applyPatch(base: Profile, patch: ProfilePatch): { profile: Profile; issues: string[] } {
  const merged = mergeProfile(base, patch);
  const issues = validateProfile(merged);
  return { profile: normalizeProfile(dropInvalid(merged)), issues };
}

export function missingRequired(p: Profile): MissingField[] {
  const missing: MissingField[] = [];
  if (p.amountNeeded === null) missing.push("amount");
  if (p.purpose === null) missing.push("purpose");
  if (p.ficoMin === null && p.ficoMax === null) missing.push("credit");
  if (p.timeInBusinessMonths === null) missing.push("timeInBusiness");

  const ownerKnown = Boolean(p.ownerCountry);
  const bizKnown = Boolean(p.businessCountry);
  const bizUsNeedsState = p.businessCountry === "US" && !p.businessState;
  const unspecifiedForeign = p.ownerCountry === "ZZ" || p.businessCountry === "ZZ";
  if (!ownerKnown || !bizKnown || bizUsNeedsState || unspecifiedForeign) missing.push("location");
  return missing;
}
