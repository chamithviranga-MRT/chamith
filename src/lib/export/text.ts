import type { Profile } from "@/lib/profile/schema";
import { BORROWER_TYPE_LABEL, PURPOSE_LABEL } from "@/lib/profile/schema";
import { countryLabel } from "@/lib/profile/geo";
import { usd } from "@/lib/report/format";
import type { GateId } from "@/lib/matching/types";
import type { Report, ReportItem } from "@/lib/report/types";

/** Helvetica (the PDF base font) has no glyphs for these. */
export function pdfSafe(s: string): string {
  return s
    .replace(/≈/g, "~").replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/→/g, "->").replace(/[−–]/g, "-").replace(/\s*—\s*/g, " - ")
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/·/g, "|").replace(/…/g, "...").replace(/×/g, "x").replace(/ /g, " ")
    .replace(/[^ -~¡-ÿ]/g, "");
}

export function profileLines(p: Profile): Array<[string, string]> {
  const rows: Array<[string, string | null]> = [
    ["Borrower type", p.borrowerType ? BORROWER_TYPE_LABEL[p.borrowerType] : null],
    ["Industry", p.industry],
    ["Amount needed", p.amountNeeded !== null ? usd(p.amountNeeded) : null],
    ["Purpose", p.purpose ? PURPOSE_LABEL[p.purpose] : null],
    ["Personal FICO", p.ficoMin !== null ? (p.ficoMin === p.ficoMax ? `${p.ficoMin}` : `${p.ficoMin}-${p.ficoMax}`) : null],
    ["Time in business", p.timeInBusinessMonths !== null ? (p.timeInBusinessMonths === 0 ? "Not launched yet" : `${p.timeInBusinessMonths} months`) : null],
    ["Monthly revenue", p.monthlyRevenue !== null ? usd(p.monthlyRevenue) : null],
    ["Owner location", p.ownerCountry ? [p.ownerState, countryLabel(p.ownerCountry)].filter(Boolean).join(", ") : null],
    ["Business location", p.businessCountry ? [p.businessState, countryLabel(p.businessCountry)].filter(Boolean).join(", ") : null],
    ["Citizenship / residency", p.ownerResidency ? p.ownerResidency.replace(/_/g, " ") : null],
    ["Preferred term", p.preferredTermMonths !== null ? `${p.preferredTermMonths} months` : null],
    ["Funds needed within", p.speedNeededDays !== null ? `${p.speedNeededDays} days` : null],
    ["Collateral available", p.collateralAvailable === null ? null : p.collateralAvailable ? "Yes" : "No"],
    ["Willing to give personal guarantee", p.willingPersonalGuarantee === null ? null : p.willingPersonalGuarantee ? "Yes" : "No"],
    ["Willing to accept UCC lien", p.willingUccLien === null ? null : p.willingUccLien ? "Yes" : "No"],
  ];
  return rows.filter((r): r is [string, string] => r[1] !== null && r[1] !== "");
}

export const GATE_LABEL: Record<GateId, string> = {
  amount: "Amount within lender range", fico: "Personal FICO minimum", timeInBusiness: "Minimum time in business", revenue: "Minimum revenue",
  state: "State availability", country: "Country availability", residency: "Citizenship / residency / US address", purpose: "Permitted use of funds",
  businessUse: "Business use allowed", collateral: "Collateral you can provide", personalGuarantee: "Personal guarantee you accept", uccLien: "UCC lien you accept",
  bankruptcy: "Bankruptcy policy", taxLiens: "Tax lien policy", defaults: "Recent defaults policy",
  userTerm: "Your term filter", userApr: "Your APR filter", userPayment: "Your payment filter", userSpeed: "Your speed filter", userLien: "Your no-lien filter",
  userGuarantee: "Your no-guarantee filter", userCollateral: "Your no-collateral filter", userType: "Your product-type filter", userCategory: "Your category filter",
  userLender: "Your lender filter", userPull: "Your soft-pull filter", userPrepay: "Your prepayment filter", userAmount: "Your amount filter",
};

/** jsonb does not preserve key order, so every renderer iterates this fixed order (matches the spec). */
export const COMPONENT_ORDER = ["eligibilityFit", "totalCost", "termPaymentFit", "speed", "collateralBurden", "reliability"] as const;

export const COMPONENT_LABEL: Record<keyof ReportItem["breakdown"], string> = {
  eligibilityFit: "Eligibility fit", totalCost: "Total cost of capital", termPaymentFit: "Term & payment fit", speed: "Speed",
  collateralBurden: "Collateral & guarantee burden", reliability: "Lender reliability & data confidence",
};

export function gateSummaryLines(report: Report): string[] {
  return Object.entries(report.gateSummary)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([id, n]) => `${GATE_LABEL[id as GateId] ?? id}: removed ${n} product${n === 1 ? "" : "s"}`);
}
