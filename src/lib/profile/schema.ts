import { z } from "zod";

export const BORROWER_TYPES = ["startup", "existing_small_business", "personal_for_business", "real_estate_investor"] as const;
export const PURPOSES = ["working_capital", "equipment", "expansion", "debt_consolidation", "real_estate", "inventory", "vehicle"] as const;
export const FREQUENCIES = ["daily", "weekly", "monthly", "no_preference"] as const;
export const RESIDENCY = ["us_citizen", "permanent_resident", "visa_holder", "non_resident"] as const;

export type BorrowerType = (typeof BORROWER_TYPES)[number];
export type Purpose = (typeof PURPOSES)[number];
export type Frequency = (typeof FREQUENCIES)[number];
export type Residency = (typeof RESIDENCY)[number];

export const BORROWER_TYPE_LABEL: Record<BorrowerType, string> = {
  startup: "Startup",
  existing_small_business: "Existing small business",
  personal_for_business: "Personal loan for business",
  real_estate_investor: "Real estate investor",
};
export const PURPOSE_LABEL: Record<Purpose, string> = {
  working_capital: "Working capital",
  equipment: "Equipment",
  expansion: "Expansion",
  debt_consolidation: "Debt consolidation",
  real_estate: "Real estate",
  inventory: "Inventory",
  vehicle: "Vehicle",
};

/**
 * Borrower profile. Every field is nullable: `null` means "not stated" and must never be guessed.
 * Kept flat (no nesting) so the same shape drives the model tool schema, the DB JSON and the
 * editable card. No field here can hold an SSN, bank number or ID — by design.
 */
export const ProfileSchema = z.object({
  borrowerType: z.enum(BORROWER_TYPES).nullable(),

  ownerCountry: z.string().nullable(), // ISO 3166-1 alpha-2, e.g. "US"
  ownerState: z.string().nullable(), // US state / DC code, e.g. "TX"
  ownerResidency: z.enum(RESIDENCY).nullable(), // citizenship / residency status of the owner
  businessCountry: z.string().nullable(),
  businessState: z.string().nullable(),

  industry: z.string().nullable(),
  timeInBusinessMonths: z.number().nullable(), // 0 = not launched yet
  monthlyRevenue: z.number().nullable(), // USD, 0 = pre-revenue
  annualRevenue: z.number().nullable(),

  ficoMin: z.number().nullable(), // personal FICO range; a single score sets min = max
  ficoMax: z.number().nullable(),
  businessCreditScore: z.number().nullable(),
  businessCreditScoreType: z.string().nullable(), // e.g. "Paydex", "Experian Intelliscore", "FICO SBSS"
  recentDefaults: z.boolean().nullable(), // defaults / charge-offs in the last 24 months
  hasBankruptcy: z.boolean().nullable(),
  bankruptcyYearsAgo: z.number().nullable(),
  hasTaxLiens: z.boolean().nullable(),

  amountNeeded: z.number().nullable(), // USD
  purpose: z.enum(PURPOSES).nullable(),
  preferredTermMonths: z.number().nullable(),
  repaymentFrequency: z.enum(FREQUENCIES).nullable(),
  speedNeededDays: z.number().nullable(),

  collateralAvailable: z.boolean().nullable(),
  collateralDescription: z.string().nullable(),
  willingPersonalGuarantee: z.boolean().nullable(),
  willingUccLien: z.boolean().nullable(),

  growthPlan: z.string().nullable(),
  expectedRevenueLiftPct: z.number().nullable(),
  cashFlowForecast: z.string().nullable(),

  /** Inferences the system made (e.g. "fair credit -> 580-669"). Shown to the user on the card. */
  assumptions: z.array(z.string()),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type ProfileKey = keyof Profile;

export function emptyProfile(): Profile {
  return {
    borrowerType: null,
    ownerCountry: null,
    ownerState: null,
    ownerResidency: null,
    businessCountry: null,
    businessState: null,
    industry: null,
    timeInBusinessMonths: null,
    monthlyRevenue: null,
    annualRevenue: null,
    ficoMin: null,
    ficoMax: null,
    businessCreditScore: null,
    businessCreditScoreType: null,
    recentDefaults: null,
    hasBankruptcy: null,
    bankruptcyYearsAgo: null,
    hasTaxLiens: null,
    amountNeeded: null,
    purpose: null,
    preferredTermMonths: null,
    repaymentFrequency: null,
    speedNeededDays: null,
    collateralAvailable: null,
    collateralDescription: null,
    willingPersonalGuarantee: null,
    willingUccLien: null,
    growthPlan: null,
    expectedRevenueLiftPct: null,
    cashFlowForecast: null,
    assumptions: [],
  };
}

/** Model output / card edits are partial: only keys that were actually provided. */
export type ProfilePatch = Partial<Profile>;
