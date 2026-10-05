# LendMatch evaluation (fixtures)
Generated 2026-10-05T20:10:09.947Z · profile extraction: offline pattern matching · reasoning: verified template

> **SYNTHETIC FIXTURE DATA: fictional lenders and invented numbers, used only to exercise the engine. These are not real lender terms.**
> 33 products from 21 fictional lenders. This run validates the engine (extraction, hard filters, scoring, cost math, reasoning verification, claim audit). It says nothing about real lenders.

## Startup, 580 FICO, no revenue  (`startup-580`)

**Input:** “I'm launching a food truck startup in Phoenix, AZ. No revenue yet — my FICO is 580 and I need $35,000 for working capital to get through the first six months. I'd rather not pledge my house.”

**Extracted profile** (offline): Borrower type = Startup · Industry = food truck · Amount needed = $35,000 · Purpose = Working capital · Personal FICO = 580 · Time in business = Not launched yet · Monthly revenue = $0 · Owner location = AZ, United States · Business location = AZ, United States
Extraction vs expected: all expected fields recovered

**Result:** 33 products considered · 3 passed every hard filter · showing 3 (fewer than 10: only 3 products passed the hard filters, so fewer than 10 are shown rather than padding the list with products you would not qualify for.)

```
 #  Label        Lender                         Product                            Cat.         Score  Amount                 Rate                     Term                Speed            Est. monthly
 1  Pink Diamond Fixture Personal Lending       Startup Personal Loan              Alternative   78.4  $5,000 – $40,000       12% – 30% APR            2 years – 5 years   2 days – 7 days  $1,184
 2  Gem          Fixture Community Microlender  Startup Microloan                  SBA           77.3  $500 – $50,000         8% – 13% APR             1 year – 6 years    14 days – 30 da… $999
 3  Gem          Fixture Startup Lender         Startup Working Capital Loan       Alternative   69.0  $5,000 – $75,000       18% – 36% APR            6 months – 2 years  2 days – 5 days  $2,775
```

**#1 Pink Diamond — Fixture Personal Lending: Startup Personal Loan** (Personal loan, Alternative; score 78.4)
- Why it fits: Fixture Personal Lending's Startup Personal Loan (Personal loan) is offered by an Alternative lender. $35,000 is within the published range ($5,000 – $40,000). Minimum FICO 560; yours is 580. Permitted use: working capital.
- Could block approval: Not published: Time in business — confirm with the lender. Not published: Revenue — confirm with the lender.
- Estimate: about $1,025 – $1,356 per month over 42 months (term assumed); total cost of capital about $14,716 (effective APR about 21%).
- Next step: Review the lender's requirements page and start an application, confirming rates and fees directly with the lender.
- Source: https://fixtures.example/fx-pers/startup-personal-loan · data scraped Oct 4, 2026 (1 day ago). Estimates only; confirm with the lender.

**#2 Gem — Fixture Community Microlender: Startup Microloan** (Microloan, SBA; score 77.3)
- Why it fits: Fixture Community Microlender's Startup Microloan (Microloan) is offered by an SBA lender. $35,000 is within the published range ($500 – $50,000). Minimum FICO 575; yours is 580. No minimum time in business.
- Could block approval: A personal guarantee is required — confirm you are willing to give one. Not published: Revenue — confirm with the lender. Not published: UCC lien — confirm with the lender.
- Estimate: about $958 – $1,042 per month over 42 months (term assumed); total cost of capital about $6,975 (effective APR about 10.5%).
- Next step: Confirm you will sign a personal guarantee. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-micro/startup-microloan · data scraped Oct 1, 2026 (4 days ago). Estimates only; confirm with the lender.

**#3 Gem — Fixture Startup Lender: Startup Working Capital Loan** (Term loan, Alternative; score 69.0)
- Why it fits: Fixture Startup Lender's Startup Working Capital Loan (Term loan) is offered by an Alternative lender. $35,000 is within the published range ($5,000 – $75,000). Minimum FICO 550; yours is 580. No minimum time in business.
- Could block approval: A personal guarantee is required — confirm you are willing to give one. Not published: Revenue — confirm with the lender. Not published: Citizenship / residency — confirm with the lender.
- Estimate: about $2,623 – $2,932 per month over 15 months (term assumed); total cost of capital about $8,201 (effective APR about 34.53%).
- Next step: Confirm you will sign a personal guarantee. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-start/startup-working-capital-loan · data scraped Oct 5, 2026 (today). Estimates only; confirm with the lender.

**Near misses (what you'd need to change):**
- Fixture Personal Lending — Personal Loan (business use allowed): Raise your personal FICO to at least 600 (currently 580).  _(source https://fixtures.example/fx-pers/personal-loan-business-use-allowed, scraped Oct 5, 2026)_
- Fixture Desert Startup Loans — Desert Startup Loan: Not offered in Arizona; only a different business location would qualify.  _(source https://fixtures.example/fx-desert/desert-startup-loan, scraped Oct 4, 2026)_
- Fixture Invoice Co — Invoice Factoring: Wait until the business has operated 3 months (currently 0), or choose a product for newer businesses.  _(source https://fixtures.example/fx-inv/invoice-factoring, scraped Oct 4, 2026)_
- Fixture Equipment Finance — Startup Equipment Financing: This product is not offered for working capital.  _(source https://fixtures.example/fx-eq/startup-equipment-financing, scraped Oct 2, 2026)_
- Fixture Marketplace — Marketplace Business Loans: Wait until the business has operated 6 months (currently 0), or choose a product for newer businesses.  _(source https://fixtures.example/fx-mkt/marketplace-business-loans, scraped Oct 3, 2026)_
- Fixture Prime Personal — Prime Personal Loan: Raise your personal FICO to at least 700 (currently 580). Choose a business loan product instead.  _(source https://fixtures.example/fx-prime/prime-personal-loan, scraped Oct 3, 2026)_

**Removed by hard filters:** fico ×22, timeInBusiness ×22, revenue ×10, purpose ×10, amount ×8, state ×1, businessUse ×1

**Claim audit:** 0 flags — every number, source and estimate label checked
**Independent oracle:** engine and oracle agree (nothing ineligible ranked, nothing eligible removed)
**Persona checks:** all passed

## 3-year restaurant, 700 FICO  (`restaurant-700`)

**Input:** “I own a restaurant in Austin, TX that's been open for 3 years. My FICO is 700 and we do about $60,000 a month in revenue. I want an $80,000 loan to expand into a second location, ideally repaid over 5 years.”

**Extracted profile** (offline): Borrower type = Existing small business · Industry = restaurant · Amount needed = $80,000 · Purpose = Expansion · Personal FICO = 700 · Time in business = 36 months · Monthly revenue = $60,000 · Owner location = TX, United States · Business location = TX, United States · Preferred term = 60 months
Extraction vs expected: all expected fields recovered

**Result:** 33 products considered · 10 passed every hard filter · showing 10

```
 #  Label        Lender                         Product                            Cat.         Score  Amount                 Rate                     Term                Speed            Est. monthly
 1  Pink Diamond Fixture Regional Bank          Small Business Term Loan           Conventional  86.6  $10,000 – $250,000     9% – 15% APR             1 year – 5 years    5 days – 10 days $1,780
 2  Gem          Fixture National Bank          Business Term Loan                 Conventional  83.6  $25,000 – $500,000     8.5% – 14% APR           1 year – 7 years    7 days – 14 days $1,749
 3  Gem          Fixture Heartland Bank         SBA Express Loan                   SBA           83.0  $25,000 – $500,000     11% – 14% APR            5 years – 10 years  10 days – 20 da… $1,800
 4  Gem          Fixture Global SMB             Global Founders Term Loan          Alternative   79.8  $10,000 – $250,000     12% – 24% APR            1 year – 4 years    5 days – 10 days $2,350
 5  Gem          Fixture Heartland Bank         Established Business Term Loan     SBA           78.7  $50,000 – $1,000,000   8% – 12% APR             3 years – 10 years  14 days – 30 da… $1,700
 6  Gem          Fixture SBA Partners           SBA 7(a) Loan                      SBA           76.8  $50,000 – $5,000,000   10.5% – 13.5% APR        5 years – 25 years  30 days – 60 da… $1,780
 7  Gem          Fixture Online Capital         Fast Term Loan                     Alternative   76.0  $5,000 – $250,000      14% – 35% APR            6 months – 3 years  1 day – 3 days   $3,160
 8  Gem          Fixture Fast Funding           Merchant Cash Advance              Alternative   68.8  $5,000 – $500,000      1.15 – 1.45 factor rate  3 months – 18 mont… same day – 2 da… $5,778
 9  Gem          Fixture Marketplace            Marketplace Business Loans         SBA           68.0  $5,000 – $5,000,000    6% – 99% APR             3 months – 25 years 1 day – 14 days  $3,790
10  Gem          Fixture Fast Funding           Revenue-Based Advance              Alternative   60.1  $5,000 – $250,000      1.2 – 1.5 factor rate    3 months – 1 year   same day – 1 day $9,000
```

**#1 Pink Diamond — Fixture Regional Bank: Small Business Term Loan** (Term loan, Conventional; score 86.6)
- Why it fits: Fixture Regional Bank's Small Business Term Loan (Term loan) is offered by a Conventional lender. $80,000 is within the published range ($10,000 – $250,000). Minimum FICO 660; yours is 700. Requires 12 months; you have 36.
- Could block approval: A personal guarantee is required — confirm you are willing to give one. Not published: Citizenship / residency — confirm with the lender. Not published: Collateral — confirm with the lender.
- Estimate: about $1,661 – $1,903 per month over 60 months; total cost of capital about $26,773 (effective APR about 12%).
- Next step: Confirm you will sign a personal guarantee. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-regl/small-business-term-loan · data scraped Oct 2, 2026 (3 days ago). Estimates only; confirm with the lender.

**#2 Gem — Fixture National Bank: Business Term Loan** (Term loan, Conventional; score 83.6)
- Why it fits: Fixture National Bank's Business Term Loan (Term loan) is offered by a Conventional lender. $80,000 is within the published range ($25,000 – $500,000). Minimum FICO 680; yours is 700. Requires 24 months; you have 36.
- Could block approval: A personal guarantee is required — confirm you are willing to give one. A UCC lien on business assets is filed — confirm you accept this. A hard credit inquiry will be made, which can lower your score slightly.
- Estimate: about $1,641 – $1,861 per month over 60 months; total cost of capital about $26,163 (effective APR about 11.91%).
- Next step: Confirm you will sign a personal guarantee. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-natl/business-term-loan · data scraped Oct 5, 2026 (today). Estimates only; confirm with the lender.

**#3 Gem — Fixture Heartland Bank: SBA Express Loan** (SBA 7(a), SBA; score 83.0)
- Why it fits: Fixture Heartland Bank's SBA Express Loan (SBA 7(a)) is offered by an SBA lender. $80,000 is within the published range ($25,000 – $500,000). Minimum FICO 660; yours is 700. Requires 12 months; you have 36.
- Could block approval: A personal guarantee is required — confirm you are willing to give one. A UCC lien on business assets is filed — confirm you accept this. Not published: Revenue — confirm with the lender.
- Estimate: about $1,739 – $1,861 per month over 60 months; total cost of capital about $27,990 (effective APR about 12.5%).
- Next step: Confirm you will sign a personal guarantee. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-heart/sba-express-loan · data scraped Oct 3, 2026 (2 days ago). Estimates only; confirm with the lender.

**#4 Gem — Fixture Global SMB: Global Founders Term Loan** (Term loan, Alternative; score 79.8)
- Why it fits: Fixture Global SMB's Global Founders Term Loan (Term loan) is offered by an Alternative lender. $80,000 is within the published range ($10,000 – $250,000). Requires 12 months; you have 36. Meets the published minimum revenue.
- Could block approval: A personal guarantee is required — confirm you are willing to give one. Not published: Personal FICO — confirm with the lender. Not published: Collateral — confirm with the lender.
- Estimate: about $2,107 – $2,608 per month over 48 months; total cost of capital about $32,800 (effective APR about 18%).
- Next step: Confirm you will sign a personal guarantee. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-global/global-founders-term-loan · data scraped Oct 3, 2026 (2 days ago). Estimates only; confirm with the lender.

**#5 Gem — Fixture Heartland Bank: Established Business Term Loan** (Term loan, SBA; score 78.7)
- Why it fits: Fixture Heartland Bank's Established Business Term Loan (Term loan) is offered by an SBA lender. $80,000 is within the published range ($50,000 – $1,000,000). Minimum FICO 700; yours is 700. Requires 36 months; you have 36.
- Could block approval: Collateral is required; you did not say whether you have any. Confirm you can pledge collateral. A personal guarantee is required — confirm you are willing to give one. A UCC lien on business assets is filed — confirm you accept this.
- Estimate: about $1,622 – $1,780 per month over 60 months; total cost of capital about $21,986 (effective APR about 10%).
- Next step: Confirm you can pledge collateral. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-heart/established-business-term-loan · data scraped Oct 2, 2026 (3 days ago). Estimates only; confirm with the lender.

**#6 Gem — Fixture SBA Partners: SBA 7(a) Loan** (SBA 7(a), SBA; score 76.8)
- Why it fits: Fixture SBA Partners's SBA 7(a) Loan (SBA 7(a)) is offered by an SBA lender. $80,000 is within the published range ($50,000 – $5,000,000). Minimum FICO 680; yours is 700. Requires 24 months; you have 36.
- Could block approval: Requires a US citizen or permanent resident; your status was not provided. Confirm you meet: a US citizen or permanent resident. A personal guarantee is required — confirm you are willing to give one. A UCC lien on business assets is filed — confirm you accept this.
- Estimate: about $1,720 – $1,841 per month over 60 months; total cost of capital about $26,773 (effective APR about 12%).
- Next step: Confirm you meet: a US citizen or permanent resident. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-sbaP/sba-7-a-loan · data scraped Oct 5, 2026 (today). Estimates only; confirm with the lender.

**#7 Gem — Fixture Online Capital: Fast Term Loan** (Term loan, Alternative; score 76.0)
- Why it fits: Fixture Online Capital's Fast Term Loan (Term loan) is offered by an Alternative lender. $80,000 is within the published range ($5,000 – $250,000). Minimum FICO 620; yours is 700. Requires 12 months; you have 36.
- Could block approval: A personal guarantee is required — confirm you are willing to give one. A UCC lien on business assets is filed — confirm you accept this. Not published: Citizenship / residency — confirm with the lender.
- Estimate: about $2,734 – $3,619 per month over 36 months; total cost of capital about $36,548 (effective APR about 27.19%).
- Next step: Confirm you will sign a personal guarantee. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-onl/fast-term-loan · data scraped Oct 4, 2026 (1 day ago). Estimates only; confirm with the lender.

**#8 Gem — Fixture Fast Funding: Merchant Cash Advance** (Merchant cash advance, Alternative; score 68.8)
- Why it fits: Fixture Fast Funding's Merchant Cash Advance (Merchant cash advance) is offered by an Alternative lender. $80,000 is within the published range ($5,000 – $500,000). Minimum FICO 500; yours is 700. Requires 6 months; you have 36.
- Could block approval: A personal guarantee is required — confirm you are willing to give one. A UCC lien on business assets is filed — confirm you accept this. Factor-rate pricing: the effective annual cost is usually far above a typical APR and repayment may be daily or weekly.
- Estimate: about $5,111 – $6,444 per month over 18 months; total cost of capital about $24,000 (effective APR about 35.05%). Repaid daily: roughly $266.63 per business day.
- Next step: Confirm you will sign a personal guarantee. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-fast/merchant-cash-advance · data scraped Oct 1, 2026 (4 days ago). Estimates only; confirm with the lender.

**#9 Gem — Fixture Marketplace: Marketplace Business Loans** (Term loan, SBA; score 68.0)
- Why it fits: Fixture Marketplace's Marketplace Business Loans (Term loan) is offered by an SBA lender. $80,000 is within the published range ($5,000 – $5,000,000). Minimum FICO 550; yours is 700. Requires 6 months; you have 36.
- Could block approval: The published APR range is very wide (6%–99%); your actual rate could be anywhere in it. This is a marketplace: offers come from partner lenders, so actual terms vary. Not published: Revenue — confirm with the lender.
- Estimate: about $1,547 – $6,657 per month over 60 months; total cost of capital about $147,420 (effective APR about 52.5%).
- Next step: Review the lender's requirements page and start an application, confirming rates and fees directly with the lender.
- Source: https://fixtures.example/fx-mkt/marketplace-business-loans · data scraped Oct 3, 2026 (2 days ago). Estimates only; confirm with the lender.

**#10 Gem — Fixture Fast Funding: Revenue-Based Advance** (Merchant cash advance, Alternative; score 60.1)
- Why it fits: Fixture Fast Funding's Revenue-Based Advance (Merchant cash advance) is offered by an Alternative lender. $80,000 is within the published range ($5,000 – $250,000). Minimum FICO 500; yours is 700. Requires 3 months; you have 36.
- Could block approval: A personal guarantee is required — confirm you are willing to give one. A UCC lien on business assets is filed — confirm you accept this. Factor-rate pricing: the effective annual cost is usually far above a typical APR and repayment may be daily or weekly.
- Estimate: about $8,000 – $10,000 per month over 12 months; total cost of capital about $28,000 (effective APR about 59.39%). Repaid daily: roughly $415.32 per business day.
- Next step: Confirm you will sign a personal guarantee. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-fast/revenue-based-advance · data scraped Oct 5, 2026 (today). Estimates only; confirm with the lender.

**Near misses (what you'd need to change):**
- Fixture Prime Personal — Prime Personal Loan: Choose a business loan product instead.  _(source https://fixtures.example/fx-prime/prime-personal-loan, scraped Oct 3, 2026)_
- Fixture Southern Equipment — Heavy Equipment Loan: This product is not offered for expansion.  _(source https://fixtures.example/fx-south/heavy-equipment-loan, scraped Oct 1, 2026)_
- Fixture Community Microlender — Growth Microloan: Reduce the request to $50,000 or less, or combine with a second source (you asked for $80,000).  _(source https://fixtures.example/fx-micro/growth-microloan, scraped Oct 5, 2026)_
- Fixture Personal Lending — Personal Loan (business use allowed): Reduce the request to $50,000 or less, or combine with a second source (you asked for $80,000).  _(source https://fixtures.example/fx-pers/personal-loan-business-use-allowed, scraped Oct 5, 2026)_
- Fixture National Bank — Equipment Loan: This product is not offered for expansion.  _(source https://fixtures.example/fx-natl/equipment-loan, scraped Oct 3, 2026)_
- Fixture Equipment Finance — Equipment Financing: This product is not offered for expansion.  _(source https://fixtures.example/fx-eq/equipment-financing, scraped Oct 3, 2026)_

**Removed by hard filters:** purpose ×17, amount ×11, state ×1, businessUse ×1

**Claim audit:** 0 flags — every number, source and estimate label checked
**Independent oracle:** engine and oracle agree (nothing ineligible ranked, nothing eligible removed)
**Persona checks:** all passed

## Contractor needing equipment  (`contractor-equipment`)

**Input:** “I'm a general contractor in Tampa, Florida, in business for 6 years with about $40k a month in sales. FICO around 680. I need $120,000 for a new excavator and I can use the machine as collateral. I need the money within 3 weeks.”

**Extracted profile** (offline): Borrower type = Existing small business · Industry = contractor · Amount needed = $120,000 · Purpose = Equipment · Personal FICO = 680 · Time in business = 72 months · Monthly revenue = $40,000 · Owner location = FL, United States · Business location = FL, United States · Funds needed within = 21 days · Collateral available = Yes
Extraction vs expected: all expected fields recovered

**Result:** 33 products considered · 11 passed every hard filter · showing 10

```
 #  Label        Lender                         Product                            Cat.         Score  Amount                 Rate                     Term                Speed            Est. monthly
 1  Pink Diamond Fixture Regional Bank          Small Business Term Loan           Conventional  85.5  $10,000 – $250,000     9% – 15% APR             1 year – 5 years    5 days – 10 days $3,986
 2  Gem          Fixture National Bank          Business Term Loan                 Conventional  84.4  $25,000 – $500,000     8.5% – 14% APR           1 year – 7 years    7 days – 14 days $3,116
 3  Gem          Fixture Heartland Bank         SBA Express Loan                   SBA           84.0  $25,000 – $500,000     11% – 14% APR            5 years – 10 years  10 days – 20 da… $2,061
 4  Gem          Fixture National Bank          Equipment Loan                     Conventional  83.6  $20,000 – $1,000,000   7.5% – 12% APR           2 years – 7 years   5 days – 10 days $2,754
 5  Gem          Fixture Equipment Finance      Equipment Financing                Alternative   81.3  $5,000 – $500,000      8% – 22% APR             1 year – 6 years    1 day – 5 days   $3,690
 6  Gem          Fixture Western Lender         Western Growth Loan                Alternative   79.3  $10,000 – $300,000     12% – 24% APR            1 year – 5 years    3 days – 7 days  $4,338
 7  Gem          Fixture Equipment Finance      Startup Equipment Financing        Alternative   75.8  $5,000 – $150,000      16% – 29% APR            2 years – 5 years   3 days – 7 days  $4,154
 8  Gem          Fixture SBA Partners           SBA 7(a) Loan                      SBA           75.8  $50,000 – $5,000,000   10.5% – 13.5% APR        5 years – 25 years  30 days – 60 da… $1,440
 9  Gem          Fixture Online Capital         Fast Term Loan                     Alternative   75.1  $5,000 – $250,000      14% – 35% APR            6 months – 3 years  1 day – 3 days   $7,084
10  Gem          Fixture Marketplace            Marketplace Business Loans         SBA           66.5  $5,000 – $5,000,000    6% – 99% APR             3 months – 25 years 1 day – 14 days  $5,258
```

**#1 Pink Diamond — Fixture Regional Bank: Small Business Term Loan** (Term loan, Conventional; score 85.5)
- Why it fits: Fixture Regional Bank's Small Business Term Loan (Term loan) is offered by a Conventional lender. $120,000 is within the published range ($10,000 – $250,000). Minimum FICO 660; yours is 680. Requires 12 months; you have 72.
- Could block approval: A personal guarantee is required — confirm you are willing to give one. Not published: Citizenship / residency — confirm with the lender. Not published: Collateral — confirm with the lender.
- Estimate: about $3,816 – $4,160 per month over 36 months (term assumed); total cost of capital about $23,486 (effective APR about 12%).
- Next step: Confirm you will sign a personal guarantee. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-regl/small-business-term-loan · data scraped Oct 2, 2026 (3 days ago). Estimates only; confirm with the lender.

**#2 Gem — Fixture National Bank: Business Term Loan** (Term loan, Conventional; score 84.4)
- Why it fits: Fixture National Bank's Business Term Loan (Term loan) is offered by a Conventional lender. $120,000 is within the published range ($25,000 – $500,000). Minimum FICO 680; yours is 680. Requires 24 months; you have 72.
- Could block approval: A personal guarantee is required — confirm you are willing to give one. A UCC lien on business assets is filed — confirm you accept this. A hard credit inquiry will be made, which can lower your score slightly.
- Estimate: about $2,958 – $3,279 per month over 48 months (term assumed); total cost of capital about $31,370 (effective APR about 12.06%).
- Next step: Confirm you will sign a personal guarantee. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-natl/business-term-loan · data scraped Oct 5, 2026 (today). Estimates only; confirm with the lender.

**#3 Gem — Fixture Heartland Bank: SBA Express Loan** (SBA 7(a), SBA; score 84.0)
- Why it fits: Fixture Heartland Bank's SBA Express Loan (SBA 7(a)) is offered by an SBA lender. $120,000 is within the published range ($25,000 – $500,000). Minimum FICO 660; yours is 680. Requires 12 months; you have 72.
- Could block approval: A personal guarantee is required — confirm you are willing to give one. A UCC lien on business assets is filed — confirm you accept this. Not published: Revenue — confirm with the lender.
- Estimate: about $1,964 – $2,161 per month over 90 months (term assumed); total cost of capital about $65,493 (effective APR about 12.5%).
- Next step: Confirm you will sign a personal guarantee. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-heart/sba-express-loan · data scraped Oct 3, 2026 (2 days ago). Estimates only; confirm with the lender.

**#4 Gem — Fixture National Bank: Equipment Loan** (Equipment financing, Conventional; score 83.6)
- Why it fits: Fixture National Bank's Equipment Loan (Equipment financing) is offered by a Conventional lender. $120,000 is within the published range ($20,000 – $1,000,000). Minimum FICO 660; yours is 680. Requires 24 months; you have 72.
- Could block approval: A personal guarantee is required — confirm you are willing to give one. A UCC lien on business assets is filed — confirm you accept this. Requires collateral.
- Estimate: about $2,625 – $2,887 per month over 54 months (term assumed); total cost of capital about $28,723 (effective APR about 9.75%).
- Next step: Confirm you will sign a personal guarantee. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-natl/equipment-loan · data scraped Oct 3, 2026 (2 days ago). Estimates only; confirm with the lender.

**#5 Gem — Fixture Equipment Finance: Equipment Financing** (Equipment financing, Alternative; score 81.3)
- Why it fits: Fixture Equipment Finance's Equipment Financing (Equipment financing) is offered by an Alternative lender. $120,000 is within the published range ($5,000 – $500,000). Minimum FICO 600; yours is 680. Requires 12 months; you have 72.
- Could block approval: A UCC lien on business assets is filed — confirm you accept this. Requires collateral. Not published: Revenue — confirm with the lender.
- Estimate: about $3,285 – $4,122 per month over 42 months (term assumed); total cost of capital about $34,975 (effective APR about 15%).
- Next step: Confirm you accept a UCC lien. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-eq/equipment-financing · data scraped Oct 3, 2026 (2 days ago). Estimates only; confirm with the lender.

**#6 Gem — Fixture Western Lender: Western Growth Loan** (Term loan, Alternative; score 79.3)
- Why it fits: Fixture Western Lender's Western Growth Loan (Term loan) is offered by an Alternative lender. $120,000 is within the published range ($10,000 – $300,000). Minimum FICO 640; yours is 680. Requires 12 months; you have 72.
- Could block approval: A personal guarantee is required — confirm you are willing to give one. Not published: Revenue — confirm with the lender. Not published: Citizenship / residency — confirm with the lender.
- Estimate: about $3,986 – $4,708 per month over 36 months (term assumed); total cost of capital about $36,178 (effective APR about 18%).
- Next step: Confirm you will sign a personal guarantee. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-west/western-growth-loan · data scraped Oct 2, 2026 (3 days ago). Estimates only; confirm with the lender.

**#7 Gem — Fixture Equipment Finance: Startup Equipment Financing** (Equipment financing, Alternative; score 75.8)
- Why it fits: Fixture Equipment Finance's Startup Equipment Financing (Equipment financing) is offered by an Alternative lender. $120,000 is within the published range ($5,000 – $150,000). Minimum FICO 560; yours is 680. No minimum time in business.
- Could block approval: A personal guarantee is required — confirm you are willing to give one. A UCC lien on business assets is filed — confirm you accept this. Requires collateral.
- Estimate: about $3,750 – $4,580 per month over 42 months (term assumed); total cost of capital about $54,454 (effective APR about 22.5%).
- Next step: Confirm you will sign a personal guarantee. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-eq/startup-equipment-financing · data scraped Oct 2, 2026 (3 days ago). Estimates only; confirm with the lender.

**#8 Gem — Fixture SBA Partners: SBA 7(a) Loan** (SBA 7(a), SBA; score 75.8)
- Why it fits: Fixture SBA Partners's SBA 7(a) Loan (SBA 7(a)) is offered by an SBA lender. $120,000 is within the published range ($50,000 – $5,000,000). Minimum FICO 680; yours is 680. Requires 24 months; you have 72.
- Could block approval: Requires a US citizen or permanent resident; your status was not provided. Confirm you meet: a US citizen or permanent resident. A personal guarantee is required — confirm you are willing to give one. A UCC lien on business assets is filed — confirm you accept this.
- Estimate: about $1,326 – $1,558 per month over 180 months (term assumed); total cost of capital about $139,236 (effective APR about 12%).
- Next step: Confirm you meet: a US citizen or permanent resident. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-sbaP/sba-7-a-loan · data scraped Oct 5, 2026 (today). Estimates only; confirm with the lender.

**#9 Gem — Fixture Online Capital: Fast Term Loan** (Term loan, Alternative; score 75.1)
- Why it fits: Fixture Online Capital's Fast Term Loan (Term loan) is offered by an Alternative lender. $120,000 is within the published range ($5,000 – $250,000). Minimum FICO 620; yours is 680. Requires 12 months; you have 72.
- Could block approval: A personal guarantee is required — confirm you are willing to give one. A UCC lien on business assets is filed — confirm you accept this. Not published: Citizenship / residency — confirm with the lender.
- Estimate: about $6,476 – $7,722 per month over 21 months (term assumed); total cost of capital about $32,960 (effective APR about 28.79%).
- Next step: Confirm you will sign a personal guarantee. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-onl/fast-term-loan · data scraped Oct 4, 2026 (1 day ago). Estimates only; confirm with the lender.

**#10 Gem — Fixture Marketplace: Marketplace Business Loans** (Term loan, SBA; score 66.5)
- Why it fits: Fixture Marketplace's Marketplace Business Loans (Term loan) is offered by an SBA lender. $120,000 is within the published range ($5,000 – $5,000,000). Minimum FICO 550; yours is 680. Requires 6 months; you have 72.
- Could block approval: The published APR range is very wide (6%–99%); your actual rate could be anywhere in it. This is a marketplace: offers come from partner lenders, so actual terms vary. Not published: Revenue — confirm with the lender.
- Estimate: about $1,129 – $9,900 per month over 152 months (term assumed); total cost of capital about $679,191 (effective APR about 52.5%).
- Next step: Review the lender's requirements page and start an application, confirming rates and fees directly with the lender.
- Source: https://fixtures.example/fx-mkt/marketplace-business-loans · data scraped Oct 3, 2026 (2 days ago). Estimates only; confirm with the lender.

**Near misses (what you'd need to change):**
- Fixture Community Microlender — Startup Microloan: Reduce the request to $50,000 or less, or combine with a second source (you asked for $120,000).  _(source https://fixtures.example/fx-micro/startup-microloan, scraped Oct 1, 2026)_
- Fixture Community Microlender — Growth Microloan: Reduce the request to $50,000 or less, or combine with a second source (you asked for $120,000).  _(source https://fixtures.example/fx-micro/growth-microloan, scraped Oct 5, 2026)_
- Fixture Southern Equipment — Heavy Equipment Loan: Not offered in Florida; only a different business location would qualify.  _(source https://fixtures.example/fx-south/heavy-equipment-loan, scraped Oct 1, 2026)_
- Fixture Investor Lending — DSCR Investment Property Loan: This product is not offered for equipment.  _(source https://fixtures.example/fx-invest/dscr-investment-property-loan, scraped Oct 2, 2026)_
- Fixture Personal Lending — Startup Personal Loan: Reduce the request to $40,000 or less, or combine with a second source (you asked for $120,000).  _(source https://fixtures.example/fx-pers/startup-personal-loan, scraped Oct 4, 2026)_
- Fixture Personal Lending — Personal Loan (business use allowed): Reduce the request to $50,000 or less, or combine with a second source (you asked for $120,000).  _(source https://fixtures.example/fx-pers/personal-loan-business-use-allowed, scraped Oct 5, 2026)_

**Removed by hard filters:** purpose ×12, amount ×12, fico ×5, revenue ×1, state ×1, businessUse ×1

**Claim audit:** 0 flags — every number, source and estimate label checked
**Independent oracle:** engine and oracle agree (nothing ineligible ranked, nothing eligible removed)
**Persona checks:** all passed

## Non-US owner of a US LLC  (`nonus-llc`)

**Input:** “I'm a citizen and resident of India and I own a Delaware LLC that sells SaaS to US customers. The LLC is 2 years old and does about $15k a month in revenue. My FICO is 690 from when I lived in the US. I need $50,000 of working capital.”

**Extracted profile** (offline): Borrower type = Existing small business · Industry = saas · Amount needed = $50,000 · Purpose = Working capital · Personal FICO = 690 · Time in business = 24 months · Monthly revenue = $15,000 · Owner location = India · Business location = DE, United States · Citizenship / residency = non resident
Extraction vs expected: all expected fields recovered

**Result:** 33 products considered · 13 passed every hard filter · showing 10

```
 #  Label        Lender                         Product                            Cat.         Score  Amount                 Rate                     Term                Speed            Est. monthly
 1  Pink Diamond Fixture Regional Bank          Small Business Term Loan           Conventional  82.1  $10,000 – $250,000     9% – 15% APR             1 year – 5 years    5 days – 10 days $1,661
 2  Gem          Fixture Western Lender         Western Growth Loan                Alternative   77.7  $10,000 – $300,000     12% – 24% APR            1 year – 5 years    3 days – 7 days  $1,808
 3  Gem          Fixture Regional Bank          Revolving Credit Line              Conventional  77.7  $5,000 – $100,000      11% – 18% APR            1 year              3 days – 7 days  $4,501
 4  Gem          Fixture Global SMB             Global Founders Term Loan          Alternative   75.6  $10,000 – $250,000     12% – 24% APR            1 year – 4 years    5 days – 10 days $2,082
 5  Gem          Fixture Desert Startup Loans   Desert Startup Loan                Alternative   74.7  $5,000 – $60,000       15% – 30% APR            6 months – 3 years  2 days – 6 days  $2,902
 6  Gem          Fixture Online Capital         Fast Term Loan                     Alternative   73.1  $5,000 – $250,000      14% – 35% APR            6 months – 3 years  1 day – 3 days   $2,952
 7  Gem          Fixture Global SMB             Global Founders Credit Line        Alternative   72.1  $5,000 – $100,000      15% – 30% APR            6 months – 1 year   3 days – 7 days  $6,089
 8  Gem          Fixture Invoice Co             Invoice Factoring                  Alternative   71.8  $10,000 – $1,000,000   1.01 – 1.04 factor rate  Not published       1 day – 3 days   n/a
 9  Gem          Fixture Online Capital         Flexible Line of Credit            Alternative   71.5  $5,000 – $150,000      16% – 40% APR            6 months – 1 year   1 day – 2 days   $6,249
10  Gem          Fixture Startup Lender         Startup Working Capital Loan       Alternative   69.5  $5,000 – $75,000       18% – 36% APR            6 months – 2 years  2 days – 5 days  $3,964
```

**#1 Pink Diamond — Fixture Regional Bank: Small Business Term Loan** (Term loan, Conventional; score 82.1)
- Why it fits: Fixture Regional Bank's Small Business Term Loan (Term loan) is offered by a Conventional lender. $50,000 is within the published range ($10,000 – $250,000). Minimum FICO 660; yours is 690. Requires 12 months; you have 24.
- Could block approval: Lender does not publish citizenship or residency rules, and the owner lives outside the US — confirm eligibility before applying. A personal guarantee is required — confirm you are willing to give one. Not published: Collateral — confirm with the lender.
- Estimate: about $1,590 – $1,733 per month over 36 months (term assumed); total cost of capital about $9,786 (effective APR about 12%).
- Next step: Ask the lender whether non-US residents may apply. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-regl/small-business-term-loan · data scraped Oct 2, 2026 (3 days ago). Estimates only; confirm with the lender.

**#2 Gem — Fixture Western Lender: Western Growth Loan** (Term loan, Alternative; score 77.7)
- Why it fits: Fixture Western Lender's Western Growth Loan (Term loan) is offered by an Alternative lender. $50,000 is within the published range ($10,000 – $300,000). Minimum FICO 640; yours is 690. Requires 12 months; you have 24.
- Could block approval: Lender does not publish citizenship or residency rules, and the owner lives outside the US — confirm eligibility before applying. A personal guarantee is required — confirm you are willing to give one. Not published: Revenue — confirm with the lender.
- Estimate: about $1,661 – $1,962 per month over 36 months (term assumed); total cost of capital about $15,074 (effective APR about 18%).
- Next step: Ask the lender whether non-US residents may apply. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-west/western-growth-loan · data scraped Oct 2, 2026 (3 days ago). Estimates only; confirm with the lender.

**#3 Gem — Fixture Regional Bank: Revolving Credit Line** (Line of credit, Conventional; score 77.7)
- Why it fits: Fixture Regional Bank's Revolving Credit Line (Line of credit) is offered by a Conventional lender. $50,000 is within the published range ($5,000 – $100,000). Minimum FICO 640; yours is 690. Requires 12 months; you have 24.
- Could block approval: Lender does not publish citizenship or residency rules, and the owner lives outside the US — confirm eligibility before applying. A personal guarantee is required — confirm you are willing to give one. Not published: Revenue — confirm with the lender.
- Estimate: about $4,419 – $4,584 per month over 12 months (term assumed); total cost of capital about $4,014 (effective APR about 14.5%).
- Next step: Ask the lender whether non-US residents may apply. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-regl/revolving-credit-line · data scraped Oct 1, 2026 (4 days ago). Estimates only; confirm with the lender.

**#4 Gem — Fixture Global SMB: Global Founders Term Loan** (Term loan, Alternative; score 75.6)
- Why it fits: Fixture Global SMB's Global Founders Term Loan (Term loan) is offered by an Alternative lender. $50,000 is within the published range ($10,000 – $250,000). Requires 12 months; you have 24. Meets the published minimum revenue.
- Could block approval: Requires a US address. Your US business address should satisfy this, but the owner lives outside the US — confirm before applying. A personal guarantee is required — confirm you are willing to give one. Not published: Personal FICO — confirm with the lender.
- Estimate: about $1,937 – $2,233 per month over 30 months (term assumed); total cost of capital about $12,459 (effective APR about 18%).
- Next step: Confirm with the lender that a US business address is enough when the owner lives abroad. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-global/global-founders-term-loan · data scraped Oct 3, 2026 (2 days ago). Estimates only; confirm with the lender.

**#5 Gem — Fixture Desert Startup Loans: Desert Startup Loan** (Term loan, Alternative; score 74.7)
- Why it fits: Fixture Desert Startup Loans's Desert Startup Loan (Term loan) is offered by an Alternative lender. $50,000 is within the published range ($5,000 – $60,000). Minimum FICO 560; yours is 690. No minimum time in business.
- Could block approval: Lender does not publish citizenship or residency rules, and the owner lives outside the US — confirm eligibility before applying. A personal guarantee is required — confirm you are willing to give one. Not published: Revenue — confirm with the lender.
- Estimate: about $2,722 – $3,089 per month over 21 months (term assumed); total cost of capital about $10,949 (effective APR about 22.5%).
- Next step: Ask the lender whether non-US residents may apply. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-desert/desert-startup-loan · data scraped Oct 4, 2026 (1 day ago). Estimates only; confirm with the lender.

**#6 Gem — Fixture Online Capital: Fast Term Loan** (Term loan, Alternative; score 73.1)
- Why it fits: Fixture Online Capital's Fast Term Loan (Term loan) is offered by an Alternative lender. $50,000 is within the published range ($5,000 – $250,000). Minimum FICO 620; yours is 690. Requires 12 months; you have 24.
- Could block approval: Lender does not publish citizenship or residency rules, and the owner lives outside the US — confirm eligibility before applying. A personal guarantee is required — confirm you are willing to give one. A UCC lien on business assets is filed — confirm you accept this.
- Estimate: about $2,698 – $3,218 per month over 21 months (term assumed); total cost of capital about $13,733 (effective APR about 28.79%).
- Next step: Ask the lender whether non-US residents may apply. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-onl/fast-term-loan · data scraped Oct 4, 2026 (1 day ago). Estimates only; confirm with the lender.

**#7 Gem — Fixture Global SMB: Global Founders Credit Line** (Line of credit, Alternative; score 72.1)
- Why it fits: Fixture Global SMB's Global Founders Credit Line (Line of credit) is offered by an Alternative lender. $50,000 is within the published range ($5,000 – $100,000). Requires 6 months; you have 24. Meets the published minimum revenue.
- Could block approval: Requires a US address. Your US business address should satisfy this, but the owner lives outside the US — confirm before applying. Not published: Personal FICO — confirm with the lender. Not published: Collateral — confirm with the lender.
- Estimate: about $5,909 – $6,273 per month over 9 months (term assumed); total cost of capital about $4,804 (effective APR about 22.5%).
- Next step: Confirm with the lender that a US business address is enough when the owner lives abroad. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-global/global-founders-credit-line · data scraped Oct 2, 2026 (3 days ago). Estimates only; confirm with the lender.

**#8 Gem — Fixture Invoice Co: Invoice Factoring** (Invoice factoring, Alternative; score 71.8)
- Why it fits: Fixture Invoice Co's Invoice Factoring (Invoice factoring) is offered by an Alternative lender. $50,000 is within the published range ($10,000 – $1,000,000). Minimum FICO 550; yours is 690. Requires 3 months; you have 24.
- Could block approval: Lender does not publish citizenship or residency rules, and the owner lives outside the US — confirm eligibility before applying. A UCC lien on business assets is filed — confirm you accept this. Not published: Revenue — confirm with the lender.
- Estimate: no fixed monthly payment (customers pay the invoices); fee roughly $3,750 over 3 30-day period(s).
- Next step: Ask the lender whether non-US residents may apply. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-inv/invoice-factoring · data scraped Oct 4, 2026 (1 day ago). Estimates only; confirm with the lender.

**#9 Gem — Fixture Online Capital: Flexible Line of Credit** (Line of credit, Alternative; score 71.5)
- Why it fits: Fixture Online Capital's Flexible Line of Credit (Line of credit) is offered by an Alternative lender. $50,000 is within the published range ($5,000 – $150,000). Minimum FICO 600; yours is 690. Requires 6 months; you have 24.
- Could block approval: Lender does not publish citizenship or residency rules, and the owner lives outside the US — confirm eligibility before applying. A personal guarantee is required — confirm you are willing to give one. A UCC lien on business assets is filed — confirm you accept this.
- Estimate: about $5,957 – $6,547 per month over 9 months (term assumed); total cost of capital about $6,238 (effective APR about 29.02%).
- Next step: Ask the lender whether non-US residents may apply. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-onl/flexible-line-of-credit · data scraped Oct 3, 2026 (2 days ago). Estimates only; confirm with the lender.

**#10 Gem — Fixture Startup Lender: Startup Working Capital Loan** (Term loan, Alternative; score 69.5)
- Why it fits: Fixture Startup Lender's Startup Working Capital Loan (Term loan) is offered by an Alternative lender. $50,000 is within the published range ($5,000 – $75,000). Minimum FICO 550; yours is 690. No minimum time in business.
- Could block approval: Lender does not publish citizenship or residency rules, and the owner lives outside the US — confirm eligibility before applying. A personal guarantee is required — confirm you are willing to give one. Not published: Revenue — confirm with the lender.
- Estimate: about $3,747 – $4,188 per month over 15 months (term assumed); total cost of capital about $11,716 (effective APR about 34.53%).
- Next step: Ask the lender whether non-US residents may apply. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-start/startup-working-capital-loan · data scraped Oct 5, 2026 (today). Estimates only; confirm with the lender.

**Near misses (what you'd need to change):**
- Fixture Personal Lending — Personal Loan (business use allowed): Only a US citizen or permanent resident qualify for this product.  _(source https://fixtures.example/fx-pers/personal-loan-business-use-allowed, scraped Oct 5, 2026)_
- Fixture Southern Equipment — Heavy Equipment Loan: This product is not offered for working capital.  _(source https://fixtures.example/fx-south/heavy-equipment-loan, scraped Oct 1, 2026)_
- Fixture Community Microlender — Growth Microloan: Only a US resident qualify for this product.  _(source https://fixtures.example/fx-micro/growth-microloan, scraped Oct 5, 2026)_
- Fixture Community Microlender — Startup Microloan: Only a US resident qualify for this product.  _(source https://fixtures.example/fx-micro/startup-microloan, scraped Oct 1, 2026)_
- Fixture Heartland Bank — SBA Express Loan: Only a US resident qualify for this product.  _(source https://fixtures.example/fx-heart/sba-express-loan, scraped Oct 3, 2026)_
- Fixture National Bank — Business Term Loan: Annual revenue of at least $250,000 is needed (currently $180,000).  _(source https://fixtures.example/fx-natl/business-term-loan, scraped Oct 5, 2026)_

**Removed by hard filters:** purpose ×10, residency ×7, amount ×7, fico ×5, revenue ×3, timeInBusiness ×1, businessUse ×1

**Claim audit:** 0 flags — every number, source and estimate label checked
**Independent oracle:** engine and oracle agree (nothing ineligible ranked, nothing eligible removed)
**Persona checks:** all passed

## Real estate investor  (`re-investor`)

**Input:** “I'm a real estate investor in Georgia buying my third rental property. I've been investing for 4 years, FICO 740, and I need $300,000 to purchase a duplex. I can offer the property as collateral and I'm fine with a personal guarantee.”

**Extracted profile** (offline): Borrower type = Real estate investor · Industry = real estate · Amount needed = $300,000 · Purpose = Real estate · Personal FICO = 740 · Time in business = 48 months · Owner location = GA, United States · Business location = GA, United States · Collateral available = Yes · Willing to give personal guarantee = Yes
Extraction vs expected: all expected fields recovered

**Result:** 33 products considered · 7 passed every hard filter · showing 7 (fewer than 10: only 7 products passed the hard filters, so fewer than 10 are shown rather than padding the list with products you would not qualify for.)

```
 #  Label        Lender                         Product                            Cat.         Score  Amount                 Rate                     Term                Speed            Est. monthly
 1  Pink Diamond Fixture Investor Lending       DSCR Investment Property Loan      Alternative   80.5  $100,000 – $3,000,000  7.5% – 10.5% APR         30 years            21 days – 35 da… $2,414
 2  Gem          Fixture Trust & Mortgage       Commercial Mortgage                Conventional  77.8  $250,000 – $10,000,000 6.8% – 9% APR            10 years – 25 years 45 days – 60 da… $2,641
 3  Gem          Fixture Heartland Bank         Established Business Term Loan     SBA           77.3  $50,000 – $1,000,000   8% – 12% APR             3 years – 10 years  14 days – 30 da… $5,246
 4  Gem          Fixture SBA Partners           SBA 504 Loan                       SBA           76.6  $125,000 – $5,000,000  7% – 9% APR              10 years – 25 years 60 days – 90 da… $2,659
 5  Gem          Fixture SBA Partners           SBA 7(a) Loan                      SBA           76.0  $50,000 – $5,000,000   10.5% – 13.5% APR        5 years – 25 years  30 days – 60 da… $3,601
 6  Gem          Fixture Investor Lending       Bridge / Fix-and-Flip Loan         Alternative   75.7  $75,000 – $2,000,000   9.5% – 13.5% APR         6 months – 2 years  7 days – 14 days $21,567
 7  Gem          Fixture Marketplace            Marketplace Business Loans         SBA           65.1  $5,000 – $5,000,000    6% – 99% APR             3 months – 25 years 1 day – 14 days  $13,145
```

**#1 Pink Diamond — Fixture Investor Lending: DSCR Investment Property Loan** (Commercial real estate loan, Alternative; score 80.5)
- Why it fits: Fixture Investor Lending's DSCR Investment Property Loan (Commercial real estate loan) is offered by an Alternative lender. $300,000 is within the published range ($100,000 – $3,000,000). Minimum FICO 680; yours is 740. No minimum time in business.
- Could block approval: Requires collateral. A hard credit inquiry will be made, which can lower your score slightly. Not published: Revenue — confirm with the lender.
- Estimate: about $2,098 – $2,744 per month over 360 months (term assumed); total cost of capital about $568,992 (effective APR about 9%).
- Next step: Review the lender's requirements page and start an application, confirming rates and fees directly with the lender.
- Source: https://fixtures.example/fx-invest/dscr-investment-property-loan · data scraped Oct 2, 2026 (3 days ago). Estimates only; confirm with the lender.

**#2 Gem — Fixture Trust & Mortgage: Commercial Mortgage** (Commercial real estate loan, Conventional; score 77.8)
- Why it fits: Fixture Trust & Mortgage's Commercial Mortgage (Commercial real estate loan) is offered by a Conventional lender. $300,000 is within the published range ($250,000 – $10,000,000). Minimum FICO 700; yours is 740. Requires 24 months; you have 48.
- Could block approval: A UCC lien on business assets is filed — confirm you accept this. Requires a personal guarantee: your personal assets are at risk if the business cannot repay. Requires collateral.
- Estimate: about $2,447 – $2,842 per month over 210 months (term assumed); total cost of capital about $254,545 (effective APR about 7.9%).
- Next step: Confirm you accept a UCC lien. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-trust/commercial-mortgage · data scraped Oct 4, 2026 (1 day ago). Estimates only; confirm with the lender.

**#3 Gem — Fixture Heartland Bank: Established Business Term Loan** (Term loan, SBA; score 77.3)
- Why it fits: Fixture Heartland Bank's Established Business Term Loan (Term loan) is offered by an SBA lender. $300,000 is within the published range ($50,000 – $1,000,000). Minimum FICO 700; yours is 740. Requires 36 months; you have 48.
- Could block approval: A UCC lien on business assets is filed — confirm you accept this. Requires a personal guarantee: your personal assets are at risk if the business cannot repay. Requires collateral.
- Estimate: about $4,945 – $5,557 per month over 78 months (term assumed); total cost of capital about $109,194 (effective APR about 10%).
- Next step: Confirm you accept a UCC lien. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-heart/established-business-term-loan · data scraped Oct 2, 2026 (3 days ago). Estimates only; confirm with the lender.

**#4 Gem — Fixture SBA Partners: SBA 504 Loan** (SBA 504, SBA; score 76.6)
- Why it fits: Fixture SBA Partners's SBA 504 Loan (SBA 504) is offered by an SBA lender. $300,000 is within the published range ($125,000 – $5,000,000). Minimum FICO 680; yours is 740. Requires 24 months; you have 48.
- Could block approval: Requires a US citizen or permanent resident; your status was not provided. Confirm you meet: a US citizen or permanent resident. A UCC lien on business assets is filed — confirm you accept this. Requires a personal guarantee: your personal assets are at risk if the business cannot repay.
- Estimate: about $2,482 – $2,842 per month over 210 months (term assumed); total cost of capital about $258,322 (effective APR about 8%).
- Next step: Confirm you meet: a US citizen or permanent resident. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-sbaP/sba-504-loan · data scraped Oct 4, 2026 (1 day ago). Estimates only; confirm with the lender.

**#5 Gem — Fixture SBA Partners: SBA 7(a) Loan** (SBA 7(a), SBA; score 76.0)
- Why it fits: Fixture SBA Partners's SBA 7(a) Loan (SBA 7(a)) is offered by an SBA lender. $300,000 is within the published range ($50,000 – $5,000,000). Minimum FICO 680; yours is 740. Requires 24 months; you have 48.
- Could block approval: Requires a US citizen or permanent resident; your status was not provided. Confirm you meet: a US citizen or permanent resident. A UCC lien on business assets is filed — confirm you accept this. Requires a personal guarantee: your personal assets are at risk if the business cannot repay.
- Estimate: about $3,316 – $3,895 per month over 180 months (term assumed); total cost of capital about $348,091 (effective APR about 12%).
- Next step: Confirm you meet: a US citizen or permanent resident. Then review the lender's page and start an application if it still fits.
- Source: https://fixtures.example/fx-sbaP/sba-7-a-loan · data scraped Oct 5, 2026 (today). Estimates only; confirm with the lender.

**#6 Gem — Fixture Investor Lending: Bridge / Fix-and-Flip Loan** (Commercial real estate loan, Alternative; score 75.7)
- Why it fits: Fixture Investor Lending's Bridge / Fix-and-Flip Loan (Commercial real estate loan) is offered by an Alternative lender. $300,000 is within the published range ($75,000 – $2,000,000). Minimum FICO 660; yours is 740. Permitted use: real estate.
- Could block approval: Requires a personal guarantee: your personal assets are at risk if the business cannot repay. Requires collateral. Not published: Time in business — confirm with the lender.
- Estimate: about $21,290 – $21,847 per month over 15 months (term assumed); total cost of capital about $30,262 (effective APR about 15.04%).
- Next step: Review the lender's requirements page and start an application, confirming rates and fees directly with the lender.
- Source: https://fixtures.example/fx-invest/bridge-fix-and-flip-loan · data scraped Oct 1, 2026 (4 days ago). Estimates only; confirm with the lender.

**#7 Gem — Fixture Marketplace: Marketplace Business Loans** (Term loan, SBA; score 65.1)
- Why it fits: Fixture Marketplace's Marketplace Business Loans (Term loan) is offered by an SBA lender. $300,000 is within the published range ($5,000 – $5,000,000). Minimum FICO 550; yours is 740. Requires 6 months; you have 48.
- Could block approval: The published APR range is very wide (6%–99%); your actual rate could be anywhere in it. This is a marketplace: offers come from partner lenders, so actual terms vary. Not published: Revenue — confirm with the lender.
- Estimate: about $2,822 – $24,750 per month over 152 months (term assumed); total cost of capital about $1,697,978 (effective APR about 52.5%).
- Next step: Review the lender's requirements page and start an application, confirming rates and fees directly with the lender.
- Source: https://fixtures.example/fx-mkt/marketplace-business-loans · data scraped Oct 3, 2026 (2 days ago). Estimates only; confirm with the lender.

**Near misses (what you'd need to change):**
- Fixture Southern Equipment — Heavy Equipment Loan: This product is not offered for real estate.  _(source https://fixtures.example/fx-south/heavy-equipment-loan, scraped Oct 1, 2026)_
- Fixture National Bank — Equipment Loan: This product is not offered for real estate.  _(source https://fixtures.example/fx-natl/equipment-loan, scraped Oct 3, 2026)_
- Fixture National Bank — Business Term Loan: This product is not offered for real estate.  _(source https://fixtures.example/fx-natl/business-term-loan, scraped Oct 5, 2026)_
- Fixture Heartland Bank — SBA Express Loan: This product is not offered for real estate.  _(source https://fixtures.example/fx-heart/sba-express-loan, scraped Oct 3, 2026)_
- Fixture Equipment Finance — Equipment Financing: This product is not offered for real estate.  _(source https://fixtures.example/fx-eq/equipment-financing, scraped Oct 3, 2026)_
- Fixture Peach Investor Loans — Peach State Property Loan: Not offered in Georgia; only a different business location would qualify.  _(source https://fixtures.example/fx-peach/peach-state-property-loan, scraped Oct 5, 2026)_

**Removed by hard filters:** purpose ×23, amount ×17, state ×1, businessUse ×1

**Claim audit:** 0 flags — every number, source and estimate label checked
**Independent oracle:** engine and oracle agree (nothing ineligible ranked, nothing eligible removed)
**Persona checks:** all passed

## Summary

| Persona | Extraction | Products | Passed filters | Shown | Flags (unsourced / source / estimate / stale) | Oracle | Persona checks |
|---|---|---|---|---|---|---|---|
| startup-580 | ok | 33 | 3 | 3 | 0 (0 / 0 / 0 / 0) | agree | pass |
| restaurant-700 | ok | 33 | 10 | 10 | 0 (0 / 0 / 0 / 0) | agree | pass |
| contractor-equipment | ok | 33 | 11 | 10 | 0 (0 / 0 / 0 / 0) | agree | pass |
| nonus-llc | ok | 33 | 13 | 10 | 0 (0 / 0 / 0 / 0) | agree | pass |
| re-investor | ok | 33 | 7 | 7 | 0 (0 / 0 / 0 / 0) | agree | pass |

**Result: PASS** — no unsourced claims, no engine/oracle disagreements, all persona checks passed.

_SYNTHETIC FIXTURE DATA: fictional lenders and invented numbers, used only to exercise the engine. These are not real lender terms._
