import { BORROWER_TYPES, FREQUENCIES, PURPOSES, RESIDENCY } from "@/lib/profile/schema";

interface Field {
  key: string;
  type: string;
  help: string;
  needed?: string;
}

const list = (xs: readonly string[]) => xs.map((x) => `\`${x}\``).join(" \\| ");

/** Every profile field the matcher understands. `null` / omitted always means "not stated": never guess a value. */
export const FIELDS: Field[] = [
  { key: "amountNeeded", type: "number (USD)", help: "How much the borrower wants to borrow.", needed: "required" },
  { key: "purpose", type: list(PURPOSES), help: "What the money is for. `vehicle` = cars, vans, trucks; `equipment` = machinery and tools.", needed: "required" },
  { key: "timeInBusinessMonths", type: "number (months)", help: "How long the business has operated. `0` = not launched yet.", needed: "required" },
  { key: "ficoMin / ficoMax", type: "number 300-850", help: "Owner's personal FICO. A single score: set both to the same number; a range: low and high. At least one is required.", needed: "required (one of)" },
  { key: "ownerCountry / businessCountry", type: "ISO country code, e.g. `US`", help: "Where the owner lives / where the business is based.", needed: "required" },
  { key: "businessState / ownerState", type: "2-letter US state or `DC`", help: "Needed when the business (owner) is in the US.", needed: "required for US businesses" },
  { key: "borrowerType", type: list(BORROWER_TYPES), help: "Inferred from the other fields if omitted." },
  { key: "ownerResidency", type: list(RESIDENCY), help: "Owner's status. Set it only when stated; some lenders require citizenship or residency." },
  { key: "industry", type: "text", help: "e.g. `restaurant`, `construction`. Context only." },
  { key: "monthlyRevenue / annualRevenue", type: "number (USD)", help: "`0` = pre-revenue. Set either one; the other is estimated." },
  { key: "businessCreditScore / businessCreditScoreType", type: "number / text", help: "e.g. `80` / `Paydex`." },
  { key: "recentDefaults", type: "true / false", help: "Defaults, charge-offs or collections in the last 24 months." },
  { key: "hasBankruptcy / bankruptcyYearsAgo", type: "true / false / number", help: "Bankruptcy history and how long ago." },
  { key: "hasTaxLiens", type: "true / false", help: "Outstanding tax liens." },
  { key: "preferredTermMonths", type: "number (months)", help: "Preferred repayment length, e.g. `60`. Used for payment estimates and term fit." },
  { key: "repaymentFrequency", type: list(FREQUENCIES), help: "Preferred repayment rhythm." },
  { key: "speedNeededDays", type: "number (days)", help: "How soon the funds are needed." },
  { key: "collateralAvailable", type: "true / false", help: "Whether the borrower can pledge collateral." },
  { key: "collateralDescription", type: "text", help: "What the collateral is. Context only." },
  { key: "willingPersonalGuarantee", type: "true / false", help: "Willing to sign a personal guarantee. `false` removes lenders that require one." },
  { key: "willingUccLien", type: "true / false", help: "Willing to accept a blanket UCC lien. `false` removes lenders that require one." },
  { key: "growthPlan / expectedRevenueLiftPct / cashFlowForecast", type: "text / number / text", help: "Context only; they do not change the ranking." },
];

export function fieldsMarkdown(): string {
  const rows = FIELDS.map((f) => `| \`${f.key}\` | ${f.type} | ${f.needed ?? ""} | ${f.help} |`).join("\n");
  return `# Profile fields

Write the borrower profile as one JSON object using only these keys (other keys are rejected). Leave a field out when the borrower did not say: \`null\` / omitted means "not stated", and the matcher treats unknown as unknown, never as a pass. Never put an SSN, bank-account number or ID number anywhere.

| Field | Type / allowed values | Needed | Meaning |
|---|---|---|---|
${rows}

Minimal example (a restaurant in Texas asking for $80,000):

\`\`\`json
{
  "amountNeeded": 80000, "purpose": "expansion", "timeInBusinessMonths": 36,
  "ficoMin": 700, "ficoMax": 700, "monthlyRevenue": 60000, "industry": "restaurant",
  "ownerCountry": "US", "businessCountry": "US", "businessState": "TX", "preferredTermMonths": 60
}
\`\`\`
`;
}
