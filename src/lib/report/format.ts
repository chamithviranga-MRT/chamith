import type { ProductRecord } from "@/lib/firecrawl/productSchema";
import { US_STATES, countryLabel } from "@/lib/profile/geo";

export const NP = "Not published";
export const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number) => `${Number.isInteger(n) ? n : n.toString()}%`;

function months(m: number): string {
  if (m % 12 === 0 && m >= 12) return `${m / 12} year${m === 12 ? "" : "s"}`;
  return `${m} month${m === 1 ? "" : "s"}`;
}

function range(lo: number | null, hi: number | null, f: (n: number) => string): string {
  if (lo !== null && hi !== null) return lo === hi ? f(lo) : `${f(lo)} – ${f(hi)}`;
  if (lo !== null) return `from ${f(lo)}`;
  if (hi !== null) return `up to ${f(hi)}`;
  return NP;
}

export const fmtAmountRange = (r: ProductRecord) => range(r.minAmount, r.maxAmount, usd);
export const fmtTermRange = (r: ProductRecord) => range(r.termMinMonths, r.termMaxMonths, months);
export function fmtRateRange(r: ProductRecord): string {
  if (r.aprMin !== null || r.aprMax !== null) return `${range(r.aprMin, r.aprMax, pct)} APR`;
  if (r.factorMin !== null || r.factorMax !== null) return `${range(r.factorMin, r.factorMax, (n) => `${n}`)} factor rate`;
  return NP;
}
export function fmtSpeed(r: ProductRecord): string {
  const f = (n: number) => (n === 0 ? "same day" : n === 1 ? "1 day" : `${n} days`);
  return range(r.fundingDaysMin, r.fundingDaysMax, f);
}

export function describeRequirements(r: ProductRecord): string[] {
  const out: string[] = [];
  if (r.minFico !== null) out.push(`Minimum personal FICO ${r.minFico}`);
  if (r.minTimeInBusinessMonths !== null) out.push(r.minTimeInBusinessMonths === 0 ? "No minimum time in business" : `At least ${months(r.minTimeInBusinessMonths)} in business`);
  if (r.minAnnualRevenue !== null) out.push(`Minimum annual revenue ${usd(r.minAnnualRevenue)}`);
  if (r.minMonthlyRevenue !== null) out.push(`Minimum monthly revenue ${usd(r.minMonthlyRevenue)}`);
  if (r.collateralRequired === "always") out.push("Collateral required");
  if (r.collateralRequired === "sometimes") out.push("Collateral sometimes required");
  if (r.collateralRequired === "none") out.push("No collateral required");
  if (r.personalGuarantee === "required") out.push("Personal guarantee required");
  if (r.personalGuarantee === "sometimes") out.push("Personal guarantee sometimes required");
  if (r.personalGuarantee === "not_required") out.push("No personal guarantee");
  if (r.uccLien === true) out.push("UCC lien filed on business assets");
  if (r.uccLien === false) out.push("No UCC lien");
  if (r.creditPull === "soft") out.push("Soft credit pull");
  if (r.creditPull === "hard") out.push("Hard credit pull");
  if (r.residencyRule === "us_citizen") out.push("Requires US citizenship");
  if (r.residencyRule === "citizen_or_permanent_resident") out.push("Requires US citizenship or permanent residency");
  if (r.residencyRule === "us_resident") out.push("Requires US residency");
  if (r.residencyRule === "us_business_address") out.push("Requires a US address");
  if (r.excludedStates.length) out.push(`Not available in: ${r.excludedStates.map((s) => US_STATES[s] ?? s).join(", ")}`);
  if (r.excludedCountries.length) out.push(`Not available in: ${r.excludedCountries.map(countryLabel).join(", ")}`);
  if (r.bankruptcyLookbackYears !== null) out.push(r.bankruptcyLookbackYears === 99 ? "No bankruptcy history allowed" : `No bankruptcy in the last ${r.bankruptcyLookbackYears} years`);
  if (r.taxLiensDisqualify) out.push("Tax liens disqualify");
  if (r.recentDefaultsDisqualify) out.push("Recent defaults/collections disqualify");
  if (r.businessUseAllowed === false) out.push("Business use not allowed");
  return out;
}

export function describeFees(r: ProductRecord): string[] {
  const out: string[] = [];
  if (r.originationFeePctMin !== null || r.originationFeePctMax !== null) out.push(`Origination fee ${range(r.originationFeePctMin, r.originationFeePctMax, pct)}`);
  if (r.monthlyFeeUsd !== null) out.push(`Monthly fee ${usd(r.monthlyFeeUsd)}`);
  if (r.prepaymentPenalty === "none") out.push("No prepayment penalty");
  if (r.prepaymentPenalty === "exists") out.push("Prepayment penalty applies");
  if (r.aprIncludesFees === true) out.push("APR stated to include fees");
  return out;
}

export function fmtDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export const ageLabel = (days: number) => (days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`);
