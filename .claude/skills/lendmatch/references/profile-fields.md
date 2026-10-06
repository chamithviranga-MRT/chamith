# Profile fields

Write the borrower profile as one JSON object using only these keys (other keys are rejected). Leave a field out when the borrower did not say: `null` / omitted means "not stated", and the matcher treats unknown as unknown, never as a pass. Never put an SSN, bank-account number or ID number anywhere.

| Field | Type / allowed values | Needed | Meaning |
|---|---|---|---|
| `amountNeeded` | number (USD) | required | How much the borrower wants to borrow. |
| `purpose` | `working_capital` \| `equipment` \| `expansion` \| `debt_consolidation` \| `real_estate` \| `inventory` \| `vehicle` | required | What the money is for. `vehicle` = cars, vans, trucks; `equipment` = machinery and tools. |
| `timeInBusinessMonths` | number (months) | required | How long the business has operated. `0` = not launched yet. |
| `ficoMin / ficoMax` | number 300-850 | required (one of) | Owner's personal FICO. A single score: set both to the same number; a range: low and high. At least one is required. |
| `ownerCountry / businessCountry` | ISO country code, e.g. `US` | required | Where the owner lives / where the business is based. |
| `businessState / ownerState` | 2-letter US state or `DC` | required for US businesses | Needed when the business (owner) is in the US. |
| `borrowerType` | `startup` \| `existing_small_business` \| `personal_for_business` \| `real_estate_investor` |  | Inferred from the other fields if omitted. |
| `ownerResidency` | `us_citizen` \| `permanent_resident` \| `visa_holder` \| `non_resident` |  | Owner's status. Set it only when stated; some lenders require citizenship or residency. |
| `industry` | text |  | e.g. `restaurant`, `construction`. Context only. |
| `monthlyRevenue / annualRevenue` | number (USD) |  | `0` = pre-revenue. Set either one; the other is estimated. |
| `businessCreditScore / businessCreditScoreType` | number / text |  | e.g. `80` / `Paydex`. |
| `recentDefaults` | true / false |  | Defaults, charge-offs or collections in the last 24 months. |
| `hasBankruptcy / bankruptcyYearsAgo` | true / false / number |  | Bankruptcy history and how long ago. |
| `hasTaxLiens` | true / false |  | Outstanding tax liens. |
| `preferredTermMonths` | number (months) |  | Preferred repayment length, e.g. `60`. Used for payment estimates and term fit. |
| `repaymentFrequency` | `daily` \| `weekly` \| `monthly` \| `no_preference` |  | Preferred repayment rhythm. |
| `speedNeededDays` | number (days) |  | How soon the funds are needed. |
| `collateralAvailable` | true / false |  | Whether the borrower can pledge collateral. |
| `collateralDescription` | text |  | What the collateral is. Context only. |
| `willingPersonalGuarantee` | true / false |  | Willing to sign a personal guarantee. `false` removes lenders that require one. |
| `willingUccLien` | true / false |  | Willing to accept a blanket UCC lien. `false` removes lenders that require one. |
| `growthPlan / expectedRevenueLiftPct / cashFlowForecast` | text / number / text |  | Context only; they do not change the ranking. |

Minimal example (a restaurant in Texas asking for $80,000):

```json
{
  "amountNeeded": 80000, "purpose": "expansion", "timeInBusinessMonths": 36,
  "ficoMin": 700, "ficoMax": 700, "monthlyRevenue": 60000, "industry": "restaurant",
  "ownerCountry": "US", "businessCountry": "US", "businessState": "TX", "preferredTermMonths": 60
}
```

