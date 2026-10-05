import type { ProductRecord } from "@/lib/firecrawl/productSchema";
import { PRODUCT_TYPE_LABEL } from "@/lib/firecrawl/productSchema";
import type { Profile } from "@/lib/profile/schema";
import { US_STATES, countryLabel } from "@/lib/profile/geo";
import type { Category, LenderRow } from "@/lib/types";
import { scoringConfig, type ScoringConfig } from "./config";
import { chooseTerm, estimateCost } from "./cost";
import { clamp } from "./math";
import type { ExtraConstraints, Gate } from "./types";

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const stateName = (c: string) => US_STATES[c] ?? c;

interface Ctx {
  profile: Profile;
  p: ProductRecord;
  lender: Pick<LenderRow, "slug" | "name" | "category">;
  cfg: ScoringConfig;
}

const g = (id: Gate["id"], label: string, status: Gate["status"], detail: string, extra: Partial<Gate> = {}): Gate => ({ id, label, status, detail, ...extra });

// ---------------------------------------------------------------- eligibility gates

function amountGate({ profile, p }: Ctx): Gate {
  const a = profile.amountNeeded;
  if (a === null) return g("amount", "Amount", "unknown", "Amount needed not provided.");
  if (p.minAmount === null && p.maxAmount === null) return g("amount", "Amount", "unknown", "Lender does not publish an amount range.");
  if (p.minAmount !== null && a < p.minAmount) return g("amount", "Amount", "fail", `Minimum is ${usd(p.minAmount)}; you need ${usd(a)}.`, { fix: `Request at least ${usd(p.minAmount)} (you asked for ${usd(a)}).` });
  if (p.maxAmount !== null && a > p.maxAmount) return g("amount", "Amount", "fail", `Maximum is ${usd(p.maxAmount)}; you need ${usd(a)}.`, { fix: `Reduce the request to ${usd(p.maxAmount)} or less, or combine with a second source (you asked for ${usd(a)}).` });
  const range = [p.minAmount !== null ? usd(p.minAmount) : null, p.maxAmount !== null ? usd(p.maxAmount) : null].filter(Boolean).join(" – ");
  return g("amount", "Amount", "pass", `${usd(a)} is within the published range (${range}).`);
}

function ficoGate({ profile, p }: Ctx, cfg: ScoringConfig): Gate {
  const lo = profile.ficoMin;
  const hi = profile.ficoMax;
  if (p.minFico === null) return g("fico", "Personal FICO", "unknown", "Lender does not publish a minimum FICO score.");
  if (lo === null || hi === null) return g("fico", "Personal FICO", "unknown", `Minimum FICO is ${p.minFico}; your score was not provided.`);
  const yours = lo === hi ? `${lo}` : `${lo}–${hi}`;
  if (hi < p.minFico) return g("fico", "Personal FICO", "fail", `Minimum FICO is ${p.minFico}; yours is ${yours}.`, { fix: `Raise your personal FICO to at least ${p.minFico} (currently ${yours}).` });
  if (lo < p.minFico) return g("fico", "Personal FICO", "borderline", `Minimum FICO is ${p.minFico}; your range ${yours} straddles it.`, { fix: `Confirm your exact score — approval depends on being at or above ${p.minFico}.` });
  return g("fico", "Personal FICO", "pass", `Minimum FICO ${p.minFico}; yours is ${yours}.`, { margin: clamp((lo - p.minFico) / cfg.eligibility.ficoMarginFullAt, 0, 1) });
}

function tibGate({ profile, p }: Ctx, cfg: ScoringConfig): Gate {
  const t = profile.timeInBusinessMonths;
  const m = p.minTimeInBusinessMonths;
  if (m === null) return g("timeInBusiness", "Time in business", "unknown", "Lender does not publish a minimum time in business.");
  if (t === null) return g("timeInBusiness", "Time in business", "unknown", `Requires ${m} months in business; yours was not provided.`);
  if (t < m) return g("timeInBusiness", "Time in business", "fail", `Requires ${m} months in business; you have ${t}.`, { fix: `Wait until the business has operated ${m} months (currently ${t}), or choose a product for newer businesses.` });
  if (m === 0) return g("timeInBusiness", "Time in business", "pass", "No minimum time in business.", { margin: 1 });
  return g("timeInBusiness", "Time in business", "pass", `Requires ${m} months; you have ${t}.`, { margin: clamp((t / m - 1) / (cfg.eligibility.tibMarginMultiple - 1), 0, 1) });
}

function revenueGate({ profile, p }: Ctx, cfg: ScoringConfig): Gate {
  const annual = profile.annualRevenue ?? (profile.monthlyRevenue !== null ? profile.monthlyRevenue * 12 : null);
  const monthly = profile.monthlyRevenue ?? (profile.annualRevenue !== null ? profile.annualRevenue / 12 : null);
  if (p.minAnnualRevenue === null && p.minMonthlyRevenue === null) return g("revenue", "Revenue", "unknown", "Lender does not publish a minimum revenue.");
  if (annual === null || monthly === null) return g("revenue", "Revenue", "unknown", "Lender requires minimum revenue; yours was not provided.");
  if (p.minAnnualRevenue !== null && annual < p.minAnnualRevenue) return g("revenue", "Revenue", "fail", `Requires ${usd(p.minAnnualRevenue)} annual revenue; you report ${usd(annual)}.`, { fix: `Annual revenue of at least ${usd(p.minAnnualRevenue)} is needed (currently ${usd(annual)}).` });
  if (p.minMonthlyRevenue !== null && monthly < p.minMonthlyRevenue) return g("revenue", "Revenue", "fail", `Requires ${usd(p.minMonthlyRevenue)} monthly revenue; you report ${usd(monthly)}.`, { fix: `Monthly revenue of at least ${usd(p.minMonthlyRevenue)} is needed (currently ${usd(monthly)}).` });
  const ratios = [p.minAnnualRevenue ? annual / p.minAnnualRevenue : null, p.minMonthlyRevenue ? monthly / p.minMonthlyRevenue : null].filter((x): x is number => x !== null);
  const ratio = Math.min(...ratios, Infinity);
  return g("revenue", "Revenue", "pass", "Meets the published minimum revenue.", { margin: ratio === Infinity ? 1 : clamp((ratio - 1) / (cfg.eligibility.revenueMarginMultiple - 1), 0, 1) });
}

function stateGate({ profile, p }: Ctx): Gate {
  const states = [profile.businessState, profile.ownerState].filter((s): s is string => Boolean(s));
  const hit = states.find((s) => p.excludedStates.includes(s));
  if (hit) return g("state", "State", "fail", `Not available in ${stateName(hit)}.`, { fix: `Not offered in ${stateName(hit)}; only a different business location would qualify.` });
  if (p.excludedStates.length) return g("state", "State", "pass", `Available in your state (excluded: ${p.excludedStates.map(stateName).join(", ")}).`);
  return g("state", "State", "unknown", "Lender does not list excluded states.");
}

function countryGate({ profile, p }: Ctx): Gate {
  const countries = [profile.ownerCountry, profile.businessCountry].filter((c): c is string => Boolean(c));
  const hit = countries.find((c) => p.excludedCountries.includes(c));
  if (hit) return g("country", "Country", "fail", `Not available to applicants in ${countryLabel(hit)}.`, { fix: `Not offered in ${countryLabel(hit)}.` });
  return g("country", "Country", p.excludedCountries.length ? "pass" : "unknown", p.excludedCountries.length ? "Your countries are not excluded." : "Lender does not list excluded countries.");
}

function residencyGate({ profile, p }: Ctx): Gate {
  const rule = p.residencyRule;
  const res = profile.ownerResidency;
  const nonUsOwner = Boolean(profile.ownerCountry && profile.ownerCountry !== "US");
  if (!rule) {
    return nonUsOwner
      ? g("residency", "Citizenship / residency", "borderline", "Lender does not publish citizenship or residency rules, and the owner lives outside the US — confirm eligibility before applying.", { fix: "Ask the lender whether non-US residents may apply." })
      : g("residency", "Citizenship / residency", "unknown", "Lender does not publish citizenship or residency rules.");
  }
  if (rule === "us_business_address") {
    if (profile.businessCountry && profile.businessCountry !== "US") return g("residency", "US address", "fail", "Requires a US business address; your business is outside the US.", { fix: "Establish a US business presence/address (e.g. a US-registered entity with a physical US address)." });
    return g("residency", "US address", nonUsOwner ? "borderline" : "pass", nonUsOwner ? "Requires a US address. Your US business address should satisfy this, but the owner lives outside the US — confirm before applying." : "Requires a US address; your business is in the US.", nonUsOwner ? { fix: "Confirm with the lender that a US business address is enough when the owner lives abroad." } : {});
  }
  if (res === null && rule === "us_resident" && profile.ownerCountry === "US") return g("residency", "Residency", "pass", "Requires US residency; you live in the US.");
  if (res === null) return g("residency", "Citizenship / residency", nonUsOwner ? "fail" : "borderline", `Requires ${ruleLabel(rule)}; your status was not provided.`, { fix: `Confirm you meet: ${ruleLabel(rule)}.` });
  const ok =
    rule === "us_citizen" ? res === "us_citizen"
    : rule === "citizen_or_permanent_resident" ? res === "us_citizen" || res === "permanent_resident"
    : res === "us_citizen" || res === "permanent_resident" || (res === "visa_holder" && !nonUsOwner);
  return ok
    ? g("residency", "Citizenship / residency", "pass", `Requires ${ruleLabel(rule)}; you qualify (${res.replace(/_/g, " ")}).`)
    : g("residency", "Citizenship / residency", "fail", `Requires ${ruleLabel(rule)}; your status is ${res.replace(/_/g, " ")}.`, { fix: `Only ${ruleLabel(rule)} qualify for this product.` });
}
const ruleLabel = (r: NonNullable<ProductRecord["residencyRule"]>) =>
  ({ us_citizen: "a US citizen", citizen_or_permanent_resident: "a US citizen or permanent resident", us_resident: "a US resident", us_business_address: "a US business address" })[r];

function purposeGate({ profile, p }: Ctx): Gate {
  if (!profile.purpose) return g("purpose", "Use of funds", "unknown", "Purpose not provided.");
  if (!p.eligiblePurposes.length) return g("purpose", "Use of funds", "unknown", "Lender does not list permitted uses of funds.");
  const label = profile.purpose.replace(/_/g, " ");
  return p.eligiblePurposes.includes(profile.purpose)
    ? g("purpose", "Use of funds", "pass", `Permitted use: ${label}.`)
    : g("purpose", "Use of funds", "fail", `Listed uses (${p.eligiblePurposes.map((x) => x.replace(/_/g, " ")).join(", ")}) do not include ${label}.`, { fix: `This product is not offered for ${label}.` });
}

function businessUseGate({ p }: Ctx): Gate {
  if (p.businessUseAllowed === false) return g("businessUse", "Business use", "fail", "Lender states the loan cannot be used for business purposes.", { fix: "Choose a business loan product instead." });
  if (p.businessUseAllowed === true) return g("businessUse", "Business use", "pass", "Lender allows business use.");
  if (p.productType === "personal_loan") return g("businessUse", "Business use", "borderline", "Personal loans often restrict business use and the page does not say — confirm before applying.", { fix: "Ask the lender whether proceeds may be used for business expenses." });
  return g("businessUse", "Business use", "unknown", "Not stated.");
}

// ---------------------------------------------------------------- burden gates (guarantee/collateral/lien)

function collateralGate({ profile, p }: Ctx): Gate {
  if (p.collateralRequired === null) return g("collateral", "Collateral", "unknown", "Lender does not state whether collateral is required.");
  if (p.collateralRequired === "none") return g("collateral", "Collateral", "pass", "No collateral required.");
  if (p.collateralRequired === "always") {
    if (profile.collateralAvailable === false) return g("collateral", "Collateral", "fail", "Collateral is required; you have none available.", { fix: "Pledge collateral (equipment, real estate, inventory or receivables)." });
    if (profile.collateralAvailable === null) return g("collateral", "Collateral", "borderline", "Collateral is required; you did not say whether you have any.", { fix: "Confirm you can pledge collateral." });
    return g("collateral", "Collateral", "pass", "Collateral is required; you have some available.");
  }
  return profile.collateralAvailable === false
    ? g("collateral", "Collateral", "borderline", "Collateral may be required depending on the amount or credit; you have none available.", { fix: "Be prepared to offer collateral if requested." })
    : g("collateral", "Collateral", "pass", "Collateral is only sometimes required.");
}

function guaranteeGate({ profile, p }: Ctx): Gate {
  if (p.personalGuarantee === null) return g("personalGuarantee", "Personal guarantee", "unknown", "Lender does not state whether a personal guarantee is required.");
  if (p.personalGuarantee === "not_required") return g("personalGuarantee", "Personal guarantee", "pass", "No personal guarantee required.");
  if (p.personalGuarantee === "required") {
    if (profile.willingPersonalGuarantee === false) return g("personalGuarantee", "Personal guarantee", "fail", "A personal guarantee is required; you are not willing to give one.", { fix: "Be willing to personally guarantee the loan." });
    if (profile.willingPersonalGuarantee === null) return g("personalGuarantee", "Personal guarantee", "borderline", "A personal guarantee is required — confirm you are willing to give one.", { fix: "Confirm you will sign a personal guarantee." });
    return g("personalGuarantee", "Personal guarantee", "pass", "A personal guarantee is required; you are willing.");
  }
  return profile.willingPersonalGuarantee === false
    ? g("personalGuarantee", "Personal guarantee", "borderline", "A personal guarantee may be required; you are not willing to give one.", { fix: "Be prepared to sign a personal guarantee if requested." })
    : g("personalGuarantee", "Personal guarantee", "pass", "A personal guarantee is only sometimes required.");
}

function uccGate({ profile, p }: Ctx): Gate {
  if (p.uccLien === null) return g("uccLien", "UCC lien", "unknown", "Lender does not state whether a UCC lien is filed.");
  if (!p.uccLien) return g("uccLien", "UCC lien", "pass", "No UCC lien.");
  if (profile.willingUccLien === false) return g("uccLien", "UCC lien", "fail", "A UCC lien on business assets is filed; you are not willing to accept one.", { fix: "Be willing to accept a UCC lien on business assets." });
  if (profile.willingUccLien === null) return g("uccLien", "UCC lien", "borderline", "A UCC lien on business assets is filed — confirm you accept this.", { fix: "Confirm you accept a UCC lien." });
  return g("uccLien", "UCC lien", "pass", "A UCC lien is filed; you accept it.");
}

// ---------------------------------------------------------------- credit-history gates

function bankruptcyGate({ profile, p }: Ctx): Gate {
  if (profile.hasBankruptcy !== true) return g("bankruptcy", "Bankruptcy", "pass", "No bankruptcy reported.");
  const look = p.bankruptcyLookbackYears;
  if (look === null) return g("bankruptcy", "Bankruptcy", "borderline", "You reported a bankruptcy; the lender does not publish its policy — expect it to be reviewed.", { fix: "Ask the lender how it treats a prior bankruptcy." });
  const ago = profile.bankruptcyYearsAgo;
  if (look === 99) return g("bankruptcy", "Bankruptcy", "fail", "Lender excludes applicants with any bankruptcy.", { fix: "Not available to applicants with a bankruptcy history." });
  if (ago === null) return g("bankruptcy", "Bankruptcy", "borderline", `Lender requires no bankruptcy in the last ${look} years; you did not say when yours was.`, { fix: `Confirm your bankruptcy was more than ${look} years ago.` });
  return ago < look
    ? g("bankruptcy", "Bankruptcy", "fail", `Lender requires no bankruptcy in the last ${look} years; yours was ${ago} years ago.`, { fix: `Wait until the bankruptcy is more than ${look} years old (${look - ago} more year${look - ago === 1 ? "" : "s"}).` })
    : g("bankruptcy", "Bankruptcy", "pass", `Lender requires no bankruptcy in the last ${look} years; yours was ${ago} years ago.`);
}

function taxLienGate({ profile, p }: Ctx): Gate {
  if (profile.hasTaxLiens !== true) return g("taxLiens", "Tax liens", "pass", "No tax liens reported.");
  if (p.taxLiensDisqualify === true) return g("taxLiens", "Tax liens", "fail", "Lender disqualifies applicants with tax liens.", { fix: "Resolve or release the tax lien." });
  return g("taxLiens", "Tax liens", "borderline", "You reported a tax lien; the lender does not say whether it disqualifies — confirm before applying.", { fix: "Ask the lender how it treats tax liens." });
}

function defaultsGate({ profile, p }: Ctx): Gate {
  if (profile.recentDefaults !== true) return g("defaults", "Recent defaults", "pass", "No recent defaults reported.");
  if (p.recentDefaultsDisqualify === true) return g("defaults", "Recent defaults", "fail", "Lender disqualifies applicants with recent defaults, charge-offs or collections.", { fix: "Resolve or age out recent defaults/collections." });
  return g("defaults", "Recent defaults", "borderline", "You reported recent defaults; the lender does not say whether they disqualify — confirm before applying.", { fix: "Ask the lender how it treats recent defaults." });
}

// ---------------------------------------------------------------- user (follow-up) constraints

function userGates(ctx: Ctx, extra: ExtraConstraints): Gate[] {
  const { p, profile, lender, cfg } = ctx;
  const out: Gate[] = [];
  const typeName = PRODUCT_TYPE_LABEL[p.productType];

  if (extra.noUccLien) out.push(p.uccLien === true ? g("userLien", "Your filter: no lien", "fail", "This product files a UCC lien.", { fix: "Remove the 'no lien' filter." }) : p.uccLien === null ? g("userLien", "Your filter: no lien", "borderline", "The lender does not say whether it files a lien — confirm.") : g("userLien", "Your filter: no lien", "pass", "No lien."));
  if (extra.noPersonalGuarantee) out.push(p.personalGuarantee === "required" ? g("userGuarantee", "Your filter: no personal guarantee", "fail", "A personal guarantee is required.", { fix: "Remove the 'no personal guarantee' filter." }) : p.personalGuarantee === null || p.personalGuarantee === "sometimes" ? g("userGuarantee", "Your filter: no personal guarantee", "borderline", "A personal guarantee may be required — confirm.") : g("userGuarantee", "Your filter: no personal guarantee", "pass", "No personal guarantee."));
  if (extra.noCollateral) out.push(p.collateralRequired === "always" ? g("userCollateral", "Your filter: no collateral", "fail", "Collateral is required.", { fix: "Remove the 'no collateral' filter." }) : p.collateralRequired === null || p.collateralRequired === "sometimes" ? g("userCollateral", "Your filter: no collateral", "borderline", "Collateral may be required — confirm.") : g("userCollateral", "Your filter: no collateral", "pass", "No collateral."));

  const bounds = { min: extra.minTermMonths, max: extra.maxTermMonths };
  if (extra.maxTermMonths !== undefined) {
    const lo = p.termMinMonths;
    out.push(lo !== null && lo > extra.maxTermMonths ? g("userTerm", "Your filter: term", "fail", `Shortest term is ${lo} months; you asked for ${extra.maxTermMonths} or less.`, { fix: `Allow terms of ${lo} months or longer.` }) : lo === null && p.termMaxMonths === null ? g("userTerm", "Your filter: term", "borderline", "The lender does not publish its terms — confirm a term this short is offered.") : g("userTerm", "Your filter: term", "pass", `A term of ${extra.maxTermMonths} months or less is available.`));
  }
  if (extra.minTermMonths !== undefined) {
    const hi = p.termMaxMonths;
    out.push(hi !== null && hi < extra.minTermMonths ? g("userTerm", "Your filter: term", "fail", `Longest term is ${hi} months; you asked for ${extra.minTermMonths} or more.`, { fix: `Allow terms shorter than ${extra.minTermMonths} months.` }) : g("userTerm", "Your filter: term", "pass", `A term of ${extra.minTermMonths} months or more is available.`));
  }
  const est = (extra.maxAprPct !== undefined || extra.maxMonthlyPayment !== undefined)
    ? estimateCost(p, { amount: profile.amountNeeded ?? p.minAmount ?? 0, preferredTermMonths: profile.preferredTermMonths, termBounds: bounds }, cfg)
    : null;
  if (extra.maxAprPct !== undefined) {
    const low = est?.rateLowPct ?? est?.effectiveAprPct ?? null;
    out.push(low === null ? g("userApr", "Your filter: APR", "borderline", "No APR is published — cannot confirm it is under your limit.") : low > extra.maxAprPct ? g("userApr", "Your filter: APR", "fail", `Lowest published APR is ${low}%; your limit is ${extra.maxAprPct}%.`, { fix: `Raise your APR limit above ${low}%.` }) : g("userApr", "Your filter: APR", "pass", `Lowest published APR ${low}% is within your ${extra.maxAprPct}% limit.`));
  }
  if (extra.maxMonthlyPayment !== undefined) {
    const lowPay = est?.monthlyPaymentLow ?? est?.monthlyPayment ?? null;
    out.push(lowPay === null ? g("userPayment", "Your filter: monthly payment", "borderline", "Payment cannot be estimated without a published rate.") : lowPay > extra.maxMonthlyPayment ? g("userPayment", "Your filter: monthly payment", "fail", `Estimated payment ≥ ${usd(lowPay)}/month exceeds your ${usd(extra.maxMonthlyPayment)} limit.`, { fix: `Allow payments up to about ${usd(lowPay)}/month, or request a smaller amount.` }) : g("userPayment", "Your filter: monthly payment", "pass", `Estimated payment ${usd(lowPay)}/month is within your limit.`));
  }
  if (extra.maxDaysToFund !== undefined) {
    const d = p.fundingDaysMin ?? p.fundingDaysMax;
    out.push(d === null ? g("userSpeed", "Your filter: speed", "borderline", "Funding speed is not published — confirm.") : d > extra.maxDaysToFund ? g("userSpeed", "Your filter: speed", "fail", `Fastest funding is about ${d} days; you need ${extra.maxDaysToFund} or fewer.`, { fix: `Allow ${d} days or longer.` }) : g("userSpeed", "Your filter: speed", "pass", `Funding in about ${d} days or less.`));
  }
  if (extra.minAmount !== undefined || extra.maxAmount !== undefined) {
    const need = profile.amountNeeded;
    out.push(g("userAmount", "Your filter: amount", "pass", need === null ? "No amount to compare." : `Amount ${usd(need)} used.`));
  }
  if (extra.includeTypes?.length) out.push(extra.includeTypes.includes(p.productType) ? g("userType", "Your filter: product type", "pass", `${typeName} is one of the types you asked for.`) : g("userType", "Your filter: product type", "fail", `${typeName} is not one of the types you asked for.`, { fix: "Remove the product-type filter." }));
  if (extra.excludeTypes?.includes(p.productType)) out.push(g("userType", "Your filter: product type", "fail", `You asked to exclude ${typeName}.`, { fix: `Allow ${typeName} products again.` }));
  const cat: Category = lender.category;
  if (extra.includeCategories?.length && !extra.includeCategories.includes(cat)) out.push(g("userCategory", "Your filter: lender category", "fail", `${cat} lenders are not in your selection.`, { fix: `Include ${cat} lenders.` }));
  if (extra.excludeCategories?.includes(cat)) out.push(g("userCategory", "Your filter: lender category", "fail", `You asked to exclude ${cat} lenders.`, { fix: `Include ${cat} lenders again.` }));
  if (extra.excludeLenders?.some((x) => x.toLowerCase() === lender.slug.toLowerCase() || lender.name.toLowerCase().includes(x.toLowerCase()))) out.push(g("userLender", "Your filter: lender", "fail", `You asked to exclude ${lender.name}.`, { fix: `Include ${lender.name} again.` }));
  if (extra.softPullOnly) out.push(p.creditPull === "hard" ? g("userPull", "Your filter: soft pull only", "fail", "Lender uses a hard credit pull.", { fix: "Allow hard credit pulls." }) : p.creditPull === null ? g("userPull", "Your filter: soft pull only", "borderline", "The lender does not say what kind of credit check it uses — confirm.") : g("userPull", "Your filter: soft pull only", "pass", "Soft credit pull."));
  if (extra.noPrepaymentPenalty) out.push(p.prepaymentPenalty === "exists" ? g("userPrepay", "Your filter: no prepayment penalty", "fail", "Lender charges a prepayment penalty.", { fix: "Allow prepayment penalties." }) : p.prepaymentPenalty === null ? g("userPrepay", "Your filter: no prepayment penalty", "borderline", "Prepayment terms are not published — confirm.") : g("userPrepay", "Your filter: no prepayment penalty", "pass", "No prepayment penalty."));
  return out;
}

/** Evaluates every hard gate (eligibility + burdens + credit history) plus any follow-up constraints. */
export function evaluateGates(profile: Profile, p: ProductRecord, lender: Pick<LenderRow, "slug" | "name" | "category">, extra: ExtraConstraints = {}, cfg: ScoringConfig = scoringConfig): Gate[] {
  const ctx: Ctx = { profile, p, lender, cfg };
  return [
    amountGate(ctx), ficoGate(ctx, cfg), tibGate(ctx, cfg), revenueGate(ctx, cfg), stateGate(ctx), countryGate(ctx), residencyGate(ctx),
    purposeGate(ctx), businessUseGate(ctx), collateralGate(ctx), guaranteeGate(ctx), uccGate(ctx), bankruptcyGate(ctx), taxLienGate(ctx), defaultsGate(ctx),
    ...userGates(ctx, extra),
  ];
}

export { chooseTerm };
